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
    await use(
      async (
        data,
        { authorization = `Bearer ${token}`, contentType, path = '/api/news/' } = {},
      ) => {
        const api = await playwright.request.newContext()
        try {
          const response = await api.post(new URL(path, baseURL).href, {
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
      },
    )
  },
})

const issueFor = (date, overrides = {}) => ({
  date,
  title: '<b>今日</b> AI News',
  summary: '摘要 & 说明',
  items: [
    {
      title: '<img src=x onerror=alert(1)>新模型发布',
      summary: '一句话摘要',
      url: 'https://example.com/post?a=1&b=2',
      tag: 'OpenAI',
    },
    { title: 'Gemini 更新', summary: '第二条', url: 'https://example.com/g', tag: 'Google' },
    { title: 'Codex 更新', summary: '第三条', url: 'http://example.com/c', tag: 'OpenAI' },
    { title: 'pi 发布', summary: '第四条', url: 'https://example.com/pi', tag: 'pi' },
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
      'markup in a tag': issueFor(date, { items: [{ ...item, tag: '<b>OpenAI</b>' }] }),
      'line break in a tag': issueFor(date, { items: [{ ...item, tag: 'Open\nAI' }] }),
      'long tag': issueFor(date, { items: [{ ...item, tag: 'x'.repeat(33) }] }),
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
    expect(
      (await post(Buffer.alloc(65 * 1024, 0x20), { contentType: 'application/json' })).status,
    ).toBe(413)
  })

  test('writes append versions, a retry adds none, and the newest version is shown', async ({
    post,
    page,
    date,
  }) => {
    const first = await post(issueFor(date))
    expect(first.status).toBe(201)
    expect(first.body).toMatchObject({ status: 'created', date, version: 1 })
    const again = await post(issueFor(date))
    expect(again.status).toBe(200)
    expect(again.body).toMatchObject({ status: 'unchanged', version: 1 })
    const changed = await post(issueFor(date, { title: '更正后的标题' }))
    expect(changed.status).toBe(200)
    expect(changed.body).toMatchObject({ status: 'updated', version: 2 })

    await page.goto(`/news/${date}/`)
    await expect(page.locator('h1')).toHaveText('更正后的标题')
    await expect(page.locator('main .items > li')).toHaveCount(4)

    // Rolling back means posting the earlier content again; it becomes the next version.
    const rollback = await post(issueFor(date))
    expect(rollback.body).toMatchObject({ status: 'updated', version: 3 })
    await page.reload()
    await expect(page.locator('h1')).toHaveText('<b>今日</b> AI News')
  })
})

test.describe('news retraction', () => {
  const retract = (post, body, options) => post(body, { path: '/api/news/retract/', ...options })

  test('needs the token and an existing, valid date', async ({ post, page, date }) => {
    expect((await post(issueFor(date))).status).toBe(201)
    for (const authorization of [null, 'Bearer wrong-token']) {
      expect((await retract(post, { date }, { authorization })).status).toBe(401)
    }
    expect((await retract(post, { date: '2026-02-30' })).status).toBe(422)
    expect((await retract(post, { date, reason: 'x' })).status).toBe(422)
    expect((await retract(post, { date: `18${date.slice(2)}` })).status).toBe(404)
    expect((await page.goto(`/news/${date}/`)).status()).toBe(200)
  })

  test('hides the issue from its page and the archive, and can restore it', async ({
    post,
    page,
    date,
  }) => {
    expect((await post(issueFor(date))).status).toBe(201)
    const hidden = await retract(post, { date })
    expect(hidden.status).toBe(200)
    // Local Wrangler has no Workers Cache to purge.
    expect(hidden.body).toEqual({
      status: 'hidden',
      date,
      search: 'disabled',
      cache: 'unavailable',
    })

    const response = await page.goto(`/news/${date}/`)
    expect(response.status()).toBe(404)
    expect(response.headers()['cache-control']).toBe('no-store')
    await page.goto(`/news/archive/${date.slice(0, 7)}/`)
    await expect(page.locator(`main a[href="/news/${date}/"]`)).toHaveCount(0)

    // A new write keeps a retracted issue hidden; only an explicit restore shows it again.
    expect((await post(issueFor(date, { title: '改过' }))).body.status).toBe('updated')
    expect((await page.goto(`/news/${date}/`)).status()).toBe(404)
    const restored = await retract(post, { date, hidden: false })
    expect(restored.body).toEqual({
      status: 'visible',
      date,
      search: 'disabled',
      cache: 'unavailable',
    })
    expect((await page.goto(`/news/${date}/`)).status()).toBe(200)
    await expect(page.locator('h1')).toHaveText('改过')
  })

  test('removes the issue from the news feed', async ({ post, request }) => {
    // This date is among the newest the specs write, so the feed would otherwise list it.
    const date = '9999-11-29'
    expect([200, 201]).toContain((await post(issueFor(date))).status)
    expect((await retract(post, { date, hidden: false })).status).toBe(200)
    expect(await (await request.get('/news/index.xml')).text()).toContain(`/news/${date}/`)
    expect((await retract(post, { date })).status).toBe(200)
    expect(await (await request.get('/news/index.xml')).text()).not.toContain(`/news/${date}/`)
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
    // Workers Cache keeps the page for a day; a write or retraction purges these tags.
    expect(response.headers()['cache-control']).toMatch(/\bs-maxage=86400\b/)
    expect(response.headers()['cache-tag']).toBe(`news,news-${date}`)
    await expect(page.locator('h1')).toHaveText('<b>今日</b> AI News')
    const link = page.locator('main .items a').first()
    await expect(link).toHaveText('<img src=x onerror=alert(1)>新模型发布')
    await expect(link).toHaveAttribute('href', 'https://example.com/post?a=1&b=2')
    await expect(page.locator('main img')).toHaveCount(0)
    await expect(page.locator('nav a[href="/news/"]')).toHaveAttribute('aria-current', 'location')

    // Tags group in the order they first appear, and keep their capitalization.
    await expect(page.locator('main .group-tag')).toHaveText(['OpenAI', 'Google', 'pi'])
    await expect(page.locator('main .group').first().locator('.item-title')).toHaveText([
      '<img src=x onerror=alert(1)>新模型发布',
      'Codex 更新',
    ])
    await expect(page.locator('nav a[href="/news/"]')).toHaveText('AI News')
  })

  test('the index shows only the latest issue by tag and links the archive', async ({
    post,
    page,
  }) => {
    // The latest valid date stays newest, whatever else the database holds.
    const newest = '9999-12-31'
    expect([200, 201]).toContain((await post(issueFor(newest))).status)
    const response = await page.goto('/news/')
    expect(response.headers()['cache-control']).toMatch(/\bs-maxage=86400\b/)
    expect(response.headers()['cache-tag'].split(',')).toEqual(
      expect.arrayContaining(['news', `news-${newest}`]),
    )
    await expect(page.locator('nav a[href="/news/"]')).toHaveAttribute('aria-current', 'page')
    const days = page.locator('main .day')
    await expect(days).toHaveCount(1)
    await expect(days.locator('h2 a')).toHaveAttribute('href', `/news/${newest}/`)
    await expect(days.locator('.group-tag')).toHaveText(['OpenAI', 'Google', 'pi'])
    // Older issues are one click away: in the introduction and after the issue.
    const archive = page.locator('main a[href="/news/archive/"]')
    await expect(archive).toHaveCount(2)
    await expect(archive.last()).toHaveText('查看往期日报')
    await archive.last().click()
    await expect(page).toHaveURL(/\/news\/archive\/$/)
  })

  test('older issues stay reachable through the monthly archive', async ({ post, page, date }) => {
    // A later issue pushes this one off the index, whatever else the database holds.
    const old = `19${date.slice(2)}`
    const month = old.slice(0, 7)
    expect((await post(issueFor(old))).status).toBe(201)
    expect([200, 201]).toContain((await post(issueFor('9999-12-01'))).status)
    await page.goto('/news/')
    await expect(page.locator(`main a[href="/news/${old}/"]`)).toHaveCount(0)

    // Archive pages carry the news tag, so a write or retraction purges them too.
    const archive = await page.goto('/news/archive/')
    expect(archive.headers()['cache-tag'].split(',')).toContain('news')
    await expect(page.locator('nav a[href="/news/"]')).toHaveAttribute('aria-current', 'location')
    const [monthResponse] = await Promise.all([
      page.waitForResponse((response) => response.url().endsWith(`/news/archive/${month}/`)),
      page.locator(`main a[href="/news/archive/${month}/"]`).click(),
    ])
    expect(monthResponse.headers()['cache-tag'].split(',')).toEqual(
      expect.arrayContaining(['news', `news-${old}`]),
    )
    const entry = page.locator('main .issues > li', {
      has: page.locator(`a[href="/news/${old}/"]`),
    })
    await expect(entry.locator('a')).toHaveText('<b>今日</b> AI News')
    await expect(entry.locator('.tag')).toHaveText(['OpenAI', 'Google', 'pi'])
    expect((await page.goto(`/news/${old}/`)).status()).toBe(200)
  })

  test('news pages advertise and link only the news feed; blog pages keep the blog feed', async ({
    post,
    page,
    date,
  }) => {
    expect((await post(issueFor(date))).status).toBe(201)
    const feeds = () =>
      page
        .locator('head link[rel="alternate"][type="application/rss+xml"]')
        .evaluateAll((links) =>
          links.map((link) => ({ href: link.getAttribute('href'), title: link.title })),
        )
    for (const path of [
      '/news/',
      `/news/${date}/`,
      '/news/archive/',
      `/news/archive/${date.slice(0, 7)}/`,
    ]) {
      expect((await page.goto(path)).status(), path).toBe(200)
      expect(await feeds(), path).toEqual([
        { href: 'https://chensl.me/news/index.xml', title: '~chensl AI News' },
      ])
      const footerFeeds = page.locator('body > footer a[type="application/rss+xml"]')
      await expect(footerFeeds, path).toHaveCount(1)
      await expect(footerFeeds, path).toHaveAttribute('href', '/news/index.xml')
      expect(await footerFeeds.textContent(), path).toBe('AI News RSS')
    }
    for (const path of ['/', '/blog/', '/blog/dockertest/']) {
      await page.goto(path)
      expect(await feeds(), path).toEqual([
        { href: 'https://chensl.me/index.xml', title: '~chensl' },
      ])
    }
  })

  test('news pages share the fixed AI News cards, which assets serve as PNG', async ({
    post,
    page,
    request,
    date,
  }) => {
    expect((await post(issueFor(date))).status).toBe(201)
    const card = (property) =>
      page.locator(`head meta[property="${property}"]`).getAttribute('content')
    for (const [path, image] of [
      ['/news/', 'news'],
      [`/news/${date}/`, 'news'],
      ['/news/archive/', 'news-archive'],
      [`/news/archive/${date.slice(0, 7)}/`, 'news-archive'],
    ]) {
      expect((await page.goto(path)).status(), path).toBe(200)
      expect(await card('og:image'), path).toBe(`https://chensl.me/og/${image}.png`)
      expect(await card('og:image:width'), path).toBe('1200')
      expect(await card('og:image:height'), path).toBe('630')
      await expect(page.locator('head meta[name="twitter:card"]'), path).toHaveAttribute(
        'content',
        'summary_large_image',
      )
    }
    for (const image of ['news', 'news-archive']) {
      const response = await request.get(`/og/${image}.png`)
      expect(response.status(), image).toBe(200)
      expect(response.headers()['content-type'], image).toBe('image/png')
    }
    expect((await page.goto('/news/1899-01-01/')).status()).toBe(404)
    await expect(page.locator('head meta[property="og:image"]')).toHaveCount(0)
  })

  test('a missing or malformed date is a 404 that is not cached', async ({ page }) => {
    for (const path of [
      '/news/1899-01-01/',
      '/news/not-a-date/',
      '/news/archive/1899-01/',
      '/news/archive/2026-13/',
    ]) {
      const response = await page.goto(path)
      expect(response.status(), path).toBe(404)
      expect(response.headers()['cache-control'], path).toBe('no-store')
    }
  })

  test('the news feed carries escaped items with absolute links', async ({ post, request }) => {
    // The feed holds only the newest issues; this date sorts after the ones other specs write.
    const newest = '9999-11-30'
    expect([200, 201]).toContain((await post(issueFor(newest))).status)
    const response = await request.get('/news/index.xml')
    expect(response.status()).toBe(200)
    expect(response.headers()['cache-control']).toMatch(/\bs-maxage=86400\b/)
    expect(response.headers()['cache-tag'].split(',')).toEqual(
      expect.arrayContaining(['news', `news-${newest}`]),
    )
    const xml = await response.text()
    expect(xml).toContain(`<link>https://chensl.me/news/${newest}/</link>`)
    // The item HTML is escaped once for XML; the stored markup is escaped once more as text.
    expect(xml).toContain('&amp;lt;img src=x onerror=alert(1)&amp;gt;新模型发布')
    expect(xml).not.toContain('<img')
    expect(xml).toContain('<title>~chensl AI News</title>')
    expect(xml).toContain('<category>OpenAI</category>')
    expect(xml).toContain('[OpenAI]')
    expect(xml.match(/<item>/g).length).toBeLessThanOrEqual(20)
  })

  test('the site feed stays articles only', async ({ request }) => {
    const xml = await (await request.get('/index.xml')).text()
    expect(xml).not.toContain('/news/')
  })
})
