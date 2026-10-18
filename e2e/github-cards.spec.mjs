import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { astroProject, buildAstro, frontmatter, write } from '../tests/support.mjs'
import { expect, expectAll, test } from './site.mjs'

// A paragraph that holds only a link to a repository root becomes a card, from the committed
// metadata alone. Any other GitHub link, and a repository without metadata, stays a plain link.
const repos = {
  'example-owner/example-repo': {
    name: 'Example-Owner/example-repo',
    description:
      '一个示例仓库, with a description long enough to wrap inside the card on a narrow phone screen.',
  },
  'example-owner/bare': { name: 'example-owner/bare', description: '' },
}
const body = `开头。

<https://github.com/example-owner/example-repo>

[任意文字](https://github.com/Example-Owner/example-repo/)

<https://github.com/example-owner/bare>

<https://github.com/example-owner/missing-repo>

正文里的 [example-owner/example-repo](https://github.com/example-owner/example-repo) 链接。

<https://github.com/example-owner/example-repo/blob/main/README.md>

[a](https://github.com/example-owner/example-repo) [b](https://github.com/example-owner/example-repo)

- <https://github.com/example-owner/example-repo>

> <https://github.com/example-owner/example-repo>

\`\`\`text
code block for the frame comparison
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
      return {
        tag: card.tagName,
        href: link?.getAttribute('href'),
        name: card.querySelector('.repo-card-name')?.textContent,
        description: card.querySelector('.repo-card-description')?.textContent ?? null,
        links: card.querySelectorAll('a').length,
        extras: card.querySelectorAll('img, script, iframe, svg').length,
        frame:
          style.borderTopWidth === code.borderTopWidth &&
          style.borderTopStyle === code.borderTopStyle &&
          style.borderTopColor === code.borderTopColor &&
          style.borderRadius === code.borderRadius &&
          style.backgroundColor === code.backgroundColor,
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

test.describe('GitHub cards from fixture metadata', () => {
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
      test(`only standalone repository links with metadata become cards at ${width}px in ${mode}`, async ({
        page,
        open,
        capture,
      }) => {
        await page.setViewportSize({ width, height: 844 })
        await page.emulateMedia({ colorScheme: mode })
        await open(`${origin}/blog/cards/`)
        const state = await page.evaluate(probeCards)
        const description = repos['example-owner/example-repo'].description
        expect(
          state.cards.map(({ tag, href, name, description, links, extras }) => ({
            tag,
            href,
            name,
            description,
            links,
            extras,
          })),
        ).toEqual([
          {
            tag: 'P',
            href: 'https://github.com/example-owner/example-repo',
            name: 'Example-Owner/example-repo',
            description,
            links: 1,
            extras: 0,
          },
          {
            tag: 'P',
            href: 'https://github.com/Example-Owner/example-repo/',
            name: 'Example-Owner/example-repo',
            description,
            links: 1,
            extras: 0,
          },
          {
            tag: 'P',
            href: 'https://github.com/example-owner/bare',
            name: 'example-owner/bare',
            description: null,
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
        await expect(page.locator('.prose a[href$="/missing-repo"]')).toHaveText(
          'https://github.com/example-owner/missing-repo',
        )
        for (const [index, card] of state.cards.entries()) {
          expectAll(`card ${index} at ${width}px in ${mode}`, card, {
            'shares the code block frame': card.frame,
            'has no underline at rest': card.underline === 'none',
            'stays inside the column': card.inColumn,
            'is a 44 px touch target': card.height >= 44,
          })
        }
        await page.locator('.repo-card').first().scrollIntoViewIfNeeded()
        await capture(page, `github-cards-fixture-${width}-${mode}`)
      })
    }
  }
})

// functional-programming ends its OCaml section with a paragraph that is only a link to
// maolonglong/bogoscheme.
for (const width of [390, 1280]) {
  for (const mode of ['light', 'dark']) {
    test(`an article repository link renders as a card at ${width}px in ${mode}`, async ({
      page,
      open,
      capture,
    }) => {
      await page.setViewportSize({ width, height: 844 })
      await page.emulateMedia({ colorScheme: mode })
      await open('/blog/functional-programming/')
      const card = page.locator('.repo-card')
      await expect(card).toHaveCount(1)
      await expect(card.locator('a')).toHaveAttribute(
        'href',
        'https://github.com/maolonglong/bogoscheme',
      )
      await expect(card.locator('.repo-card-name')).toHaveText('maolonglong/bogoscheme')
      await card.evaluate((element) => element.scrollIntoView({ block: 'center' }))
      await capture(page, `github-card-${width}-${mode}`)
    })
  }
}
