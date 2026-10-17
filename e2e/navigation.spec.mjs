import { expect, test } from './site.mjs'

// The header carries the sections and the controls; the site title is the way home, and the
// footer carries the feed.

test('the header links the sections, and the site title links home', async ({ open, page }) => {
  await open('/')
  await expect(page.locator('.site-title a')).toHaveAttribute('href', '/')
  const links = page.getByRole('navigation', { name: '主导航' }).getByRole('link')
  await expect(links).toHaveText(['博客', 'AI News', '搜索'])
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
