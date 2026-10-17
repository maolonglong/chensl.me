// Reciprocal rank fusion: each list adds 1 / (k + rank) to a hit, by URL, so a page that
// several searches rank high comes first without comparing their incompatible scores.
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

// Short queries are usually names, such as 智谱 or METR, which keyword search matches exactly and
// semantic search matches loosely. Up to this many characters, when keyword search found anything,
// the keyword hits come first and semantic hits only add documents after them.
export const shortQueryChars = 4

export function merge<T extends { url: string }>(
  query: string,
  keyword: T[][],
  semantic: T[],
  k = rrfK,
): T[] {
  const keywordHits = fuse(keyword, k)
  if ([...query].length > shortQueryChars || !keywordHits.length)
    return fuse([...keyword, semantic], k)
  const seen = new Set(keywordHits.map((hit) => hit.url))
  return [...keywordHits, ...semantic.filter((hit) => !seen.has(hit.url))]
}
