import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

// Run only against a disposable local D1 database, never a production URL.
// Boundaries: concurrent retries, visitor/article isolation, missing cookies,
// invalid articles, cross-origin requests, persistence, and browser failure recovery.
const base = process.argv[2]
const screenshots = process.argv[3] && path.resolve(process.argv[3])
assert.ok(base, 'Usage: node scripts/check-upvotes.mjs <local-preview-url> [screenshots-directory]')
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname))
const requireAstro = createRequire(import.meta.resolve('astro/package.json'))
const { parse } = await import(requireAstro.resolve('devalue'))
const article = 'dockertest'
const otherArticle = 'semantic-view-sql-traps'
// Connection: close avoids reusing a socket that Wrangler closed while the browser checks ran.
async function call(name, postId = article, cookie = '', origin = new URL(base).origin) {
  const response = await fetch(new URL(`/_actions/${name}/`, base), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: origin,
      Cookie: cookie,
      Connection: 'close',
    },
    body: JSON.stringify({ postId }),
  })
  const body = await response.text()
  return { response, data: response.ok ? parse(body) : body }
}
const first = await call('getVotes')
assert.equal(first.response.status, 200, first.data)
assert.equal(first.response.headers.get('cache-control'), 'private, no-store')
assert.equal(first.data.voted, false)
const baseline = first.data.count
const setCookie = first.response.headers.get('set-cookie')
assert.match(setCookie, /HttpOnly/i)
assert.match(setCookie, /Secure/i)
assert.match(setCookie, /SameSite=Strict/i)
const cookie = setCookie.split(';')[0]
assert.equal((await call('upvote')).response.status, 403)
assert.equal((await call('upvote', article, cookie, 'https://other.example')).response.status, 403)
assert.equal((await call('upvote', 'not-a-published-post', cookie)).response.status, 404)
// Only slug-shaped IDs reach the article lookup, so path syntax cannot select another page.
for (const postId of ['../dockertest', 'a/b', 'Dockertest', 'dockertest/', '', '%2e%2e']) {
  for (const name of ['getVotes', 'upvote']) {
    assert.equal((await call(name, postId, cookie)).response.status, 400, `${name} ${postId}`)
  }
}
const votes = await Promise.all(Array.from({ length: 8 }, () => call('upvote', article, cookie)))
for (const vote of votes) {
  assert.equal(vote.response.status, 200, vote.data)
  assert.deepEqual(vote.data, { count: baseline + 1, voted: true })
}
assert.deepEqual((await call('getVotes', article, cookie)).data, {
  count: baseline + 1,
  voted: true,
})
assert.equal((await call('getVotes', otherArticle, cookie)).data.voted, false)
const second = await call('getVotes')
assert.deepEqual(second.data, { count: baseline + 1, voted: false })
const secondCookie = second.response.headers.get('set-cookie').split(';')[0]
assert.deepEqual((await call('upvote', article, secondCookie)).data, {
  count: baseline + 2,
  voted: true,
})
console.log(
  'PASS: private responses, secure cookie, validation, concurrency, isolation, persistence.',
)

const session = `votes-${process.pid}`
function browser(...args) {
  const response = JSON.parse(
    execFileSync('agent-browser', ['--session', session, '--json', ...args], {
      encoding: 'utf8',
      timeout: 60_000,
    }),
  )
  assert.ok(response.success, response.error)
  return response.data?.result
}
function captureStates(state) {
  if (!screenshots) return
  mkdirSync(screenshots, { recursive: true })
  for (const width of [1280, 390]) {
    browser('set', 'viewport', String(width), '720', '2')
    for (const theme of ['light', 'dark']) {
      browser('set', 'media', theme)
      browser('eval', `document.querySelector('[data-upvote]').scrollIntoView({block:'center'})`)
      browser(
        'eval',
        'document.fonts.ready.then(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(true)))))',
      )
      assert.equal(browser('eval', 'document.documentElement.scrollWidth <= innerWidth'), true)
      browser('screenshot', path.join(screenshots, `${state}-${width}-${theme}.png`))
    }
  }
}
try {
  browser('open', new URL(`/blog/${article}/`, base).href)
  browser('wait', '--fn', "document.querySelector('[data-upvote] button')?.disabled === false")
  const state = () =>
    browser(
      'eval',
      `(() => {
    const button = document.querySelector('[data-upvote] button');
    return { voted: button.getAttribute('aria-disabled') === 'true',
      count: Number(button.querySelector('[data-count]').textContent) };
  })()`,
    )
  assert.deepEqual(state(), { voted: false, count: baseline + 2 })
  assert.equal(
    browser('eval', `getComputedStyle(document.querySelector('[data-upvote] svg')).fill`),
    'none',
  )
  const unvotedIcon = browser('eval', "document.querySelector('[data-upvote] svg').innerHTML")
  const unvotedColor = browser(
    'eval',
    "getComputedStyle(document.querySelector('[data-upvote] button')).color",
  )
  captureStates('unvoted')
  browser('network', 'route', '**/_actions/upvote/**', '--abort')
  browser('click', '[data-upvote] button')
  browser(
    'wait',
    '--fn',
    "document.querySelector('[data-upvote] [role=status]').textContent.includes('重试')",
  )
  assert.deepEqual(state(), { voted: false, count: baseline + 2 })
  captureStates('error')
  browser('network', 'unroute')
  browser('focus', '[data-upvote] button')
  browser('press', 'Enter')
  browser(
    'wait',
    '--fn',
    "document.querySelector('[data-upvote] button').getAttribute('aria-disabled') === 'true'",
  )
  assert.deepEqual(state(), { voted: true, count: baseline + 3 })
  assert.equal(
    browser('eval', `getComputedStyle(document.querySelector('[data-upvote] svg')).fill`),
    'none',
  )
  assert.equal(
    browser('eval', "document.querySelector('[data-upvote] svg').innerHTML"),
    unvotedIcon,
  )
  browser('set', 'media', 'light')
  assert.notEqual(
    browser('eval', "getComputedStyle(document.querySelector('[data-upvote] button')).color"),
    unvotedColor,
  )
  captureStates('voted')
  browser('reload')
  browser(
    'wait',
    '--fn',
    "document.querySelector('[data-upvote] button').getAttribute('aria-disabled') === 'true'",
  )
  assert.deepEqual(state(), { voted: true, count: baseline + 3 })
  console.log(
    'PASS: browser click, failed-request retry without false success, reload restores vote.',
  )
} finally {
  browser('close')
}

// Cloudflare's limiter is approximate and local to a location, not an exact global counter.
const limited = []
for (let i = 0; i < 65; i++) limited.push((await call('upvote', article, cookie)).response.status)
assert.ok(limited.includes(429), 'Submission bursts should eventually be rate limited')
assert.deepEqual((await call('getVotes', article, cookie)).data, {
  count: baseline + 3,
  voted: true,
})
console.log('PASS: rate limiting rejects bursts without changing the vote count.')
