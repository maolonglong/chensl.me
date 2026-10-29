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
      // A quiet note under the metadata line: upright text, close below that line.
      const style = await notice.evaluate((element) => {
        const notice = getComputedStyle(element)
        const above = element.previousElementSibling
        return {
          fontStyle: notice.fontStyle,
          whiteSpace: notice.whiteSpace,
          gap: element.getBoundingClientRect().top - above.getBoundingClientRect().bottom,
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
          const timeBox = time.getBoundingClientRect()
          const rects = [...link.getClientRects()]
          return {
            afterContent: getComputedStyle(link, '::after').content,
            timeRightGap: Math.abs(row.right - timeBox.right),
            sideBySide: link.getBoundingClientRect().right <= timeBox.left,
            hasDescription: item.querySelector('.post-description') !== null,
            // iOS WebKit inflates each inline client rect by 3px vertically for tap highlights,
            // groups lines whose gap is under 0.5px, and drops interior lines if they do not overlap.
            tapHighlightContinuous: rects.every(
              (rect, index) => index === 0 || rect.top - rects[index - 1].bottom <= 6,
            ),
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
        expect(row.sideBySide).toBe(true)
        expect(row.hasDescription).toBe(false)
        expect(row.tapHighlightContinuous).toBe(true)
      }
      await capture(page, `archive-${width}-${mode}`)
    })

    test(`home layout at ${width}px in ${mode}`, async ({ page, open, capture }) => {
      await page.setViewportSize({ width, height: 844 })
      await page.emulateMedia({ colorScheme: mode })
      await open('/')
      const layout = await page.evaluate(() => {
        const rows = [...document.querySelectorAll('.home .entries > li')].map((item) => {
          const row = item.querySelector('.entry-head').getBoundingClientRect()
          const link = item.querySelector('.entry-head a')
          const time = item.querySelector('.entry-head time').getBoundingClientRect()
          const rects = [...link.getClientRects()]
          return {
            timeRightGap: Math.abs(row.right - time.right),
            sideBySide: link.getBoundingClientRect().right <= time.left,
            tapHighlightContinuous: rects.every(
              (rect, index) => index === 0 || rect.top - rects[index - 1].bottom <= 6,
            ),
          }
        })
        return {
          rows,
          hasSummary: document.querySelector('.home .entry-summary') !== null,
        }
      })
      expect(layout.rows.length).toBeGreaterThan(0)
      expect(layout.hasSummary).toBe(false)
      for (const row of layout.rows) {
        expect(row.timeRightGap).toBeLessThanOrEqual(1)
        expect(row.sideBySide).toBe(true)
        expect(row.tapHighlightContinuous).toBe(true)
      }
      await capture(page, `home-${width}-${mode}`)
    })
  }
}

// Date, length, reading time, and the creation label stay one line under the title at every width.
for (const width of [375, 1280]) {
  test(`article metadata at ${width}px`, async ({ page, open }) => {
    await page.setViewportSize({ width, height: 844 })
    await open('/blog/harness-engineering/')
    const layout = await page.evaluate(() => {
      const box = (element) => element.getBoundingClientRect()
      const meta = document.querySelector('.post-meta')
      const parts = [...meta.querySelectorAll(':scope > :not([aria-hidden])')].map(box)
      return {
        column: box(document.querySelector('.post')),
        title: box(document.querySelector('.post-header h1')),
        meta: box(meta),
        tops: parts.map((part) => Math.round(part.top)),
        separatorsShown: [...meta.querySelectorAll('[aria-hidden]')].every(
          (separator) => separator.getClientRects().length > 0,
        ),
      }
    })
    const { column, title, meta, tops } = layout
    expectAll(`metadata at ${width}px`, layout, {
      'sits in the column under the title':
        meta.left >= column.left - 1 && meta.right <= column.right + 1 && meta.top >= title.bottom,
      'keeps one line': tops.every((top) => top === tops[0]),
      'keeps the inline separators': layout.separatorsShown,
    })
  })
}

// The site icon's sleeping cat is the masthead logo: decorative, beside the name, on the name's line.
// The drawing is 22px so it stays with the 15px name. Whitespace, not a rule, separates the header from the page.
for (const width of [390, 1280]) {
  test(`masthead cat sits beside the site name at ${width}px`, async ({ page, open }) => {
    await page.setViewportSize({ width, height: 844 })
    await open('/')
    const masthead = await page.evaluate(() => {
      const header = document.querySelector('.site-header')
      const link = header.querySelector('.site-title a')
      const svg = link.querySelector('svg')
      const cat = svg?.getBoundingClientRect()
      const name = document.createRange()
      name.selectNodeContents(link)
      if (svg) name.setStartAfter(svg)
      const text = name.getBoundingClientRect()
      const style = getComputedStyle(header)
      return {
        hidden: svg?.getAttribute('aria-hidden'),
        beside: !!cat && cat.right <= text.left,
        centered: !!cat && Math.abs(cat.top + cat.height / 2 - (text.top + text.height / 2)) <= 2,
        fitted: !!cat && Math.abs(cat.width - 22) <= 0.5 && Math.abs(cat.height - 22) <= 0.5,
        ruleless: style.backgroundImage === 'none' && style.borderBottomStyle === 'none',
      }
    })
    expectAll(`masthead at ${width}px`, masthead, {
      'cat is decorative': masthead.hidden === 'true',
      'cat sits left of the name': masthead.beside,
      'cat centers on the name': masthead.centered,
      'cat is 22px': masthead.fitted,
      'header draws no rule': masthead.ruleless,
    })
    await expect(page.getByRole('link', { name: '~chensl', exact: true })).toBeVisible()
  })
}

// Sections, year groups, and the footer stand apart by whitespace; no structural rule divides them.
test('page structure draws no section rules', async ({ page, open }) => {
  for (const path of ['/', '/blog/', '/blog/harness-engineering/']) {
    await open(path)
    const ruled = await page.evaluate(() =>
      [
        ...document.querySelectorAll(
          '.section-label, .section-head, .year-group, .post-nav, .footnotes, .footer-row',
        ),
      ]
        .filter((element) => getComputedStyle(element).borderTopStyle !== 'none')
        .map((element) => element.className),
    )
    expect(ruled, path).toEqual([])
  }
})

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

// Reading text and chrome use the system sans-serif stack, and JetBrains Mono is not preloaded, so
// a cold visit to a page without code downloads no web fonts.
test('home loads zero web fonts on a cold visit', async ({ page, open }) => {
  await open('/')
  const fonts = await page.evaluate(() => {
    const fonts = performance
      .getEntriesByType('resource')
      .filter((entry) => entry.name.includes('/_astro/fonts/'))
    return {
      requests: fonts.length,
      bytes: fonts.reduce((sum, entry) => sum + entry.encodedBodySize, 0),
    }
  })
  expect(fonts).toEqual({ requests: 0, bytes: 0 })
})

// Code added to a standalone page loads JetBrains Mono on demand without article metadata or layout
// flags, and <em> sets italic without CJK emphasis dots.
test('standalone pages load code fonts on demand and set italic without emphasis dots', async ({
  page,
  open,
  capture,
}) => {
  await open('/')
  const state = await page.evaluate(async () => {
    const codeFace = () =>
      [...document.fonts].some(
        (font) => font.family.includes('JetBrains') && font.status === 'loaded',
      )
    const codeBefore = codeFace()
    const code = document.createElement('code')
    code.textContent = 'const answer = 42'
    const em = document.createElement('em')
    em.textContent = 'Human Factors'
    document.querySelector('main').append(code, em)
    await new Promise(requestAnimationFrame)
    await document.fonts.ready
    const emStyle = getComputedStyle(em)
    const result = {
      codeBefore,
      codeLoaded: getComputedStyle(code).fontFamily.includes('JetBrains') && codeFace(),
      fontStyle: emStyle.fontStyle,
      emphasisStyle: emStyle.textEmphasisStyle,
    }
    code.remove()
    em.remove()
    return result
  })
  expect(state).toEqual({
    codeBefore: false,
    codeLoaded: true,
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

test('the 404 table flip stays in the column when text is enlarged', async ({ page, open }) => {
  await page.setViewportSize({ width: 320, height: 844 })
  await open('/404.html')
  const kaomoji = page.locator('.kaomoji')
  await expect(kaomoji).toHaveText('(╯°□°)╯︵ ┻━┻')
  const layout = await kaomoji.evaluate((element) => {
    document.documentElement.style.fontSize = '200%'
    const font = getComputedStyle(element).fontFamily
    const table = element.querySelector('.table').getBoundingClientRect()
    return {
      sans: font.includes('PingFang SC'),
      fits: document.documentElement.scrollWidth <= innerWidth,
      table: table.width > 0 && table.right <= innerWidth,
    }
  })
  expectAll('404 table flip at 320px / 200%', layout, {
    'uses the system sans': layout.sans,
    'does not widen the page': layout.fits,
    'keeps the table inside the view': layout.table,
  })
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

// Sections open with more air than an index row. Home and the archive share `.entries`.
for (const width of [375, 1280]) {
  test(`reading rhythm at ${width}px`, async ({ page, open }) => {
    await page.setViewportSize({ width, height: 844 })
    await open('/')
    const home = await page.evaluate(
      (read) => {
        const px = (name) =>
          Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name))
        const titles = [...document.querySelectorAll('.home .entry-title')].map((title) =>
          title.getBoundingClientRect(),
        )
        const lede = document.querySelector('.lede').getBoundingClientRect()
        const label = document.querySelector('#home-posts').getBoundingClientRect()
        return {
          sectionGap: label.top - lede.bottom,
          rowGap: titles[1].top - titles[0].bottom,
          opening: px(read) + px('--space-4'),
          row: 2 * px('--space-1'),
        }
      },
      width >= 600 ? '--space-8' : '--space-7',
    )
    expectAll(`home rhythm at ${width}px`, home, {
      'a section opens looser than a row': home.sectionGap > home.rowGap * 2,
      'the opening matches the section tokens': Math.abs(home.sectionGap - home.opening) <= 1,
      'a row matches two steps of --space-1': Math.abs(home.rowGap - home.row) <= 1,
    })

    await open('/blog/')
    const archive = await page.evaluate(
      (read) => {
        const px = (name) =>
          Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name))
        const group = document.querySelector('.year-group')
        const year = group.querySelector('.posts-year').getBoundingClientRect()
        const title = document.querySelector('.page-title').getBoundingClientRect()
        const firstTitle = group.querySelector('.entry-title').getBoundingClientRect()
        // Wide years share the first title's baseline, so the year box sits below the content edge.
        const contentTop = Math.min(year.top, firstTitle.top)
        const list = [...document.querySelectorAll('.blog-posts')].find(
          (posts) => posts.querySelectorAll('.entry-title').length >= 2,
        )
        const rows = [...list.querySelectorAll('.entry-title')].map((entry) =>
          entry.getBoundingClientRect(),
        )
        return {
          opening: contentTop - title.bottom,
          expectedOpening: px('--space-6') + px(read),
          rowGap: rows[1].top - rows[0].bottom,
          row: 2 * px('--space-1'),
        }
      },
      width >= 600 ? '--space-6' : '--space-5',
    )
    expectAll(`archive rhythm at ${width}px`, archive, {
      'a year opens looser than a row': archive.opening > archive.rowGap * 2,
      'the year opening matches the section tokens':
        Math.abs(archive.opening - archive.expectedOpening) <= 1,
      'a row matches two steps of --space-1': Math.abs(archive.rowGap - archive.row) <= 1,
    })
  })
}

test('a wrapped index title keeps the date on its first line', async ({ page, open }) => {
  await page.setViewportSize({ width: 320, height: 844 })
  for (const path of ['/', '/blog/']) {
    await open(path)
    const locked = await page.evaluate(() => {
      // Article titles are short, so the first row gets a title long enough to wrap at 320px.
      document.querySelector('.entry-head a').append('，再加一段足够长的文字让标题在窄屏上换行')
      return [...document.querySelectorAll('.entry-head')].map((row) => {
        const link = row.querySelector('a')
        const time = row.querySelector('time').getBoundingClientRect()
        const lines = [...link.getClientRects()]
        const center = (time.top + time.bottom) / 2
        const first = lines[0]
        return {
          lines: lines.length,
          onFirstLine: !!first && center >= first.top - 2 && center <= first.bottom + 2,
        }
      })
    })
    const wrapped = locked.filter((row) => row.lines >= 2)
    expect(wrapped.length, `${path} needs a wrapped title at 320px`).toBeGreaterThan(0)
    for (const row of wrapped) expect(row.onFirstLine).toBe(true)
  }
})

test('an article heading leaves more space above than below', async ({ page, open }) => {
  await open('/blog/dockertest/')
  const rhythm = await page.evaluate(() =>
    ['h2', 'h3'].map((tag) => {
      const heading = [...document.querySelectorAll(`.prose ${tag}`)].find(
        (element) => Number.parseFloat(getComputedStyle(element).marginTop) > 0,
      )
      const style = getComputedStyle(heading)
      return {
        tag,
        top: Number.parseFloat(style.marginTop),
        bottom: Number.parseFloat(style.marginBottom),
      }
    }),
  )
  for (const heading of rhythm) {
    expect(heading.top, `${heading.tag} space above`).toBeGreaterThan(heading.bottom * 4)
  }
})

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
