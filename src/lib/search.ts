import {
  allNewsVectorIds,
  clipSnippet,
  embeddingModel,
  newsItemEmbeddingText,
  newsKeywordQuery,
  newsVectors,
  queryInstruction,
  rankMatches,
  searchNamespace,
  semanticTopK,
} from './search-text.mjs'
import type { SearchHit } from './search-fuse'
import { newsUrl, visibleIssueDates, type NewsIssue } from './news'

// Server side of /search/: semantic hits from Vectorize and AI News keyword hits from D1 FTS5.
// The browser merges both with its Pagefind article hits; see src/pages/search.astro.
// src/worker.ts routes GET /api/search/ here before the Astro handler.

type SearchEnv = Pick<Cloudflare.Env, 'AI' | 'SEARCH_INDEX' | 'NEWS' | 'SEMANTIC_SEARCH'>

// Local runs have the AI and Vectorize bindings without a remote session, so every call would
// fail; the browser specs start the Worker with SEMANTIC_SEARCH=off to get keyword-only search.
export const semanticEnabled = (
  env: SearchEnv,
): env is SearchEnv & { AI: Ai; SEARCH_INDEX: VectorizeIndex } =>
  Boolean(env.AI && env.SEARCH_INDEX) && env.SEMANTIC_SEARCH !== 'off'

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
  if (!semanticEnabled(env)) return []
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
  // A retraction deletes the issue's vectors; D1 still decides before ranking, in case that
  // delete failed or is still applying, so a hidden issue never sets the news score gap.
  const newsDates = [
    ...new Set(
      matches
        .filter((match) => match.metadata?.type === 'news')
        .map((match) => (match.metadata as unknown as NewsMetadata).date),
    ),
  ]
  const visible = await visibleIssueDates(env.NEWS, newsDates)
  return rankMatches(matches, visible).map((match) => {
    const score = Math.round(match.score * 1000) / 1000
    if (match.type === 'news') {
      const { date, title, snippet } = match.metadata as unknown as NewsMetadata
      return { type: 'news', url: newsUrl(date), title, date, snippet, score }
    }
    const { url, title, date, description } = match.metadata as unknown as BlogMetadata
    return { type: 'blog', url, title, date, snippet: clipSnippet(description), score }
  })
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
export async function purgeSearchCache() {
  try {
    // Imported at request time: the search page imports this module while it prerenders in Node.
    const { cache } = await import('cloudflare:workers')
    // Local runs have a cache export without purge.
    if (typeof cache?.purge !== 'function') return
    const result = await cache.purge({ pathPrefixes: ['/api/search/'] })
    if (result && !result.success) console.error('search cache purge failed', result.errors)
  } catch (error) {
    console.error('search cache purge failed', error)
  }
}

// Called after each accepted news write, and when a retracted issue is shown again. Each item
// gets its own vector; the vectors of items that a longer earlier version had are deleted. A
// failure is logged and reported to the bot but never fails the write: the issue is already
// published, and the next write of that date retries.
export async function indexIssue(env: SearchEnv, issue: NewsIssue): Promise<IndexResult> {
  if (!semanticEnabled(env)) return 'disabled'
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
  if (!semanticEnabled(env)) return 'disabled'
  try {
    await env.SEARCH_INDEX.deleteByIds(allNewsVectorIds(date))
    return 'removed'
  } catch (error) {
    console.error('news search removal failed', date, error)
    return 'failed'
  }
}
