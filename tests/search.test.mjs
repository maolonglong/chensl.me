import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  evaluate,
  evaluateWithRetry,
  evaluationBudgetMs,
  evaluationRetryDelays,
  searchIndexApi,
  syncArticles,
} from '../scripts/search-index.mjs'
import { merge } from '../src/lib/search-fuse.ts'
import * as searchFuse from '../src/lib/search-fuse.ts'
import {
  articleChunks,
  chunkMaxChars,
  chunkOverlapChars,
  clipSnippet,
  newsKeywordQuery,
  newsVectors,
  rankMatches,
} from '../src/lib/search-text.mjs'

// The search index code without Cloudflare: chunking, ranking, merging, and the index sync
// against an in-memory stand-in for the Workers AI and Vectorize REST calls.

const paragraph = (marker, length) => `${marker}${'字'.repeat(length - marker.length)}`

test('article chunks follow H2 and H3 sections, stay near the size limit, and overlap', () => {
  const long = Array.from({ length: 8 }, (_, index) => paragraph(`p${index}`, 400)).join('\n')
  const chunks = articleChunks({
    title: 'Title',
    sections: [
      { heading: '', text: paragraph('intro', 350) },
      { heading: 'Short', text: 'tiny' },
      { heading: 'Long', text: long },
    ],
  })
  // The section under 300 characters joins the next one, and keeps its heading as text.
  assert.ok(chunks[0].text.startsWith('Title\nintro'))
  assert.ok(chunks.slice(1).every((chunk) => chunk.text.startsWith('Title › ')))
  assert.ok(chunks.some((chunk) => chunk.section === 'Long' && chunk.text.includes('Short\ntiny')))
  const longChunks = chunks.filter((chunk) => chunk.section === 'Long')
  assert.ok(longChunks.length >= 3, `${longChunks.length} chunks`)
  for (const chunk of longChunks)
    assert.ok(chunk.text.length <= chunkMaxChars + chunkOverlapChars + 'Title › Long\n'.length + 1)
  // Each chunk after the first starts with the end of the previous one.
  for (let index = 1; index < longChunks.length; index++) {
    const previous = longChunks[index - 1].text
    const overlap = longChunks[index].text.split('\n')[1]
    assert.ok(previous.endsWith(overlap), `chunk ${index} repeats the previous tail`)
  }
})

test('a short last section joins the previous chunk', () => {
  const chunks = articleChunks({
    title: 'T',
    sections: [
      { heading: 'A', text: paragraph('a', 500) },
      { heading: 'B', text: 'end' },
    ],
  })
  assert.equal(chunks.length, 1)
  assert.ok(chunks[0].text.endsWith('B\nend'))
})

test('a single paragraph over chunkMaxChars splits with one overlap per boundary', () => {
  const longParagraph = Array.from({ length: 250 }, (_, index) =>
    String(index).padStart(10, '0'),
  ).join('')
  const chunks = articleChunks({
    title: 'T',
    sections: [{ heading: 'S', text: longParagraph }],
  })
  assert.equal(chunks.length, 3)
  for (const chunk of chunks) {
    const body = chunk.text.slice('T › S\n'.length)
    assert.ok(body.length <= chunkMaxChars, `body length ${body.length} exceeds ${chunkMaxChars}`)
  }
  const firstBody = chunks[0].text.slice('T › S\n'.length)
  const secondBody = chunks[1].text.slice('T › S\n'.length)
  const overlap = firstBody.slice(-chunkOverlapChars)
  assert.ok(secondBody.startsWith(overlap))
  assert.ok(!secondBody.slice(chunkOverlapChars).startsWith(overlap))

  // Astral characters at the split and overlap boundaries must never split into lone surrogates.
  const astralSplit = `${'a'.repeat(chunkMaxChars - 1)}𠀀${'b'.repeat(200)}`
  const astralTail = `${'a'.repeat(700)}𠀀${'b'.repeat(chunkOverlapChars - 1)}\n${'c'.repeat(200)}`
  for (const text of [astralSplit, astralTail]) {
    for (const chunk of articleChunks({ title: 'T', sections: [{ heading: 'S', text }] })) {
      assert.equal(chunk.text.isWellFormed(), true, `chunk contains lone surrogate: ${chunk.text}`)
    }
  }
})

const blog = (id, score, chunk = 0) => ({
  id: `blog:${id}#${chunk}`,
  score,
  metadata: { type: 'blog', url: `/blog/${id}/` },
})
const news = (date, item, score) => ({
  id: `news:${date}:${item}`,
  score,
  metadata: { type: 'news', date },
})

test('semantic ranking merges chunks and items by document and thresholds each kind alone', () => {
  // Scores sit on both sides of the 0.10 gap and the 0.40 news floor.
  const ranked = rankMatches([
    blog('a', 0.5),
    blog('a', 0.62, 3),
    blog('b', 0.53),
    blog('c', 0.51),
    news('2026-10-16', 0, 0.36),
    news('2026-10-16', 4, 0.45),
    news('2026-10-15', 1, 0.41),
    news('2026-10-14', 2, 0.39),
    { id: 'post:a', score: 0.9, metadata: { type: 'post' } },
  ])
  assert.deepEqual(
    ranked.map((match) => [match.id, match.score]),
    [
      ['blog:a#3', 0.62],
      ['blog:b#0', 0.53],
      ['news:2026-10-16:4', 0.45],
      ['news:2026-10-15:1', 0.41],
    ],
  )
  // The article floor is 0.36: a document at the floor stays, and one below it is dropped.
  assert.deepEqual(
    rankMatches([blog('z', 0.36)]).map((match) => match.id),
    ['blog:z#0'],
  )
  assert.deepEqual(rankMatches([blog('z', 0.35)]), [])
})

test('query normalization strips control characters and snippet clipping preserves surrogate pairs', () => {
  assert.equal(searchFuse.normalizeQuery('abc\0def\tghi'), 'abc def ghi')
  assert.equal(searchFuse.normalizeQuery('\0\x1f'), null)
  assert.equal(searchFuse.cleanQuery('  a\0b  '), 'a b')
  const exact120 = `${'a'.repeat(118)}𠀀b`
  assert.equal(clipSnippet(exact120), exact120)
  assert.doesNotThrow(() => encodeURIComponent(clipSnippet(exact120)))
  const over120 = `${'a'.repeat(118)}𠀀bc`
  assert.equal(clipSnippet(over120), `${'a'.repeat(118)}𠀀…`)
  assert.doesNotThrow(() => encodeURIComponent(clipSnippet(over120)))
})

test('news vectors cover each item and list the IDs a longer version left behind', () => {
  const issue = {
    date: '2026-10-16',
    version: 4,
    title: 'Issue',
    summary: 'S',
    items: [
      { tag: 'A', title: 't0', summary: 's0', url: 'https://a' },
      { tag: 'B', title: 't1', summary: 's1', url: 'https://b' },
    ],
  }
  const { upserts, stale } = newsVectors(issue, [[1], [2]])
  assert.deepEqual(
    upserts.map((vector) => [vector.id, vector.namespace, vector.metadata.snippet]),
    [
      ['news:2026-10-16:0', 'search', 't0：s0'],
      ['news:2026-10-16:1', 'search', 't1：s1'],
    ],
  )
  assert.equal(stale[0], 'news:2026-10-16:2')
  assert.equal(stale.at(-1), 'news:2026-10-16:29')
  assert.equal(upserts[0].metadata.version, 4)
  assert.deepEqual(newsKeywordQuery('AI 芯片').binds, ['芯片', '%AI%', '%芯片%'])
  assert.deepEqual(newsKeywordQuery('芯片 AI').binds, ['芯片', '%芯片%', '%AI%'])
})

test('short queries put keyword hits first; longer ones fuse by rank', () => {
  const hit = (url) => ({ url })
  const keyword = [[], [hit('/news/1/')]]
  const semantic = [hit('/blog/a/'), hit('/news/1/')]
  assert.deepEqual(
    merge('智谱', keyword, semantic).map(({ url }) => url),
    ['/news/1/', '/blog/a/'],
  )
  assert.deepEqual(
    merge('测试时依赖数据库', keyword, semantic).map(({ url }) => url),
    ['/news/1/', '/blog/a/'],
  )
  // Without keyword hits, a short query still gets the semantic hits.
  assert.deepEqual(
    merge('智谱', [[], []], semantic).map(({ url }) => url),
    ['/blog/a/', '/news/1/'],
  )
  // A long query lets a strong semantic hit lead a weak keyword hit.
  assert.deepEqual(
    merge('一个更长的查询', [[hit('/x/'), hit('/blog/a/')]], [hit('/blog/a/')]).map(
      ({ url }) => url,
    ),
    ['/blog/a/', '/x/'],
  )
})

// An in-memory index: vectors by ID, and an embedding that encodes the text length.
function fakeApi(initial = []) {
  const vectors = new Map(initial.map((vector) => [vector.id, vector]))
  const calls = { embedded: [], deleted: [], operations: [] }
  return {
    vectors,
    calls,
    neurons: 0,
    async embedDocuments(texts) {
      calls.embedded.push(...texts)
      return texts.map((text) => [Math.cos(text.length), Math.sin(text.length)])
    },
    async embedQuery(query) {
      return query
    },
    async getByIds(ids) {
      return ids.filter((id) => vectors.has(id)).map((id) => vectors.get(id))
    },
    async upsert(list) {
      calls.operations.push(['upsert', list.map((vector) => vector.id)])
      for (const vector of list) vectors.set(vector.id, vector)
    },
    async deleteByIds(ids) {
      calls.operations.push(['delete', [...ids]])
      calls.deleted.push(...ids)
      for (const id of ids) vectors.delete(id)
    },
    async listIds() {
      return [...vectors.keys()]
    },
    async query(query) {
      return this.answers[query]
    },
  }
}

const article = (id, hash, chunkCount) => ({
  id,
  hash,
  text: `${id} whole ${hash}`,
  title: id,
  description: '',
  date: '2026-01-01',
  chunks: Array.from({ length: chunkCount }, (_, index) => ({
    section: `s${index}`,
    text: `${id} chunk ${index} ${hash}`,
  })),
})

test('the index sync embeds only changed articles and removes chunks and articles that went away', async () => {
  const api = fakeApi()
  const first = await syncArticles(api, [article('a', 'h1', 3), article('b', 'h1', 1)])
  assert.deepEqual(first.changed, ['a', 'b'])
  assert.ok(api.vectors.has('blog:a#2'))
  assert.equal(api.vectors.get('post:a').namespace, 'related')
  assert.equal(api.vectors.get('blog:a#0').namespace, 'search')

  // Legacy whole-article IDs, deleted articles, and orphaned high chunk indices are pruned,
  // and post:<id> checkpoints are written only after chunk upserts and stale chunk deletes.
  api.vectors.set('blog:a', { id: 'blog:a' })
  api.vectors.set('blog:a#9', { id: 'blog:a#9' })
  api.vectors.set('news:2026-10-16:0', { id: 'news:2026-10-16:0' })
  api.calls.embedded.length = 0
  api.calls.operations.length = 0
  const second = await syncArticles(api, [article('a', 'h2', 1)], { prune: true })
  assert.deepEqual(second.changed, ['a'])
  assert.deepEqual(api.calls.embedded, ['a whole h2', 'a chunk 0 h2'])
  assert.deepEqual(api.calls.operations.slice(0, 3), [
    ['upsert', ['blog:a#0']],
    ['delete', ['blog:a#1', 'blog:a#2']],
    ['upsert', ['post:a']],
  ])
  assert.deepEqual([...api.vectors.keys()].sort(), ['blog:a#0', 'news:2026-10-16:0', 'post:a'])
  assert.deepEqual(second.pruned.sort(), ['blog:a', 'blog:a#9', 'blog:b#0', 'post:b'])

  // An unchanged article reuses its stored vector for the related-article data.
  api.calls.embedded.length = 0
  const third = await syncArticles(api, [article('a', 'h2', 1), article('c', 'h1', 1)])
  assert.deepEqual(third.changed, ['c'])
  assert.deepEqual(api.calls.embedded, ['c whole h1', 'c chunk 0 h1'])
  assert.deepEqual(Object.keys(third.data.posts), ['a', 'c'])
  assert.equal(third.data.posts.a.related[0][0], 'c')
})

test('the evaluation reports top-3 recall and false positives of gated queries without news crowding', async () => {
  const api = fakeApi()
  api.answers = {
    hit: [
      news('2026-10-16', 0, 0.72),
      news('2026-10-15', 0, 0.7),
      news('2026-10-14', 0, 0.68),
      blog('a', 0.6),
      blog('b', 0.58),
    ],
    noise: [blog('z', 0.37)],
    offTopicWithNews: [news('2026-10-16', 0, 0.5)],
    news: [news('2026-10-16', 0, 0.5)],
  }
  const report = await evaluate(api, {
    minRecall: 0.5,
    maxFalsePositives: 0,
    queries: [
      { query: 'hit', expect: ['/blog/a/'], allow: ['/blog/b/'] },
      { query: 'noise', expect: [] },
      { query: 'offTopicWithNews', expect: [] },
      { query: 'news', expect: ['/news/2026-10-16/'], gate: false },
    ],
  })
  assert.equal(report.recall, 1)
  assert.equal(report.offTopicHits, 1)
  assert.equal(report.falsePositives, 1)
  assert.equal(report.passed, false)
  assert.deepEqual(report.results[3].hits, [['/news/2026-10-16/', 0.5]])
})

test('the index client counts its writes and waits for the last mutation', async () => {
  let mutation = 0
  let processed = 0
  let waits = 0
  const request = async ({ path }) => {
    if (path.endsWith('/info')) {
      processed = Math.min(processed + 1, mutation)
      return { success: true, result: { processedUpToMutation: `m${processed}` } }
    }
    mutation += 1
    return { success: true, result: { mutationId: `m${mutation}` } }
  }
  // The index catches up on the second poll; the injected sleep keeps the test instant.
  const api = searchIndexApi(request, 'account', 'index', { sleep: async () => waits++ })
  assert.deepEqual(api.writes, { upserted: 0, deleted: 0, lastMutation: undefined })
  await api.upsert([
    { id: 'a', values: [1] },
    { id: 'b', values: [1] },
  ])
  await api.deleteByIds(['c'])
  await api.waitForWrites(1000)
  assert.deepEqual(api.writes, { upserted: 2, deleted: 1, lastMutation: 'm2' })
  assert.equal(processed, 2)
  assert.equal(waits, 1, 'waitForWrites yields between polls')
})

// A clock that only moves when the code under test sleeps, so the retry schedule is exact.
function fakeClock() {
  const clock = { time: 0, waits: [] }
  clock.now = () => clock.time
  clock.sleep = async (ms) => {
    clock.waits.push(ms)
    clock.time += ms
  }
  return clock
}

const retryFixture = {
  minRecall: 1,
  maxFalsePositives: 0,
  queries: [{ query: 'hit', expect: ['/blog/a/'] }],
}

test('a failed evaluation retries with growing delays until the index answers', async () => {
  const api = fakeApi()
  let calls = 0
  // The index answers the third run, as a fresh write that queries see late.
  api.query = async () => (++calls >= 3 ? [blog('a', 0.6)] : [])
  const clock = fakeClock()
  const report = await evaluateWithRetry(api, retryFixture, {
    delays: [10, 20, 40],
    budgetMs: 1000,
    ...clock,
  })
  assert.equal(report.passed, true)
  assert.equal(report.attempts, 3)
  assert.deepEqual(clock.waits, [10, 20])
})

test('an evaluation that keeps failing stops at the time budget and reports the failure', async () => {
  const api = fakeApi()
  api.query = async () => []
  const clock = fakeClock()
  const retries = []
  const report = await evaluateWithRetry(api, retryFixture, {
    delays: [100, 200, 400, 800],
    budgetMs: 500,
    onRetry: ({ attempts, wait }) => retries.push([attempts, wait]),
    ...clock,
  })
  assert.equal(report.passed, false)
  // The third wait is cut to the 200 ms left of the budget; no run starts after the budget.
  assert.deepEqual(clock.waits, [100, 200, 200])
  assert.deepEqual(retries, [
    [1, 100],
    [2, 200],
    [3, 200],
  ])
  assert.equal(report.attempts, 4)
  assert.equal(clock.time, 500)
})

test('a passing evaluation runs once and does not wait', async () => {
  const api = fakeApi()
  api.answers = { hit: [blog('a', 0.6)] }
  const clock = fakeClock()
  const report = await evaluateWithRetry(api, retryFixture, { ...clock })
  assert.equal(report.attempts, 1)
  assert.deepEqual(clock.waits, [])
})

test('the default retry schedule stays within the five-minute job budget', () => {
  // The search-index job allows 15 minutes; the evaluation gets five of them.
  assert.ok(evaluationBudgetMs <= 5 * 60_000, `${evaluationBudgetMs} ms exceeds five minutes`)
  assert.ok(evaluationRetryDelays.every((delay, index, all) => !index || delay > all[index - 1]))
})
