import { expect, expectAll, test } from './site.mjs'

// Articles with real snapshot entries: gobreaker links sony/gobreaker, buddy the archived
// maolonglong/zig-buddy2.
const card = (page) => page.locator('.repo-card')
const fresh = {
  name: 'sony/gobreaker',
  description: 'Circuit Breaker implemented in Go',
  stars: 4321,
  forks: 1234,
  language: 'Go',
  archived: true,
  pushedAt: '2026-10-01T02:03:04Z',
}

function probeCards() {
  const box = (element) => element.getBoundingClientRect().toJSON()
  const code = getComputedStyle(document.querySelector('.highlight'))
  const prose = box(document.querySelector('.prose'))
  return [...document.querySelectorAll('.repo-card')].map((card) => {
    const link = card.querySelector('a')
    const style = getComputedStyle(link)
    const description = card.querySelector('.repo-card-description')
    const lineHeight = description && parseFloat(getComputedStyle(description).lineHeight)
    return {
      repo: card.dataset.repo,
      href: link?.getAttribute('href'),
      name: card.querySelector('.repo-card-name')?.textContent,
      archived: card.querySelector('.repo-card-archived')?.textContent ?? null,
      description: description?.textContent ?? null,
      descriptionLines: description ? Math.round(box(description).height / lineHeight) : 0,
      stats: card.querySelector('.repo-card-stats')?.textContent,
      links: card.querySelectorAll('a').length,
      extras: card.querySelectorAll('img, script, iframe, svg').length,
      frame:
        style.borderTopWidth === '1px' &&
        style.borderTopStyle === 'solid' &&
        style.borderRadius === code.borderRadius,
      underline: style.textDecorationLine,
      arrow: getComputedStyle(card.querySelector('.repo-card-name'), '::after').content.includes(
        '↗',
      ),
      inColumn: box(link).left >= prose.left && box(link).right <= prose.right,
      height: box(link).height,
    }
  })
}

async function answer(page, respond) {
  const requests = []
  await page.route('**/api/github/repos/**', (route) => {
    requests.push(new URL(route.request().url()).pathname)
    return respond(route)
  })
  return requests
}

async function cspViolations(page) {
  await page.addInitScript(() => {
    window.cspViolations = []
    document.addEventListener('securitypolicyviolation', (event) =>
      window.cspViolations.push(event.violatedDirective),
    )
  })
  return () => page.evaluate(() => window.cspViolations)
}

test.describe('GitHub card refresh', () => {
  for (const width of [390, 1280]) {
    for (const mode of ['light', 'dark']) {
      test(`fresh data replaces the numbers without moving the card at ${width}px in ${mode}`, async ({
        page,
        open,
        capture,
      }) => {
        await page.setViewportSize({ width, height: 844 })
        await page.emulateMedia({ colorScheme: mode })
        let release
        const held = new Promise((resolve) => (release = resolve))
        const requests = await answer(page, async (route) => {
          await held
          return route.fulfill({ json: fresh })
        })
        const violations = await cspViolations(page)
        await open('/blog/gobreaker/')
        await expect(card(page)).toHaveCount(1)
        const [initial] = await page.evaluate(probeCards)
        expectAll(`gobreaker card at ${width}px in ${mode}`, initial, {
          'has a hairline frame with the code block corners': initial.frame,
          'has no underline at rest': initial.underline === 'none',
          'carries an external link arrow': initial.arrow,
          'stays inside the column': initial.inColumn,
          'is a 44 px touch target': initial.height >= 44,
          'clips the description to two lines': initial.descriptionLines <= 2,
        })
        const stats = card(page).locator('.repo-card-stats')
        const before = await stats.textContent()
        const head = await card(page).locator('.repo-card-head').boundingBox()
        const box = await card(page).locator('a').boundingBox()
        release()
        await expect(stats).toHaveText('Go · ★ 4.3k · fork 1.2k · 2026 年 10 月更新')
        expect(before).not.toBe(await stats.textContent())
        await expect(card(page).locator('.repo-card-archived')).toHaveText('已归档')
        await expect(card(page).locator('.repo-card-archived')).toHaveAttribute(
          'data-pagefind-ignore',
          '',
        )
        const after = await card(page).locator('a').boundingBox()
        expect(after.height).toBe(box.height)
        expect((await card(page).locator('.repo-card-head').boundingBox()).y).toBe(head.y)
        expect(requests).toEqual(['/api/github/repos/sony/gobreaker/'])
        expect(await violations()).toEqual([])
        await card(page).evaluate((element) => element.scrollIntoView({ block: 'center' }))
        await capture(page, `github-card-refreshed-${width}-${mode}`)
      })
    }
  }

  test('an unarchived repository loses the archived label', async ({ page, open }) => {
    await page.setViewportSize({ width: 1280, height: 844 })
    await answer(page, (route) =>
      route.fulfill({
        json: { ...fresh, name: 'maolonglong/zig-buddy2', archived: false, description: '' },
      }),
    )
    await open('/blog/buddy/')
    await expect(card(page)).toHaveCount(1)
    await expect(card(page).locator('.repo-card-archived')).toHaveCount(0)
    // An empty fresh description keeps the build text.
    await expect(card(page).locator('.repo-card-description')).not.toBeEmpty()
    await expect(card(page).locator('.repo-card-head')).toHaveText('maolonglong/zig-buddy2')
  })

  for (const [name, respond] of [
    ['a stale snapshot answer', (route) => route.fulfill({ json: { ...fresh, stale: true } })],
    ['a server error', (route) => route.fulfill({ status: 500, body: 'error' })],
    ['an aborted request', (route) => route.abort()],
    ['an unexpected body', (route) => route.fulfill({ json: { error: 'odd' } })],
  ]) {
    test(`${name} keeps the build card`, async ({ page, open }) => {
      let release
      const held = new Promise((resolve) => (release = resolve))
      const requests = await answer(page, async (route) => {
        await held
        return respond(route)
      })
      const settled = new Promise((resolve) => {
        const done = (request) => request.url().includes('/api/github/repos/') && resolve()
        page.on('requestfinished', done)
        page.on('requestfailed', done)
      })
      await open('/blog/gobreaker/')
      const html = await card(page).innerHTML()
      release()
      await settled
      // The response promise chain resolves in microtasks before the next frames render.
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      )
      expect(await card(page).innerHTML()).toBe(html)
      await expect(card(page).locator('.repo-card-archived')).toHaveCount(0)
      expect(requests).toEqual(['/api/github/repos/sony/gobreaker/'])
    })
  }

  test.describe('without scripts', () => {
    test.use({ javaScriptEnabled: false })
    test('the archived snapshot card is complete', async ({ page, open, capture }) => {
      await page.setViewportSize({ width: 1280, height: 844 })
      await open('/blog/buddy/')
      await expect(card(page).locator('.repo-card-archived')).toHaveText('已归档')
      await expect(card(page).locator('.repo-card-stats')).toHaveText(
        /^Zig · ★ \d+ · fork \d+ · \d{4} 年 \d{1,2} 月更新$/,
      )
      await card(page).evaluate((element) => element.scrollIntoView({ block: 'center' }))
      await capture(page, 'github-card-archived-no-script')
    })
  })

  test('articles without a card load no refresh script', async ({ page, open }) => {
    const requests = await answer(page, (route) => route.fulfill({ json: fresh }))
    await open('/blog/gat/')
    await expect(card(page)).toHaveCount(0)
    expect(requests).toEqual([])
    expect(await page.content()).not.toContain('/api/github/repos/')
  })
})

test('the endpoint rejects repositories outside the snapshot and other methods', async ({
  request,
}) => {
  for (const path of [
    '/api/github/repos/torvalds/linux/',
    '/api/github/repos/Sony/gobreaker/',
    '/api/github/repos/sony/gobreaker/?x=1',
    '/api/github/users/sony/',
  ]) {
    const response = await request.get(path)
    expect(response.status(), path).toBe(404)
    expect(response.headers()['x-frame-options'], path).toBe('DENY')
  }
  const post = await request.post('/api/github/repos/sony/gobreaker/')
  expect(post.status()).toBe(405)
  expect(post.headers().allow).toBe('GET, HEAD')
})
