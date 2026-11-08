import { expect, test } from './site.mjs'

// These specs assert behavior and capture 2x screenshots for human review; inspect the images in
// test-results/screenshots (or the HTML report). A successful capture is not visual verification.

const appearance = (page) =>
  page.evaluate(() => ({
    scheme: getComputedStyle(document.documentElement).colorScheme,
    background: getComputedStyle(document.body).backgroundColor,
  }))

test('the page follows the OS color scheme', async ({ page, open, settle }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await open('/')
  const light = await appearance(page)
  expect(light.scheme).toBe('light dark')
  await page.emulateMedia({ colorScheme: 'dark' })
  await settle(page)
  const dark = await appearance(page)
  expect(dark.background, 'Dark OS resolves to the dark background').not.toBe(light.background)
  expect(dark.scheme).toBe('light dark')
})

test('prefers-contrast: more raises muted text to body contrast', async ({ page, open }) => {
  await page.emulateMedia({ contrast: 'more' })
  await open('/')
  const highContrast = await page.evaluate(() => ({
    muted: getComputedStyle(document.querySelector('.meta')).color,
    body: getComputedStyle(document.body).color,
  }))
  expect(highContrast.muted, 'prefers-contrast: more raises muted text to body contrast').toBe(
    highContrast.body,
  )
})

for (const width of [1280, 390]) {
  for (const mode of ['light', 'dark']) {
    test(`display math at ${width}px in ${mode}`, async ({ page, open, capture }) => {
      await page.setViewportSize({ width, height: 844 })
      await page.emulateMedia({ colorScheme: mode })
      await open('/blog/functional-programming/')
      const wrapper = page.locator('.math-scroll').first()
      await wrapper.evaluate((element) => element.scrollIntoView({ block: 'center' }))
      await capture(page, `math-${width}-${mode}`)
      // Widen the formula past the column: the wrapper scrolls, the page does not.
      const layout = await wrapper.evaluate((element) => {
        const row = element.querySelector('math > mrow')
        for (let step = 0; step < 4; step++)
          row.append(...[...row.children].map((child) => child.cloneNode(true)))
        return {
          scrolls: element.scrollWidth > element.clientWidth,
          leftAligned:
            element.querySelector('math').getBoundingClientRect().left ===
            element.getBoundingClientRect().left,
        }
      })
      expect(layout.scrolls, 'A wide formula scrolls inside its wrapper').toBe(true)
      expect(layout.leftAligned, 'A wide formula starts at the left edge').toBe(true)
      await capture(page, `math-wide-${width}-${mode}`)
    })
  }
}

test.describe('on a touch screen', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } })

  test.describe('without page scripts', () => {
    test.use({ javaScriptEnabled: false })

    test('contents open natively and script-only controls are absent', async ({
      page,
      open,
      capture,
    }) => {
      await open('/blog/dockertest/')
      await expect(
        page.locator('[data-upvote] button'),
        'No-script upvote control is hidden',
      ).toHaveCSS('display', 'none')
      await expect(page.locator('.code-copy')).toHaveCount(0)
      await page.locator('.toc-button').click()
      expect(
        await page.evaluate(() => document.querySelector('#article-toc').matches(':popover-open')),
      ).toBe(true)
      await expect(page.locator('#article-toc')).toHaveCSS('opacity', '1')
      await capture(page, 'no-script-toc')
    })
  })
})
