import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { securityHeaders, withSecurityHeaders } from '../src/lib/security-headers.mjs'

const root = new URL('..', import.meta.url)

test('Worker responses and static assets share one set of response protections', async () => {
  const file = await readFile(new URL('public/_headers', root), 'utf8')
  const global = file.match(/^\/\*\n((?:[ \t].*\n)*)/m)[1]
  const staticHeaders = Object.fromEntries(
    global
      .trim()
      .split('\n')
      .map((line) =>
        line
          .trim()
          .split(/:\s(.*)/s)
          .slice(0, 2),
      ),
  )
  // The CSP differs on purpose: Astro sends its own hashed policy on on-demand pages.
  delete staticHeaders['Content-Security-Policy']
  assert.deepEqual(staticHeaders, securityHeaders)
})

test('Worker responses on workers.dev hosts ask search engines not to index them', () => {
  const page = () => new Response('x', { headers: { 'Content-Type': 'text/html' } })
  for (const host of [
    'blog.chensl.workers.dev',
    'fix-a-blog.chensl.workers.dev',
    'abc123-blog.chensl.workers.dev',
  ]) {
    const response = withSecurityHeaders(page(), new URL(`https://${host}/news/`))
    assert.equal(response.headers.get('X-Robots-Tag'), 'noindex', host)
    assert.equal(response.headers.get('X-Frame-Options'), 'DENY', host)
  }
  const production = withSecurityHeaders(page(), new URL('https://chensl.me/news/'))
  assert.equal(production.headers.get('X-Robots-Tag'), null)
})

test('the protections apply to responses with immutable headers', async () => {
  const fetched = Response.redirect('https://chensl.me/news/', 302)
  const response = withSecurityHeaders(fetched, new URL('https://chensl.me/news'))
  assert.equal(response.status, 302)
  assert.equal(response.headers.get('Location'), 'https://chensl.me/news/')
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff')
})
