import { visit, SKIP } from 'unist-util-visit'
import temml from 'temml'

const element = (tagName, properties, children) => ({
  type: 'element',
  tagName,
  properties,
  children,
})
const text = (value) => ({ type: 'text', value })

export function remarkSite() {
  return (tree) => {
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
  return (tree) => {
    visit(tree, 'element', (node, index, parent) => {
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
  }
}

function theme(name, dark) {
  return {
    name,
    type: dark ? 'dark' : 'light',
    colors: {
      'editor.foreground': dark ? '#d4d3cd' : '#3d3d3a',
      'editor.background': dark ? '#30302e' : '#f0eee6',
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
        settings: { foreground: dark ? '#94b4d4' : '#1b365d' },
      },
      {
        scope: ['entity.name.function', 'entity.name.type'],
        settings: { foreground: dark ? '#faf9f5' : '#141413' },
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
