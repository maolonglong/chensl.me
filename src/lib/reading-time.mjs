import { SKIP, visit } from 'unist-util-visit'

// English: Brysbaert (2019), https://doi.org/10.1016/j.jml.2019.104047, the silent reading rate
// of adults for non-fiction. Chinese: the common estimate of 300 characters a minute, which the
// owner chose over the paper's converted 390 (260 words at 1.5 characters a word).
export const wordsPerMinute = 238
export const charactersPerMinute = 300

const han = /\p{Script=Han}/gu
// Letters or digits, joined by an apostrophe, hyphen or decimal point: isn't, well-known, 6.7.
const word = /[\p{L}\p{M}\p{N}]+(?:['’.-][\p{L}\p{M}\p{N}]+)*/gu

// Only text and inline code reach the count. Fenced and indented code, display and inline math,
// and raw HTML are separate node types, so they never do. Text marked data-pagefind-ignore, such
// as a repository card's stats line, is page furniture and stays out, as it does in search.
export function readingStats(tree) {
  let characters = 0
  let words = 0
  visit(tree, (node) => {
    if (node.data?.hProperties?.dataPagefindIgnore !== undefined) return SKIP
    if (node.type !== 'text' && node.type !== 'inlineCode') return
    characters += node.value.match(han)?.length ?? 0
    words += node.value.replace(han, ' ').match(word)?.length ?? 0
  })
  const wordCount = characters + words
  const minutes = characters / charactersPerMinute + words / wordsPerMinute
  return { characters, words, wordCount, minutes: wordCount ? Math.max(1, Math.round(minutes)) : 0 }
}

export function remarkReadingStats() {
  return (tree, file) => {
    file.data.astro.frontmatter.readingStats = readingStats(tree)
  }
}

// An exact count reads as false precision beside a reading estimate.
export function readingLength(wordCount) {
  return `约 ${wordCount < 100 ? wordCount : Math.round(wordCount / 100) * 100} 字`
}
