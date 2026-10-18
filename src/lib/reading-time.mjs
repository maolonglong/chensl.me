import { visit } from 'unist-util-visit'

// Brysbaert (2019), https://doi.org/10.1016/j.jml.2019.104047: adults read English non-fiction
// silently at 238 words a minute, and Chinese at 260 words a minute. The paper converts Chinese
// characters to words at 1.5 characters a word, so 260 words are 390 characters.
export const wordsPerMinute = 238
export const charactersPerMinute = 390

const han = /\p{Script=Han}/gu
// Letters or digits, joined by an apostrophe, hyphen or decimal point: isn't, well-known, 6.7.
const word = /[\p{L}\p{M}\p{N}]+(?:['’.-][\p{L}\p{M}\p{N}]+)*/gu

// Only text and inline code reach the count. Fenced and indented code, display and inline math,
// and raw HTML are separate node types, so they never do.
export function readingStats(tree) {
  let characters = 0
  let words = 0
  visit(tree, ['text', 'inlineCode'], (node) => {
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
