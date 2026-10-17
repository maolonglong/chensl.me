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
  const mutate = async (options) => {
    const result = await call(request, options)
    lastMutation = result?.mutationId ?? lastMutation
  }
  return {
    get neurons() {
      return neurons
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
    const upserts = []
    const staleChunks = []
    let offset = 0
    for (const article of changed) {
      const { id, hash, title, description, date, chunks } = article
      const url = `/blog/${id}/`
      wholeVectors.set(id, vectors[offset])
      upserts.push({
        id: relatedVectorId(id),
        values: vectors[offset],
        namespace: relatedNamespace,
        metadata: { type: 'post', hash, chunks: chunks.length },
      })
      chunks.forEach((chunk, index) =>
        upserts.push({
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
    await api.upsert(upserts)
    if (staleChunks.length) await api.deleteByIds(staleChunks)
  }
  let pruned = []
  if (prune) {
    const known = new Set(articles.map(({ id }) => id))
    pruned = (await api.listIds()).filter((vectorId) => {
      const id = articleOfVectorId(vectorId)
      return (
        /^(?:post|blog):/.test(vectorId) &&
        (!id || !known.has(id) || !/^(?:post:[^#]+|blog:[^#]+#\d+)$/.test(vectorId))
      )
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
    const ranked = rankMatches(await api.query(await api.embedQuery(entry.query)))
    const urls = ranked.map((match) =>
      match.type === 'news' ? `/news/${match.metadata.date}/` : match.metadata.url,
    )
    const top3 = urls.slice(0, 3)
    const expected = entry.expect ?? []
    const found = expected.filter((url) => top3.includes(url))
    const allowed = new Set([...expected, ...(entry.allow ?? [])])
    const falsePositives = urls.filter((url) => url.startsWith('/blog/') && !allowed.has(url))
    results.push({
      query: entry.query,
      gate: entry.gate !== false,
      recall: expected.length ? found.length / expected.length : null,
      falsePositives,
      hits: ranked.map((match, index) => [urls[index], Math.round(match.score * 1000) / 1000]),
    })
  }
  const gated = results.filter((result) => result.gate)
  const withExpected = gated.filter((result) => result.recall !== null)
  const recall = withExpected.reduce((sum, result) => sum + result.recall, 0) / withExpected.length
  const offTopicHits = gated.filter((result) => result.recall === null && result.hits.length)
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
