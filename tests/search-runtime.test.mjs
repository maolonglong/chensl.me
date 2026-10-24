import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import path from 'node:path'
import { registerHooks } from 'node:module'
import { test } from 'node:test'

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && context.parentURL) {
      const candidate = new URL(`${specifier}.ts`, context.parentURL)
      if (existsSync(candidate)) return nextResolve(candidate.href, context)
    }
    return nextResolve(specifier, context)
  },
})

const search = await import('../src/lib/search.ts')
const { handleSearch } = await import('../src/lib/search-endpoint.ts')
const { newsKeywordLimit } = await import('../src/lib/search-text.mjs')

function fixture() {
  const env = {
    NEWS: {
      prepare: () => ({
        bind: () => ({
          all: async () => ({
            results: [{ date: '2026-10-17', title: '日报', snippet: '条目：摘要' }],
          }),
        }),
      }),
    },
    READ_LIMITER: { limit: async () => ({ success: true }) },
  }
  return { env }
}

test('search returns news keyword hits and Server-Timing', async () => {
  const { env } = fixture()
  const slow =
    (work, ms) =>
    async (...args) => {
      await new Promise((resolve) => setTimeout(resolve, ms))
      return work(...args)
    }
  const prepare = env.NEWS.prepare
  env.NEWS.prepare = (sql) => {
    const statement = prepare(sql)
    return {
      bind: (...binds) => ({
        ...statement.bind(...binds),
        all: slow(statement.bind(...binds).all, 15),
      }),
    }
  }
  for (const requestPath of ['/api/search', '/api/search/']) {
    const response = await handleSearch(
      new Request(`https://example.com${requestPath}?q=Test`),
      env,
    )
    const body = await response.json()
    assert.equal(response.headers.get('cache-control'), 'private, no-store')
    assert.equal(body.news[0].url, '/news/2026-10-17/')
    const timing = response.headers.get('server-timing') ?? ''
    assert.match(timing, /^d1;dur=\d+$/)
    assert.ok(Number(timing.slice('d1;dur='.length)) >= 10, timing)
  }
})

test('search answers 500 when D1 fails', async (t) => {
  t.mock.method(console, 'error', () => {})
  const { env } = fixture()
  env.NEWS.prepare = () => {
    throw new Error('D1 down')
  }
  const response = await handleSearch(new Request('https://example.com/api/search?q=Test'), env)
  assert.equal(response.status, 500)
  assert.equal((await response.json()).error, 'search_failed')
})

// D1 is SQLite. The migrations are the schema the Worker queries, including the item-level FTS5
// triggers in 0004_item_search.sql.
function newsDatabase() {
  const db = new DatabaseSync(':memory:')
  const root = path.resolve(import.meta.dirname, '..')
  for (const file of [
    '0001_issues.sql',
    '0002_versions_and_retraction.sql',
    '0003_search.sql',
    '0004_item_search.sql',
  ])
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

test('安全漏洞 finds an item that says 严重漏洞 and 安全, and skips cross-item or unrelated issues', async () => {
  const db = newsDatabase()
  insertIssue(db, {
    date: '2026-10-23',
    title: '短语',
    summary: '摘要',
    items: [newsItem('OpenAI', '修复安全漏洞', '正文里有安全漏洞这四个字')],
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
  // One item has 安全 and another has 漏洞; item-level indexing must not combine them.
  insertIssue(db, {
    date: '2026-10-21',
    title: '两条分开',
    summary: '分开写',
    items: [newsItem('A', '安全事件', '只谈安全'), newsItem('B', '严重漏洞', '只谈漏洞')],
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
  const hits = await search.newsKeywordSearch(d1Of(db), '安全漏洞')
  assert.deepEqual(
    hits.map((hit) => hit.url),
    ['/news/2026-10-23/', '/news/2026-10-22/'],
  )
  assert.equal(
    hits[1].snippet,
    'OpenAI 模型帮忙挖出 PHP 严重漏洞：牵头维护者和安全研究者准备修复，PHP 已发安全版本',
  )
})

test('updating an issue replaces its items in FTS, and a full phrase list does not scan pairs', async () => {
  const db = newsDatabase()
  insertIssue(db, {
    date: '2026-10-22',
    title: '旧版',
    summary: '摘要',
    items: [
      newsItem('A', '旧条目一', '包含旧词条'),
      newsItem('B', '旧条目二', '会被删除的尾随条目'),
    ],
  })
  db.prepare('UPDATE issues SET title = ?, items_json = ? WHERE date = ?').run(
    '新版',
    JSON.stringify([newsItem('A', '新条目一', '包含新词条')]),
    '2026-10-22',
  )
  assert.deepEqual(await search.newsKeywordSearch(d1Of(db), '会被删除'), [])
  const updated = await search.newsKeywordSearch(d1Of(db), '包含新词条')
  assert.equal(updated.length, 1)
  assert.equal(updated[0].title, '新版')
  assert.equal(updated[0].snippet, '新条目一：包含新词条')

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
