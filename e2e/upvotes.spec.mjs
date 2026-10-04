import { randomUUID } from 'node:crypto'
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

// Existing identities are opaque UUIDs. Seed an unvoted identity for isolation/concurrency tests;
// first-vote tests below separately exercise server-issued cookies through the real Actions.
async function visit(action, postId = article) {
  const cookie = `__Host-blog-voter=${randomUUID()}`
  const read = await action('getVotes', postId, { cookie })
  expect(read.status, read.data).toBe(200)
  return { read, count: read.data.count, cookie }
}

test.describe('vote Actions', () => {
  test('reads are private and never create or replace visitor cookies', async ({ action }) => {
    for (const cookie of [
      undefined,
      '__Host-blog-voter=invalid',
      `__Host-blog-voter=${randomUUID()}`,
    ]) {
      const read = await action('getVotes', article, { cookie })
      expect(read.status, read.data).toBe(200)
      expect(read.headers['cache-control']).toBe('private, no-store')
      expect(read.headers['set-cookie']).toBeUndefined()
      expect(read.data.voted).toBe(false)
    }
  })

  for (const initialCookie of [undefined, '__Host-blog-voter=invalid']) {
    test(`a first vote with ${initialCookie ? 'an invalid' : 'no'} cookie creates a persistent identity`, async ({
      action,
    }) => {
      const baseline = (await action('getVotes', article)).data.count
      // The submission has no identity established by a prior read.
      const vote = await action('upvote', article, { cookie: initialCookie })
      expect(vote.status, vote.data).toBe(200)
      expect(vote.data).toEqual({ count: baseline + 1, voted: true })
      expect(vote.headers['cache-control']).toBe('private, no-store')
      const setCookie = vote.headers['set-cookie']
      expect(setCookie).toMatch(
        /^__Host-blog-voter=[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12};/,
      )
      expect(setCookie).toMatch(/HttpOnly/i)
      expect(setCookie).toMatch(/Secure/i)
      expect(setCookie).toMatch(/SameSite=Strict/i)
      expect(setCookie).toMatch(/Path=\/(?:;|$)/i)
      expect(setCookie).toMatch(/Max-Age=31536000/i)
      expect(setCookie).not.toMatch(/Domain=/i)

      const cookie = setCookie.split(';')[0]
      const read = await action('getVotes', article, { cookie })
      expect(read.data).toEqual({ count: baseline + 1, voted: true })
      expect(read.headers['set-cookie']).toBeUndefined()
      const duplicate = await action('upvote', article, { cookie })
      expect(duplicate.data).toEqual({ count: baseline + 1, voted: true })
      expect(duplicate.headers['set-cookie']).toBeUndefined()
    })
  }

  test('a first vote still requires a same-origin request', async ({ action }) => {
    const baseline = (await action('getVotes', article)).data.count
    const vote = await action('upvote', article, { origin: 'https://other.example' })
    expect(vote.status).toBe(403)
    expect(vote.headers['set-cookie']).toBeUndefined()
    expect((await action('getVotes', article)).data.count).toBe(baseline)
  })

  test('pages that are not published articles cannot be voted on', async ({ action }) => {
    // Pages that exist but are not articles, and IDs that assets would redirect, are not votable.
    for (const postId of ['not-a-published-post', 'index', '404']) {
      for (const name of ['getVotes', 'upvote']) {
        const response = await action(name, postId)
        expect(response.status, `${name} ${postId}`).toBe(404)
        expect(response.headers['set-cookie']).toBeUndefined()
      }
    }
  })

  test('only slug-shaped article IDs reach the article lookup', async ({ action }) => {
    // Path syntax must not be able to select another page.
    for (const postId of ['../dockertest', 'a/b', 'Dockertest', 'dockertest/', '', '%2e%2e']) {
      for (const name of ['getVotes', 'upvote']) {
        const response = await action(name, postId)
        expect(response.status, `${name} ${postId}`).toBe(400)
        expect(response.headers['set-cookie']).toBeUndefined()
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
    expect((await action('upvote', article)).data).toEqual({
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
    const limited = await action('upvote', article)
    expect(limited.status).toBe(429)
    expect(limited.headers['set-cookie']).toBeUndefined()
    expect((await action('getVotes', article)).data.count).toBe(count + 1)
  })

  test('read bursts are rate limited per client address', async ({ action }) => {
    // A sequential burst can cross the limiter's fixed one-minute window. Keep this burst in one
    // scheduling interval so the assertion verifies the configured per-window budget.
    const statuses = await Promise.all(
      Array.from({ length: 150 }, async () => (await action('getVotes', article)).status),
    )
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

test('a keyboard vote changes the button and persists after reload', async ({
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
      voted: element.disabled,
      count: Number(element.querySelector('[data-count]').textContent),
    }))
  const color = () => button.evaluate((element) => getComputedStyle(element).color)

  await open(`/blog/${article}/`)
  await expect.poll(state).toEqual({ voted: false, count: baseline })
  await expect(icon).toHaveCSS('fill', 'none')
  const unvotedIcon = await icon.innerHTML()
  const unvotedColor = await color()
  await captureStates(page, capture, 'unvoted')

  await test.step('a keyboard vote disables the button and is announced', async () => {
    const response = page.waitForResponse('**/_actions/upvote/**')
    await button.focus()
    await page.keyboard.press('Enter')
    await expect.poll(state).toEqual({ voted: true, count: baseline + 1 })
    expect((await response).status()).toBe(200)
    await expect(button).toHaveAccessibleName(`已点赞，${baseline + 1} 票`)
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

test('an unavailable initial count stays blank and does not prevent a first vote', async ({
  page,
  open,
  capture,
  action,
}) => {
  const baseline = (await action('getVotes', article)).data.count
  const button = page.locator('[data-upvote] button')
  const count = page.locator('[data-upvote] [data-count]')
  const failure = page.waitForEvent('requestfailed', (request) =>
    request.url().includes('/_actions/getVotes/'),
  )
  await page.route('**/_actions/getVotes/**', (route) => route.abort())
  await open(`/blog/${article}/`)
  await failure
  await expect(button).toBeEnabled()
  await expect(count).toHaveText('')
  await expect(page.locator('[data-upvote] [aria-live]')).toBeEmpty()
  await expect(page.locator('#vote-status')).toHaveCount(0)
  await captureStates(page, capture, 'unavailable')

  const response = page.waitForResponse('**/_actions/upvote/**')
  await button.click()
  expect((await response).status()).toBe(200)
  await page.unroute('**/_actions/getVotes/**')
  await page.reload()
  await expect(count).toHaveText(String(baseline + 1))
  await expect(button).toBeDisabled()
})

test('a first vote succeeds while the initial read is pending and keeps its cookie', async ({
  page,
  context,
  open,
  action,
}) => {
  const baseline = (await action('getVotes', article)).data.count
  let release
  const pending = new Promise((resolve) => (release = resolve))
  let received
  const reading = new Promise((resolve) => (received = resolve))
  await page.route('**/_actions/getVotes/**', async (route) => {
    received()
    await pending
    await route.fallback()
  })
  await open(`/blog/${article}/`)
  await reading
  const voterCookies = async () =>
    (await context.cookies()).filter((cookie) => cookie.name === '__Host-blog-voter')
  expect(await voterCookies()).toEqual([])

  try {
    const response = page.waitForResponse('**/_actions/upvote/**')
    await page.locator('[data-upvote] button').click()
    expect((await response).status()).toBe(200)
    const cookies = await voterCookies()
    expect(cookies).toHaveLength(1)
    const value = cookies[0].value
    const read = page.waitForResponse('**/_actions/getVotes/**')
    release()
    expect((await read).headers()['set-cookie']).toBeUndefined()
    expect((await voterCookies()).map((cookie) => cookie.value)).toEqual([value])
    await page.unroute('**/_actions/getVotes/**')
    await page.reload()
    await expect(page.locator('[data-upvote] [data-count]')).toHaveText(String(baseline + 1))
    await expect(page.locator('[data-upvote] button')).toBeDisabled()
  } finally {
    release()
  }
})

for (const failure of ['network', 'forbidden']) {
  test(`a ${failure} failure leaves the immediate vote feedback unchanged`, async ({
    page,
    open,
    action,
    capture,
    clientAddress,
  }) => {
    const baseline = (await action('getVotes', article)).data.count
    const button = page.locator('[data-upvote] button')
    const count = page.locator('[data-upvote] [data-count]')
    await open(`/blog/${article}/`)
    await expect(count).toHaveText(String(baseline))

    let release
    const pending = new Promise((resolve) => (release = resolve))
    let submissions = 0
    await page.route('**/_actions/upvote/**', async (route) => {
      submissions++
      await pending
      if (failure === 'network') await route.abort()
      else {
        // Chromium keeps its own Origin on continued browser requests. Fetch the real rejection
        // through the request API, then deliver that response to exercise the client failure path.
        const response = await route.fetch({
          headers: {
            ...route.request().headers(),
            'cf-connecting-ip': clientAddress,
            origin: 'https://other.example',
          },
        })
        await route.fulfill({ response })
      }
    })
    const finished =
      failure === 'network'
        ? page.waitForEvent('requestfailed', (request) =>
            request.url().includes('/_actions/upvote/'),
          )
        : page.waitForResponse('**/_actions/upvote/**')
    await button.click()
    await expect(button).toBeDisabled()
    await expect(count).toHaveText(String(baseline + 1))
    await expect(button).toHaveAttribute('data-voted', 'true')
    await expect(page.locator('[data-upvote] [aria-live]')).toHaveText('已点赞')
    await button.dispatchEvent('click')
    if (failure === 'network') await captureStates(page, capture, 'pending')
    release()
    const result = await finished
    if (failure === 'forbidden') expect(result.status()).toBe(403)
    // Give the client time to process rejection; no rollback or retry UI should appear.
    await page.waitForTimeout(300)
    expect(submissions).toBe(1)
    await expect(button).toBeDisabled()
    await expect(count).toHaveText(String(baseline + 1))
    await expect(page.locator('#vote-status')).toHaveCount(0)
    if (failure === 'network') await captureStates(page, capture, 'failed-vote')
    expect((await action('getVotes', article)).data.count).toBe(baseline)

    await page.reload()
    await expect(count).toHaveText(String(baseline))
    await expect(button).toBeEnabled()
  })
}
