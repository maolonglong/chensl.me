// Runs the labeled queries in tests/fixtures/search-queries.json against a Vectorize index with
// the ranking of /api/search, and reports top-3 recall and false positives. Fails below the
// fixture's floors. GitHub Actions runs it after each index update.
//
//   node scripts/search-eval.mjs --index <name> [--json <report path>]
//
// Needs CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_EMBED_TOKEN (scripts/cloudflare-api.mjs).
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { cloudflareFromEnv } from './cloudflare-api.mjs'
import { evaluate, searchIndexApi } from './search-index.mjs'

const root = path.resolve(import.meta.dirname, '..')
const { values } = parseArgs({ options: { index: { type: 'string' }, json: { type: 'string' } } })
if (!values.index) throw new Error('Pass --index <vectorize-index-name>')

const fixture = JSON.parse(
  await readFile(path.join(root, 'tests/fixtures/search-queries.json'), 'utf8'),
)
const { accountId, request } = cloudflareFromEnv()
const report = await evaluate(searchIndexApi(request, accountId, values.index), fixture)
for (const result of report.results) {
  const mark = result.gate ? (result.recall === 0 || result.falsePositives.length ? '✗' : '✓') : '·'
  console.log(
    `${mark} ${result.query}: ${result.hits.map(([url, score]) => `${url} ${score}`).join(', ') || 'no hits'}`,
  )
}
console.log(
  `top-3 recall ${report.recall.toFixed(2)} (floor ${fixture.minRecall}), ${report.falsePositives} false positives (limit ${fixture.maxFalsePositives}), ${report.offTopicHits} off-topic queries with hits, ${report.neurons.toFixed(2)} neurons.`,
)
if (values.json) await writeFile(values.json, `${JSON.stringify(report, null, 2)}\n`)
if (!report.passed) process.exitCode = 1
