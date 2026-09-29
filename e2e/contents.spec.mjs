import { apart, covers, expect, inside, test } from './site.mjs'

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
      expect
        .soft(
          !inside(rest.rail, rest) ||
            !rest.listOnTop ||
            !!rest.button ||
            Math.abs(rest.rail?.left - rest.backToTop.left) > 1 ||
            rest.rail?.left < rest.main.right + 23 ||
            !apart(rest.rail, rest.backToTop),
          `${label}: rail must hang beside the column on back-to-top's line from the start, clear of it (${JSON.stringify(rest)})`,
        )
        .toBe(false)
      if (!rest.rail) return

      // The Dockertest H2 is followed at once by an H3; arriving at the H2 must still mark the H2.
      const section = await measure(page, () =>
        document.getElementById('dockertest').scrollIntoView(),
      )
      expect
        .soft(
          section.current.length !== 1 || section.current[0] !== '#dockertest',
          `${label}: the heading at the top of the view must be the current entry (${JSON.stringify(section.current)})`,
        )
        .toBe(false)
      const end = await measure(page, () => scrollTo(0, document.documentElement.scrollHeight))
      expect
        .soft(
          end.current.length !== 1 || end.current[0] !== end.last,
          `${label}: the last entry must be current at the bottom of the page (${JSON.stringify(end.current)})`,
        )
        .toBe(false)

      // Keyboard focus opens the rail into a card; Enter jumps to the heading and closes it again.
      await measure(page, () => scrollTo(0, 0))
      await page.locator(firstEntry).focus()
      const focused = await measure(page)
      expect
        .soft(
          !covers(focused.rail, rest.rail) ||
            !inside(focused.rail, focused) ||
            focused.rail.width < 200 ||
            !apart(focused.rail, focused.backToTop),
          `${label}: focus must open the rail into a card within the view, clear of back-to-top (${JSON.stringify(focused)})`,
        )
        .toBe(false)
      await page.keyboard.press('Enter')
      const jumped = await measure(page)
      expect
        .soft(
          jumped.hash !== jumped.first ||
            Math.abs(jumped.targetTop) > 1 ||
            !jumped.rail ||
            jumped.rail.width > rest.rail.width + 1 ||
            jumped.focused !== 'BODY',
          `${label}: Enter must jump to the heading and fold the card back into the rail (${JSON.stringify(jumped)})`,
        )
        .toBe(false)

      // Hover opens the same card, and the card covers the rail so the pointer never falls off its edge.
      await page.locator('#article-toc').hover()
      const hovered = await measure(page)
      expect
        .soft(
          !covers(hovered.rail, rest.rail) ||
            !inside(hovered.rail, hovered) ||
            !hovered.listOnTop ||
            hovered.rail.width < 200 ||
            !apart(hovered.rail, hovered.backToTop),
          `${label}: hover must open the rail into a card that covers it (${JSON.stringify(hovered)})`,
        )
        .toBe(false)

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
        expect
          .soft(
            dismissed.rail?.width !== 44 || departed.rail?.width !== 44,
            `${label}: Escape must stay dismissed when ${first} leaves first`,
          )
          .toBe(false)
        if (first === 'pointer') await page.locator('.site-title a').focus()
        else await page.mouse.move(0, 0)
        await page.locator(firstEntry).focus()
        expect
          .soft(
            !((await measure(page)).rail?.width >= 200),
            `${label}: focus must reopen the rail after both inputs leave`,
          )
          .toBe(false)
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
      expect
        .soft(
          !!rest.rail ||
            !inside(rest.button, rest) ||
            !rest.buttonOnTop ||
            Math.abs(rest.button?.right - rest.backToTop.right) > 1 ||
            rest.button?.top - rest.backToTop.bottom < 7 ||
            rest.page > rest.width,
          `${label}: the button must hold the corner below back-to-top's place (${JSON.stringify(rest)})`,
        )
        .toBe(false)
      if (!rest.button) return
      const end = await measure(page, () => scrollTo(0, document.documentElement.scrollHeight))
      expect
        .soft(
          !apart(end.button, end.footer) || !apart(end.button, end.comments),
          `${label}: at the bottom the button must stay clear of the footer and comments (${JSON.stringify(end)})`,
        )
        .toBe(false)
      await page.locator('.toc-button').click()
      const opened = await measure(page)
      expect
        .soft(
          !inside(opened.panel, opened) ||
            !apart(opened.panel, opened.button) ||
            !apart(opened.panel, opened.backToTop) ||
            !opened.current.includes(opened.last),
          `${label}: the button must open the contents above both buttons (${JSON.stringify(opened)})`,
        )
        .toBe(false)
      await page.locator(secondEntry).click()
      const jumped = await measure(page)
      expect
        .soft(
          !!jumped.panel || Math.abs(jumped.targetTop) > 1 || !jumped.hash,
          `${label}: choosing an entry must close the contents and jump to the heading (${JSON.stringify(jumped)})`,
        )
        .toBe(false)
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
  expect
    .soft(
      !!short.rail || !!short.button || short.height - short.backToTop.bottom > 24,
      `/blog/lock-free-queue/ must float no contents and keep back-to-top in the corner (${JSON.stringify(short)})`,
    )
    .toBe(false)
})
