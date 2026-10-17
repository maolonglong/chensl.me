// Embeds every built article with Workers AI, writes src/data/related-posts.json, and upserts the
// article vectors into a Vectorize index for /api/search.
//
//   pnpm build && node scripts/embed-posts.mjs --index <vectorize-index-name>
//
// scripts/check-site.mjs fails when an article has no entry, and warns when one is stale.
//
// Workers AI and Vectorize run through Wrangler remote bindings, so the script needs
// `pnpm exec wrangler login` (or CLOUDFLARE_API_TOKEN) and calls the account's resources:
// pass the Preview index or the production index explicitly. One run embeds about 17 articles,
// about 13 Neurons of the 10,000 free each day.
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { embeddingModel, relatedFromVectors } from '../src/lib/search-text.mjs'
import { articleInputs } from './search-inputs.mjs'

const root = path.resolve(import.meta.dirname, '..')
const dataFile = path.join(root, 'src/data/related-posts.json')
const distClient = path.join(root, 'dist/client')
const batchSize = 32

async function main() {
  const { values } = parseArgs({ options: { index: { type: 'string' } } })
  if (!values.index)
    throw new Error('Pass --index <vectorize-index-name>: the Preview or the production index')

  const { getPlatformProxy } = await import('wrangler')
  const configDir = path.join(root, '.wrangler/tmp')
  await mkdir(configDir, { recursive: true })
  const configPath = path.join(configDir, 'embed-posts.wrangler.json')
  await writeFile(
    configPath,
    JSON.stringify({
      name: 'blog-embed-posts',
      compatibility_date: '2026-09-25',
      ai: { binding: 'AI', remote: true },
      vectorize: [{ binding: 'SEARCH_INDEX', index_name: values.index, remote: true }],
    }),
  )
  const { env, dispose } = await getPlatformProxy({ configPath })
  try {
    const inputs = await articleInputs(distClient)
    const vectors = []
    for (let start = 0; start < inputs.length; start += batchSize) {
      const batch = inputs.slice(start, start + batchSize)
      const { data } = await env.AI.run(embeddingModel, {
        documents: batch.map(({ text }) => text),
      })
      vectors.push(...data)
    }
    const items = inputs.map(({ id }, index) => ({ id, vector: vectors[index] }))
    const related = relatedFromVectors(items)
    const posts = Object.fromEntries(
      inputs.map(({ id, hash }) => [id, { hash, related: related[id] }]),
    )
    await writeFile(dataFile, `${JSON.stringify({ model: embeddingModel, posts }, null, 2)}\n`)
    // /api/search returns these fields for an article hit without another lookup.
    const upserts = inputs.map(({ id, title, description, date }, index) => ({
      id: `blog:${id}`,
      values: vectors[index],
      metadata: { type: 'blog', url: `/blog/${id}/`, title, description, date },
    }))
    const mutation = await env.SEARCH_INDEX.upsert(upserts)
    console.log(
      `Embedded ${inputs.length} articles into ${values.index}; mutation ${mutation.mutationId}.`,
    )
  } finally {
    await dispose()
  }
}

await main()
