import { randomInt } from 'node:crypto'
import { expect, test as base } from './site.mjs'

// These specs write issues through the real endpoint into the disposable local D1 database.
// Each test uses its own random date, so earlier runs against a preview that stays up cannot
// collide with it.
const token = process.env.NEWS_TOKEN

const test = base.extend({
  // oxlint-disable-next-line no-empty-pattern
  date: async ({}, use) => {
    const day = new Date(Date.UTC(2000 + randomInt(900), 0, 1 + randomInt(365)))
    await use(day.toISOString().slice(0, 10))
  },
  post: async ({ playwright, baseURL, clientAddress }, use) => {
    await use(async (data, { authorization = `Bearer ${token}`, contentType } = {}) => {
      const api = await playwright.request.newContext()
      try {
        const response = await api.post(new URL('/api/news/', baseURL).href, {
          headers: {
            'CF-Connecting-IP': clientAddress,
            ...(authorization && { Authorization: authorization }),
            ...(contentType && { 'Content-Type': contentType }),
          },
          data,
        })
        return {
          status: response.status(),
          headers: response.headers(),
          body: await response.json(),
        }
      } finally {
        await api.dispose()
      }
    })
  },
})

const issueFor = (date, overrides = {}) => ({
  date,
  title: '<b>今日</b> 晚报',
  summary: '摘要 & 说明',
  items: [
    {
      title: '<img src=x onerror=alert(1)>新模型发布',
      summary: '一句话摘要',
      url: 'https://example.com/post?a=1&b=2',
      tag: '模型',
    },
  ],
  ...overrides,
})

test.describe('news API', () => {
  test('rejects a missing or wrong token without writing', async ({ post, page, date }) => {
    for (const authorization of [null, 'Bearer wrong-token', `Basic ${token}`, token]) {
      const response = await post(issueFor(date), { authorization })
      expect(response.status, authorization ?? 'none').toBe(401)
      expect(response.headers['cache-control']).toBe('private, no-store')
    }
    expect((await page.goto(`/news/${date}/`)).status()).toBe(404)
  })

  test('rejects malformed issues with a 4xx status', async ({ post, date }) => {
    const item = issueFor(date).items[0]
    const cases = {
      'impossible date': issueFor('2026-02-30'),
      'date format': issueFor('2026-2-3'),
      'javascript URL': issueFor(date, { items: [{ ...item, url: 'javascript:alert(1)' }] }),
      'data URL': issueFor(date, { items: [{ ...item, url: 'data:text/html,x' }] }),
      'no items': issueFor(date, { items: [] }),
      'too many items': issueFor(date, { items: Array(31).fill(item) }),
      'long title': issueFor(date, { title: 'x'.repeat(121) }),
      'wrong type': issueFor(date, { summary: 42 }),
      'unknown field': { ...issueFor(date), html: '<p>x</p>' },
      'unknown item field': issueFor(date, { items: [{ ...item, html: '<p>x</p>' }] }),
    }
    for (const [name, data] of Object.entries(cases)) {
      const response = await post(data)
      expect(response.status, name).toBe(422)
    }
    expect((await post(Buffer.from('{not json'), { contentType: 'application/json' })).status).toBe(
      400,
    )
    expect(
      (await post(Buffer.from(JSON.stringify(issueFor(date))), { contentType: 'text/plain' }))
        .status,
    ).toBe(415)
  })

  test('a repeated write is idempotent and a changed write replaces the issue', async ({
    post,
    page,
    date,
  }) => {
    const first = await post(issueFor(date))
    expect(first.status).toBe(201)
    expect(first.body).toMatchObject({ status: 'created', date })
    const again = await post(issueFor(date))
    expect(again.status).toBe(200)
    expect(again.body.status).toBe('unchanged')
    const changed = await post(issueFor(date, { title: '更正后的标题' }))
    expect(changed.status).toBe(200)
    expect(changed.body.status).toBe('updated')

    await page.goto(`/news/${date}/`)
    await expect(page.locator('h1')).toHaveText('更正后的标题')
    await expect(page.locator('main ol > li')).toHaveCount(1)
  })
})

test.describe('news pages', () => {
  test('render stored text as text, link only web URLs, and cache publicly', async ({
    post,
    page,
    date,
  }) => {
    expect((await post(issueFor(date))).status).toBe(201)

    const response = await page.goto(`/news/${date}/`)
    expect(response.status()).toBe(200)
    expect(response.headers()['cache-control']).toMatch(/\bs-maxage=\d+/)
    await expect(page.locator('h1')).toHaveText('<b>今日</b> 晚报')
    const link = page.locator('main ol a')
    await expect(link).toHaveText('<img src=x onerror=alert(1)>新模型发布')
    await expect(link).toHaveAttribute('href', 'https://example.com/post?a=1&b=2')
    await expect(page.locator('main img')).toHaveCount(0)
    await expect(page.locator('nav a[href="/news/"]')).toHaveAttribute('aria-current', 'location')

    const index = await page.goto('/news/')
    expect(index.headers()['cache-control']).toMatch(/\bs-maxage=\d+/)
    await expect(page.locator(`main a[href="/news/${date}/"]`)).toHaveText('<b>今日</b> 晚报')
    await expect(page.locator('nav a[href="/news/"]')).toHaveAttribute('aria-current', 'page')
  })

  test('a missing or malformed date is a 404 that is not cached', async ({ page }) => {
    for (const path of ['/news/1999-01-01/', '/news/not-a-date/']) {
      const response = await page.goto(path)
      expect(response.status(), path).toBe(404)
      expect(response.headers()['cache-control'], path).toBe('no-store')
    }
  })

  test('the news feed carries escaped items with absolute links', async ({
    post,
    request,
    date,
  }) => {
    expect((await post(issueFor(date))).status).toBe(201)
    const response = await request.get('/news/index.xml')
    expect(response.status()).toBe(200)
    expect(response.headers()['cache-control']).toMatch(/\bs-maxage=\d+/)
    const xml = await response.text()
    expect(xml).toContain(`<link>https://chensl.me/news/${date}/</link>`)
    // The item HTML is escaped once for XML; the stored markup is escaped once more as text.
    expect(xml).toContain('&amp;lt;img src=x onerror=alert(1)&amp;gt;新模型发布')
    expect(xml).not.toContain('<img')
  })

  test('the site feed stays articles only', async ({ request }) => {
    const xml = await (await request.get('/index.xml')).text()
    expect(xml).not.toContain('/news/')
  })
})
