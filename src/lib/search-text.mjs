// Search embeddings: the model and the text each document sends to it. Shared by the build
// (related articles), the scripts that embed articles, and the Worker (queries and AI News), so
// this module must stay free of Node APIs.

export const embeddingModel = '@cf/qwen/qwen3-embedding-0.6b'
export const embeddingDimensions = 1024

// About 3000 Chinese characters fit well inside the model's 4096-token input, and the opening of
// an article carries its topic. Longer inputs cost more Neurons without better matches.
const maxInputChars = 3000

const clip = (text) => text.slice(0, maxInputChars)

export const articleEmbeddingText = ({ title, description, text }) =>
  clip([title, description, text].filter(Boolean).join('\n'))

export const newsEmbeddingText = ({ title, summary, items }) =>
  clip(
    [title, summary, ...items.map((item) => `${item.tag}: ${item.title}. ${item.summary}`)].join(
      '\n',
    ),
  )

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
