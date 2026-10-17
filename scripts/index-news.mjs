// Writes the item vectors of AI News issues that were published before search existed, or after
// a failed index write. The Worker indexes every later write itself.
//
//   pnpm exec wrangler d1 execute NEWS --remote --json \
//     --command "SELECT date, title, summary, items_json FROM issues WHERE hidden_at IS NULL" > issues.json
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
const issues = rows.map(({ date, title, summary, items_json }) => ({
  date,
  title,
  summary,
  items: JSON.parse(items_json),
}))
const { accountId, request } = cloudflareFromEnv()
const result = await indexIssues(searchIndexApi(request, accountId, values.index), issues)
console.log(
  `${values.index}: indexed ${result.issues} issues, ${result.neurons.toFixed(2)} neurons.`,
)
