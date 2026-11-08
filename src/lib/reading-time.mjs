import { SKIP, visit } from 'unist-util-visit'

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
  return { characters, words, wordCount }
}

export function remarkReadingStats() {
  return (tree, file) => {
    file.data.astro.frontmatter.readingStats = readingStats(tree)
  }
}

// An exact count reads as false precision, so the header shows a rounded length.
export function readingLength(wordCount) {
  return `约 ${wordCount < 100 ? wordCount : Math.round(wordCount / 100) * 100} 字`
}
