// Writes the item vectors of AI News issues that were published before search existed, or after
// a failed index write. The Worker indexes every later write itself.
// Pause and drain news writers before exporting, and keep them paused through the backfill:
// this snapshot can overwrite newer versions.
//
//   pnpm exec wrangler d1 execute NEWS --remote --json \
//     --command "SELECT date, version, title, summary, items_json FROM issues WHERE hidden_at IS NULL" > issues.json
//   node scripts/index-news.mjs --index <name> issues.json
//
// Reads the output of `wrangler d1 execute --json`. Needs CLOUDFLARE_ACCOUNT_ID and
// CLOUDFLARE_EMBED_TOKEN (scripts/cloudflare-api.mjs), not the news write token.
import { readFile } from 'node:fs/promises'
import { parseArgs } from 'node:util'
import { cloudflareFromEnv } from './cloudflare-api.mjs'
import { indexIssues, searchIndexApi } from './search-index.mjs'

const { values, positionals } = parseArgs({
  options: { index: { type: 'string' } },
  allowPositionals: true,
})
if (!values.index || positionals.length !== 1)
  throw new Error('Usage: node scripts/index-news.mjs --index <name> <issues.json>')

const output = JSON.parse(await readFile(positionals[0], 'utf8'))
const rows = output.flatMap((statement) => statement.results ?? [])
const issues = rows.map(({ date, version, title, summary, items_json }) => {
  const items = JSON.parse(items_json)
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isSafeInteger(version) ||
    version < 1 ||
    !title ||
    !Array.isArray(items) ||
    !items.length
  )
    throw new Error(`Invalid news issue row for ${date ?? 'unknown date'}`)
  return { date, version, title, summary, items }
})
const { accountId, request } = cloudflareFromEnv()
const api = searchIndexApi(request, accountId, values.index)
const result = await indexIssues(api, issues)
await api.waitForWrites()
console.log(
  `${values.index}: indexed ${result.issues} issues, ${result.neurons.toFixed(2)} neurons.`,
)
const { upserted, deleted, lastMutation } = api.writes
console.log(
  `${values.index}: upserted ${upserted} vectors, deleted ${deleted}${lastMutation ? `, applied up to mutation ${lastMutation}` : ', no write'}.`,
)
