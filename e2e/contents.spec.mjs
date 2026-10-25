import { apart, expect, expectAll, inside, test } from './site.mjs'

// The article's one contents list: a plain list in the margin beside the column where the view
// leaves room, and a popover behind a button in back-to-top's corner everywhere else.
const firstEntry = '#article-toc > ul > li:first-child > a'
const secondEntry = '#article-toc > ul > li:nth-child(2) > a'

// Runs in the page. Self-contained: Playwright serializes it.
function probeContents() {
  const box = (element) => (element ? element.getBoundingClientRect().toJSON() : null)
  const shown = (element) =>
    !!element &&
    getComputedStyle(element).display !== 'none' &&
    getComputedStyle(element).visibility === 'visible'
  const list = document.querySelector('#article-toc')
  const button = document.querySelector('.toc-button')
  const open = !!list && list.matches(':popover-open')
  // A fixed control can still be painted over by positioned content later in the page; hit-test it.
  const onTop = (element) => {
    if (!shown(element)) return false
    const r = element.getBoundingClientRect()
    const hit = document.elementFromPoint(r.left + 8, r.top + r.height / 2)
    return !!hit && element.contains(hit)
  }
  const target = document.getElementById(decodeURIComponent(location.hash.slice(1)))
  return {
    rail: shown(list) && !open ? box(list) : null,
    panel: open ? box(list) : null,
    button: shown(button) ? box(button) : null,
    backToTop: box(document.querySelector('.back-to-top')),
    listOnTop: onTop(list),
    buttonOnTop: onTop(button),
    column: box(document.querySelector('.post')),
    footer: box(document.querySelector('body > footer')),
    comments: box(document.querySelector('.comments')),
    current: [...document.querySelectorAll('#article-toc [aria-current]')].map((a) =>
      decodeURIComponent(a.hash),
    ),
    first: decodeURIComponent(document.querySelector('#article-toc a')?.hash ?? ''),
    last: decodeURIComponent([...document.querySelectorAll('#article-toc a')].at(-1)?.hash ?? ''),
    hash: decodeURIComponent(location.hash),
    targetTop: target ? Math.round(target.getBoundingClientRect().top) : null,
    focused: document.activeElement.tagName,
    width: innerWidth,
    height: innerHeight,
    page: document.documentElement.scrollWidth,
  }
}

const frames = () =>
  new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))

// Optionally act in the page, wait two frames, then report where everything is.
async function measure(page, action) {
  if (action) await page.evaluate(action)
  await page.evaluate(frames)
  return page.evaluate(probeContents)
}

for (const width of [1280, 1440]) {
  test(`contents list in the margin at ${width}px`, async ({ page, open }) => {
    await page.setViewportSize({ width, height: 844 })
    await open('/blog/dockertest/')
    const label = `/blog/dockertest/ contents list at ${width}px`
    const rest = await measure(page, () => scrollTo(0, 0))
    expectAll(label, rest, {
      'list sits inside the view': inside(rest.rail, rest),
      'list paints on top': rest.listOnTop,
      'no contents button beside the list': !rest.button,
      'list clears the column': rest.rail?.right <= rest.column.left - 23,
      'list clears back-to-top': apart(rest.rail, rest.backToTop),
    })
    if (!rest.rail) return

    // The Dockertest H2 is followed at once by an H3; arriving at the H2 must still mark the H2.
    const section = await measure(page, () =>
      document.getElementById('dockertest').scrollIntoView(),
    )
    expect
      .soft(section.current, `${label}: the heading at the top of the view is current`)
      .toEqual(['#dockertest'])
    const end = await measure(page, () => scrollTo(0, document.documentElement.scrollHeight))
    expect
      .soft(end.current, `${label}: the last entry is current at the bottom of the page`)
      .toEqual([end.last])

    // The keyboard reaches the list, and Enter jumps to the heading.
    await measure(page, () => scrollTo(0, 0))
    await page.locator(firstEntry).focus()
    await page.keyboard.press('Enter')
    const jumped = await measure(page)
    expectAll(`${label} after Enter`, jumped, {
      'URL points at the first heading': jumped.hash === jumped.first,
      'heading sits at the top': Math.abs(jumped.targetTop) <= 1,
      'list stays in the margin':
        jumped.rail?.left === rest.rail.left && inside(jumped.rail, jumped),
    })
  })
}

// A list fixed to the view stays put while a trackpad bounce at the page edge drags the header
// down, and stacks the two. Playwright cannot emulate that bounce, so the test pins what keeps the
// list with the page: it starts level with the article, holds below the header while reading, and
// ends with the article.
test('the margin list travels with the page instead of staying fixed to the view', async ({
  page,
  open,
}) => {
  await page.setViewportSize({ width: 1440, height: 844 })
  await open('/blog/dockertest/')
  const label = '/blog/dockertest/ margin list'
  const rest = await measure(page, () => scrollTo(0, 0))
  expectAll(label, rest, {
    'list starts level with the article': Math.abs(rest.rail?.top - rest.column.top) <= 1,
  })
  const reading = await measure(page, () => scrollTo(0, 1500))
  expectAll(`${label} while reading`, reading, {
    'list holds 8rem below the top of the view': Math.abs(reading.rail?.top - 128) <= 1,
  })
  const end = await measure(page, () => scrollTo(0, document.documentElement.scrollHeight))
  expectAll(`${label} at the bottom`, end, {
    'list ends with the article, above the footer': end.rail?.bottom <= end.footer.top,
  })
})

test('a pointer in a view without a margin opens the contents from the button', async ({
  page,
  open,
}) => {
  await page.setViewportSize({ width: 1024, height: 768 })
  await open('/blog/dockertest/')
  const rest = await measure(page, () => scrollTo(0, 0))
  expectAll('/blog/dockertest/ at 1024px', rest, {
    'no list before the button opens it': !rest.rail,
    'button paints on top': rest.buttonOnTop,
  })
  await page.locator('.toc-button').click()
  const opened = await measure(page)
  expectAll('/blog/dockertest/ at 1024px opened', opened, {
    'contents sit inside the view': inside(opened.panel, opened),
    'contents clear the button': apart(opened.panel, opened.button),
  })
  await page.keyboard.press('Escape')
  expect((await measure(page)).panel).toBeNull()
})

test.describe('with a touch screen', () => {
  test.use({ hasTouch: true })

  for (const [width, size] of [
    [390, '100%'],
    [390, '200%'],
    [768, '100%'],
    [1024, '100%'],
  ]) {
    test(`contents button at ${width}px / ${size}`, async ({ page, open }) => {
      await page.setViewportSize({ width, height: 844 })
      await open('/blog/dockertest/')
      await page.evaluate((size) => (document.documentElement.style.fontSize = size), size)
      const label = `/blog/dockertest/ contents button at ${width}px / ${size}`
      // The button holds the corner from the start; back-to-top joins above it later, so neither ever moves.
      const rest = await measure(page, () => scrollTo(0, 0))
      expectAll(label, rest, {
        'no rail on a touch screen': !rest.rail,
        'button sits inside the view': inside(rest.button, rest),
        'button paints on top': rest.buttonOnTop,
        'button lines up with back-to-top':
          Math.abs(rest.button?.right - rest.backToTop.right) <= 1,
        "button sits below back-to-top's place": rest.button?.top - rest.backToTop.bottom >= 7,
        'page does not scroll sideways': rest.page <= rest.width,
      })
      if (!rest.button) return
      const end = await measure(page, () => scrollTo(0, document.documentElement.scrollHeight))
      expectAll(`${label} at the bottom`, end, {
        'button clears the footer': apart(end.button, end.footer),
        'button clears the comments': apart(end.button, end.comments),
      })
      await page.locator('.toc-button').click()
      const opened = await measure(page)
      expectAll(`${label} opened`, opened, {
        'contents sit inside the view': inside(opened.panel, opened),
        'contents clear the button': apart(opened.panel, opened.button),
        'contents clear back-to-top': apart(opened.panel, opened.backToTop),
        'the current entry is marked': opened.current.includes(opened.last),
      })
      await page.locator(secondEntry).click()
      const jumped = await measure(page)
      expectAll(`${label} after choosing an entry`, jumped, {
        'contents close': !jumped.panel,
        'heading sits at the top': Math.abs(jumped.targetTop) <= 1,
        'URL points at the heading': !!jumped.hash,
      })
    })
  }

  test('every contents entry is a 44px touch target', async ({ page, open }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await open('/blog/dockertest/')
    await page.locator('.toc-button').click()
    const heights = await page
      .locator('#article-toc a')
      .evaluateAll((links) => links.map((link) => link.getBoundingClientRect().height))
    expect(heights.length).toBeGreaterThanOrEqual(3)
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(44)
  })
})

// Fewer than three headings means no contents list, and back-to-top keeps the corner.
test('a short article floats no contents and keeps back-to-top in the corner', async ({
  page,
  open,
}) => {
  await open('/blog/lock-free-queue/')
  const short = await measure(page, () => scrollTo(0, document.documentElement.scrollHeight))
  expectAll('/blog/lock-free-queue/', short, {
    'no contents rail': !short.rail,
    'no contents button': !short.button,
    'back-to-top keeps the corner': short.height - short.backToTop.bottom <= 24,
  })
})
