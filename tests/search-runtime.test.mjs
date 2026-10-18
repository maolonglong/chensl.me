import assert from 'node:assert/strict'
import { timingSafeEqual } from 'node:crypto'
import { existsSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { test } from 'node:test'

// Routes read their bindings from cloudflare:workers; the stub forwards to globalThis.workerEnv.
const workersStub = `export const env = new Proxy({}, { get: (_, key) => globalThis.workerEnv?.[key] })`
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
const search = await import('../src/lib/search.ts')
const { handleSearch } = await import('../src/lib/search-endpoint.ts')
const { newsVectors } = await import('../src/lib/search-text.mjs')
const retract = await import('../src/pages/api/news/retract.ts')

const issue = (title, version, count = 1) => ({
  date: '2026-10-17',
  title,
  summary: title,
  version,
  items: Array.from({ length: count }, (_, index) => ({
    title: `${title} ${index}`,
    summary: title,
    tag: 'Test',
    url: 'https://example.com/',
  })),
})

function fixture(initial) {
  const state = { current: initial, vectors: new Map() }
  const env = {
    AI: {
      run: async (_model, input) => ({
        data: input.documents ? input.documents.map(() => [1, 0]) : [[1, 0]],
      }),
    },
    NEWS: {
      prepare: () => ({
        bind: () => ({
          first: async () => {
            const row = state.current
            return row && { ...row, items_json: JSON.stringify(row.items) }
          },
          run: async () => ({ meta: { changes: 1 } }),
          all: async () => ({
            results: state.current ? [{ ...state.current, snippet: state.current.summary }] : [],
          }),
        }),
      }),
    },
    SEARCH_INDEX: {
      upsert: async (vectors) => vectors.forEach((v) => state.vectors.set(v.id, v)),
      deleteByIds: async (ids) => ids.forEach((id) => state.vectors.delete(id)),
      query: async () => ({
        matches: [...state.vectors.values()].map((vector) => ({
          ...vector,
          score: vector.score ?? 0.7,
        })),
      }),
    },
    READ_LIMITER: { limit: async () => ({ success: true }) },
  }
  return { state, env }
}

test('overlapping news writes, retractions and restores converge to the latest D1 state', async () => {
  for (const [before, after] of [
    [issue('OLD', 1), issue('NEW', 2, 3)],
    [issue('OLD', 1, 3), issue('NEW', 2)],
    [issue('OLD', 1), null],
    [null, issue('RESTORED', 2, 2)],
  ]) {
    const { state, env } = fixture(before)
    const method = before ? 'upsert' : 'deleteByIds'
    const original = env.SEARCH_INDEX[method]
    let release
    let started
    const blocked = new Promise((resolve) => (release = resolve))
    const ready = new Promise((resolve) => (started = resolve))
    env.SEARCH_INDEX[method] = async (values) => {
      env.SEARCH_INDEX[method] = original
      started()
      await blocked
      return original(values)
    }
    // The first writer has read D1 and is suspended before its index mutation is accepted.
    const old = search.syncIssue(env, '2026-10-17')
    await ready
    state.current = after
    const newest = await search.syncIssue(env, '2026-10-17')
    release()
    assert.equal(newest, after ? 'indexed' : 'removed')
    assert.equal(await old, after ? 'indexed' : 'removed')
    assert.equal(state.vectors.size, after?.items.length ?? 0)
    for (const vector of state.vectors.values()) assert.equal(vector.metadata.title, after.title)
  }
})

test('search suppresses old news versions while Vectorize is applying an update and never caches them', async () => {
  const current = issue('NEW', 2)
  const { state, env } = fixture(current)
  const old = newsVectors(issue('OLD', 1), [[1, 0]]).upserts[0]
  state.vectors.set(old.id, old)
  for (const path of ['/api/search', '/api/search/']) {
    const response = await handleSearch(new Request(`https://example.com${path}?q=Test`), env)
    const body = await response.json()
    assert.equal(response.headers.get('cache-control'), 'private, no-store')
    assert.deepEqual(body.semantic, [])
    assert.equal(body.news[0].title, 'NEW')
  }
  state.vectors.clear()
  for (const vector of newsVectors(current, [[1, 0]]).upserts) state.vectors.set(vector.id, vector)
  // A stronger obsolete item must not hide the lower-scoring current version.
  const obsolete = { ...old, id: 'news:2026-10-17:1', score: 0.95 }
  state.vectors.set(obsolete.id, obsolete)
  assert.equal((await search.semanticSearch(env, 'Test'))[0].title, 'NEW')
  state.current = null
  assert.deepEqual(await search.semanticSearch(env, 'Test'), [])
  state.current = current
  delete state.vectors.get(old.id).metadata.version
  assert.deepEqual(await search.semanticSearch(env, 'Test'), [])
})

test('continuous corrections report a failed sync and a stable resend repairs it', async (t) => {
  t.mock.method(console, 'error', () => {})
  const { state, env } = fixture(issue('START', 1))
  const run = env.AI.run
  env.AI.run = async (model, input) => {
    if (input.documents) state.current = issue('CHANGED', state.current.version + 1)
    return run(model, input)
  }
  assert.equal(await search.syncIssue(env, '2026-10-17'), 'failed')
  assert.deepEqual(await search.semanticSearch(env, 'Test'), [])
  env.AI.run = run
  assert.equal(await search.syncIssue(env, '2026-10-17'), 'indexed')
  assert.equal((await search.semanticSearch(env, 'Test'))[0].title, 'CHANGED')
})

test('a restore that loses to a concurrent retraction reports the hidden state', async (t) => {
  // workerd provides crypto.subtle.timingSafeEqual; Node has it only in node:crypto.
  crypto.subtle.timingSafeEqual ??= (a, b) => timingSafeEqual(new Uint8Array(a), new Uint8Array(b))
  t.after(() => delete crypto.subtle.timingSafeEqual)
  const { state, env } = fixture(issue('BACK', 2))
  globalThis.workerEnv = {
    ...env,
    NEWS_TOKEN: 'token',
    VOTE_LIMITER: { limit: async () => ({ success: true }) },
  }
  const run = env.AI.run
  // The retraction commits to D1 while the restore is embedding the issue.
  env.AI.run = async (model, input) => {
    state.current = null
    return run(model, input)
  }
  const response = await retract.POST({
    request: new Request('https://example.com/api/news/retract/', {
      method: 'POST',
      headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
      body: JSON.stringify({ date: '2026-10-17', hidden: false }),
    }),
    clientAddress: '192.0.2.1',
  })
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), {
    status: 'hidden',
    date: '2026-10-17',
    search: 'removed',
  })
  assert.equal(state.vectors.size, 0)
})

test('search reports Workers AI, Vectorize and D1 time in Server-Timing', async () => {
  const { state, env } = fixture(issue('NEW', 2))
  for (const vector of newsVectors(state.current, [[1, 0]]).upserts)
    state.vectors.set(vector.id, vector)
  const slow =
    (work, ms) =>
    async (...args) => {
      await new Promise((resolve) => setTimeout(resolve, ms))
      return work(...args)
    }
  env.AI.run = slow(env.AI.run, 40)
  env.SEARCH_INDEX.query = slow(env.SEARCH_INDEX.query, 20)
  const prepare = env.NEWS.prepare
  env.NEWS.prepare = (sql) => {
    const statement = prepare(sql)
    return {
      bind: (...binds) => ({
        ...statement.bind(...binds),
        all: slow(statement.bind(...binds).all, 10),
      }),
    }
  }
  const timing = async () => {
    const response = await handleSearch(new Request('https://example.com/api/search?q=Test'), env)
    const header = response.headers.get('server-timing') ?? ''
    return Object.fromEntries(
      header.split(', ').map((entry) => {
        const [name, dur] = entry.split(';dur=')
        return [name, Number(dur)]
      }),
    )
  }
  const on = await timing()
  assert.deepEqual(Object.keys(on), ['ai', 'vec', 'd1'])
  assert.ok(on.ai >= 35 && on.vec >= 15, JSON.stringify(on))
  // Two D1 queries: the keyword search and the visible-version check.
  assert.ok(on.d1 >= 15, JSON.stringify(on))
  env.SEMANTIC_SEARCH = 'off'
  assert.deepEqual(Object.keys(await timing()), ['d1'])
})
