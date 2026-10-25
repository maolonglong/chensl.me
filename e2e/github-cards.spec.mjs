import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { astroProject, buildAstro, frontmatter, write } from '../tests/support.mjs'
import { expect, expectAll, test } from './site.mjs'

// Repository cards: the build renders them from the snapshot alone, and the page script swaps in
// fresh numbers from /api/github/repos/. GitHub itself is never called here: the fixture build
// needs no Worker, and the article tests answer the endpoint with page.route.
const repos = {
  'example-owner/example-repo': {
    name: 'Example-Owner/example-repo',
    description:
      '一个示例仓库, with a description long enough to wrap inside the card on a narrow phone screen. It goes on for a while so that it needs more than two lines even on a wide desktop column, which the card must clip to two lines.',
    stars: 3708,
    forks: 230,
    language: 'Go',
    archived: false,
    pushedAt: '2026-02-07T09:21:38Z',
  },
  'example-owner/archived': {
    name: 'example-owner/archived',
    description: '',
    stars: 3,
    forks: 1,
    language: null,
    archived: true,
    pushedAt: '2025-08-12T09:24:05Z',
  },
}
const body = `开头。

<https://github.com/example-owner/example-repo>

[任意文字](https://github.com/Example-Owner/example-repo/)

<https://github.com/example-owner/archived>

<https://github.com/example-owner/missing-repo>

正文里的 [example-owner/example-repo](https://github.com/example-owner/example-repo) 链接。

<https://github.com/example-owner/example-repo/blob/main/README.md>

[a](https://github.com/example-owner/example-repo) [b](https://github.com/example-owner/example-repo)

- <https://github.com/example-owner/example-repo>

> <https://github.com/example-owner/example-repo>

\`\`\`text
code block for the corner comparison
\`\`\`

结尾[^1]。

[^1]: <https://github.com/example-owner/example-repo>
`

// Runs in the page. Self-contained: Playwright serializes it.
function probeCards() {
  const box = (element) => element.getBoundingClientRect().toJSON()
  const code = getComputedStyle(document.querySelector('.highlight'))
  const prose = box(document.querySelector('.prose'))
  return {
    cards: [...document.querySelectorAll('.repo-card')].map((card) => {
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
        inColumn: box(link).left >= prose.left && box(link).right <= prose.right,
        height: box(link).height,
      }
    }),
    plain: [...document.querySelectorAll('.prose a[href*="github.com"]')]
      .filter((link) => !link.closest('.repo-card'))
      .map((link) => link.getAttribute('href')),
  }
}

test.describe('GitHub cards from a fixture snapshot', () => {
  test.use({ javaScriptEnabled: false })
  let origin
  let server
  let cleanup

  test.beforeAll(async () => {
    test.setTimeout(120_000)
    const fixture = await astroProject('astro-github-cards-e2e-', (dispose) => {
      cleanup = dispose
    })
    await write(fixture, 'src/data/github-repos.json', `${JSON.stringify(repos, null, 2)}\n`)
    await write(
      fixture,
      'src/content/blog/cards.md',
      `${frontmatter('GitHub 链接卡片', '2000-01-01', 'comments: false\n')}${body}`,
    )
    const dist = await buildAstro(fixture)
    server = createServer(async (request, response) => {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
      const file = path.resolve(dist, `.${pathname}`, pathname.endsWith('/') ? 'index.html' : '')
      try {
        if (!file.startsWith(`${dist}${path.sep}`)) throw new Error('Outside fixture output')
        const content = await readFile(file)
        const type = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8' }
        response.writeHead(200, {
          'Content-Type': type[path.extname(file)] ?? 'application/octet-stream',
        })
        response.end(content)
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

  for (const width of [375, 1280]) {
    for (const mode of ['light', 'dark']) {
      test(`standalone repository links in the snapshot become complete cards at ${width}px in ${mode}`, async ({
        page,
        open,
        capture,
      }) => {
        await page.setViewportSize({ width, height: 844 })
        await page.emulateMedia({ colorScheme: mode })
        await open(`${origin}/blog/cards/`)
        const state = await page.evaluate(probeCards)
        const { description } = repos['example-owner/example-repo']
        const full = {
          repo: 'example-owner/example-repo',
          name: 'Example-Owner/example-repo',
          archived: null,
          description,
          stats: 'Go · ★ 3.7k · fork 230 · 2026 年 2 月更新',
          links: 1,
          extras: 0,
        }
        expect(
          state.cards.map(({ repo, href, name, archived, description, stats, links, extras }) => ({
            repo,
            href,
            name,
            archived,
            description,
            stats,
            links,
            extras,
          })),
        ).toEqual([
          { ...full, href: 'https://github.com/example-owner/example-repo' },
          { ...full, href: 'https://github.com/Example-Owner/example-repo/' },
          {
            repo: 'example-owner/archived',
            href: 'https://github.com/example-owner/archived',
            name: 'example-owner/archived',
            archived: '已归档',
            description: null,
            stats: '★ 3 · fork 1 · 2025 年 8 月更新',
            links: 1,
            extras: 0,
          },
        ])
        expect(state.plain).toEqual([
          'https://github.com/example-owner/missing-repo',
          'https://github.com/example-owner/example-repo',
          'https://github.com/example-owner/example-repo/blob/main/README.md',
          'https://github.com/example-owner/example-repo',
          'https://github.com/example-owner/example-repo',
          'https://github.com/example-owner/example-repo',
          'https://github.com/example-owner/example-repo',
          'https://github.com/example-owner/example-repo',
        ])
        for (const [index, card] of state.cards.entries()) {
          expectAll(`card ${index} at ${width}px in ${mode}`, card, {
            'has a hairline frame with the code block corners': card.frame,
            'has no underline at rest': card.underline === 'none',
            'stays inside the column': card.inColumn,
            'is a 44 px touch target': card.height >= 44,
            'clips the description to two lines': card.descriptionLines <= 2,
          })
        }
        expect(state.cards[0].descriptionLines).toBe(2)
        await page.locator('.repo-card').first().scrollIntoViewIfNeeded()
        await capture(page, `github-cards-fixture-${width}-${mode}`)
      })
    }
  }
})

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
