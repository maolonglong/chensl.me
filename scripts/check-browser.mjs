import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'

const base = process.argv[2]
assert.ok(base, 'Usage: node scripts/check-browser.mjs <preview-url>')
const session = `site-check-${process.pid}`
const failures = []
const browser = (...args) => {
  let output
  try {
    output = execFileSync('agent-browser', ['--session', session, '--json', ...args], {
      encoding: 'utf8', timeout: 60_000,
    })
  } catch (error) {
    // A failed command exits 1 with its JSON verdict on stdout; anything else (a timeout, a missing binary) is rethrown as is.
    if (!error.stdout?.trimStart().startsWith('{')) {
      throw error
    }
    output = error.stdout
  }
  const response = JSON.parse(output)
  assert.ok(response.success, `agent-browser ${args.join(' ')}: ${response.error}`)
  return response.data?.result
}
const open = pathname => {
  browser('open', new URL(pathname, base).href)
  browser('eval', 'document.fonts.ready.then(() => true)')
}

// Home, archive, a long article with code, tables, and a TOC, and the shared 404.
const pages = ['/', '/blog/', '/blog/dockertest/', '/404.html']

try {
  open('/')
  const fonts = browser('eval', `(() => {
    const fonts = performance.getEntriesByType('resource').filter(e => e.name.includes('/fonts/tsanger-jinkai02/'));
    return { requests: fonts.length, bytes: fonts.reduce((sum, e) => sum + e.encodedBodySize, 0),
      loaded: [...document.fonts].some(f => f.family.toLowerCase().includes('tsanger') && f.status === 'loaded') };
  })()`)
  console.log('Cold home fonts:', fonts)
  // `just check` models this budget statically; this confirms the browser agrees in practice.
  if (!fonts.loaded || fonts.bytes === 0 || fonts.bytes > 640 * 1024 || fonts.requests > 4) {
    failures.push('Home must load actual JinKai fonts in at most 4 requests and 640 KiB on a cold visit')
  }

  for (const width of [320, 390, 768, 1280]) {
    browser('set', 'viewport', String(width), '844', '2')
    for (const pathname of pages) {
      open(pathname)
      for (const size of ['100%', '200%']) {
        const layout = browser('eval', `(() => {
          document.documentElement.style.fontSize = '${size}';
          const box = element => element.getBoundingClientRect();
          const controls = [...document.querySelectorAll('header a, header button')];
          const main = box(document.querySelector('main'));
          const title = box(document.querySelector('.site-title'));
          const nav = box(document.querySelector('header nav'));
          const footer = box(document.querySelector('body > footer'));
          const result = {
            width: innerWidth, page: document.documentElement.scrollWidth, controls: controls.length,
            fits: controls.every(e => { const r = box(e); return r.width > 0 && r.height > 0 && r.left >= 0 && r.right <= innerWidth; }),
            titleOffset: Math.round(title.left - main.left),
            navOffset: Math.round(main.right - nav.right),
            // At large text sizes the nav wraps under the title and starts a new line at the left edge.
            navWrapped: nav.top >= title.bottom && Math.abs(nav.left - main.left) <= 1,
            footerGap: Math.round(innerHeight - footer.bottom),
            footerOffset: Math.round(footer.left - main.left),
            backToTop: document.querySelectorAll('.back-to-top').length,
            floatingContents: document.querySelectorAll('#TableOfContents, .toc-button').length,
          };
          document.documentElement.style.fontSize = '';
          return result;
        })()`)
        const label = `${pathname} at ${width}px / ${size}`
        if (layout.controls < 5 || !layout.fits || layout.page > layout.width) {
          failures.push(`${label}: header or page overflows (${JSON.stringify(layout)})`)
        }
        // Header, text column, and footer share one left edge and one right edge.
        if (Math.abs(layout.titleOffset) > 1 || (Math.abs(layout.navOffset) > 1 && !layout.navWrapped) || Math.abs(layout.footerOffset) > 1) {
          failures.push(`${label}: header or footer leaves the text column (${JSON.stringify(layout)})`)
        }
        // A short page keeps its footer at the bottom of the viewport instead of mid-screen.
        if (layout.footerGap > 64) {
          failures.push(`${label}: footer floats ${layout.footerGap}px above the viewport bottom`)
        }
        // Only articles are long enough to need a way back up.
        if (layout.backToTop !== (pathname === '/blog/dockertest/' ? 1 : 0)) {
          failures.push(`${label}: expected a back-to-top button on articles only (${JSON.stringify(layout)})`)
        }
        // Only an article with enough headings carries the contents: one list and the button that opens it.
        if (layout.floatingContents !== (pathname === '/blog/dockertest/' ? 2 : 0)) {
          failures.push(`${label}: expected floating contents on articles with a contents list only (${JSON.stringify(layout)})`)
        }
      }
    }
  }

  // The back-to-top button waits a screen down, then floats clear of the footer, the comments, and, when there is room, the text column.
  for (const width of [320, 390, 768, 1280]) {
    browser('set', 'viewport', String(width), '844', '2')
    open('/blog/dockertest/')
    for (const size of ['100%', '200%']) {
      const top = browser('eval', `new Promise(resolve => {
        document.documentElement.style.fontSize = '${size}';
        const button = document.querySelector('.back-to-top');
        const settle = () => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
        const box = element => element.getBoundingClientRect();
        const apart = (a, b) => a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top;
        (async () => {
          scrollTo(0, 0);
          await settle();
          const hiddenAtTop = !button || getComputedStyle(button).visibility === 'hidden';
          scrollTo(0, document.documentElement.scrollHeight);
          await settle();
          const b = button ? box(button) : null;
          const result = {
            hiddenAtTop,
            visible: !!button && getComputedStyle(button).visibility === 'visible',
            inViewport: !!b && b.width >= 44 && b.height >= 44 && b.left >= 0 && b.right <= innerWidth && b.top >= 0 && b.bottom <= innerHeight,
            clearOfFooter: !!b && apart(b, box(document.querySelector('body > footer'))),
            clearOfComments: !!b && apart(b, box(document.querySelector('.comments'))),
            outsideColumn: !!b && b.left >= box(document.querySelector('main')).right,
            columnOffset: b ? Math.round(box(document.querySelector('main')).right - b.right) : null,
          };
          document.documentElement.style.fontSize = '';
          scrollTo(0, 0);
          resolve(result);
        })();
      })`)
      const label = `/blog/dockertest/ back-to-top at ${width}px / ${size}`
      if (!top.hiddenAtTop || !top.visible || !top.inViewport || !top.clearOfFooter || !top.clearOfComments) {
        failures.push(`${label}: button must hide at the top and float clear of the footer and comments at the bottom (${JSON.stringify(top)})`)
      }
      // Without room beside the column, the button still hangs from its right edge.
      if (!top.outsideColumn && Math.abs(top.columnOffset) > 1) {
        failures.push(`${label}: button must line up with the text column's right edge (${JSON.stringify(top)})`)
      }
      if (width === 1280 && size === '100%' && !top.outsideColumn) {
        failures.push(`${label}: button must sit beside the text column when there is room (${JSON.stringify(top)})`)
      }
    }
  }

  // From the very bottom, one press returns to the top within a second, leaves the URL alone, and a keyboard press lands on the site title.
  browser('set', 'viewport', '1280', '844', '2')
  open('/blog/semantic-view-sql-traps/')
  const bottom = browser('eval', `new Promise(resolve => {
    scrollTo(0, document.documentElement.scrollHeight);
    requestAnimationFrame(() => requestAnimationFrame(() => resolve({ scrollY, button: !!document.querySelector('.back-to-top') })));
  })`)
  if (!bottom.button) {
    failures.push('Back-to-top button is missing from the longest article')
  } else {
    browser('focus', '.back-to-top')
    browser('press', 'Enter')
    const back = browser('eval', `new Promise(resolve => {
      const start = performance.now();
      (function poll() {
        const elapsed = Math.round(performance.now() - start);
        scrollY === 0 || elapsed > 3000
          ? resolve({ from: ${bottom.scrollY}, scrollY, elapsed, url: location.href, focused: document.activeElement.matches('.site-title a') })
          : requestAnimationFrame(poll);
      })();
    })`)
    if (back.scrollY !== 0 || back.elapsed > 1000 || back.url.includes('#') || !back.focused) {
      failures.push(`Back-to-top must reach the top within 1s without a URL fragment and hand keyboard focus to the site title (${JSON.stringify(back)})`)
    }
  }

  // The article's one contents list floats in back-to-top's lane from the start: a Notion-style rail beside
  // the column where a pointer can hover, and a popover behind a button in the corner everywhere else.
  const contents = `(() => {
    const box = element => element ? element.getBoundingClientRect().toJSON() : null;
    const shown = element => !!element && getComputedStyle(element).display !== 'none' && getComputedStyle(element).visibility === 'visible';
    const list = document.querySelector('#TableOfContents'), button = document.querySelector('.toc-button');
    const open = !!list && list.matches(':popover-open');
    // A fixed control can still be painted over by positioned content later in the page; hit-test it.
    const onTop = element => {
      if (!shown(element)) return false;
      const r = element.getBoundingClientRect(), hit = document.elementFromPoint(r.left + 8, r.top + r.height / 2);
      return !!hit && element.contains(hit);
    };
    const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    return {
      rail: shown(list) && !open ? box(list) : null, panel: open ? box(list) : null,
      button: shown(button) ? box(button) : null, backToTop: box(document.querySelector('.back-to-top')),
      listOnTop: onTop(list), buttonOnTop: onTop(button),
      main: box(document.querySelector('main')), footer: box(document.querySelector('body > footer')),
      comments: box(document.querySelector('.comments')),
      current: [...document.querySelectorAll('#TableOfContents [aria-current]')].map(a => decodeURIComponent(a.hash)),
      first: decodeURIComponent(document.querySelector('#TableOfContents a')?.hash ?? ''),
      last: decodeURIComponent([...document.querySelectorAll('#TableOfContents a')].at(-1)?.hash ?? ''),
      hash: decodeURIComponent(location.hash), targetTop: target ? Math.round(target.getBoundingClientRect().top) : null,
      focused: document.activeElement.tagName, width: innerWidth, height: innerHeight, page: document.documentElement.scrollWidth,
    };
  })()`
  const settle = script => browser('eval', `new Promise(resolve => {
    ${script};
    requestAnimationFrame(() => requestAnimationFrame(() => resolve(${contents})));
  })`)
  const apart = (a, b) => !a || !b || a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top
  const inside = (a, state) => !!a && a.left >= 0 && a.top >= 0 && a.right <= state.width && a.bottom <= state.height
  const covers = (outer, inner) => !!outer && !!inner && outer.left <= inner.left && outer.top <= inner.top && outer.right >= inner.right && outer.bottom >= inner.bottom

  for (const width of [1024, 1280]) {
    browser('set', 'viewport', String(width), '844', '2')
    open('/blog/dockertest/')
    const label = `/blog/dockertest/ contents rail at ${width}px`
    const rest = settle('scrollTo(0, 0)')
    if (!inside(rest.rail, rest) || !rest.listOnTop || rest.button || Math.abs(rest.rail.left - rest.backToTop.left) > 1 || rest.rail.left < rest.main.right + 23 || !apart(rest.rail, rest.backToTop)) {
      failures.push(`${label}: rail must hang beside the column on back-to-top's line from the start, clear of it (${JSON.stringify(rest)})`)
    }
    if (!rest.rail) {
      continue
    }
    // The Dockertest H2 is followed at once by an H3; arriving at the H2 must still mark the H2.
    const section = settle(`document.getElementById('dockertest').scrollIntoView()`)
    if (section.current.length !== 1 || section.current[0] !== '#dockertest') {
      failures.push(`${label}: the heading at the top of the view must be the current entry (${JSON.stringify(section.current)})`)
    }
    const end = settle('scrollTo(0, document.documentElement.scrollHeight)')
    if (end.current.length !== 1 || end.current[0] !== end.last) {
      failures.push(`${label}: the last entry must be current at the bottom of the page (${JSON.stringify(end.current)})`)
    }
    // Keyboard focus opens the rail into a card; Enter jumps to the heading and closes it again.
    settle('scrollTo(0, 0)')
    browser('focus', '#TableOfContents li:first-child > a')
    const focused = settle('')
    if (!covers(focused.rail, rest.rail) || !inside(focused.rail, focused) || focused.rail.width < 200 || !apart(focused.rail, focused.backToTop)) {
      failures.push(`${label}: focus must open the rail into a card within the view, clear of back-to-top (${JSON.stringify(focused)})`)
    }
    browser('press', 'Enter')
    const jumped = settle('')
    if (jumped.hash !== jumped.first || Math.abs(jumped.targetTop) > 1 || !jumped.rail || jumped.rail.width > rest.rail.width + 1 || jumped.focused !== 'BODY') {
      failures.push(`${label}: Enter must jump to the heading and fold the card back into the rail (${JSON.stringify(jumped)})`)
    }
    // Hover opens the same card, and the card covers the rail so the pointer never falls off its edge.
    browser('hover', '#TableOfContents')
    const hovered = settle('')
    if (!covers(hovered.rail, rest.rail) || !inside(hovered.rail, hovered) || !hovered.listOnTop || hovered.rail.width < 200 || !apart(hovered.rail, hovered.backToTop)) {
      failures.push(`${label}: hover must open the rail into a card that covers it (${JSON.stringify(hovered)})`)
    }
  }

  for (const [width, size] of [[390, '100%'], [390, '200%'], [768, '100%']]) {
    browser('set', 'viewport', String(width), '844', '2')
    open('/blog/dockertest/')
    browser('eval', `document.documentElement.style.fontSize = '${size}'`)
    const label = `/blog/dockertest/ contents button at ${width}px / ${size}`
    // The button holds the corner from the start; back-to-top joins above it later, so neither ever moves.
    const rest = settle('scrollTo(0, 0)')
    if (rest.rail || !inside(rest.button, rest) || !rest.buttonOnTop || Math.abs(rest.button.right - rest.backToTop.right) > 1 || rest.button.top - rest.backToTop.bottom < 7 || rest.page > rest.width) {
      failures.push(`${label}: the button must hold the corner below back-to-top's place (${JSON.stringify(rest)})`)
    }
    if (!rest.button) {
      continue
    }
    const end = settle('scrollTo(0, document.documentElement.scrollHeight)')
    if (!apart(end.button, end.footer) || !apart(end.button, end.comments)) {
      failures.push(`${label}: at the bottom the button must stay clear of the footer and comments (${JSON.stringify(end)})`)
    }
    browser('click', '.toc-button')
    const opened = settle('')
    if (!inside(opened.panel, opened) || !apart(opened.panel, opened.button) || !apart(opened.panel, opened.backToTop) || !opened.current.includes(opened.last)) {
      failures.push(`${label}: the button must open the contents above both buttons (${JSON.stringify(opened)})`)
    }
    browser('click', '#TableOfContents li:nth-child(2) > a')
    const jumped = settle('')
    if (jumped.panel || Math.abs(jumped.targetTop) > 1 || !jumped.hash) {
      failures.push(`${label}: choosing an entry must close the contents and jump to the heading (${JSON.stringify(jumped)})`)
    }
    browser('eval', `document.documentElement.style.fontSize = ''`)
  }

  // Fewer than three headings means no contents list, and back-to-top keeps the corner.
  open('/blog/lock-free-queue/')
  const short = settle('scrollTo(0, document.documentElement.scrollHeight)')
  if (short.rail || short.button || short.height - short.backToTop.bottom > 24) {
    failures.push(`/blog/lock-free-queue/ must float no contents and keep back-to-top in the corner (${JSON.stringify(short)})`)
  }

  // Every code block gets one copy button inside its top-right corner that stays put while the
  // code scrolls, and a wide first line can always be scrolled out from under it.
  browser('set', 'viewport', '320', '844', '2')
  open('/blog/dockertest/')
  const copy = browser('eval', `(() => {
    const blocks = [...document.querySelectorAll('.highlight')];
    const button = block => block.parentElement.querySelectorAll('.code-copy');
    const placed = blocks.every(block => {
      if (button(block).length !== 1) return false;
      const b = button(block)[0].getBoundingClientRect(), r = block.getBoundingClientRect();
      return b.width >= 24 && b.top >= r.top && b.right <= r.right && b.right <= innerWidth;
    });
    const wide = blocks.filter(block => block.scrollWidth > block.clientWidth);
    const firstLineClear = wide.every(block => {
      block.scrollLeft = block.scrollWidth;
      const range = document.createRange();
      range.selectNodeContents(block.querySelector('.line'));
      return range.getBoundingClientRect().right <= button(block)[0].getBoundingClientRect().left;
    });
    return { blocks: blocks.length, placed, wide: wide.length, firstLineClear,
      expected: blocks[0]?.querySelector('code').textContent.replace(/\\n$/, '') };
  })()`)
  if (copy.blocks === 0 || !copy.placed || copy.wide === 0 || !copy.firstLineClear) {
    failures.push(`Code blocks must each carry one copy button in their top-right corner that a scrolled first line can clear (${JSON.stringify(copy)})`)
  } else {
    // Headless Chrome denies clipboard reads, so record what reaches the real writeText and let it run.
    browser('eval', `(() => {
      const write = navigator.clipboard.writeText.bind(navigator.clipboard);
      navigator.clipboard.writeText = text => { window.copiedText = text; return write(text); };
    })()`)
    browser('find', 'first', '.code-copy', 'click')
    // "已复制" is announced only after the browser accepts the write.
    const { copied, status } = browser('eval', `new Promise(resolve => {
      const status = document.querySelector('.code-copy-status'), start = Date.now();
      (function poll() {
        status?.textContent || Date.now() - start > 1000
          ? resolve({ copied: window.copiedText, status: status?.textContent }) : setTimeout(poll, 20);
      })();
    })`)
    if (copied !== copy.expected || status !== '已复制') {
      failures.push(`Copy button must copy the code without its trailing newline and announce it (${JSON.stringify({ copied, status })})`)
    }
  }
} finally {
  browser('close')
}
assert.deepEqual(failures, [], failures.join('\n'))
console.log('Browser font budget, text-resize, page-shell, code-copy, back-to-top, and floating contents checks passed.')
