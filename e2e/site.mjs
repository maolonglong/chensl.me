import { createHash } from 'node:crypto'
import path from 'node:path'
import { test as base, expect } from '@playwright/test'

export { expect }

// Boxes are DOMRect-like objects; `null` means the element is absent, which counts as clear.
export const apart = (a, b) =>
  !a || !b || a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top
export const inside = (a, view) =>
  !!a && a.left >= 0 && a.top >= 0 && a.right <= view.width && a.bottom <= view.height
export const covers = (outer, inner) =>
  !!outer &&
  !!inner &&
  outer.left <= inner.left &&
  outer.top <= inner.top &&
  outer.right >= inner.right &&
  outer.bottom >= inner.bottom

export const test = base.extend({
  // The Actions rate-limit by client address. A distinct address per test keeps each test's
  // budget independent of how fast or in what order the suite runs.
  // Playwright requires a destructured first argument even when a fixture depends on nothing.
  // oxlint-disable-next-line no-empty-pattern
  clientAddress: async ({}, use, testInfo) => {
    const hash = createHash('sha256').update(testInfo.testId).digest()
    await use(`10.${hash[0]}.${hash[1]}.${hash[2]}`)
  },
  context: async ({ context, clientAddress }, use) => {
    await context.route('**/_actions/**', (route) =>
      route.continue({
        headers: { ...route.request().headers(), 'cf-connecting-ip': clientAddress },
      }),
    )
    await use(context)
  },
  // Fonts loaded and layout stable. Animation frames do not run while page scripts are disabled.
  settle: async ({ javaScriptEnabled }, use) => {
    await use((page) =>
      javaScriptEnabled
        ? page.evaluate(() =>
            document.fonts.ready.then(
              () =>
                new Promise((resolve) =>
                  requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))),
                ),
            ),
          )
        : page.waitForTimeout(300),
    )
  },
  // Navigate, settle, and confirm the browser really has the pointer capability the test
  // configured: a hover-dependent check on the wrong input type would pass for the wrong reason.
  open: async ({ page, settle, hasTouch }, use) => {
    await use(async (route) => {
      await page.goto(route)
      await settle(page)
      const hover = await page.evaluate(() => matchMedia('(hover: hover)').matches)
      expect(hover, 'Hover capability must match the test configuration').toBe(!hasTouch)
    })
  },
  // Screenshots are for human review, not pixel comparison: rendering differs across platforms.
  // They land in test-results/screenshots and in the HTML report.
  capture: async ({ settle }, use, testInfo) => {
    await use(async (page, name) => {
      await settle(page)
      expect(await page.evaluate(() => devicePixelRatio), `${name}: pixel ratio`).toBe(2)
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        `${name}: page overflow`,
      ).toBe(true)
      const file = path.resolve('test-results/screenshots', `${name}.png`)
      await page.screenshot({ path: file })
      await testInfo.attach(name, { path: file, contentType: 'image/png' })
    })
  },
})
