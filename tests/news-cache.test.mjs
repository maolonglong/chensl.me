import assert from 'node:assert/strict'
import { timingSafeEqual } from 'node:crypto'
import { existsSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { test } from 'node:test'

// Routes read cloudflare:workers; the stub forwards env and cache to globals set by each test.
const workersStub = `
export const env = new Proxy({}, { get: (_, key) => globalThis.workerEnv?.[key] })
export const cache = { purge: (options) => globalThis.workerCache.purge(options) }`
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'cloudflare:workers')
      return { url: `data:text/javascript,${encodeURIComponent(workersStub)}`, shortCircuit: true }
    if (specifier.startsWith('.') && context.parentURL) {
      const candidate = new URL(`${specifier}.ts`, context.parentURL)
      if (existsSync(candidate)) return nextResolve(candidate.href, context)
    }
    return nextResolve(specifier, context)
  },
})
crypto.subtle.timingSafeEqual ??= (a, b) => timingSafeEqual(new Uint8Array(a), new Uint8Array(b))
const news = await import('../src/pages/api/news.ts')
const retract = await import('../src/pages/api/news/retract.ts')
const { newsCacheControl } = await import('../src/lib/news.ts')

const date = '2026-10-17'
const issue = {
  date,
  title: 'T',
  summary: 'S',
  items: [{ title: 'I', summary: 'S', tag: 'Test', url: 'https://example.com/' }],
}

function setup(purgeResult = { success: true, errors: [] }) {
  const purges = []
  const row = { ...issue, version: 1, hidden_at: null, items_json: JSON.stringify(issue.items) }
  globalThis.workerCache = {
    purge: async (options) => {
      purges.push(options)
      if (purgeResult instanceof Error) throw purgeResult
      return purgeResult
    },
  }
  globalThis.workerEnv = {
    NEWS_TOKEN: 'token',
    VOTE_LIMITER: { limit: async () => ({ success: true }) },
    NEWS: {
      prepare: () => ({
        bind: () => ({
          first: async () => row,
          run: async () => ({ meta: { changes: 1 } }),
        }),
      }),
      batch: async () => [
        { results: [] },
        { meta: { changes: 1 } },
        {},
        { results: [{ version: 1, hidden_at: null }] },
      ],
    },
  }
  return purges
}

const post = (route, body, token = 'token') =>
  route.POST({
    request: new Request('https://example.com/api/news/', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    clientAddress: '192.0.2.1',
  })

test('news pages stay in Workers Cache for a day', () => {
  assert.match(newsCacheControl, /\bs-maxage=86400\b/)
})

test('a news write or retraction purges the issue tags and reports the result', async (t) => {
  t.mock.method(console, 'error', () => {})
  for (const [route, body] of [
    [news, issue],
    [retract, { date }],
    [retract, { date, hidden: false }],
  ]) {
    let purges = setup()
    let response = await post(route, body)
    assert.ok(response.ok)
    assert.equal((await response.json()).cache, 'purged')
    assert.deepEqual(purges, [{ tags: ['news', `news-${date}`] }])

    for (const failure of [
      { success: false, errors: [{ code: 1, message: 'rate' }] },
      new Error(),
    ]) {
      purges = setup(failure)
      response = await post(route, body)
      assert.ok(response.ok, 'a failed purge does not fail the write')
      assert.equal((await response.json()).cache, 'failed')
    }

    purges = setup()
    response = await post(route, body, 'wrong')
    assert.equal(response.status, 401)
    assert.deepEqual(purges, [], 'a rejected request purges nothing')
  }
})
