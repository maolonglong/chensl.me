import { apart, expect, expectAll, inside, test } from './site.mjs'

// Runs in the page. Self-contained: Playwright serializes it.
function probe() {
  const box = (selector) =>
    document.querySelector(selector)?.getBoundingClientRect().toJSON() ?? null
  const button = document.querySelector('.back-to-top')
  return {
    visible: !!button && getComputedStyle(button).visibility === 'visible',
    button: box('.back-to-top'),
    main: box('main'),
    footer: box('body > footer'),
    comments: box('.comments'),
    width: innerWidth,
    height: innerHeight,
  }
}

// The button waits a screen down, then floats clear of the footer, the comments, and, when there
// is room, the text column.
for (const width of [320, 390, 768, 1280]) {
  test(`back-to-top hides at the top and floats clear at ${width}px`, async ({
    page,
    open,
    settle,
  }) => {
    await page.setViewportSize({ width, height: 844 })
    await open('/blog/dockertest/')
    for (const size of ['100%', '200%']) {
      await page.evaluate((size) => {
        document.documentElement.style.fontSize = size
        scrollTo(0, 0)
      }, size)
      await settle(page)
      const top = await page.evaluate(probe)
      await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight))
      await settle(page)
      const end = await page.evaluate(probe)
      const button = end.button
      const besideColumn = button?.left >= end.main.right
      expectAll(`/blog/dockertest/ back-to-top at ${width}px / ${size}`, end, {
        'hidden at the top': !top.visible,
        'visible at the bottom': end.visible,
        'a 44px target inside the view':
          inside(button, end) && button.width >= 44 && button.height >= 44,
        'clear of the footer': !!button && apart(button, end.footer),
        'clear of the comments': !!button && apart(button, end.comments),
        // Without room beside the column, the button still hangs from its right edge.
        "on the column's right edge or beside it":
          besideColumn || Math.abs(end.main.right - button?.right) <= 1,
        ...(width === 1280 &&
          size === '100%' && { 'beside the column when there is room': besideColumn }),
      })
    }
  })
}

// Resizing across the one-screen threshold must update visibility without another scroll.
test('back-to-top follows resizes across the one-screen threshold without scrolling', async ({
  page,
  open,
  settle,
}) => {
  await open('/blog/dockertest/')
  await page.evaluate(() => scrollTo(0, 900))
  for (const [height, visible] of [
    [844, true],
    [1000, false],
    [844, true],
  ]) {
    await page.setViewportSize({ width: 1280, height })
    await settle(page)
    const state = await page.evaluate(() => ({
      y: scrollY,
      visible: getComputedStyle(document.querySelector('.back-to-top')).visibility === 'visible',
    }))
    expect
      .soft(state, `Back-to-top must update on resize to ${height}px without scrolling`)
      .toEqual({ y: 900, visible })
  }
})

// From the very bottom, one press returns to the top within a second, leaves the URL alone, and a
// keyboard press lands on the site title.
test('back-to-top returns to the top within a second and focuses the site title', async ({
  page,
  open,
  settle,
}) => {
  await open('/blog/semantic-view-sql-traps/')
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight))
  await settle(page)
  const bottom = await page.evaluate(() => ({
    scrollY,
    button: !!document.querySelector('.back-to-top'),
  }))
  expect(bottom.button, 'Back-to-top button is missing from the longest article').toBe(true)
  await page.locator('.back-to-top').focus()
  await page.keyboard.press('Enter')
  const back = await page.evaluate(
    (from) =>
      new Promise((resolve) => {
        const start = performance.now()
        ;(function poll() {
          const elapsed = Math.round(performance.now() - start)
          if (scrollY !== 0 && elapsed <= 3000) {
            requestAnimationFrame(poll)
            return
          }
          resolve({
            from,
            scrollY,
            elapsed,
            url: location.href,
            focused: document.activeElement.matches('.site-title a'),
          })
        })()
      }),
    bottom.scrollY,
  )
  expectAll('Back-to-top', back, {
    'reaches the top': back.scrollY === 0,
    'within a second': back.elapsed <= 1000,
    'leaves the URL alone': !back.url.includes('#'),
    'hands keyboard focus to the site title': back.focused,
  })
})
