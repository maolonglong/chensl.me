import { securityHeaders } from '../src/lib/security-headers.mjs'
import { expect, test } from './site.mjs'

// public/_headers protects the static assets only. These paths are Worker responses: an
// on-demand page, both search spellings, the news feed, and a rejected Action.
const workerResponses = [
  ['GET', '/news/'],
  ['GET', '/news/index.xml'],
  ['GET', '/api/search/?q=test'],
  ['GET', '/api/search?q=test'],
  ['POST', '/_actions/getVotes/'],
]

for (const [method, path] of workerResponses) {
  test(`${method} ${path} carries the shared response protections`, async ({
    playwright,
    baseURL,
    clientAddress,
  }) => {
    const api = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: { 'CF-Connecting-IP': clientAddress },
    })
    // A cross-origin Action request gets the middleware's 403 without touching D1.
    const response = await api.fetch(path, {
      method,
      ...(method === 'POST' && { headers: { origin: 'https://example.com' }, data: {} }),
    })
    const headers = response.headers()
    for (const [name, value] of Object.entries(securityHeaders)) {
      expect(headers[name.toLowerCase()], `${path} ${name}`).toBe(value)
    }
    // The local preview runs on localhost, which search engines may index like the real site.
    expect(headers['x-robots-tag'], path).toBeUndefined()
    await api.dispose()
  })
}

test('the on-demand news page keeps exactly one CSP, the one Astro hashes', async ({ request }) => {
  const response = await request.get('/news/')
  const csp = response
    .headersArray()
    .filter(({ name }) => name.toLowerCase() === 'content-security-policy')
  expect(csp).toHaveLength(1)
  expect(csp[0].value).toMatch(/script-src [^;]*'sha256-/)
})
