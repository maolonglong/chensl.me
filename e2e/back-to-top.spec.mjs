import { expect, test } from './site.mjs'

// The button waits a screen down, then floats clear of the footer, the comments, and, when there
// is room, the text column.
for (const width of [320, 390, 768, 1280]) {
  test(`back-to-top hides at the top and floats clear at ${width}px`, async ({ page, open }) => {
    await page.setViewportSize({ width, height: 844 })
    await open('/blog/dockertest/')
    for (const size of ['100%', '200%']) {
      const top = await page.evaluate(async (size) => {
        document.documentElement.style.fontSize = size
        const button = document.querySelector('.back-to-top')
        const settle = () =>
          new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
        const box = (element) => element.getBoundingClientRect()
        const apart = (a, b) =>
          a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top
        scrollTo(0, 0)
        await settle()
        const hiddenAtTop = !button || getComputedStyle(button).visibility === 'hidden'
        scrollTo(0, document.documentElement.scrollHeight)
        await settle()
        const b = button ? box(button) : null
        const result = {
          hiddenAtTop,
          visible: !!button && getComputedStyle(button).visibility === 'visible',
          inViewport:
            !!b &&
            b.width >= 44 &&
            b.height >= 44 &&
            b.left >= 0 &&
            b.right <= innerWidth &&
            b.top >= 0 &&
            b.bottom <= innerHeight,
          clearOfFooter: !!b && apart(b, box(document.querySelector('body > footer'))),
          clearOfComments: !!b && apart(b, box(document.querySelector('.comments'))),
          outsideColumn: !!b && b.left >= box(document.querySelector('main')).right,
          columnOffset: b ? Math.round(box(document.querySelector('main')).right - b.right) : null,
        }
        document.documentElement.style.fontSize = ''
        scrollTo(0, 0)
        return result
      }, size)
      const label = `/blog/dockertest/ back-to-top at ${width}px / ${size}`
      const state = JSON.stringify(top)
      expect
        .soft(
          !top.hiddenAtTop ||
            !top.visible ||
            !top.inViewport ||
            !top.clearOfFooter ||
            !top.clearOfComments,
          `${label}: button must hide at the top and float clear of the footer and comments at the bottom (${state})`,
        )
        .toBe(false)
      // Without room beside the column, the button still hangs from its right edge.
      expect
        .soft(
          !top.outsideColumn && Math.abs(top.columnOffset) > 1,
          `${label}: button must line up with the text column's right edge (${state})`,
        )
        .toBe(false)
      if (width === 1280 && size === '100%') {
        expect
          .soft(
            !top.outsideColumn,
            `${label}: button must sit beside the text column when there is room (${state})`,
          )
          .toBe(false)
      }
    }
  })
}

// Resizing across the one-screen threshold must update visibility without another scroll.
test('back-to-top follows resizes across the one-screen threshold without scrolling', async ({
  page,
  open,
}) => {
  await open('/blog/dockertest/')
  await page.evaluate(() => scrollTo(0, 900))
  for (const [height, visible] of [
    [844, true],
    [1000, false],
    [844, true],
  ]) {
    await page.setViewportSize({ width: 1280, height })
    const state = await page.evaluate(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      return {
        y: scrollY,
        visible: getComputedStyle(document.querySelector('.back-to-top')).visibility === 'visible',
      }
    })
    expect
      .soft(
        state.y !== 900 || state.visible !== visible,
        `Back-to-top must update on resize to ${height}px without scrolling (${JSON.stringify(state)})`,
      )
      .toBe(false)
  }
})

// From the very bottom, one press returns to the top within a second, leaves the URL alone, and a
// keyboard press lands on the site title.
test('back-to-top returns to the top within a second and focuses the site title', async ({
  page,
  open,
}) => {
  await open('/blog/semantic-view-sql-traps/')
  const bottom = await page.evaluate(async () => {
    scrollTo(0, document.documentElement.scrollHeight)
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    return { scrollY, button: !!document.querySelector('.back-to-top') }
  })
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
  expect
    .soft(
      back.scrollY !== 0 || back.elapsed > 1000 || back.url.includes('#') || !back.focused,
      `Back-to-top must reach the top within 1s without a URL fragment and hand keyboard focus to the site title (${JSON.stringify(back)})`,
    )
    .toBe(false)
})
