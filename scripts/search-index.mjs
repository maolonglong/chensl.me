// Writes and reads the search index through the Cloudflare REST API. Every call goes through a
// `request` function with the shape of the Cloudflare API client, so the same code runs in
// GitHub Actions (scripts/cloudflare-api.mjs, with an API token) and in any other client that
// speaks the API. No Node APIs: callers read files and the environment.
import {
  allNewsVectorIds,
  articleOfVectorId,
  chunkVectorId,
  embeddingModel,
  newsItemEmbeddingText,
  newsVectors,
  queryInstruction,
  rankMatches,
  relatedFromVectors,
  relatedNamespace,
  relatedVectorId,
  searchNamespace,
  semanticTopK,
} from '../src/lib/search-text.mjs'

// Workers AI takes at most this many documents in one embedding call.
const embedBatch = 32
const idBatch = 20
const upsertBatch = 500

async function call(request, options) {
  const response = await request(options)
  if (!response.success) {
    const detail = response.errors?.map((error) => `${error.code} ${error.message}`).join('; ')
    throw new Error(
      `${options.method} ${options.path.replace(/^\/accounts\/[^/]+/, '')} failed: ${detail}`,
    )
  }
  return response.result
}

const batches = (items, size) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size),
  )

export function searchIndexApi(request, accountId, indexName) {
  const account = `/accounts/${accountId}`
  const index = `${account}/vectorize/v2/indexes/${indexName}`
  let neurons = 0
  let lastMutation
  // Counts of what this client wrote, for the CI log.
  const writes = { upserted: 0, deleted: 0 }
  const mutate = async (options) => {
    const result = await call(request, options)
    lastMutation = result?.mutationId ?? lastMutation
  }
  return {
    get neurons() {
      return neurons
    },
    get writes() {
      return { ...writes, lastMutation }
    },
    // Vectorize applies writes asynchronously. Waits until the index has processed the last
    // write of this client, so a query right after a sync sees it.
    async waitForWrites(timeoutMs = 180_000) {
      const deadline = Date.now() + timeoutMs
      while (lastMutation) {
        const info = await call(request, { method: 'GET', path: `${index}/info` })
        if (info.processedUpToMutation === lastMutation) return
        if (Date.now() > deadline)
          throw new Error(`Vectorize has not applied mutation ${lastMutation}`)
        await new Promise((resolve) => setTimeout(resolve, 3000))
      }
    },
    async embedDocuments(texts) {
      const vectors = []
      for (const batch of batches(texts, embedBatch)) {
        const result = await call(request, {
          method: 'POST',
          path: `${account}/ai/run/${embeddingModel}`,
          body: { documents: batch },
        })
        neurons += result.usage?.neurons ?? 0
        vectors.push(...result.data)
      }
      return vectors
    },
    async embedQuery(query) {
      const result = await call(request, {
        method: 'POST',
        path: `${account}/ai/run/${embeddingModel}`,
        body: { queries: [query], instruction: queryInstruction },
      })
      neurons += result.usage?.neurons ?? 0
      return result.data[0]
    },
    async getByIds(ids) {
      const vectors = []
      for (const batch of batches(ids, idBatch)) {
        vectors.push(
          ...(await call(request, {
            method: 'POST',
            path: `${index}/get_by_ids`,
            body: { ids: batch },
          })),
        )
      }
      return vectors
    },
    async upsert(vectors) {
      for (const batch of batches(vectors, upsertBatch)) {
        writes.upserted += batch.length
        await mutate({
          method: 'POST',
          path: `${index}/upsert`,
          body: batch.map((vector) => JSON.stringify(vector)).join('\n'),
          contentType: 'application/x-ndjson',
          rawBody: true,
        })
      }
    },
    async deleteByIds(ids) {
      for (const batch of batches(ids, upsertBatch)) {
        writes.deleted += batch.length
        await mutate({
          method: 'POST',
          path: `${index}/delete_by_ids`,
          body: { ids: batch },
        })
      }
    },
    async listIds() {
      const ids = []
      let cursor
      do {
        const result = await call(request, {
          method: 'GET',
          path: `${index}/list`,
          query: { count: 1000, ...(cursor && { cursor }) },
        })
        ids.push(...result.vectors.map((vector) => vector.id))
        cursor = result.isTruncated ? result.nextCursor : undefined
      } while (cursor)
      return ids
    },
    async query(vector) {
      const result = await call(request, {
        method: 'POST',
        path: `${index}/query`,
        body: { vector, topK: semanticTopK, returnMetadata: 'all', namespace: searchNamespace },
      })
      return result.matches
    },
  }
}

// Brings the article vectors in line with the build: re-embeds articles whose hash changed,
// removes chunks that a shorter version left behind, and, with prune, removes every article
// vector whose article is no longer in the build (deleted, renamed, or back to draft). Returns
// the related-article data for src/data/related-posts.json, computed from all whole-article
// vectors, and what changed.
export async function syncArticles(api, articles, { prune = false } = {}) {
  const stored = new Map(
    (await api.getByIds(articles.map(({ id }) => relatedVectorId(id)))).map((vector) => [
      articleOfVectorId(vector.id),
      vector,
    ]),
  )
  const changed = articles.filter(({ id, hash }) => stored.get(id)?.metadata?.hash !== hash)
  const wholeVectors = new Map(
    [...stored]
      .filter(([id]) => !changed.some((article) => article.id === id))
      .map(([id, vector]) => [id, vector.values]),
  )
  if (changed.length) {
    const texts = changed.flatMap(({ text, chunks }) => [
      text,
      ...chunks.map((chunk) => chunk.text),
    ])
    const vectors = await api.embedDocuments(texts)
    const postUpserts = []
    const chunkUpserts = []
    const staleChunks = []
    let offset = 0
    for (const article of changed) {
      const { id, hash, title, description, date, chunks } = article
      const url = `/blog/${id}/`
      wholeVectors.set(id, vectors[offset])
      postUpserts.push({
        id: relatedVectorId(id),
        values: vectors[offset],
        namespace: relatedNamespace,
        metadata: { type: 'post', hash, chunks: chunks.length },
      })
      chunks.forEach((chunk, index) =>
        chunkUpserts.push({
          id: chunkVectorId(id, index),
          values: vectors[offset + 1 + index],
          namespace: searchNamespace,
          // /api/search shows these fields for an article hit without another lookup.
          metadata: { type: 'blog', url, title, description, date, section: chunk.section },
        }),
      )
      offset += 1 + chunks.length
      const before = stored.get(id)?.metadata?.chunks ?? 0
      for (let index = chunks.length; index < before; index++)
        staleChunks.push(chunkVectorId(id, index))
    }
    // Write chunks and delete stale chunks before updating the post:<id> hash checkpoint, so an
    // interrupted run retries the article on the next sync.
    if (chunkUpserts.length) await api.upsert(chunkUpserts)
    if (staleChunks.length) await api.deleteByIds(staleChunks)
    await api.upsert(postUpserts)
  }
  let pruned = []
  if (prune) {
    const chunkCounts = new Map(articles.map(({ id, chunks }) => [id, chunks.length]))
    pruned = (await api.listIds()).filter((vectorId) => {
      if (!/^(?:post|blog):/.test(vectorId)) return false
      const id = articleOfVectorId(vectorId)
      if (!id || !chunkCounts.has(id)) return true
      if (vectorId === `post:${id}`) return false
      const match = vectorId.match(/^blog:[^#]+#(\d+)$/)
      return !match || Number(match[1]) >= chunkCounts.get(id)
    })
    if (pruned.length) await api.deleteByIds(pruned)
  }
  const related = relatedFromVectors(
    articles.map(({ id }) => ({ id, vector: wholeVectors.get(id) })),
  )
  const posts = Object.fromEntries(
    articles.map(({ id, hash }) => [id, { hash, related: related[id] }]),
  )
  return {
    data: { model: embeddingModel, posts },
    changed: changed.map(({ id }) => id),
    pruned,
    neurons: api.neurons,
  }
}

// Writes the item vectors of AI News issues, as the Worker does on each news write. For a
// backfill of issues that were published before search existed.
export async function indexIssues(api, issues) {
  for (const issue of issues) {
    const embeddings = await api.embedDocuments(issue.items.map(newsItemEmbeddingText))
    const { upserts, stale } = newsVectors(issue, embeddings)
    await api.upsert(upserts)
    await api.deleteByIds(stale)
  }
  return { issues: issues.length, neurons: api.neurons }
}

export const removeIssueVectors = (api, date) => api.deleteByIds(allNewsVectorIds(date))

// Runs each labeled query through the semantic ranking that /api/search uses. A query passes
// when its expected documents are in the top three; an off-topic query passes with no hit.
// Only gated queries decide the outcome, and a news hit is never a false positive of an article
// query: news content differs between indexes.
export async function evaluate(api, fixture) {
  const results = []
  for (const entry of fixture.queries) {
    const gate = entry.gate !== false
    const ranked = rankMatches(await api.query(await api.embedQuery(entry.query)))
    const urls = ranked.map((match) =>
      match.type === 'news' ? `/news/${match.metadata.date}/` : match.metadata.url,
    )
    const blogUrls = urls.filter((url) => url.startsWith('/blog/'))
    const top3 = (gate ? blogUrls : urls).slice(0, 3)
    const expected = entry.expect ?? []
    const found = expected.filter((url) => top3.includes(url))
    const allowed = new Set([...expected, ...(entry.allow ?? [])])
    const falsePositives = blogUrls.filter((url) => !allowed.has(url))
    results.push({
      query: entry.query,
      gate,
      recall: expected.length ? found.length / expected.length : null,
      falsePositives,
      hits: ranked.map((match, index) => [urls[index], Math.round(match.score * 1000) / 1000]),
    })
  }
  const gated = results.filter((result) => result.gate)
  const withExpected = gated.filter((result) => result.recall !== null)
  const recall = withExpected.reduce((sum, result) => sum + result.recall, 0) / withExpected.length
  const offTopicHits = gated.filter(
    (result) => result.recall === null && result.falsePositives.length,
  )
  const falsePositives = gated.reduce((sum, result) => sum + result.falsePositives.length, 0)
  return {
    recall,
    falsePositives,
    offTopicHits: offTopicHits.length,
    passed:
      recall >= fixture.minRecall &&
      offTopicHits.length === 0 &&
      falsePositives <= fixture.maxFalsePositives,
    results,
    neurons: api.neurons,
  }
}

// Vectorize marks a write as applied (processedUpToMutation, which embed-posts.mjs waits for)
// before its queries see all of it: on 2026-10-17 a new production index answered 4 of 16
// labeled queries with no hits right after the first write, and every query three minutes
// later. A failed evaluation therefore runs again after growing delays until it passes or the
// time budget ends; a real regression still fails, only later.
export const evaluationRetryDelays = [15_000, 30_000, 60_000, 90_000, 120_000]
export const evaluationBudgetMs = 300_000

export async function evaluateWithRetry(
  api,
  fixture,
  {
    delays = evaluationRetryDelays,
    budgetMs = evaluationBudgetMs,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now = Date.now,
    onRetry = () => {},
  } = {},
) {
  const start = now()
  let report = await evaluate(api, fixture)
  let attempts = 1
  for (const delay of delays) {
    const remaining = budgetMs - (now() - start)
    if (report.passed || remaining <= 0) break
    const wait = Math.min(delay, remaining)
    onRetry({ attempts, report, wait })
    await sleep(wait)
    report = await evaluate(api, fixture)
    attempts += 1
  }
  return { ...report, attempts }
}
