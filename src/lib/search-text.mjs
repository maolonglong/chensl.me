// D1 FTS5 queries and CJK compound splitting for AI News search, plus snippet clipping.

export const clipSnippet = (text) => {
  const chars = [...text]
  return chars.length > 120 ? `${chars.slice(0, 119).join('')}…` : text
}

export const newsKeywordLimit = 10
const maxTerms = 5
const hanSegmenter = new Intl.Segmenter('zh', { granularity: 'word' })

// Trigram MATCH needs the characters in order. A Han term of four or more characters splits into
// its constituent words (or two-character pairs when the segmenter sees one word), required
// together within one news item when the phrase query is short of its limit, so 安全漏洞 matches
// 严重漏洞 together with 安全. A leftover single character is dropped: one character would match
// almost every item. Latin terms stay whole.
export function hanPairs(term) {
  const chars = [...term]
  if (chars.length < 4 || chars.some((char) => !/\p{Script=Han}/u.test(char))) return null
  const segments = [...hanSegmenter.segment(term)].map((entry) => entry.segment)
  const words = []
  if (segments.length === 1) {
    for (let index = 0; index + 1 < chars.length; index += 2)
      words.push(`${chars[index]}${chars[index + 1]}`)
  } else {
    let single = ''
    for (const segment of segments) {
      if ([...segment].length === 1) {
        single += segment
        if ([...single].length === 2) {
          words.push(single)
          single = ''
        }
      } else {
        single = ''
        words.push(segment)
      }
    }
  }
  return new Set(words).size >= 2 ? words : null
}

// Null when the query has no Han compound to split, or when the term limit would keep fewer
// than two pairs and the LIKE would collapse to one common word.
export function newsKeywordFallbackQuery(query) {
  const terms = [...new Set(query.split(' '))].slice(0, maxTerms)
  const pairTerms = new Set()
  const rewritten = []
  for (const term of terms) {
    const pairs = hanPairs(term)
    if (!pairs) {
      rewritten.push(term)
      continue
    }
    for (const pair of pairs) pairTerms.add(pair)
    rewritten.push(...pairs)
  }
  if (pairTerms.size < 2) return null
  const limited = [...new Set(rewritten)].slice(0, maxTerms)
  if ([...pairTerms].filter((term) => limited.includes(term)).length < 2) return null
  return newsKeywordQuery(limited.join(' '))
}

// FTS5 trigram needs three characters; a shorter term, such as a two-character Chinese word,
// becomes a LIKE condition on the same item row. Quoting makes every term a literal string.
// Each row in issue_items_fts is one item and carries its preformatted title：summary snippet,
// so all terms must match within the same item and the Worker never parses items_json.
export function newsKeywordQuery(query) {
  const terms = [...new Set(query.split(' '))].slice(0, maxTerms)
  const long = terms.filter((term) => [...term].length >= 3)
  const short = terms.filter((term) => [...term].length < 3)
  const where = ['issues.hidden_at IS NULL']
  const binds = []
  if (long.length) {
    where.push('issue_items_fts MATCH ?')
    binds.push(long.map((term) => `"${term.replaceAll('"', '""')}"`).join(' AND '))
  }
  for (const term of short) {
    where.push("issue_items_fts.body LIKE ? ESCAPE '\\'")
    binds.push(`%${term.replace(/[\\%_]/g, '\\$&')}%`)
  }
  const order = long.length
    ? 'issue_items_fts.rank, issues.date DESC'
    : 'issues.date DESC, issue_items_fts.rowid ASC'
  const sql = `SELECT issues.date, issues.title, issue_items_fts.snippet AS snippet
    FROM issue_items_fts JOIN issues ON issues.date = issue_items_fts.date
    WHERE ${where.join(' AND ')}
    ORDER BY ${order} LIMIT ${newsKeywordLimit * 3}`
  return { sql, binds }
}
