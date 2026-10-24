import { randomBytes, randomInt } from 'node:crypto'
import { expect, test as base } from './site.mjs'

const token = process.env.NEWS_TOKEN

const test = base.extend({
  context: async ({ context, clientAddress }, use) => {
    await context.route('**/api/search/**', (route) =>
      route.continue({
        headers: { ...route.request().headers(), 'cf-connecting-ip': clientAddress },
      }),
    )
    await use(context)
  },
  api: async ({ playwright, baseURL, clientAddress }, use) => {
    const api = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: { 'CF-Connecting-IP': clientAddress },
    })
    await use(api)
    await api.dispose()
  },
})

// A random date and random words, so earlier runs against a preview that stays up cannot match.
const randomDate = () =>
  new Date(Date.UTC(2000 + randomInt(900), 0, 1 + randomInt(365))).toISOString().slice(0, 10)
const hanzi = () => String.fromCodePoint(0x4e00 + randomInt(0x5000))

async function publish(api, date, word, pair) {
  const response = await api.post('/api/news/', {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      date,
      title: 'AI News',
      summary: '摘要',
      items: [
        { title: '无关条目', summary: '第一条', url: 'https://example.com/a', tag: 'OpenAI' },
        {
          title: `${word} 发布`,
          summary: `${pair}的说明`,
          url: 'https://example.com/b',
          tag: 'Google',
        },
      ],
    },
  })
  expect(response.status()).toBe(201)
}

const search = (page, query) => page.getByRole('searchbox').fill(query)
const results = (page) => page.locator('.search-results > li')

test.describe('search page', () => {
  test('finds articles by keyword through the static index', async ({ open, page }) => {
    await open('/search/')
    await search(page, '无锁队列')
    await expect(results(page).first().getByRole('link')).toHaveAttribute(
      'href',
      /^\/blog\/lock-free-queue\/$/,
    )
    await expect(results(page).first()).toContainText('文章')
    await expect(page).toHaveURL(/\?q=%E6%97%A0%E9%94%81%E9%98%9F%E5%88%97$/)
  })

  test('does not search while an input method is composing, and searches once after', async ({
    open,
    page,
  }) => {
    // A stand-in for the Pagefind module records every search, so a call before the
    // composition ends shows up even though it would find nothing.
    await page.route('**/pagefind/pagefind.js', (route) =>
      route.fulfill({
        contentType: 'text/javascript',
        body: 'export async function search(term) { (globalThis.pagefindTerms ??= []).push(term); return { results: [] } }',
      }),
    )
    const apiQueries = []
    await page.route('**/api/search/**', (route) => {
      apiQueries.push(new URL(route.request().url()).searchParams.get('q'))
      return route.fulfill({
        json: { query: '', news: [] },
      })
    })
    // Fake timers keep running in real time; runFor below fires any pending debounce at once.
    await page.clock.install()
    await open('/search/')
    const box = page.getByRole('searchbox')
    await box.focus()
    // Pinyin keystrokes, each followed by a pause longer than the 300 ms debounce, as a slow
    // typist would leave them. The browser marks these input events with isComposing.
    await box.evaluate(async (input) => {
      const pause = () => new Promise((resolve) => setTimeout(resolve, 450))
      input.dispatchEvent(new CompositionEvent('compositionstart', { data: '' }))
      for (const text of ['n', 'ni', 'ni h', 'ni ha', 'ni hao']) {
        input.value = text
        input.dispatchEvent(
          new InputEvent('input', { isComposing: true, inputType: 'insertCompositionText' }),
        )
        await pause()
      }
      input.value = '你好'
      input.dispatchEvent(
        new InputEvent('input', { isComposing: true, inputType: 'insertCompositionText' }),
      )
      input.dispatchEvent(new CompositionEvent('compositionend', { data: '你好' }))
    })
    await expect(page.getByRole('status')).toHaveText('没有找到相关内容')
    // Fire every timer a second, late search would wait on: the 300 ms debounce, twice over.
    await page.clock.runFor(600)
    // Pagefind runs the plain and the phrase search once for the final text.
    expect({
      api: apiQueries,
      pagefind: await page.evaluate(() => globalThis.pagefindTerms ?? []),
    }).toEqual({ api: ['你好'], pagefind: ['你好', '"你好"'] })
    await expect(page).toHaveURL(/\?q=%E4%BD%A0%E5%A5%BD$/)
  })

  test('a Chinese phrase does not match articles that only contain its characters apart', async ({
    open,
    page,
  }) => {
    // 智能体 appears in no article as a phrase; the characters 智, 能 and 体 appear in many.
    await page.route('**/api/search/**', (route) =>
      route.fulfill({ json: { query: '智能体', news: [] } }),
    )
    await open('/search/?q=智能体')
    await expect(page.getByRole('status')).toHaveText('没有找到相关内容')
    await expect(results(page)).toHaveCount(0)
  })

  test('merges article and news results by rank', async ({ open, page }) => {
    const issue = {
      type: 'news',
      url: '/news/2026-10-16/',
      title: '日报',
      date: '2026-10-16',
      snippet: '无锁队列',
    }
    await page.route('**/api/search/**', (route) =>
      route.fulfill({ json: { query: '无锁队列', news: [issue] } }),
    )
    await open('/search/?q=无锁队列')
    const links = results(page).getByRole('link')
    await expect(links.nth(0)).toHaveAttribute('href', '/blog/lock-free-queue/')
    await expect(links.nth(1)).toHaveAttribute('href', '/news/2026-10-16/')
    await expect(results(page)).toHaveCount(2)
  })

  test('keeps article results when the search API fails', async ({ open, page }) => {
    await page.route('**/api/search/**', (route) => route.fulfill({ status: 500, body: '' }))
    await open('/search/?q=无锁队列')
    await expect(results(page).first().getByRole('link')).toHaveAttribute(
      'href',
      '/blog/lock-free-queue/',
    )
    await expect(page.getByRole('status')).toContainText('部分搜索暂时不可用')
  })

  test('finds AI News by keyword, also with two-character terms', async ({ open, page, api }) => {
    const date = randomDate()
    const word = `kw${randomBytes(4).toString('hex')}`
    const pair = hanzi() + hanzi()
    await publish(api, date, word, pair)
    await open('/search/')
    for (const query of [word, pair]) {
      await search(page, query)
      const hit = results(page).filter({ has: page.locator(`a[href="/news/${date}/"]`) })
      await expect(hit, query).toHaveCount(1)
      await expect(hit).toContainText(`AI News · ${date}`)
      await expect(hit.locator('.search-snippet')).toContainText(`${word} 发布`)
    }
  })

  test('a retracted issue leaves the search results', async ({ api }) => {
    const date = randomDate()
    const word = `kw${randomBytes(4).toString('hex')}`
    await publish(api, date, word, hanzi() + hanzi())
    const urls = async () =>
      (await (await api.get(`/api/search/?q=${word}`)).json()).news.map((hit) => hit.url)
    expect(await urls()).toEqual([`/news/${date}/`])
    const retract = await api.post('/api/news/retract/', {
      headers: { Authorization: `Bearer ${token}` },
      data: { date },
    })
    expect(retract.status()).toBe(200)
    expect(await urls()).toEqual([])
  })

  test('reports D1 wait time in Server-Timing', async ({ api }) => {
    const response = await api.get('/api/search/?q=docker')
    expect(response.status()).toBe(200)
    expect(response.headers()['server-timing']).toMatch(/^d1;dur=\d+$/)
  })

  test('rejects empty and overlong queries and normalizes control characters and astral code points', async ({
    api,
    open,
    page,
  }) => {
    for (const q of ['', '%20', '%00', 'x'.repeat(65)]) {
      const response = await api.get(`/api/search/?q=${q}`)
      expect(response.status(), JSON.stringify(q)).toBe(400)
      expect(response.headers()['cache-control']).toBe('private, no-store')
    }
    // Both /api/search and /api/search/ reach the Worker handler, and NUL bytes never break FTS5.
    for (const path of ['/api/search?q=abc%00def', '/api/search/?q=abc%00def']) {
      const response = await api.get(path)
      expect(response.status(), path).toBe(200)
      expect(response.headers()['cache-control'], path).toBe('private, no-store')
      const body = await response.json()
      expect(body.query, path).toBe('abc def')
    }
    // 64 Unicode code points (65 UTF-16 code units) must not split the surrogate pair in the page.
    const astral64 = `${'a'.repeat(63)}𠀀`
    await open(`/search/?q=${encodeURIComponent(astral64)}`)
    await expect(page.getByRole('status')).toHaveText('没有找到相关内容')
  })
})
