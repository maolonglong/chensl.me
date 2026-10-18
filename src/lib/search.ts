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
import { newsUrl, queryIssue, visibleIssueVersions } from './news'

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
  version: number
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
  // Filter before ranking: an obsolete issue must not set the news score gap.
  const newsDates = [
    ...new Set(
      matches
        .filter((match) => match.metadata?.type === 'news')
        .map((match) => (match.metadata as unknown as NewsMetadata).date),
    ),
  ]
  const versions = await visibleIssueVersions(env.NEWS, newsDates)
  const current = matches.filter((match) => {
    if (match.metadata?.type !== 'news') return true
    const { date, version } = match.metadata as unknown as NewsMetadata
    return versions.has(date) && versions.get(date) === version
  })
  return rankMatches(current).map((match) => {
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

// Mutation acceptance is not query visibility. Re-read after all mutations so a slow older
// request repairs its own overwrite with the latest D1 state. A resend retries failures.
export async function syncIssue(env: SearchEnv, date: string): Promise<IndexResult> {
  if (!semanticEnabled(env)) return 'disabled'
  try {
    let issue = await queryIssue(env.NEWS, date)
    for (let attempt = 0; attempt < 3; attempt++) {
      if (issue) {
        const { data } = await env.AI.run(embeddingModel, {
          documents: issue.items.map(newsItemEmbeddingText),
        })
        if (data?.length !== issue.items.length)
          throw new Error('Workers AI returned too few embeddings')
        const { upserts, stale } = newsVectors(issue, data)
        await env.SEARCH_INDEX.upsert(upserts)
        await env.SEARCH_INDEX.deleteByIds(stale)
      } else {
        await env.SEARCH_INDEX.deleteByIds(allNewsVectorIds(date))
      }
      const current = await queryIssue(env.NEWS, date)
      if (current?.version === issue?.version) return issue ? 'indexed' : 'removed'
      issue = current
    }
    throw new Error('News changed during every indexing attempt')
  } catch (error) {
    console.error('news search indexing failed', date, error)
    return 'failed'
  }
}
