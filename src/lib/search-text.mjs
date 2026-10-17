// Search embeddings: the model, the text each document sends to it, the vector IDs, and the
// ranking of semantic matches. Shared by the build, the scripts that write and evaluate the
// index, and the Worker, so this module must stay free of Node APIs.

export const embeddingModel = '@cf/qwen/qwen3-embedding-0.6b'
export const embeddingDimensions = 1024

// Bump when the text, the chunking, or the vector layout changes: every article hash changes, so
// the next index run re-embeds every article.
export const indexVersion = 2

// Search vectors (article chunks and news items) live in one namespace; whole-article vectors,
// used only for related articles, live in another, so queries never return them.
export const searchNamespace = 'search'
export const relatedNamespace = 'related'

// Qwen3 embeddings take a task instruction on the query side only. A Chinese instruction that
// names both kinds of document ranked the right article first for 智能体, which the default missed.
export const queryInstruction = '给定一个搜索查询，检索能回答该查询的技术博客文章或 AI 新闻'

// The model reads up to 8192 tokens, but the opening 3000 characters of an article carry its
// topic, and the related-article threshold was calibrated on this length. Longer inputs cost
// more Neurons without better matches.
const maxInputChars = 3000

const clip = (text) => text.slice(0, maxInputChars)

export const articleEmbeddingText = ({ title, description, text }) =>
  clip([title, description, text].filter(Boolean).join('\n'))

export const newsItemEmbeddingText = (item) => `${item.tag}: ${item.title}. ${item.summary}`

// Search chunks: each H2 or H3 section is split into pieces of about 800 to 1200 characters,
// and each piece repeats the end of the previous one, so a sentence at a boundary is in both.
// A short section joins the next one, and a short last section joins the previous one, instead
// of becoming a chunk of its own.
export const chunkMinChars = 800
export const chunkMaxChars = 1200
export const chunkOverlapChars = 150
const shortSectionChars = 300

function splitLong(paragraph) {
  const pieces = []
  for (let start = 0; start < paragraph.length; start += chunkMaxChars - chunkOverlapChars) {
    pieces.push(paragraph.slice(start, start + chunkMaxChars))
    if (start + chunkMaxChars >= paragraph.length) break
  }
  return pieces
}

function packSection(text) {
  const paragraphs = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => (line.length > chunkMaxChars ? splitLong(line) : [line]))
  const chunks = []
  let current = ''
  for (const paragraph of paragraphs) {
    const joined = current ? `${current}\n${paragraph}` : paragraph
    if (current.length >= chunkMinChars || (current && joined.length > chunkMaxChars)) {
      chunks.push(current)
      // Start the next chunk with the tail of this one, cut at a line break when there is one.
      const tail = current.slice(-chunkOverlapChars)
      const lineStart = tail.indexOf('\n')
      const overlap =
        lineStart >= 0 && lineStart < tail.length - 1 ? tail.slice(lineStart + 1) : tail
      current = `${overlap}\n${paragraph}`
    } else {
      current = joined
    }
  }
  if (current) chunks.push(current)
  return chunks
}

// sections: [{ heading, text }] in page order; the first may have an empty heading.
// Returns [{ section, text }], where text starts with "title › section" (or the title alone).
export function articleChunks({ title, sections }) {
  const merged = []
  for (const section of sections) {
    const text = section.text.trim()
    const previous = merged.at(-1)
    if (previous && previous.text.length < shortSectionChars) {
      // The chunk is named after the section that brings most of the text.
      previous.text = [previous.heading, previous.text, text].filter(Boolean).join('\n')
      previous.heading = section.heading
    } else if (text || section.heading) {
      merged.push({ heading: section.heading, text })
    }
  }
  const last = merged.at(-1)
  if (merged.length > 1 && last.text.length < shortSectionChars) {
    merged.pop()
    merged.at(-1).text += `\n${last.heading}\n${last.text}`
  }
  return merged.flatMap(({ heading, text }) =>
    packSection(text).map((body) => ({
      section: heading,
      text: `${heading ? `${title} › ${heading}` : title}\n${body}`,
    })),
  )
}

export const clipSnippet = (text) => (text.length > 120 ? `${text.slice(0, 119)}…` : text)

// Vector IDs. An article has one whole-article vector and its chunks; an issue has one vector
// for each item. Vectorize limits an ID to 64 bytes; article IDs and dates stay far below it.
export const relatedVectorId = (id) => `post:${id}`
export const chunkVectorId = (id, index) => `blog:${id}#${index}`
export const newsVectorId = (date, index) => `news:${date}:${index}`
export const maxNewsItems = 30

export const articleOfVectorId = (vectorId) => vectorId.match(/^(?:post|blog):([^#]+)/)?.[1]

// The vectors for one issue, given one embedding per item in order, and the IDs of item vectors
// that a previous, longer version of the issue left behind.
export function newsVectors(issue, embeddings) {
  const upserts = issue.items.map((item, index) => ({
    id: newsVectorId(issue.date, index),
    values: embeddings[index],
    namespace: searchNamespace,
    // /api/search shows the issue title and the item without reading items_json from D1.
    metadata: {
      type: 'news',
      date: issue.date,
      item: index,
      title: issue.title,
      snippet: clipSnippet(`${item.title}：${item.summary}`),
    },
  }))
  const stale = []
  for (let index = issue.items.length; index < maxNewsItems; index++)
    stale.push(newsVectorId(issue.date, index))
  return { upserts, stale }
}

export const allNewsVectorIds = (date) =>
  Array.from({ length: maxNewsItems }, (_, index) => newsVectorId(date, index))

// Semantic ranking, calibrated against the deployed model on 2026-10-17 with 46 queries
// (.agents/notes/implemented/feature/2026-10-17-hybrid-search.md#calibration). Matches are merged
// by document first: an article scores its best chunk, an issue its best item. Each kind then
// keeps the documents at or above its floor and within the gap of its own best document, so a
// strong news match does not hide a good article, and the reverse. Short chunks and items score
// higher than whole documents did, so the floors are higher than the first calibration's 0.30.
export const semanticMinScore = { blog: 0.36, news: 0.4 }
export const semanticMaxGap = 0.1
export const semanticTopK = 30

const documentKey = (match) =>
  match.metadata?.type === 'news'
    ? `news:${match.metadata.date}`
    : `blog:${articleOfVectorId(match.id) ?? match.id}`

export function rankMatches(matches) {
  const best = new Map()
  for (const match of matches) {
    const type = match.metadata?.type
    if (type !== 'blog' && type !== 'news') continue
    const key = documentKey(match)
    if (!best.has(key) || best.get(key).score < match.score) best.set(key, { ...match, type })
  }
  const documents = [...best.values()]
  const top = {}
  for (const document of documents)
    top[document.type] = Math.max(top[document.type] ?? -1, document.score)
  return documents
    .filter(
      (document) =>
        document.score >= semanticMinScore[document.type] &&
        document.score >= top[document.type] - semanticMaxGap,
    )
    .sort((a, b) => b.score - a.score)
}

const relatedCandidates = 5

const dot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0)

// The model returns unit vectors, so the dot product is the cosine similarity. Keeps the best
// few candidates for each article; the build applies the score threshold (src/lib/related.ts).
export function relatedFromVectors(items) {
  return Object.fromEntries(
    items.map(({ id, vector }) => [
      id,
      items
        .filter((other) => other.id !== id)
        .map((other) => [other.id, Math.round(dot(vector, other.vector) * 1000) / 1000])
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, relatedCandidates),
    ]),
  )
}
