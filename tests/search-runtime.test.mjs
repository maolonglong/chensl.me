import assert from 'node:assert/strict'
import { timingSafeEqual } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import path from 'node:path'
import { registerHooks } from 'node:module'
import { test } from 'node:test'

// Routes read their bindings from cloudflare:workers; the stub forwards to globalThis.workerEnv
// and accepts every cache purge.
const workersStub = `export const env = new Proxy({}, { get: (_, key) => globalThis.workerEnv?.[key] })
export const cache = { purge: async () => ({ success: true }) }`
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
const { newsKeywordLimit, newsVectors } = await import('../src/lib/search-text.mjs')
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
    cache: 'purged',
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

// D1 is SQLite. The migrations are the schema the Worker queries, including the FTS5 triggers.
function newsDatabase() {
  const db = new DatabaseSync(':memory:')
  const root = path.resolve(import.meta.dirname, '..')
  for (const file of ['0001_issues.sql', '0002_versions_and_retraction.sql', '0003_search.sql'])
    db.exec(readFileSync(path.join(root, 'migrations/news', file), 'utf8'))
  return db
}

const newsItem = (tag, title, summary) => ({ tag, title, summary, url: 'https://example.com/' })

function insertIssue(db, { date, title, summary, items, hidden = false }) {
  db.prepare(
    `INSERT INTO issues (date, title, summary, items_json, created_at)
     VALUES (?, ?, ?, ?, '2026-10-22T00:00:00Z')`,
  ).run(date, title, summary, JSON.stringify(items))
  if (hidden)
    db.prepare('UPDATE issues SET hidden_at = ? WHERE date = ?').run('2026-10-22T00:00:00Z', date)
}

function d1Of(db) {
  return {
    prepare: (sql) => ({
      bind: (...binds) => ({
        all: async () => ({ results: db.prepare(sql).all(...binds) }),
      }),
    }),
  }
}

test('安全漏洞 finds an issue that says 严重漏洞 and 安全, and skips unrelated issues', async () => {
  const db = newsDatabase()
  insertIssue(db, {
    date: '2026-10-23',
    title: '短语',
    summary: '正文里有安全漏洞这四个字',
    items: [newsItem('OpenAI', '其他', '无关')],
  })
  insertIssue(db, {
    date: '2026-10-22',
    title: 'OpenAI 模型挖出 PHP 严重漏洞',
    summary: 'OpenAI 牵头修复 PHP 漏洞',
    items: [
      newsItem(
        'OpenAI',
        'OpenAI 模型帮忙挖出 PHP 严重漏洞',
        '牵头维护者和安全研究者准备修复，PHP 已发安全版本',
      ),
    ],
  })
  insertIssue(db, {
    date: '2026-10-21',
    title: '只有安全',
    summary: '安全事件说明',
    items: [newsItem('Railway', '发布安全事件', '没有另一个词')],
  })
  insertIssue(db, {
    date: '2026-10-20',
    title: '只有漏洞',
    summary: '某产品漏洞',
    items: [newsItem('X', '漏洞公告', '没有另一个词')],
  })
  insertIssue(db, {
    date: '2026-10-18',
    title: '天气',
    summary: '今天天气怎么样',
    items: [newsItem('X', '无关', '做饭')],
  })
  insertIssue(db, {
    date: '2026-10-15',
    title: '隐藏的安全漏洞',
    summary: '安全并且漏洞',
    items: [newsItem('X', '隐藏', '安全漏洞')],
    hidden: true,
  })
  const urls = (await search.newsKeywordSearch(d1Of(db), '安全漏洞')).map((hit) => hit.url)
  // The contiguous phrase leads. The PHP issue matches by its pairs. One word, or a hidden issue, does not.
  assert.deepEqual(urls, ['/news/2026-10-23/', '/news/2026-10-22/'])
})

test('pairs in different items of one issue still match, and a full phrase list does not scan pairs', async () => {
  const db = newsDatabase()
  insertIssue(db, {
    date: '2026-10-22',
    title: '两条',
    summary: '分开写',
    items: [newsItem('A', '安全事件', '只谈安全'), newsItem('B', '严重漏洞', '只谈漏洞')],
  })
  const split = await search.newsKeywordSearch(d1Of(db), '安全漏洞')
  assert.deepEqual(
    split.map((hit) => hit.url),
    ['/news/2026-10-22/'],
  )

  let calls = 0
  const rows = Array.from({ length: newsKeywordLimit }, (_, index) => ({
    date: `2026-01-${String(index + 1).padStart(2, '0')}`,
    title: '短语',
    snippet: '安全漏洞',
  }))
  const full = {
    prepare: () => ({
      bind: () => ({
        all: async () => {
          calls += 1
          return { results: rows }
        },
      }),
    }),
  }
  const hits = await search.newsKeywordSearch(full, '安全漏洞')
  assert.equal(calls, 1)
  assert.equal(hits.length, newsKeywordLimit)

  calls = 0
  const latin = {
    prepare: () => ({
      bind: () => ({
        all: async () => {
          calls += 1
          return { results: [] }
        },
      }),
    }),
  }
  assert.deepEqual(await search.newsKeywordSearch(latin, 'docker'), [])
  assert.equal(calls, 1)
})
