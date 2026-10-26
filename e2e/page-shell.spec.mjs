import { expect, expectAll, test } from './site.mjs'

// Home, archive, a long article with code, tables, and a TOC, and the shared 404.
const pages = ['/', '/blog/', '/blog/dockertest/', '/404.html']

test('articles become stale in the browser without a rebuild', async ({ page, open }) => {
  // semantic-view-sql-traps was published on 2026-09-23.
  await page.clock.setFixedTime(new Date('2028-09-01T00:00:00Z'))
  await open('/blog/semantic-view-sql-traps/')
  const notice = page.locator('.post-notice')
  await expect(notice).toBeHidden()
  await page.clock.setFixedTime(new Date('2029-01-01T00:00:00Z'))
  await open('/blog/semantic-view-sql-traps/')
  await expect(notice).toHaveText('这篇文章写于两年多以前，部分内容可能已经过时。')
  await expect(notice).toBeVisible()
})

test('a clock behind build time does not hide an existing stale notice', async ({ page, open }) => {
  await page.clock.setFixedTime(new Date('2020-01-01T00:00:00Z'))
  await open('/blog/overlayfs/')
  await expect(page.locator('.post-notice')).toBeVisible()
})

test.describe('stale notices without page scripts', () => {
  test.use({ javaScriptEnabled: false })

  test('old articles retain their build-time notice', async ({ page, open }) => {
    await open('/blog/overlayfs/')
    const notice = page.locator('.post-header > .post-meta + .post-notice')
    await expect(notice).toHaveText('这篇文章写于两年多以前，部分内容可能已经过时。')
    await expect(notice).toBeVisible()
  })
})

for (const width of [375, 1280]) {
  for (const mode of ['light', 'dark']) {
    test(`stale article header at ${width}px in ${mode}`, async ({ page, open, capture }) => {
      await page.setViewportSize({ width, height: 844 })
      await page.emulateMedia({ colorScheme: mode })
      await open('/blog/overlayfs/')
      const notice = page.locator('.post-notice')
      await expect(notice).toBeVisible()
      // A quiet note under the metadata: upright text in the body color, close below the header line.
      const style = await notice.evaluate((element) => {
        const notice = getComputedStyle(element)
        return {
          fontStyle: notice.fontStyle,
          whiteSpace: notice.whiteSpace,
          gap:
            element.getBoundingClientRect().top -
            element.previousElementSibling.getBoundingClientRect().bottom,
        }
      })
      expect(style.fontStyle).toBe('normal')
      expect(style.whiteSpace).toBe('normal')
      expect(style.gap).toBeGreaterThanOrEqual(8)
      expect(style.gap).toBeLessThanOrEqual(32)
      await expect(notice).not.toHaveAttribute('role', 'alert')
      await expect(notice).not.toHaveAttribute('aria-live')
      await capture(page, `stale-header-${width}-${mode}`)
    })

    test(`archive layout at ${width}px in ${mode}`, async ({ page, open, capture }) => {
      await page.setViewportSize({ width, height: 844 })
      await page.emulateMedia({ colorScheme: mode })
      await open('/blog/')
      const layout = await page.evaluate(() => {
        const group = document.querySelector('.year-group')
        const year = group.querySelector('.posts-year').getBoundingClientRect()
        const list = group.querySelector('.blog-posts').getBoundingClientRect()
        const rows = [...document.querySelectorAll('.blog-posts > li')].map((item) => {
          const row = item.querySelector('.entry-head').getBoundingClientRect()
          const link = item.querySelector('.entry-head a')
          const time = item.querySelector('.entry-head time')
          const desc = item.querySelector('.post-description')
          const timeBox = time.getBoundingClientRect()
          const descBox = desc.getBoundingClientRect()
          return {
            afterContent: getComputedStyle(link, '::after').content,
            timeRightGap: Math.abs(row.right - timeBox.right),
            descBelowRow: descBox.top - row.bottom,
            descMatchesTime:
              getComputedStyle(desc).fontSize === getComputedStyle(time).fontSize &&
              getComputedStyle(desc).color === getComputedStyle(time).color,
          }
        })
        return {
          sideBySide: year.right <= list.left,
          stacked: year.bottom <= list.top && Math.abs(year.left - list.left) <= 1,
          rows,
        }
      })
      expect(layout.rows.length).toBeGreaterThan(0)
      expect(width >= 768 ? layout.sideBySide : layout.stacked).toBe(true)
      for (const row of layout.rows) {
        expect(row.afterContent).toBe('none')
        expect(row.timeRightGap).toBeLessThanOrEqual(1)
        expect(row.descBelowRow).toBeGreaterThanOrEqual(2)
        expect(row.descBelowRow).toBeLessThanOrEqual(8)
        expect(row.descMatchesTime).toBe(true)
      }
      await capture(page, `archive-${width}-${mode}`)
    })
  }
}

test('CSP blocks untrusted inline scripts and event handlers', async ({ page, open }) => {
  await open('/')
  const injection = await page.evaluate(async () => {
    const violations = []
    let reported
    const bothReported = new Promise((resolve) => (reported = resolve))
    const onViolation = (event) => {
      violations.push(event.effectiveDirective)
      if (violations.length === 2) reported()
    }
    document.addEventListener('securitypolicyviolation', onViolation)
    const script = document.createElement('script')
    script.textContent = 'window.cspInjectedScript = true'
    document.body.append(script)
    const button = document.createElement('button')
    button.setAttribute('onclick', 'window.cspInjectedHandler = true')
    document.body.append(button)
    button.click()
    // A violation is reported asynchronously; a missing report fails the test by its timeout.
    await bothReported
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

// `pnpm check` models the JinKai budget statically; this confirms the browser agrees in practice.
// The home page also loads the Latin serif, so the cold visit fetches two font files in total.
test('home loads its fonts in two requests and at most 150 KiB on a cold visit', async ({
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
  expect(fonts.bytes).toBeLessThanOrEqual(150 * 1024)
  expect(fonts.requests).toBe(2)
  const slices = await page.evaluate(
    () =>
      performance.getEntriesByType('resource').filter((entry) => entry.name.includes('/slice-'))
        .length,
  )
  expect(slices, 'home text must not need a JinKai slice').toBe(0)
})

// Text that only exists at runtime, such as a news issue read from D1, is in no build-time
// subset. It must still render in JinKai by downloading the slice that covers it.
test('runtime text outside the build-time subsets loads a JinKai slice', async ({ page, open }) => {
  await open('/')
  const result = await page.evaluate(async () => {
    const probe = document.createElement('p')
    // Neither character appears in the source, so only a slice can cover them.
    probe.textContent = '龘鼐'
    document.querySelector('main').append(probe)
    await document.fonts.load(`16px ${getComputedStyle(probe).fontFamily}`, probe.textContent)
    await document.fonts.ready
    return {
      slices: performance
        .getEntriesByType('resource')
        .filter((entry) => /\/_astro\/slice-\d+\.[\w-]+\.woff2$/.test(entry.name))
        .map((entry) => entry.encodedBodySize),
      loaded: [...document.fonts].some(
        (font) =>
          font.family.replaceAll('"', '') === 'TsangerJinKai02 Slices' && font.status === 'loaded',
      ),
    }
  })
  expect(result.loaded, 'a JinKai slice must load').toBe(true)
  expect(result.slices.length).toBeGreaterThanOrEqual(1)
  expect(result.slices.length).toBeLessThanOrEqual(2)
})

// Code and italic Latin added to a standalone page must work without article metadata or layout
// flags, and <em> sets italic without CJK emphasis dots.
test('standalone pages load code and italic Latin fonts on demand', async ({
  page,
  open,
  capture,
}) => {
  await open('/')
  const state = await page.evaluate(async () => {
    const italicFace = () =>
      [...document.fonts].some(
        (font) =>
          font.family.includes('Source Serif') &&
          font.style === 'italic' &&
          font.status === 'loaded',
      )
    const italicBefore = italicFace()
    const code = document.createElement('code')
    code.textContent = 'const answer = 42'
    const em = document.createElement('em')
    em.textContent = 'Human Factors'
    document.querySelector('main').append(code, em)
    await new Promise(requestAnimationFrame)
    await document.fonts.ready
    const emStyle = getComputedStyle(em)
    const result = {
      italicBefore,
      codeLoaded:
        getComputedStyle(code).fontFamily.includes('JetBrains') &&
        [...document.fonts].some(
          (font) => font.family.includes('JetBrains') && font.status === 'loaded',
        ),
      italicLoaded: italicFace(),
      fontStyle: emStyle.fontStyle,
      emphasisStyle: emStyle.textEmphasisStyle,
    }
    code.remove()
    em.remove()
    return result
  })
  expect(state).toEqual({
    italicBefore: false,
    codeLoaded: true,
    italicLoaded: true,
    fontStyle: 'italic',
    emphasisStyle: 'none',
  })
  await open('/blog/terminal-auto-theme/')
  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 844 })
    await page.locator('.footnotes').scrollIntoViewIfNeeded()
    for (const mode of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme: mode })
      await capture(page, `emphasis-${width}-${mode}`)
    }
  }
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
          const inset = Number.parseFloat(
            getComputedStyle(document.querySelector('main')).paddingLeft,
          )
          main.x += inset
          main.width -= 2 * inset
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
            footerOffset: Math.round(footer.left + inset - main.left),
            backToTop: document.querySelectorAll('.back-to-top').length,
            floatingContents: document.querySelectorAll('#article-toc, .toc-button').length,
          }
          document.documentElement.style.fontSize = ''
          return result
        }, size)
        const article = pathname === '/blog/dockertest/'
        expectAll(`${pathname} at ${width}px / ${size}`, layout, {
          'header shows every control': layout.controls >= 5,
          'header controls fit the view': layout.fits,
          'page does not scroll sideways': layout.page <= layout.width,
          // Header, page shell, and footer share one left edge and one right edge.
          'title on the column edge': Math.abs(layout.titleOffset) <= 1,
          'nav on the column edge or wrapped': Math.abs(layout.navOffset) <= 1 || layout.navWrapped,
          'footer on the column edge': Math.abs(layout.footerOffset) <= 1,
          // A short page keeps its footer at the bottom of the viewport instead of mid-screen.
          'footer at the viewport bottom': layout.footerGap <= 64,
          // Only articles are long enough to need a way back up.
          'back-to-top on articles only': layout.backToTop === (article ? 1 : 0),
          // Only an article with enough headings carries the contents: one list and its button.
          'contents on articles with headings only': layout.floatingContents === (article ? 2 : 0),
        })
      }
    }
  })
}

test('every heading level outranks the article body size', async ({ page, open }) => {
  await open('/blog/dockertest/')
  const [body, h2, h3, ...deep] = await page.evaluate(() =>
    ['p', 'h2', 'h3', 'h4', 'h5', 'h6'].map((tag) => {
      const element = document.querySelector('.prose').appendChild(document.createElement(tag))
      element.textContent = '标题'
      return Number.parseFloat(getComputedStyle(element).fontSize)
    }),
  )
  expect(h2).toBeGreaterThan(h3)
  for (const size of deep) {
    expect(h3).toBeGreaterThan(size)
    expect(size).toBeGreaterThanOrEqual(body)
  }
})
