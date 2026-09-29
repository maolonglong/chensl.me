import { expect, test } from './site.mjs'

// Home, archive, a long article with code, tables, and a TOC, and the shared 404.
const pages = ['/', '/blog/', '/blog/dockertest/', '/404.html']

test('CSP blocks untrusted inline scripts and event handlers', async ({ page, open }) => {
  await open('/')
  const injection = await page.evaluate(async () => {
    const violations = []
    const onViolation = (event) => violations.push(event.effectiveDirective)
    document.addEventListener('securitypolicyviolation', onViolation)
    const script = document.createElement('script')
    script.textContent = 'window.cspInjectedScript = true'
    document.body.append(script)
    const button = document.createElement('button')
    button.setAttribute('onclick', 'window.cspInjectedHandler = true')
    document.body.append(button)
    button.click()
    await new Promise((resolve) => setTimeout(resolve, 100))
    script.remove()
    button.remove()
    document.removeEventListener('securitypolicyviolation', onViolation)
    return {
      scriptBlocked: window.cspInjectedScript !== true,
      handlerBlocked: window.cspInjectedHandler !== true,
      scriptViolation: violations.includes('script-src-elem'),
      handlerViolation: violations.includes('script-src-attr'),
    }
  })
  expect(injection).toEqual({
    scriptBlocked: true,
    handlerBlocked: true,
    scriptViolation: true,
    handlerViolation: true,
  })
})

// `pnpm check` models this budget statically; this confirms the browser agrees in practice.
test('home loads JinKai in one request and at most 100 KiB on a cold visit', async ({
  page,
  open,
}) => {
  await open('/')
  const fonts = await page.evaluate(() => {
    const fonts = performance
      .getEntriesByType('resource')
      .filter((entry) => entry.name.includes('/_astro/fonts/'))
    return {
      requests: fonts.length,
      bytes: fonts.reduce((sum, entry) => sum + entry.encodedBodySize, 0),
      loaded: [...document.fonts].some(
        (font) => font.family.toLowerCase().includes('tsanger') && font.status === 'loaded',
      ),
    }
  })
  expect(fonts.loaded, 'JinKai must actually load').toBe(true)
  expect(fonts.bytes).toBeGreaterThan(0)
  expect(fonts.bytes).toBeLessThanOrEqual(100 * 1024)
  expect(fonts.requests).toBe(1)
})

// Code added to a standalone page must work without article metadata or layout flags.
test('standalone pages load code fonts on demand', async ({ page, open }) => {
  await open('/')
  const loaded = await page.evaluate(async () => {
    const code = document.createElement('code')
    code.textContent = 'const answer = 42'
    document.querySelector('main').append(code)
    await new Promise(requestAnimationFrame)
    await document.fonts.ready
    const loaded =
      getComputedStyle(code).fontFamily.includes('JetBrains') &&
      [...document.fonts].some(
        (font) => font.family.includes('JetBrains') && font.status === 'loaded',
      )
    code.remove()
    return loaded
  })
  expect(loaded, 'Standalone pages must load code fonts on demand').toBe(true)
})

for (const width of [320, 390, 768, 1280]) {
  test(`page shell fits and aligns at ${width}px`, async ({ page, open }) => {
    await page.setViewportSize({ width, height: 844 })
    for (const pathname of pages) {
      await open(pathname)
      for (const size of ['100%', '200%']) {
        const layout = await page.evaluate((size) => {
          document.documentElement.style.fontSize = size
          const box = (element) => element.getBoundingClientRect()
          const controls = [...document.querySelectorAll('header a, header button')]
          const main = box(document.querySelector('main'))
          const title = box(document.querySelector('.site-title'))
          const nav = box(document.querySelector('header nav'))
          const footer = box(document.querySelector('body > footer'))
          const result = {
            width: innerWidth,
            page: document.documentElement.scrollWidth,
            controls: controls.length,
            fits: controls.every((element) => {
              const r = box(element)
              return r.width > 0 && r.height > 0 && r.left >= 0 && r.right <= innerWidth
            }),
            titleOffset: Math.round(title.left - main.left),
            navOffset: Math.round(main.right - nav.right),
            // At large text sizes the nav wraps under the title and starts a new line at the left edge.
            navWrapped: nav.top >= title.bottom && Math.abs(nav.left - main.left) <= 1,
            footerGap: Math.round(innerHeight - footer.bottom),
            footerOffset: Math.round(footer.left - main.left),
            backToTop: document.querySelectorAll('.back-to-top').length,
            floatingContents: document.querySelectorAll('#article-toc, .toc-button').length,
          }
          document.documentElement.style.fontSize = ''
          return result
        }, size)
        const label = `${pathname} at ${width}px / ${size}`
        const state = JSON.stringify(layout)
        expect
          .soft(
            layout.controls < 5 || !layout.fits || layout.page > layout.width,
            `${label}: header or page overflows (${state})`,
          )
          .toBe(false)
        // Header, text column, and footer share one left edge and one right edge.
        expect
          .soft(
            Math.abs(layout.titleOffset) > 1 ||
              (Math.abs(layout.navOffset) > 1 && !layout.navWrapped) ||
              Math.abs(layout.footerOffset) > 1,
            `${label}: header or footer leaves the text column (${state})`,
          )
          .toBe(false)
        // A short page keeps its footer at the bottom of the viewport instead of mid-screen.
        expect
          .soft(
            layout.footerGap > 64,
            `${label}: footer floats ${layout.footerGap}px above the viewport bottom`,
          )
          .toBe(false)
        // Only articles are long enough to need a way back up.
        const article = pathname === '/blog/dockertest/'
        expect
          .soft(
            layout.backToTop !== (article ? 1 : 0),
            `${label}: expected a back-to-top button on articles only (${state})`,
          )
          .toBe(false)
        // Only an article with enough headings carries the contents: one list and the button that opens it.
        expect
          .soft(
            layout.floatingContents !== (article ? 2 : 0),
            `${label}: expected floating contents on articles with a contents list only (${state})`,
          )
          .toBe(false)
      }
    }
  })
}
