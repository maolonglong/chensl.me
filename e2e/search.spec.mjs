import { randomBytes, randomInt } from 'node:crypto'
import { expect, test as base } from './site.mjs'

// The local Worker has no Workers AI or Vectorize binding, so /api/search answers with news
// keyword results only. Tests that need semantic results stub the endpoint in the browser.
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
        json: { query: '', semantic: [], news: [], semanticEnabled: true },
      })
    })
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
    // Give a second, late search the time it would need to start.
    await page.waitForTimeout(600)
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
      route.fulfill({ json: { query: '智能体', semantic: [], news: [], semanticEnabled: true } }),
    )
    await open('/search/?q=智能体')
    await expect(page.getByRole('status')).toHaveText('没有找到相关内容')
    await expect(results(page)).toHaveCount(0)
  })

  test('merges keyword and semantic results by rank', async ({ open, page }) => {
    const semantic = [
      {
        type: 'blog',
        url: '/blog/dockertest/',
        title: '语义结果',
        date: '2020-01-01',
        snippet: '',
      },
      {
        type: 'blog',
        url: '/blog/lock-free-queue/',
        title: '无锁队列',
        date: '2020-01-01',
        snippet: '',
      },
    ]
    await page.route('**/api/search/**', (route) =>
      route.fulfill({ json: { query: '无锁队列', semantic, news: [], semanticEnabled: true } }),
    )
    await open('/search/?q=无锁队列')
    // The article that both lists return ranks above the one only the semantic list returns.
    const links = results(page).getByRole('link')
    await expect(links.nth(0)).toHaveAttribute('href', '/blog/lock-free-queue/')
    await expect(links.nth(1)).toHaveAttribute('href', '/blog/dockertest/')
    await expect(results(page)).toHaveCount(2)
  })

  test('a short query lists keyword hits before semantic hits', async ({ open, page }) => {
    const issue = {
      type: 'news',
      url: '/news/2026-10-16/',
      title: '日报',
      date: '2026-10-16',
      snippet: '智谱发布',
    }
    const article = {
      type: 'blog',
      url: '/blog/1brc-in-zig/',
      title: '语义结果',
      date: '2024-02-22',
      snippet: '',
    }
    await page.route('**/api/search/**', (route) =>
      route.fulfill({
        json: { query: '智谱', semantic: [article, issue], news: [issue], semanticEnabled: true },
      }),
    )
    await open('/search/?q=智谱')
    const links = results(page).getByRole('link')
    await expect(links.nth(0)).toHaveAttribute('href', '/news/2026-10-16/')
    await expect(links.nth(1)).toHaveAttribute('href', '/blog/1brc-in-zig/')
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
    // The local Worker has no edge cache, so the second answer reflects the retraction.
    expect(await urls()).toEqual([])
  })

  test('rejects empty and overlong queries', async ({ api }) => {
    for (const q of ['', '%20', 'x'.repeat(65)]) {
      const response = await api.get(`/api/search/?q=${q}`)
      expect(response.status(), JSON.stringify(q)).toBe(400)
      expect(response.headers()['cache-control']).toBe('private, no-store')
    }
  })

  test('the navigation links the search page and marks it current', async ({ open, page }) => {
    await open('/search/')
    await expect(page.getByRole('link', { name: '搜索', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await open('/')
    const link = page.getByRole('link', { name: '搜索', exact: true })
    await expect(link).toHaveAttribute('href', '/search/')
    await expect(link).not.toHaveAttribute('aria-current', /.+/)
  })
})

test.describe('related articles', () => {
  test('an article links its related articles after the text', async ({ open, page }) => {
    await open('/blog/thin-agent-thick-harness/')
    const related = page.locator('.post-related')
    await expect(related).toContainText('相关文章：')
    await expect(related.getByRole('link')).toHaveCount(3)
    await expect(related.getByRole('link').first()).toHaveAttribute(
      'href',
      '/blog/harness-engineering/',
    )
  })

  test('an article without a related article above the threshold shows no line', async ({
    open,
    page,
  }) => {
    await open('/blog/lock-free-queue/')
    await expect(page.locator('.post-related')).toHaveCount(0)
  })
})
