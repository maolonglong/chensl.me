import { apart, covers, expect, expectAll, inside, test } from './site.mjs'

// The article's one contents list floats in back-to-top's lane from the start: a Notion-style rail
// beside the column where a pointer can hover, and a popover behind a button in the corner
// everywhere else.
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
    main: box(document.querySelector('main')),
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

test.describe('with a hovering pointer', () => {
  for (const width of [1024, 1280]) {
    test(`contents rail at ${width}px`, async ({ page, open }) => {
      await page.setViewportSize({ width, height: 844 })
      await open('/blog/dockertest/')
      const label = `/blog/dockertest/ contents rail at ${width}px`
      const rest = await measure(page, () => scrollTo(0, 0))
      // The rail hangs beside the column on back-to-top's line from the start, clear of it.
      expectAll(label, rest, {
        'rail sits inside the view': inside(rest.rail, rest),
        'rail paints on top': rest.listOnTop,
        'no contents button beside a rail': !rest.button,
        "rail shares back-to-top's line": Math.abs(rest.rail?.left - rest.backToTop.left) <= 1,
        'rail clears the column': rest.rail?.left >= rest.main.right + 23,
        'rail clears back-to-top': apart(rest.rail, rest.backToTop),
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

      // Keyboard focus opens the rail into a card; Enter jumps to the heading and closes it again.
      await measure(page, () => scrollTo(0, 0))
      await page.locator(firstEntry).focus()
      const focused = await measure(page)
      expectAll(`${label} focused`, focused, {
        'card covers the rail': covers(focused.rail, rest.rail),
        'card sits inside the view': inside(focused.rail, focused),
        'card is at least 200px wide': focused.rail?.width >= 200,
        'card clears back-to-top': apart(focused.rail, focused.backToTop),
      })
      await page.keyboard.press('Enter')
      const jumped = await measure(page)
      expectAll(`${label} after Enter`, jumped, {
        'URL points at the first heading': jumped.hash === jumped.first,
        'heading sits at the top': Math.abs(jumped.targetTop) <= 1,
        'card folds back into the rail': jumped.rail?.width <= rest.rail.width + 1,
        'focus leaves the list': jumped.focused === 'BODY',
      })

      // Hover opens the same card, and the card covers the rail so the pointer never falls off its edge.
      await page.locator('#article-toc').hover()
      const hovered = await measure(page)
      expectAll(`${label} hovered`, hovered, {
        'card covers the rail': covers(hovered.rail, rest.rail),
        'card sits inside the view': inside(hovered.rail, hovered),
        'card paints on top': hovered.listOnTop,
        'card is at least 200px wide': hovered.rail?.width >= 200,
        'card clears back-to-top': apart(hovered.rail, hovered.backToTop),
      })

      // Dismissal survives either departure order, and resets once both inputs leave.
      for (const first of ['pointer', 'focus']) {
        await page.mouse.move(0, 0)
        await page.locator('.site-title a').focus()
        await page.locator(firstEntry).focus()
        await page.mouse.move(rest.rail.left + 8, rest.rail.top + rest.rail.height / 2)
        await page.keyboard.press('Escape')
        const dismissed = await measure(page)
        if (first === 'pointer') await page.mouse.move(0, 0)
        else await page.locator('.site-title a').focus()
        const departed = await measure(page)
        expect.soft(dismissed.rail?.width, `${label}: Escape dismisses the card`).toBe(44)
        expect
          .soft(
            departed.rail?.width,
            `${label}: the card stays dismissed when ${first} leaves first`,
          )
          .toBe(44)
        if (first === 'pointer') await page.locator('.site-title a').focus()
        else await page.mouse.move(0, 0)
        await page.locator(firstEntry).focus()
        expect
          .soft((await measure(page)).rail?.width, `${label}: focus reopens the card`)
          .toBeGreaterThanOrEqual(200)
      }
    })
  }
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
