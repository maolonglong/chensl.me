import assert from 'node:assert/strict'
import { test } from 'node:test'
import { syncArticles } from '../scripts/search-index.mjs'
import { merge } from '../src/lib/search-fuse.ts'
import {
  articleChunks,
  chunkMaxChars,
  chunkOverlapChars,
  newsVectors,
  rankMatches,
  semanticMaxGap,
  semanticMinScore,
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
  // The literals sit on both sides of the gap (0.10) and the news floor (0.40).
  assert.deepEqual([semanticMaxGap, semanticMinScore.news], [0.1, 0.4])
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
  // A kind whose best document is below its floor contributes nothing.
  assert.deepEqual(rankMatches([blog('z', semanticMinScore.blog - 0.01)]), [])
})

test('news vectors cover each item and list the IDs a longer version left behind', () => {
  const issue = {
    date: '2026-10-16',
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
  const calls = { embedded: [], deleted: [] }
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
      for (const vector of list) vectors.set(vector.id, vector)
    },
    async deleteByIds(ids) {
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

  // A legacy whole-article ID and a deleted article stay until a pruning run.
  api.vectors.set('blog:a', { id: 'blog:a' })
  api.vectors.set('news:2026-10-16:0', { id: 'news:2026-10-16:0' })
  api.calls.embedded.length = 0
  const second = await syncArticles(api, [article('a', 'h2', 1)], { prune: true })
  assert.deepEqual(second.changed, ['a'])
  assert.deepEqual(api.calls.embedded, ['a whole h2', 'a chunk 0 h2'])
  assert.deepEqual([...api.vectors.keys()].sort(), ['blog:a#0', 'news:2026-10-16:0', 'post:a'])
  assert.deepEqual(second.pruned.sort(), ['blog:a', 'blog:b#0', 'post:b'])

  // An unchanged article reuses its stored vector for the related-article data.
  api.calls.embedded.length = 0
  const third = await syncArticles(api, [article('a', 'h2', 1), article('c', 'h1', 1)])
  assert.deepEqual(third.changed, ['c'])
  assert.deepEqual(api.calls.embedded, ['c whole h1', 'c chunk 0 h1'])
  assert.deepEqual(Object.keys(third.data.posts), ['a', 'c'])
  assert.equal(third.data.posts.a.related[0][0], 'c')
})
