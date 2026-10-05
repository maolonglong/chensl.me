import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { astroProject, buildAstro, frontmatter, write } from '../tests/support.mjs'
import { expect, test } from './site.mjs'

const cases = [
  { id: 'handmade', creation: { mode: 'handmade' }, label: '手作' },
  { id: 'assisted', creation: { mode: 'ai-assisted' }, label: 'AI 辅助' },
  { id: 'generated', creation: { mode: 'ai-generated' }, label: 'AI 生成' },
  { id: 'unmarked', label: null },
  {
    id: 'noted',
    label: 'AI 辅助',
    creation: {
      mode: 'ai-assisted',
      note: '  AI 用于整理结构和润色，观点与结论由作者确定。特殊文本 & <script>unexpected()</script> 应当原样可读。长词用于检查窄屏换行：abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz。  ',
    },
  },
]

// A real Astro build serves fixture articles over localhost. This checks static content and
// layout without inventing declarations for real posts. Worker headers and Actions stay in
// the main Wrangler suite; no page scripts are needed for creation declarations.
test.use({ javaScriptEnabled: false })
let origin
let server
let cleanup

test.beforeAll(async () => {
  test.setTimeout(120_000)
  const fixture = await astroProject('astro-creation-e2e-', (dispose) => {
    cleanup = dispose
  })
  for (const { id, creation } of cases) {
    await write(
      fixture,
      `src/content/blog/${id}.md`,
      `${frontmatter('创作声明与旧文提示', '2000-01-01', `comments: false\n${creation ? `creation: ${JSON.stringify(creation)}\n` : ''}`)}Original **body**.`,
    )
  }
  const dist = await buildAstro(fixture)
  server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
      const file = path.resolve(dist, `.${pathname}`, pathname.endsWith('/') ? 'index.html' : '')
      if (!file.startsWith(`${dist}${path.sep}`)) throw new Error('Outside fixture output')
      const body = await readFile(file)
      const types = {
        '.html': 'text/html; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.md': 'text/markdown; charset=utf-8',
        '.xml': 'application/xml; charset=utf-8',
        '.woff2': 'font/woff2',
      }
      response.writeHead(200, {
        'Content-Type': types[path.extname(file)] ?? 'application/octet-stream',
      })
      response.end(body)
    } catch {
      response.writeHead(404)
      response.end()
    }
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  origin = `http://127.0.0.1:${server.address().port}`
})

test.afterAll(async () => {
  if (server) await new Promise((resolve) => server.close(resolve))
  await cleanup?.()
})

test('creation declarations survive page, RSS and Markdown reads without scripts', async ({
  page,
  open,
  request,
}) => {
  const rss = await (await request.get(`${origin}/index.xml`)).text()
  for (const { id, label, creation } of cases) {
    await open(`${origin}/blog/${id}/`)
    const declaration = page.locator('.post-creation')
    const note = page.locator('.post-creation-note')
    if (label) await expect(declaration).toHaveText(label)
    else await expect(declaration).toHaveCount(0)
    if (creation?.note) await expect(note).toHaveText(creation.note.trim())
    else await expect(note).toHaveCount(0)
    await expect(page.locator('.post-header script, .post-header img')).toHaveCount(0)
    await expect(page.locator('.prose')).toHaveText('Original body.')

    const markdown = await (await request.get(`${origin}/blog/${id}/index.md`)).text()
    expect(markdown.endsWith('Original **body**.')).toBe(true)
    if (label) expect(markdown).toContain(`Creation: ${label}\n`)
    else expect(markdown).not.toContain('Creation:')
    if (creation?.note) {
      expect(markdown).toContain('Creation note: AI 用于整理结构和润色')
      expect(markdown).toContain('\\<script\\>unexpected()\\</script\\>')
      expect(markdown).not.toContain('<script>')
    } else expect(markdown).not.toContain('Creation note:')

    const feed = await page.evaluate(
      ({ rss, id }) => {
        const xml = new DOMParser().parseFromString(rss, 'application/xml')
        const item = [...xml.querySelectorAll('item')].find(
          (entry) => entry.querySelector('link').textContent === `https://chensl.me/blog/${id}/`,
        )
        const content = item.getElementsByTagNameNS(
          'http://purl.org/rss/1.0/modules/content/',
          'encoded',
        )[0].textContent
        const html = new DOMParser().parseFromString(content, 'text/html')
        return {
          xmlErrors: xml.querySelectorAll('parsererror').length,
          paragraphs: [...html.querySelectorAll('p')].map((element) => element.textContent),
          scripts: html.querySelectorAll('script').length,
        }
      },
      { rss, id },
    )
    expect(feed.xmlErrors).toBe(0)
    expect(feed.scripts).toBe(0)
    expect(feed.paragraphs).toEqual([
      ...(label ? [`创作方式：${label}${creation?.note ? `。${creation.note.trim()}` : ''}`] : []),
      'Original body.',
    ])
  }
  for (const route of ['/', '/blog/']) {
    await open(`${origin}${route}`)
    await expect(page.locator('.post-creation, .post-creation-note')).toHaveCount(0)
  }
})

for (const width of [375, 1280]) {
  for (const mode of ['light', 'dark']) {
    test(`creation metadata at ${width}px in ${mode}`, async ({ page, open, capture }) => {
      await page.setViewportSize({ width, height: 844 })
      await page.emulateMedia({ colorScheme: mode })
      for (const { id, label } of cases) {
        await open(`${origin}/blog/${id}/`)
        if (label) {
          const style = await page.locator('.post-creation').evaluate((element) => {
            const label = getComputedStyle(element)
            const date = getComputedStyle(document.querySelector('.post-meta time'))
            return {
              sameType:
                label.fontSize === date.fontSize &&
                label.color === date.color &&
                label.fontFamily === date.fontFamily,
              fontSize: label.fontSize,
              fontWeight: label.fontWeight,
              fontStyle: label.fontStyle,
              background: label.backgroundColor,
              border: label.borderWidth,
            }
          })
          expect(style).toEqual({
            sameType: true,
            fontSize: '14px',
            fontWeight: '400',
            fontStyle: 'normal',
            background: 'rgba(0, 0, 0, 0)',
            border: '0px',
          })
        }
        await expect(page.locator('.post-notice')).toBeVisible()
        if (id === 'noted') {
          const layout = await page.locator('.post-creation-note').evaluate((element) => {
            const note = element.getBoundingClientRect()
            const date = document.querySelector('.post-meta').getBoundingClientRect()
            const stale = document.querySelector('.post-notice').getBoundingClientRect()
            return { afterDate: note.top - date.bottom, beforeStale: stale.top - note.bottom }
          })
          expect(layout).toEqual({ afterDate: 8, beforeStale: 8 })
        }
        await capture(page, `creation-${id}-${width}-${mode}`)
      }
    })
  }
}
