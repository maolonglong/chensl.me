import { expect, test } from './site.mjs'

// These specs assert behavior and capture 2x screenshots for human review; inspect the images in
// test-results/screenshots (or the HTML report). A successful capture is not visual verification.

const firstEntry = '#article-toc > ul > li:first-child > a'
const theme = (page) =>
  page.evaluate(() => ({
    mode: document.querySelector('[data-theme-toggle]').dataset.themeMode,
    scheme: getComputedStyle(document.documentElement).colorScheme,
    background: getComputedStyle(document.body).backgroundColor,
  }))

test('theme cycles, persists across navigation and follows the OS', async ({
  page,
  open,
  settle,
}) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await open('/')
  expect((await theme(page)).mode).toBe('auto')
  for (const [mode, scheme] of [
    ['light', 'light'],
    ['dark', 'dark'],
    ['auto', 'light dark'],
  ]) {
    await page.locator('[data-theme-toggle]').click()
    expect((await theme(page)).mode).toBe(mode)
    expect((await theme(page)).scheme).toBe(scheme)
  }
  const lightBackground = (await theme(page)).background
  await page.emulateMedia({ colorScheme: 'dark' })
  await settle(page)
  expect((await theme(page)).background, 'Auto follows the OS').not.toBe(lightBackground)
  await page.locator('[data-theme-toggle]').click()
  expect((await theme(page)).background, 'Forced light overrides a dark OS').toBe(lightBackground)
  await open('/')
  expect((await theme(page)).mode, 'Forced theme persists across navigation').toBe('light')
  await page.locator('[data-theme-toggle]').click()
  await page.emulateMedia({ colorScheme: 'light' })
  await settle(page)
  expect((await theme(page)).scheme, 'Forced dark overrides a light OS').toBe('dark')
})

for (const width of [1280, 390]) {
  for (const mode of ['light', 'dark']) {
    test(`pages at ${width}px in ${mode}`, async ({ page, open, capture }) => {
      await page.setViewportSize({ width, height: 844 })
      await page.emulateMedia({ colorScheme: mode })
      for (const [name, route] of [
        ['home', '/'],
        ['archive', '/blog/'],
        ['article', '/blog/dockertest/'],
        ['404', '/404.html'],
      ]) {
        await open(route)
        expect(
          await page.evaluate(() =>
            [...document.fonts].some(
              (font) => font.family.includes('Tsanger') && font.status === 'loaded',
            ),
          ),
          `${name}: JinKai must be loaded`,
        ).toBe(true)
        await capture(page, `${name}-${width}-${mode}`)
      }
    })
  }
}

for (const width of [320, 479, 481, 599, 601, 768]) {
  test(`navigation and table at ${width}px`, async ({ page, open, capture }) => {
    await page.setViewportSize({ width, height: 844 })
    await page.emulateMedia({ colorScheme: 'light' })
    await open('/blog/dockertest/')
    await capture(page, `navigation-${width}`)
    await page.evaluate(() => document.querySelector('.table-scroll').scrollIntoView())
    await capture(page, `table-${width}`)
  })
}

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

test('code caption in both color schemes', async ({ page, open, capture }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await open('/blog/dockertest/')
  await page.evaluate(() => document.querySelector('.code-figure').scrollIntoView())
  await capture(page, 'code-caption-light')
  await page.emulateMedia({ colorScheme: 'dark' })
  await capture(page, 'code-caption-dark')
})

for (const width of [1280, 390]) {
  for (const mode of ['light', 'dark']) {
    test(`copy feedback at ${width}px in ${mode}`, async ({ page, context, open, capture }) => {
      await context.grantPermissions(['clipboard-read', 'clipboard-write'])
      await page.setViewportSize({ width, height: 844 })
      await page.emulateMedia({ colorScheme: mode })
      await open('/blog/dockertest/')
      // The first captioned block stands in for all of them.
      const button = page.locator('.code-figure .code-copy').first()
      await page.evaluate(() =>
        document.querySelector('.code-figure').scrollIntoView({ block: 'center' }),
      )
      await button.click()
      await expect(button).toHaveAttribute('data-state', 'done')
      await capture(page, `copy-success-${width}-${mode}`)
      await expect(button).toHaveAttribute('data-state', 'done')
      await page.evaluate(() => {
        navigator.clipboard.writeText = () =>
          Promise.reject(new DOMException('Denied', 'NotAllowedError'))
      })
      await button.click()
      await expect(button).not.toHaveAttribute('data-state')
      await expect(page.locator('.code-copy-error')).toHaveCount(0)
      await capture(page, `copy-failed-${width}-${mode}`)
    })
  }
}

test.describe('contents states with a hovering pointer', () => {
  test.use({ colorScheme: 'dark' })

  test('contents rail while focused, dismissed and hovered', async ({ page, open, capture }) => {
    await open('/blog/dockertest/')
    await page.locator(firstEntry).focus()
    await capture(page, 'toc-focused')
    await page.keyboard.press('Escape')
    await capture(page, 'toc-dismissed')
    await page.locator('.site-title a').focus()
    await page.locator('#article-toc').hover()
    await capture(page, 'toc-hovered')
  })

  test('quote and footnotes', async ({ page, open, capture }) => {
    await open('/blog/2024-review/')
    await page.evaluate(() => document.querySelector('blockquote').scrollIntoView())
    await capture(page, 'quote-dark')
    await page.evaluate(() => document.querySelector('.footnotes').scrollIntoView())
    await capture(page, 'footnotes-dark')
  })
})

test.describe('on a touch screen', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } })

  test('contents popover', async ({ page, open, capture }) => {
    await open('/blog/dockertest/')
    await page.locator('.toc-button').click()
    await capture(page, 'toc-popover')
    await page.keyboard.press('Escape')
  })

  test.describe('without page scripts', () => {
    test.use({ javaScriptEnabled: false })

    test('contents open natively and script-only controls are absent', async ({
      page,
      open,
      capture,
    }) => {
      await open('/blog/dockertest/')
      await expect(page.locator('.theme-toggle'), 'No-script theme control is hidden').toHaveCSS(
        'display',
        'none',
      )
      await expect(page.locator('.code-copy, .back-to-top')).toHaveCount(0)
      await page.locator('.toc-button').click()
      expect(
        await page.evaluate(() => document.querySelector('#article-toc').matches(':popover-open')),
      ).toBe(true)
      await capture(page, 'no-script-toc')
    })
  })

  test('theme still switches when storage throws', async ({ page, context, open }) => {
    await context.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        get() {
          throw new DOMException('blocked', 'SecurityError')
        },
      })
    })
    await open('/')
    await page.locator('[data-theme-toggle]').click()
    expect((await theme(page)).mode).toBe('light')
  })
})
