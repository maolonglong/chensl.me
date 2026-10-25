export interface SearchHit {
  type: 'blog' | 'news'
  url: string
  title: string
  date: string
  snippet: string
}

export const maxQueryLength = 64

export const cleanQuery = (raw: string | null) => (raw ?? '').replace(/[\p{Cc}"\s]+/gu, ' ').trim()

// Collapses whitespace, quotes, and control characters and rejects empty or oversized input, so
// Pagefind and D1 search the same text and FTS5 never sees a NUL byte or raw quote.
export function normalizeQuery(raw: string | null) {
  const query = cleanQuery(raw)
  return query && [...query].length <= maxQueryLength ? query : null
}

// Pagefind's build-time Jieba dictionary and the browser's Intl.Segmenter disagree on Chinese
// word boundaries, so the build separates adjacent Han characters with zero-width spaces and
// the browser spaces them here. Any space-free word that splits into multiple Han or Latin
// tokens is also searched as a quoted phrase so 智能体 (or a mixed token with an unknown Han
// character) does not match articles that only contain one of its parts, while single Latin
// terms keep Pagefind's prefix matching.
export function articleQuery(raw: string) {
  const clean = cleanQuery(raw)
  const query = clean.replace(/\p{Script=Han}(?=\p{Script=Han})/gu, '$& ')
  const phrases = [
    ...new Set(
      clean
        .split(' ')
        .map((word) =>
          word
            .replace(/\p{Script=Han}/gu, ' $& ')
            .trim()
            .split(/\s+/)
            .filter((part) => /[\p{L}\p{N}]/u.test(part)),
        )
        .filter((parts) => parts.length >= 2)
        .map((parts) => `"${parts.join(' ')}"`),
    ),
  ]
  return { query, phrases }
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
