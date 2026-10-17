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

// The header keeps its text spacing (12 px on phones, 20 px on desktop). Each icon's target is
// 44 px tall and reaches halfway into the gap beside it: 44 px wide on desktop, 36 px on phones.
for (const [width, gap] of [
  [320, 12],
  [390, 12],
  [1280, 20],
]) {
  test(`the search icon and the theme toggle own separate 44px-tall targets at ${width}px`, async ({
    open,
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 })
    await open('/')
    const result = await page.evaluate(() => {
      const nav = document.querySelector('header nav')
      const controls = {
        search: nav.querySelector('a[href="/search/"]'),
        theme: document.querySelector('[data-theme-toggle]'),
      }
      const search = controls.search.getBoundingClientRect()
      const theme = controls.theme.getBoundingClientRect()
      const iconGap = theme.left - search.right
      const halfWidth = Math.min(22, search.width / 2 + iconGap / 2)
      // Sample each target, edges included (one pixel in); every point must hit that control,
      // so neither target overlaps the other or lets a tap land on its neighbor.
      const misses = Object.fromEntries(
        Object.entries(controls).map(([name, control]) => {
          const box = control.getBoundingClientRect()
          const x = box.left + box.width / 2
          const y = box.top + box.height / 2
          const missed = []
          for (const dx of [-(halfWidth - 1), -halfWidth / 2, 0, halfWidth / 2, halfWidth - 1])
            for (const dy of [-21, -11, 0, 11, 21]) {
              const hit = document.elementFromPoint(x + dx, y + dy)?.closest('a, button')
              if (hit !== control) missed.push([dx, dy])
            }
          return [name, missed]
        }),
      )
      return { navGap: getComputedStyle(nav).columnGap, iconGap, halfWidth, misses }
    })
    expect(result.navGap).toBe(`${gap}px`)
    expect(result.iconGap).toBeCloseTo(gap, 0)
    expect(result.halfWidth).toBeCloseTo(Math.min(22, 12 + gap / 2), 0)
    expect(result.misses).toEqual({ search: [], theme: [] })
  })
}
