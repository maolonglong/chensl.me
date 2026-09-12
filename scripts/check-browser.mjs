import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'

const url = process.argv[2]
assert.ok(url, 'Usage: node scripts/check-browser.mjs <preview-url>')
const session = `site-check-${process.pid}`
const failures = []
const browser = (...args) => {
  const response = JSON.parse(execFileSync('agent-browser', ['--session', session, '--json', ...args], {
    encoding: 'utf8', timeout: 60_000,
  }))
  assert.ok(response.success, JSON.stringify(response.error))
  return response.data?.result
}

try {
  browser('open', url)
  const fonts = browser('eval', `document.fonts.ready.then(() => {
    const fonts = performance.getEntriesByType('resource').filter(e => e.name.includes('/fonts/tsanger-jinkai02/'));
    return { requests: fonts.length, bytes: fonts.reduce((sum, e) => sum + e.encodedBodySize, 0),
      loaded: [...document.fonts].some(f => f.family.toLowerCase().includes('tsanger') && f.status === 'loaded') };
  })`)
  console.log('Cold home fonts:', fonts)
  if (!fonts.loaded || fonts.bytes === 0 || fonts.bytes > 4 * 1024 * 1024) {
    failures.push('Home must load actual JinKai fonts using at most 4 MiB on a cold visit')
  }
  for (const width of [320, 390, 768, 1280]) {
    browser('set', 'viewport', String(width), '844', '2')
    for (const size of ['100%', '200%']) {
      const layout = browser('eval', `(() => {
        document.documentElement.style.fontSize = '${size}';
        const controls = [...document.querySelectorAll('header a, header button')];
        return { width: innerWidth, page: document.documentElement.scrollWidth, controls: controls.length,
          fits: controls.every(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.left >= 0 && r.right <= innerWidth; }) };
      })()`)
      console.log(`Header ${width}px / ${size}:`, layout)
      if (layout.controls < 5 || !layout.fits || layout.page > layout.width) {
        failures.push(`Header overflows at ${width}px / ${size}`)
      }
    }
  }
} finally {
  browser('close')
}
assert.deepEqual(failures, [], failures.join('\n'))
console.log('Browser font budget and text-resize checks passed.')
