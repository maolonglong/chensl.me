// Brings the article vectors in a Vectorize index in line with the build, and checks or writes
// src/data/related-posts.json. GitHub Actions runs it after each push (.github/workflows/search-index.yml).
//
//   pnpm build && node scripts/embed-posts.mjs --index <name> [--prune] [--write]
//
// Only articles whose hash changed are embedded again. --prune also deletes the vectors of
// articles that are no longer in the build. Without --write, the script fails when the committed
// related-posts.json differs from the recomputed one, prints the difference, and saves the new
// file to the --out path, so a person commits it; CI never pushes. Needs CLOUDFLARE_ACCOUNT_ID
// and CLOUDFLARE_EMBED_TOKEN (scripts/cloudflare-api.mjs).
import { execFileSync } from 'node:child_process'
import { appendFile, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { cloudflareFromEnv } from './cloudflare-api.mjs'
import { searchIndexApi, syncArticles } from './search-index.mjs'
import { articleInputs } from './search-inputs.mjs'

const root = path.resolve(import.meta.dirname, '..')
const dataFile = path.join(root, 'src/data/related-posts.json')

const { values } = parseArgs({
  options: {
    index: { type: 'string' },
    prune: { type: 'boolean', default: false },
    write: { type: 'boolean', default: false },
    out: { type: 'string', default: path.join(root, 'related-posts.json') },
  },
})
if (!values.index) throw new Error('Pass --index <vectorize-index-name>')

const { accountId, request } = cloudflareFromEnv()
const api = searchIndexApi(request, accountId, values.index)
const articles = await articleInputs(path.join(root, 'dist/client'))
const result = await syncArticles(api, articles, { prune: values.prune })
console.log(
  `${values.index}: ${articles.length} articles, ${result.changed.length} embedded (${result.changed.join(', ') || 'none'}), ${result.pruned.length} vectors pruned, ${result.neurons.toFixed(2)} neurons.`,
)
// Lets a reader of the CI log check the write against the index (`wrangler vectorize info`).
const { upserted, deleted, lastMutation } = api.writes
console.log(
  `${values.index}: submitted ${upserted} upserts and ${deleted} deletes${lastMutation ? `, last accepted mutation ${lastMutation}` : ', no write'}. Written checkpoints are readable; query visibility is checked by search-eval.mjs.`,
)
// The search index job evaluates after any write (scripts/search-eval-scope.mjs).
if (process.env.GITHUB_OUTPUT)
  await appendFile(process.env.GITHUB_OUTPUT, `wrote=${Boolean(lastMutation)}\n`)

const next = `${JSON.stringify(result.data, null, 2)}\n`
if (values.write) {
  await writeFile(dataFile, next)
  console.log(`Wrote ${path.relative(root, dataFile)}.`)
} else if ((await readFile(dataFile, 'utf8')) !== next) {
  await writeFile(values.out, next)
  let diff = ''
  try {
    execFileSync('git', ['diff', '--no-index', '--', dataFile, values.out], { encoding: 'utf8' })
  } catch (error) {
    diff = error.stdout
  }
  console.log(diff)
  console.error(
    `src/data/related-posts.json is out of date. Commit the file saved at ${path.relative(root, values.out)} (also uploaded as the related-posts artifact).`,
  )
  process.exitCode = 1
} else {
  console.log('src/data/related-posts.json is current.')
}
