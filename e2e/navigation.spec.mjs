import { expect, test } from './site.mjs'

// The header carries the sections and the controls; the site title is the way home, and the
// footer carries the feed.

test('the header links the sections, and the site title links home', async ({ open, page }) => {
  await open('/')
  await expect(page.locator('.site-title a')).toHaveAttribute('href', '/')
  const links = page.getByRole('navigation', { name: '主导航' }).getByRole('link')
  await expect(links).toHaveCount(3)
  for (const [index, name] of ['博客', 'AI News', '搜索'].entries())
    await expect(links.nth(index)).toHaveAccessibleName(name)
  expect(await links.evaluateAll((all) => all.map((link) => link.getAttribute('href')))).toEqual([
    '/blog/',
    '/news/',
    '/search/',
  ])
  await expect(page.getByRole('navigation', { name: '主导航' }).getByRole('button')).toHaveCount(1)
})

test('the footer links the article feed', async ({ open, page }) => {
  for (const path of ['/', '/blog/', '/blog/dockertest/', '/search/']) {
    await open(path)
    const feed = page.locator('body > footer a[type="application/rss+xml"]')
    await expect(feed, path).toHaveCount(1)
    // Exact text: whitespace inside the inline link would extend its underline.
    expect(await feed.textContent(), path).toBe('RSS')
    await expect(feed, path).toHaveAttribute('href', '/index.xml')
  }
})

test('the search icon is a named link that marks the search page as current', async ({
  open,
  page,
}) => {
  const search = page.getByRole('navigation', { name: '主导航' }).getByRole('link', {
    name: '搜索',
    exact: true,
  })
  // The current mark is the same underline geometry as a current text link, drawn under the icon.
  const mark = () =>
    search.evaluate((link) => {
      const after = getComputedStyle(link, '::after')
      return after.content === 'none' ? null : { height: parseFloat(after.height) }
    })

  await open('/search/')
  await expect(search).toHaveAttribute('aria-current', 'page')
  await expect(search).toHaveAttribute('aria-label', '搜索')
  await expect(search.locator('svg')).toHaveAttribute('aria-hidden', 'true')
  expect((await mark())?.height).toBeGreaterThan(0)
  await expect(page.getByRole('link', { name: '博客', exact: true })).not.toHaveAttribute(
    'aria-current',
    /.+/,
  )

  for (const path of ['/', '/blog/', '/news/']) {
    await open(path)
    await expect(search, path).toHaveAttribute('href', '/search/')
    await expect(search, path).not.toHaveAttribute('aria-current', /.+/)
    expect(await mark(), path).toBeNull()
  }
})

for (const width of [320, 390, 1280]) {
  test(`the search icon and the theme toggle each own a 44px target at ${width}px`, async ({
    open,
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 })
    await open('/')
    const owners = await page.evaluate(() => {
      const controls = {
        search: document.querySelector('header nav a[href="/search/"]'),
        theme: document.querySelector('[data-theme-toggle]'),
      }
      // Sample a 44x44 square centred on each icon, edges included; every point must hit that control.
      return Object.fromEntries(
        Object.entries(controls).map(([name, control]) => {
          const box = control.getBoundingClientRect()
          const x = box.left + box.width / 2
          const y = box.top + box.height / 2
          const misses = []
          for (const dx of [-21, -11, 0, 11, 21])
            for (const dy of [-21, -11, 0, 11, 21]) {
              const hit = document.elementFromPoint(x + dx, y + dy)?.closest('a, button')
              if (hit !== control) misses.push([dx, dy])
            }
          return [name, misses]
        }),
      )
    })
    expect(owners).toEqual({ search: [], theme: [] })
  })
}
