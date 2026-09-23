import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'

const base = process.argv[2]
assert.ok(base, 'Usage: node scripts/check-browser.mjs <preview-url>')
const session = `site-check-${process.pid}`
const failures = []
const browser = (...args) => {
  const response = JSON.parse(execFileSync('agent-browser', ['--session', session, '--json', ...args], {
    encoding: 'utf8', timeout: 60_000,
  }))
  assert.ok(response.success, JSON.stringify(response.error))
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
      }
    }
  }
} finally {
  browser('close')
}
assert.deepEqual(failures, [], failures.join('\n'))
console.log('Browser font budget, text-resize, and page-shell checks passed.')
