import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import rehypeParse from 'rehype-parse'
import { unified } from 'unified'
import { visit, SKIP } from 'unist-util-visit'
import { articleChunks, articleEmbeddingText, indexVersion } from '../src/lib/search-text.mjs'

// Reads the embedding input of each built article from dist/client, so the text that
// scripts/embed-posts.mjs embeds and the hash that scripts/check-site.mjs compares come from what
// readers see. Code blocks and hidden helper text stay out: they carry little meaning
// for a semantic match and would use most of the input budget.

const parser = unified().use(rehypeParse)
const skippedTags = new Set(['pre', 'script', 'style', 'button', 'annotation', 'template'])

const hasClass = (node, name) => node.properties?.className?.includes(name)

const tidy = (text) =>
  text
    .replace(/[ \t\r\f\v]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim()

// Walks the visible text in page order. onHeading, when given, receives each H2 or H3 text
// instead of adding it to the text, and starts a new section.
function walkText(node, onText, onHeading) {
  visit(node, (child) => {
    if (child.type === 'element') {
      if (skippedTags.has(child.tagName) || hasClass(child, 'visually-hidden')) return SKIP
      if (child.properties?.dataFootnoteBackref !== undefined) return SKIP
      if (onHeading && /^h[23]$/.test(child.tagName)) {
        onHeading(textOf(child))
        return SKIP
      }
      if (/^(?:p|li|h[1-6]|tr|blockquote|figcaption|dt|dd)$/.test(child.tagName)) onText('\n')
    }
    if (child.type === 'text') onText(child.value)
  })
}

function textOf(node) {
  let text = ''
  walkText(node, (value) => (text += value))
  return tidy(text)
}

function sectionsOf(node) {
  const sections = [{ heading: '', text: '' }]
  walkText(
    node,
    (value) => (sections.at(-1).text += value),
    (heading) => sections.push({ heading, text: '' }),
  )
  return sections.map(({ heading, text }) => ({ heading, text: tidy(text) }))
}

export function articleFromHtml(html) {
  const tree = parser.parse(html)
  let title = ''
  let description = ''
  let date = ''
  let prose
  visit(tree, 'element', (node) => {
    if (node.tagName === 'meta' && node.properties.name === 'description')
      description = node.properties.content ?? ''
    // The displayed date, in Asia/Shanghai like every date on the site.
    if (node.tagName === 'time' && !date) date = textOf(node)
    if (node.tagName === 'h1' && !title) title = textOf(node)
    if (!prose && hasClass(node, 'prose')) prose = node
  })
  return {
    title,
    description,
    date,
    text: prose ? textOf(prose) : '',
    sections: prose ? sectionsOf(prose) : [],
  }
}

export const textHash = (text) => createHash('sha256').update(text).digest('hex')

// Returns { id, text, chunks, hash, title, description, date } for every built article page, by
// ID. text is the whole-article input for related articles; chunks are the search inputs. The
// hash covers both and the index version, so any change re-embeds the article.
export async function articleInputs(distClient) {
  const blogDir = path.join(distClient, 'blog')
  const inputs = []
  for (const entry of await readdir(blogDir, { withFileTypes: true })) {
    const file = path.join(blogDir, entry.name, 'index.html')
    if (!entry.isDirectory()) continue
    let html
    try {
      html = await readFile(file, 'utf8')
    } catch {
      continue
    }
    const article = articleFromHtml(html)
    const text = articleEmbeddingText(article)
    const chunks = articleChunks(article)
    const { title, description, date } = article
    const hash = textHash(JSON.stringify({ indexVersion, text, chunks }))
    inputs.push({ id: entry.name, text, chunks, hash, title, description, date })
  }
  return inputs.sort((a, b) => a.id.localeCompare(b.id))
}
