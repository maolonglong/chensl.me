import {
  allNewsVectorIds,
  clipSnippet,
  embeddingModel,
  newsItemEmbeddingText,
  newsVectors,
  queryInstruction,
  rankMatches,
  searchNamespace,
  semanticTopK,
} from './search-text.mjs'
import { newsUrl, type NewsIssue } from './news'

// Server side of /search/: semantic hits from Vectorize and AI News keyword hits from D1 FTS5.
// The browser merges both with its Pagefind article hits; see src/pages/search.astro.
// src/worker.ts routes GET /api/search/ here before the Astro handler.

export interface SearchHit {
  type: 'blog' | 'news'
  url: string
  title: string
  date: string
  snippet: string
  score?: number
}

export const maxQueryLength = 64

// Collapses whitespace and rejects empty or oversized input, so equal queries share one cache key.
export function normalizeQuery(raw: string | null) {
  const query = (raw ?? '').replace(/\s+/g, ' ').trim()
  return query && [...query].length <= maxQueryLength ? query : null
}

type SearchEnv = Pick<Cloudflare.Env, 'AI' | 'SEARCH_INDEX' | 'NEWS'>

export const semanticEnabled = (env: SearchEnv) => Boolean(env.AI && env.SEARCH_INDEX)

interface BlogMetadata {
  url: string
  title: string
  date: string
  description: string
}

interface NewsMetadata {
  date: string
  title: string
  snippet: string
}

export async function semanticSearch(env: SearchEnv, query: string): Promise<SearchHit[]> {
  if (!env.AI || !env.SEARCH_INDEX) return []
  const { data } = await env.AI.run(embeddingModel, {
    queries: query,
    instruction: queryInstruction,
  })
  const vector = data?.[0]
  if (!vector) throw new Error('Workers AI returned no query embedding')
  const { matches } = await env.SEARCH_INDEX.query(vector, {
    topK: semanticTopK,
    returnMetadata: 'all',
    namespace: searchNamespace,
  })
  const ranked = rankMatches(matches)
  // A retraction deletes the issue's vectors; D1 still decides, in case that delete failed.
  const newsDates = ranked
    .filter((match) => match.type === 'news')
    .map((match) => (match.metadata as unknown as NewsMetadata).date)
  const visible = new Set<string>()
  if (newsDates.length) {
    const { results } = await env.NEWS.prepare(
      `SELECT date FROM issues WHERE hidden_at IS NULL AND date IN (${newsDates.map(() => '?').join(', ')})`,
    )
      .bind(...newsDates)
      .all<{ date: string }>()
    for (const row of results) visible.add(row.date)
  }
  const hits: SearchHit[] = []
  for (const match of ranked) {
    const score = Math.round(match.score * 1000) / 1000
    if (match.type === 'news') {
      const { date, title, snippet } = match.metadata as unknown as NewsMetadata
      if (visible.has(date))
        hits.push({ type: 'news', url: newsUrl(date), title, date, snippet, score })
    } else {
      const { url, title, date, description } = match.metadata as unknown as BlogMetadata
      hits.push({ type: 'blog', url, title, date, snippet: clipSnippet(description), score })
    }
  }
  return hits
}

const newsKeywordLimit = 10
const maxTerms = 5

// FTS5 trigram needs three characters; a shorter term, such as a two-character Chinese word,
// becomes a LIKE condition on the same rows. Quoting makes every term a literal string. D1 cuts
// the snippet around the first match, so the Worker never parses items_json.
export function newsKeywordQuery(query: string) {
  const terms = [...new Set(query.split(' '))].slice(0, maxTerms)
  const long = terms.filter((term) => [...term].length >= 3)
  const short = terms.filter((term) => [...term].length < 3)
  const where = ['issues.hidden_at IS NULL']
  const binds: string[] = []
  if (long.length) {
    where.push('issues_fts MATCH ?')
    binds.push(long.map((term) => `"${term.replaceAll('"', '""')}"`).join(' AND '))
  }
  for (const term of short) {
    where.push("issues_fts.body LIKE ? ESCAPE '\\'")
    binds.push(`%${term.replace(/[\\%_]/g, '\\$&')}%`)
  }
  const snippet = long.length
    ? "snippet(issues_fts, 1, '', '', '…', 48)"
    : `substr(issues_fts.body, max(1, instr(lower(issues_fts.body), lower(?)) - 24), 96)`
  if (!long.length) binds.unshift(short[0])
  const sql = `SELECT issues.date, issues.title, ${snippet} AS snippet
    FROM issues_fts JOIN issues ON issues.date = issues_fts.date
    WHERE ${where.join(' AND ')}
    ORDER BY ${long.length ? 'issues_fts.rank' : 'issues.date DESC'} LIMIT ${newsKeywordLimit}`
  return { sql, binds }
}

export async function newsKeywordSearch(db: D1Database, query: string): Promise<SearchHit[]> {
  const { sql, binds } = newsKeywordQuery(query)
  const { results } = await db
    .prepare(sql)
    .bind(...binds)
    .all<{ date: string; title: string; snippet: string }>()
  return results.map((row) => ({
    type: 'news',
    url: newsUrl(row.date),
    title: row.title,
    date: row.date,
    snippet: clipSnippet(row.snippet.replace(/\s*\n\s*/g, ' · ').trim()),
  }))
}

export type IndexResult = 'indexed' | 'removed' | 'disabled' | 'failed'

// Every news write and retraction changes what /api/search returns, keyword hits included, so
// the news endpoints drop the cached answers. Workers Cache
// is absent in Previews and local Wrangler; a failed purge only delays new results by the TTL.
// Called after each accepted news write, and when a retracted issue is shown again. Each item
// gets its own vector; the vectors of items that a longer earlier version had are deleted. A
// failure is logged and reported to the bot but never fails the write: the issue is already
// published, and the next write of that date retries.
export async function indexIssue(env: SearchEnv, issue: NewsIssue): Promise<IndexResult> {
  if (!env.AI || !env.SEARCH_INDEX) return 'disabled'
  try {
    const { data } = await env.AI.run(embeddingModel, {
      documents: issue.items.map(newsItemEmbeddingText),
    })
    if (data?.length !== issue.items.length)
      throw new Error('Workers AI returned too few embeddings')
    const { upserts, stale } = newsVectors(issue, data)
    await env.SEARCH_INDEX.upsert(upserts)
    await env.SEARCH_INDEX.deleteByIds(stale)
    return 'indexed'
  } catch (error) {
    console.error('news search indexing failed', issue.date, error)
    return 'failed'
  }
}

// Called when an issue is retracted: its items leave semantic search at once.
export async function removeIssue(env: SearchEnv, date: string): Promise<IndexResult> {
  if (!env.SEARCH_INDEX) return 'disabled'
  try {
    await env.SEARCH_INDEX.deleteByIds(allNewsVectorIds(date))
    return 'removed'
  } catch (error) {
    console.error('news search removal failed', date, error)
    return 'failed'
  }
}
