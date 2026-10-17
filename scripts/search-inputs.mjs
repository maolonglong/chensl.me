import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import rehypeParse from 'rehype-parse'
import { unified } from 'unified'
import { visit, SKIP } from 'unist-util-visit'
import { articleEmbeddingText } from '../src/lib/search-text.mjs'

// Reads the embedding input of each built article from dist/client, so the text that
// scripts/embed-posts.mjs embeds and the text that scripts/check-site.mjs compares are the same
// as what readers see. Code blocks and hidden helper text stay out: they carry little meaning
// for a semantic match and would use most of the input budget.

const parser = unified().use(rehypeParse)
const skippedTags = new Set(['pre', 'script', 'style', 'button', 'annotation', 'template'])

const hasClass = (node, name) => node.properties?.className?.includes(name)

function textOf(node) {
  let text = ''
  visit(node, (child) => {
    if (child.type === 'element') {
      if (skippedTags.has(child.tagName) || hasClass(child, 'visually-hidden')) return SKIP
      if (child.properties?.dataFootnoteBackref !== undefined) return SKIP
      if (/^(?:p|li|h[1-6]|tr|blockquote|figcaption|dt|dd)$/.test(child.tagName)) text += '\n'
    }
    if (child.type === 'text') text += child.value
  })
  return text
    .replace(/[ \t\r\f\v]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim()
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
  return { title, description, date, text: prose ? textOf(prose) : '' }
}

export const textHash = (text) => createHash('sha256').update(text).digest('hex')

// Returns { id, text, hash, title, description, date } for every built article page, by ID.
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
    const { title, description, date } = article
    inputs.push({ id: entry.name, text, hash: textHash(text), title, description, date })
  }
  return inputs.sort((a, b) => a.id.localeCompare(b.id))
}
