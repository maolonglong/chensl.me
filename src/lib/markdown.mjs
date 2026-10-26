import { visit, SKIP } from 'unist-util-visit'
import temml from 'temml'
import githubRepos from '../data/github-repos.json' with { type: 'json' }
import { archivedLabel, repositoryUrl, statsLine } from './github-repo.mjs'

const element = (tagName, properties, children) => ({
  type: 'element',
  tagName,
  properties,
  children,
})
const text = (value) => ({ type: 'text', value })

// Yields each top-level paragraph that holds only a link to a repository root, with the
// lowercase owner/repo key. scripts/github-repos.mjs reads the same list to refresh the snapshot.
export function* standaloneRepositoryLinks(tree) {
  for (const paragraph of tree.children) {
    if (paragraph.type !== 'paragraph') continue
    const children = paragraph.children.filter(
      (child) => child.type !== 'text' || child.value.trim(),
    )
    const [link] = children
    const key = children.length === 1 && link.type === 'link' && link.url.match(repositoryUrl)?.[1]
    if (key) yield { paragraph, link, key: key.toLowerCase() }
  }
}

const span = (className, value, properties = {}) => ({
  type: 'repoCardText',
  data: { hName: 'span', hProperties: { className: [className], ...properties } },
  children: [text(value)],
})

// The card shows the build snapshot in src/data/github-repos.json, which only
// scripts/github-repos.mjs writes, so a build never calls the GitHub API and the card is complete
// without scripts, in RSS, and when the refresh fails. src/components/GitHubCards.astro replaces
// the stats line, the description, and the archived label from /api/github/repos/<key>/.
// The label and the stats line stay out of search (data-pagefind-ignore):
// they change with every snapshot and say nothing about the article.
function githubCards(tree) {
  let cards = 0
  for (const { paragraph, link, key } of standaloneRepositoryLinks(tree)) {
    const repo = githubRepos[key]
    if (!repo) continue
    cards++
    paragraph.data = { hProperties: { className: ['repo-card'], dataRepo: key } }
    const ignore = { dataPagefindIgnore: '' }
    link.children = [
      {
        type: 'repoCardText',
        data: { hName: 'span', hProperties: { className: ['repo-card-head'] } },
        children: [
          span('repo-card-name', repo.name),
          ...(repo.archived ? [text(' '), span('repo-card-archived', archivedLabel, ignore)] : []),
        ],
      },
      ...(repo.description ? [text(' '), span('repo-card-description', repo.description)] : []),
      text(' '),
      span('repo-card-stats', statsLine(repo), ignore),
    ]
  }
  return cards
}

export function remarkSite() {
  return (tree, file) => {
    // The article page loads the refresh script only when the article has a card.
    if (githubCards(tree) && file?.data?.astro?.frontmatter)
      file.data.astro.frontmatter.githubCards = true
    visit(tree, 'blockquote', (node) => {
      const first = node.children[0]?.children?.[0]
      const match =
        first?.type === 'text' &&
        first.value.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](?:\s*\n|$)/)
      if (!match) return
      const kind = match[1].toLowerCase()
      first.value = first.value.slice(match[0].length)
      if (!first.value) {
        const paragraph = node.children[0]
        paragraph.children.shift()
        if (!paragraph.children.length) node.children.shift()
      }
      node.data = { hProperties: { className: ['alert', `alert-${kind}`] } }
      node.children.unshift({
        type: 'paragraph',
        data: { hProperties: { className: ['alert-heading'] } },
        children: [
          text(
            { note: '提示', tip: '建议', important: '重要', warning: '警告', caution: '注意' }[
              kind
            ],
          ),
        ],
      })
    })
  }
}

// A focusable wrapper that scrolls wide content sideways, so the page itself never does.
const scrollRegion = (className, label, child) =>
  element('div', { className: [className], tabIndex: 0, role: 'region', ariaLabel: label }, [child])

export function rehypeSite() {
  return (tree, file) => {
    let images = false
    visit(tree, (node, index, parent) => {
      if (node.type === 'raw' && /<img\b/i.test(node.value)) {
        images = true
        return
      }
      if (node.type !== 'element') return
      if (node.tagName === 'img') {
        images = true
        return
      }
      // remark-math emits `code.language-math` inline and `pre > code.language-math` on display.
      // Render it before the `pre` branch below takes it for a code block. Astro parses the raw
      // MathML later.
      const code = node.tagName === 'pre' ? node.children[0] : node
      if (code?.tagName === 'code' && code.properties.className?.includes('language-math')) {
        const displayMode = node !== code
        const math = {
          type: 'raw',
          value: temml.renderToString(code.children[0]?.value ?? '', {
            displayMode,
            throwOnError: true,
          }),
        }
        parent.children[index] = displayMode ? scrollRegion('math-scroll', '公式', math) : math
        return SKIP
      }
      if (node.tagName === 'table') {
        parent.children[index] = scrollRegion('table-scroll', '表格', node)
        visit(node, 'element', (cell) => {
          if (cell.properties.align) {
            cell.properties.style = `text-align: ${cell.properties.align}`
            delete cell.properties.align
          }
        })
        // No SKIP: the visit goes on into the cells, which can hold inline math.
        return
      }
      if (node.tagName === 'pre') {
        const title = node.properties['data-title']
        delete node.properties['data-title']
        // Shiki emits a lowercase `tabindex`; the wrapper is the scroller, so it takes the focus stop.
        delete node.properties.tabindex
        const wrapper = scrollRegion('highlight', '代码', node)
        parent.children[index] = title
          ? element('figure', { className: ['code-figure'] }, [
              element('figcaption', {}, [text(title)]),
              wrapper,
            ])
          : wrapper
        return SKIP
      }
    })
    if (images && file?.data?.astro?.frontmatter) file.data.astro.frontmatter.images = true
  }
}

function theme(name, dark) {
  return {
    name,
    type: dark ? 'dark' : 'light',
    colors: {
      'editor.foreground': dark ? '#faf9f5' : '#141413',
      'editor.background': dark ? '#282724' : '#f0eee6',
    },
    tokenColors: [
      {
        scope: [
          'keyword',
          'storage',
          'support.type',
          'entity.name.tag',
          'constant.character.escape',
        ],
        settings: { foreground: dark ? '#9db9d8' : '#1b365d' },
      },
      {
        scope: ['string'],
        settings: { foreground: dark ? '#c2c0b6' : '#504e49' },
      },
      {
        scope: ['constant.numeric'],
        settings: { foreground: dark ? '#d4d3cd' : '#3d3d3a' },
      },
      {
        scope: ['comment', 'punctuation.definition.comment'],
        settings: { foreground: dark ? '#b0aea5' : '#6b6a64' },
      },
    ],
  }
}

export const codeThemes = { light: theme('ink-light', false), dark: theme('ink-dark', true) }
export const codeCaption = {
  name: 'code-caption',
  pre(node) {
    const title = this.options.meta?.__raw?.match(/\btitle="([^"]*)"/)?.[1]
    if (title) node.properties['data-title'] = title
  },
}
