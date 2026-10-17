import { embeddingModel, newsEmbeddingText } from './search-text.mjs'
import { newsUrl, type NewsIssue, type NewsItem } from './news'

// Server side of /search/: semantic hits from Vectorize and AI News keyword hits from D1 FTS5.
// The browser merges both with its Pagefind article hits; see src/pages/search.astro.

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

// Calibrated against the deployed model on 2026-10-17 (.agents/notes/implemented/feature/2026-10-17-hybrid-search.md): the best
// match of every off-topic query scored below 0.27, and every on-topic best match at least 0.33.
// Hits that trail the best one by more than 0.10 were mostly loosely related articles.
export const semanticMinScore = 0.3
export const semanticMaxGap = 0.1
const semanticTopK = 10

// Qwen3 embeddings take a task instruction on the query side only. A Chinese instruction that
// names both kinds of document ranked the right article first for 智能体, which the default missed.
export const queryInstruction = '给定一个搜索查询，检索能回答该查询的技术博客文章或 AI 新闻'

type SearchEnv = Pick<Cloudflare.Env, 'AI' | 'SEARCH_INDEX' | 'NEWS'>

export const semanticEnabled = (env: SearchEnv) => Boolean(env.AI && env.SEARCH_INDEX)

export const vectorId = (type: SearchHit['type'], id: string) => `${type}:${id}`

interface BlogMetadata {
  type: 'blog'
  url: string
  title: string
  date: string
  description: string
}

const clipSnippet = (text: string) => (text.length > 120 ? `${text.slice(0, 119)}…` : text)

export function keepConfident<T extends { score: number }>(matches: T[]) {
  const best = Math.max(...matches.map((match) => match.score))
  return matches.filter(
    (match) => match.score >= semanticMinScore && match.score >= best - semanticMaxGap,
  )
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
  })
  const confident = keepConfident(matches)
  // News vectors carry only the date: titles come from D1, which also drops retracted issues.
  const newsDates = confident
    .filter((match) => match.id.startsWith('news:'))
    .map((match) => match.id.slice('news:'.length))
  const visibleNews = new Map<string, { title: string; summary: string }>()
  if (newsDates.length) {
    const { results } = await env.NEWS.prepare(
      `SELECT date, title, summary FROM issues WHERE hidden_at IS NULL AND date IN (${newsDates.map(() => '?').join(', ')})`,
    )
      .bind(...newsDates)
      .all<{ date: string; title: string; summary: string }>()
    for (const row of results) visibleNews.set(row.date, row)
  }
  const hits: SearchHit[] = []
  for (const match of confident) {
    const score = Math.round(match.score * 1000) / 1000
    if (match.id.startsWith('news:')) {
      const date = match.id.slice('news:'.length)
      const issue = visibleNews.get(date)
      if (issue)
        hits.push({
          type: 'news',
          url: newsUrl(date),
          title: issue.title,
          date,
          snippet: clipSnippet(issue.summary),
          score,
        })
    } else if (match.metadata?.type === 'blog') {
      const { url, title, date, description } = match.metadata as unknown as BlogMetadata
      hits.push({ type: 'blog', url, title, date, snippet: clipSnippet(description), score })
    }
  }
  return hits
}

const newsKeywordLimit = 10
const maxTerms = 5

// FTS5 trigram needs three characters; a shorter term, such as a two-character Chinese word,
// becomes a LIKE condition on the same rows. Quoting makes every term a literal string.
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
  const sql = `SELECT issues.date, issues.title, issues.summary, issues.items_json
    FROM issues_fts JOIN issues ON issues.date = issues_fts.date
    WHERE ${where.join(' AND ')}
    ORDER BY ${long.length ? 'issues_fts.rank' : 'issues.date DESC'} LIMIT ${newsKeywordLimit}`
  return { sql, binds, terms }
}

// The snippet names the item that contains the most terms, so the reader sees why the issue matched.
function matchingItem(itemsJson: string, terms: string[]) {
  let items: NewsItem[]
  try {
    items = JSON.parse(itemsJson)
  } catch {
    return undefined
  }
  const lowered = terms.map((term) => term.toLowerCase())
  let best: NewsItem | undefined
  let bestCount = 0
  for (const item of items) {
    const text = `${item.tag} ${item.title} ${item.summary}`.toLowerCase()
    const count = lowered.filter((term) => text.includes(term)).length
    if (count > bestCount) [best, bestCount] = [item, count]
  }
  return best
}

export async function newsKeywordSearch(db: D1Database, query: string): Promise<SearchHit[]> {
  const { sql, binds, terms } = newsKeywordQuery(query)
  const { results } = await db
    .prepare(sql)
    .bind(...binds)
    .all<{ date: string; title: string; summary: string; items_json: string }>()
  return results.map((row) => {
    const item = matchingItem(row.items_json, terms)
    return {
      type: 'news',
      url: newsUrl(row.date),
      title: row.title,
      date: row.date,
      snippet: clipSnippet(item ? `${item.title}：${item.summary}` : row.summary),
    }
  })
}

export type IndexResult = 'indexed' | 'disabled' | 'failed'

// Called after each accepted news write. A failure is logged and reported to the bot but never
// fails the write: the issue is already published, and the next write of that date retries.
export async function indexIssue(env: SearchEnv, issue: NewsIssue): Promise<IndexResult> {
  if (!env.AI || !env.SEARCH_INDEX) return 'disabled'
  try {
    const { data } = await env.AI.run(embeddingModel, { documents: newsEmbeddingText(issue) })
    const values = data?.[0]
    if (!values) throw new Error('Workers AI returned no document embedding')
    await env.SEARCH_INDEX.upsert([
      { id: vectorId('news', issue.date), values, metadata: { type: 'news', date: issue.date } },
    ])
    return 'indexed'
  } catch (error) {
    console.error('news search indexing failed', issue.date, error)
    return 'failed'
  }
}
