import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { astroProject, buildAstro, frontmatter, write } from '../tests/support.mjs'
import { expect, test } from './site.mjs'

// Fixture articles with a known amount of text pin the shown length, the reading time, and the
// JSON-LD wordCount. The rates are 300 Chinese characters and 238 English words a minute.
const code = `\`\`\`text\n${'code '.repeat(500)}\n\`\`\``
const cases = [
  {
    id: 'mixed',
    extra: 'creation: { mode: handmade }\n',
    body: `${'读'.repeat(900)}。\n\n${'word '.repeat(238)}\n\n${code}`,
    meta: '2000-01-01 · 约 1100 字 · 4 分钟 · 手作',
    wordCount: 1138,
  },
  {
    id: 'short',
    body: '只有十个字的短文，就这样。',
    meta: '2000-01-01 · 约 11 字 · 1 分钟',
    wordCount: 11,
  },
]

test.describe('reading time from fixture articles', () => {
  test.use({ javaScriptEnabled: false })
  let origin
  let server
  let cleanup

  test.beforeAll(async () => {
    test.setTimeout(120_000)
    const fixture = await astroProject('astro-reading-time-e2e-', (dispose) => {
      cleanup = dispose
    })
    for (const { id, extra = '', body } of cases) {
      await write(
        fixture,
        `src/content/blog/${id}.md`,
        `${frontmatter('字数与阅读时长', '2000-01-01', `comments: false\n${extra}`)}${body}\n`,
      )
    }
    const dist = await buildAstro(fixture)
    server = createServer(async (request, response) => {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
      const file = path.resolve(dist, `.${pathname}`, pathname.endsWith('/') ? 'index.html' : '')
      try {
        if (!file.startsWith(`${dist}${path.sep}`)) throw new Error('Outside fixture output')
        const body = await readFile(file)
        const type = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8' }
        response.writeHead(200, {
          'Content-Type': type[path.extname(file)] ?? 'application/octet-stream',
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

  test('articles show their length and reading time after the date', async ({ page, open }) => {
    for (const { id, meta, wordCount } of cases) {
      await open(`${origin}/blog/${id}/`)
      const shown = await page
        .locator('.post-meta')
        .evaluate((element) => element.textContent.replace(/\s+/g, ' ').trim())
      expect(shown, `${id}: meta line`).toBe(meta)
      const schema = JSON.parse(
        await page.locator('script[type="application/ld+json"]').textContent(),
      )
      expect(schema, `${id}: JSON-LD`).toMatchObject({ '@type': 'BlogPosting', wordCount })
      // The estimate is article chrome, not article text, so keyword search does not index it.
      await expect(page.locator('[data-pagefind-body] .post-meta')).toHaveCount(1)
    }
  })
})

for (const width of [375, 1280]) {
  for (const mode of ['light', 'dark']) {
    test(`article length and reading time at ${width}px in ${mode}`, async ({
      page,
      open,
      capture,
    }) => {
      await page.setViewportSize({ width, height: 844 })
      await page.emulateMedia({ colorScheme: mode })
      await open('/blog/harness-engineering/')
      const meta = await page.locator('.post-meta').evaluate((element) => {
        const date = getComputedStyle(element.querySelector('time'))
        const parts = [...element.querySelectorAll('.post-length, .post-reading-time')]
        return {
          text: element.textContent.replace(/\s+/g, ' ').trim(),
          sameType: parts.map((part) => {
            const style = getComputedStyle(part)
            return style.fontSize === date.fontSize && style.color === date.color
          }),
          unbroken: parts.every((part) => part.getClientRects().length === 1),
        }
      })
      expect(meta.text).toMatch(/^\d{4}-\d{2}-\d{2} · 约 \d+ 字 · \d+ 分钟( · \S.*)?$/)
      expect(meta.sameType).toEqual([true, true])
      expect(meta.unbroken).toBe(true)
      await capture(page, `reading-time-${width}-${mode}`)
    })
  }
}
