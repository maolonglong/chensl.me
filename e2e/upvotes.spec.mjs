import { createRequire } from 'node:module'
import { expect, test as base } from './site.mjs'

// These specs cast real votes through the real Actions, so playwright.config.mjs accepts only
// loopback URLs and votes accumulate in the disposable local D1 database. Counts are asserted
// relative to a baseline read at the start of each test; that is exact because tests in one file
// run one after another and no other spec votes.
const requireAstro = createRequire(import.meta.resolve('astro/package.json'))
const { parse } = await import(requireAstro.resolve('devalue'))

const article = 'dockertest'
const otherArticle = 'semantic-view-sql-traps'

const test = base.extend({
  // Calls an Action the way a client would, outside the browser, with explicit control over the
  // visitor cookie, origin and client address. Each call uses a fresh request context so no cookie
  // is sent that the test did not pass.
  action: async ({ playwright, baseURL, clientAddress }, use) => {
    await use(async (name, postId, { cookie, origin = new URL(baseURL).origin } = {}) => {
      const api = await playwright.request.newContext()
      try {
        const response = await api.post(new URL(`/_actions/${name}/`, baseURL).href, {
          headers: {
            Origin: origin,
            'CF-Connecting-IP': clientAddress,
            ...(cookie && { Cookie: cookie }),
          },
          data: { postId },
        })
        const body = await response.text()
        return {
          status: response.status(),
          headers: response.headers(),
          data: response.ok() ? parse(body) : body,
        }
      } finally {
        await api.dispose()
      }
    })
  },
})

// A visitor is whoever holds the cookie that `getVotes` mints.
async function visit(action, postId = article) {
  const read = await action('getVotes', postId)
  expect(read.status, read.data).toBe(200)
  return { read, count: read.data.count, cookie: read.headers['set-cookie'].split(';')[0] }
}

test.describe('vote Actions', () => {
  test('a read is private, reports no vote and mints a hardened visitor cookie', async ({
    action,
  }) => {
    const { read } = await visit(action)
    expect(read.headers['cache-control']).toBe('private, no-store')
    expect(read.data.voted).toBe(false)
    expect(read.headers['set-cookie']).toMatch(/HttpOnly/i)
    expect(read.headers['set-cookie']).toMatch(/Secure/i)
    expect(read.headers['set-cookie']).toMatch(/SameSite=Strict/i)
  })

  test('a vote needs the visitor cookie and a same-origin request', async ({ action }) => {
    const { cookie } = await visit(action)
    expect((await action('upvote', article)).status).toBe(403)
    expect(
      (await action('upvote', article, { cookie, origin: 'https://other.example' })).status,
    ).toBe(403)
  })

  test('pages that are not published articles cannot be voted on', async ({ action }) => {
    const { cookie } = await visit(action)
    // Pages that exist but are not articles, and IDs that assets would redirect, are not votable.
    for (const postId of ['not-a-published-post', 'index', '404']) {
      for (const name of ['getVotes', 'upvote']) {
        expect((await action(name, postId, { cookie })).status, `${name} ${postId}`).toBe(404)
      }
    }
  })

  test('only slug-shaped article IDs reach the article lookup', async ({ action }) => {
    const { cookie } = await visit(action)
    // Path syntax must not be able to select another page.
    for (const postId of ['../dockertest', 'a/b', 'Dockertest', 'dockertest/', '', '%2e%2e']) {
      for (const name of ['getVotes', 'upvote']) {
        expect((await action(name, postId, { cookie })).status, `${name} ${postId}`).toBe(400)
      }
    }
  })

  test('concurrent duplicate submissions count once and persist', async ({ action }) => {
    const { cookie, count } = await visit(action)
    const votes = await Promise.all(
      Array.from({ length: 8 }, () => action('upvote', article, { cookie })),
    )
    for (const vote of votes) {
      expect(vote.status, vote.data).toBe(200)
      expect(vote.data).toEqual({ count: count + 1, voted: true })
    }
    expect((await action('getVotes', article, { cookie })).data).toEqual({
      count: count + 1,
      voted: true,
    })
  })

  test('a vote belongs to one article and one visitor', async ({ action }) => {
    const voter = await visit(action)
    expect((await action('upvote', article, { cookie: voter.cookie })).data).toEqual({
      count: voter.count + 1,
      voted: true,
    })
    expect((await action('getVotes', otherArticle, { cookie: voter.cookie })).data.voted).toBe(
      false,
    )

    const other = await action('getVotes', article)
    expect(other.data).toEqual({ count: voter.count + 1, voted: false })
    const otherCookie = other.headers['set-cookie'].split(';')[0]
    expect((await action('upvote', article, { cookie: otherCookie })).data).toEqual({
      count: voter.count + 2,
      voted: true,
    })
  })

  // Cloudflare's limiter is approximate and local to a location, not an exact global counter, so
  // a burst must eventually be limited rather than at an exact request number.
  test('submission bursts are rate limited and leave the count alone', async ({ action }) => {
    const { cookie, count } = await visit(action)
    const statuses = []
    for (let i = 0; i < 65; i++) {
      const vote = await action('upvote', article, { cookie })
      statuses.push(vote.status)
      if (vote.status === 200) expect(vote.data).toEqual({ count: count + 1, voted: true })
    }
    expect(statuses[0]).toBe(200)
    expect(statuses).toContain(429)
    expect(statuses.every((status) => status === 200 || status === 429)).toBe(true)
    expect((await action('getVotes', article, { cookie })).data).toEqual({
      count: count + 1,
      voted: true,
    })
  })

  test('read bursts are rate limited per client address', async ({ action }) => {
    const statuses = []
    for (let i = 0; i < 150; i++) statuses.push((await action('getVotes', article)).status)
    expect(statuses[0]).toBe(200)
    expect(statuses).toContain(429)
  })
})

async function captureStates(page, capture, state) {
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 720 })
    for (const mode of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme: mode })
      await page.evaluate(() =>
        document.querySelector('[data-upvote]').scrollIntoView({ block: 'center' }),
      )
      await capture(page, `${state}-${width}-${mode}`)
    }
  }
}

test('a failed vote can be retried from the keyboard and survives a reload', async ({
  page,
  open,
  action,
  capture,
}) => {
  const baseline = (await action('getVotes', article)).data.count
  const button = page.locator('[data-upvote] button')
  const icon = page.locator('[data-upvote] svg')
  const state = () =>
    button.evaluate((element) => ({
      voted: element.getAttribute('aria-disabled') === 'true',
      count: Number(element.querySelector('[data-count]').textContent),
    }))
  const color = () => button.evaluate((element) => getComputedStyle(element).color)

  await open(`/blog/${article}/`)
  await expect.poll(state).toEqual({ voted: false, count: baseline })
  await expect(icon).toHaveCSS('fill', 'none')
  const unvotedIcon = await icon.innerHTML()
  const unvotedColor = await color()
  await captureStates(page, capture, 'unvoted')

  await test.step('a failed request reports the problem and changes nothing', async () => {
    await page.route('**/_actions/upvote/**', (route) => route.abort())
    await button.click()
    await expect(page.locator('[data-upvote] [role=status]')).toContainText('重试')
    expect(await state()).toEqual({ voted: false, count: baseline })
    await captureStates(page, capture, 'error')
    await page.unroute('**/_actions/upvote/**')
  })

  await test.step('a keyboard vote keeps focus and is announced', async () => {
    await button.focus()
    await page.keyboard.press('Enter')
    await expect.poll(state).toEqual({ voted: true, count: baseline + 1 })
    await expect(button).toBeFocused()
    await expect(page.locator('[data-upvote] [aria-live]')).toHaveText('已点赞')
    await expect(icon).toHaveCSS('fill', 'none')
    expect(await icon.innerHTML()).toBe(unvotedIcon)
    await page.emulateMedia({ colorScheme: 'light' })
    expect(await color(), 'A voted button changes color').not.toBe(unvotedColor)
    await captureStates(page, capture, 'voted')
  })

  await test.step('a reload restores the vote', async () => {
    await page.reload()
    await expect.poll(state).toEqual({ voted: true, count: baseline + 1 })
  })
})
