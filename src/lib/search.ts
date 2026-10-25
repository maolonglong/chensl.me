import {
  clipSnippet,
  newsKeywordFallbackQuery,
  newsKeywordLimit,
  newsKeywordQuery,
} from './search-text.mjs'
import { normalizeQuery, type SearchHit } from './search-fuse'
import { newsUrl } from './news'

// Server side of /search/: AI News keyword hits from D1 FTS5 (issue_items_fts).
// The browser merges them with its Pagefind article hits; see src/pages/search.astro.
// src/worker.ts routes GET /api/search/ here before the Astro handler.

type KeywordRow = { date: string; title: string; snippet: string }

async function keywordRows(db: D1Database, sql: string, binds: string[]) {
  const { results } = await db
    .prepare(sql)
    .bind(...binds)
    .all<KeywordRow>()
  return results
}

// Phrase hits stay ahead of pair hits, and multiple matching items in one issue collapse to the
// best-ranked item for that date. The pair query runs only to fill a short list.
function mergeKeywordRows(primary: KeywordRow[], extra: KeywordRow[]) {
  const seen = new Set<string>()
  const merged: KeywordRow[] = []
  for (const row of [...primary, ...extra]) {
    if (seen.has(row.date)) continue
    seen.add(row.date)
    merged.push(row)
    if (merged.length >= newsKeywordLimit) break
  }
  return merged
}

export async function newsKeywordSearch(db: D1Database, query: string): Promise<SearchHit[]> {
  const phrase = newsKeywordQuery(query)
  const primary = mergeKeywordRows([], await keywordRows(db, phrase.sql, phrase.binds))
  const pairs = primary.length >= newsKeywordLimit ? null : newsKeywordFallbackQuery(query)
  const rows = pairs
    ? mergeKeywordRows(primary, await keywordRows(db, pairs.sql, pairs.binds))
    : primary
  return rows.map((row) => ({
    type: 'news',
    url: newsUrl(row.date),
    title: row.title,
    date: row.date,
    snippet: clipSnippet(row.snippet.replace(/\s*\n\s*/g, ' · ').trim()),
  }))
}

export async function handleSearch(request: Request, env: Cloudflare.Env) {
  if (request.method !== 'GET' && request.method !== 'HEAD')
    return reply(405, { error: 'method_not_allowed' }, { Allow: 'GET, HEAD' })
  const query = normalizeQuery(new URL(request.url).searchParams.get('q'))
  if (!query) return reply(400, { error: 'invalid_query' })
  const clientAddress = request.headers.get('cf-connecting-ip') ?? 'unknown'
  const { success } = await env.READ_LIMITER.limit({ key: `search:${clientAddress}` })
  if (!success) return reply(429, { error: 'rate_limited' })

  try {
    const news = await newsKeywordSearch(env.NEWS, query)
    return reply(200, { query, news })
  } catch (error) {
    console.error('search news keyword failed', error)
    return reply(500, { error: 'search_failed' })
  }
}

const reply = (
  status: number,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store', ...headers } })
