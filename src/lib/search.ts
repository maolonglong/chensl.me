import {
  clipSnippet,
  newsKeywordFallbackQuery,
  newsKeywordLimit,
  newsKeywordQuery,
} from './search-text.mjs'
import type { SearchHit } from './search-fuse'
import { newsUrl } from './news'

// Server side of /search/: AI News keyword hits from D1 FTS5 (issue_items_fts).
// The browser merges them with its Pagefind article hits; see src/pages/search.astro.
// src/worker.ts routes GET /api/search/ here before the Astro handler.

// Milliseconds spent waiting on D1 during one search, summed across queries.
export type SearchTiming = Partial<Record<'d1', number>>

async function timed<T>(timing: SearchTiming, name: keyof SearchTiming, work: Promise<T>) {
  const start = performance.now()
  try {
    return await work
  } finally {
    timing[name] = (timing[name] ?? 0) + performance.now() - start
  }
}

type KeywordRow = { date: string; title: string; snippet: string }

async function keywordRows(db: D1Database, sql: string, binds: string[], timing: SearchTiming) {
  const { results } = await timed(
    timing,
    'd1',
    db
      .prepare(sql)
      .bind(...binds)
      .all<KeywordRow>(),
  )
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

export async function newsKeywordSearch(
  db: D1Database,
  query: string,
  timing: SearchTiming = {},
): Promise<SearchHit[]> {
  const phrase = newsKeywordQuery(query)
  const primary = mergeKeywordRows([], await keywordRows(db, phrase.sql, phrase.binds, timing))
  const pairs = primary.length >= newsKeywordLimit ? null : newsKeywordFallbackQuery(query)
  const rows = pairs
    ? mergeKeywordRows(primary, await keywordRows(db, pairs.sql, pairs.binds, timing))
    : primary
  return rows.map((row) => ({
    type: 'news',
    url: newsUrl(row.date),
    title: row.title,
    date: row.date,
    snippet: clipSnippet(row.snippet.replace(/\s*\n\s*/g, ' · ').trim()),
  }))
}
