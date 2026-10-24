export interface SearchHit {
  type: 'blog' | 'news'
  url: string
  title: string
  date: string
  snippet: string
}

export const maxQueryLength = 64

export const cleanQuery = (raw: string | null) => (raw ?? '').replace(/[\p{Cc}\s]+/gu, ' ').trim()

// Collapses whitespace and control characters and rejects empty or oversized input, so Pagefind
// and D1 search the same text and FTS5 never sees a NUL byte.
export function normalizeQuery(raw: string | null) {
  const query = cleanQuery(raw)
  return query && [...query].length <= maxQueryLength ? query : null
}

// Reciprocal rank fusion: each list adds 1 / (k + rank) to a hit, by URL, so articles and news
// items interleave by rank without comparing their incompatible scores.
export const rrfK = 60

export function fuse<T extends { url: string }>(lists: T[][], k = rrfK): T[] {
  const scored = new Map<string, { hit: T; score: number }>()
  for (const list of lists) {
    list.forEach((hit, index) => {
      const score = 1 / (k + index + 1)
      const entry = scored.get(hit.url)
      if (entry) entry.score += score
      else scored.set(hit.url, { hit, score })
    })
  }
  return [...scored.values()].sort((a, b) => b.score - a.score).map(({ hit }) => hit)
}
