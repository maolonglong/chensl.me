// Decides whether the search index job runs scripts/search-eval.mjs. An evaluation costs about
// 27,000 queried Vectorize dimensions and 0.8 neurons per attempt, so it runs only when the
// change can move the results: the articles, the embedding or ranking code, the fixture or the
// job itself. The job also evaluates after any index write (embed-posts.mjs sets `wrote`), which
// covers rendering changes and overtaken runs. Prints `eval=true` or `eval=false`.
//
//   node scripts/search-eval-scope.mjs <base commit>
import { execFileSync } from 'node:child_process'

const searchPaths = [
  /^src\/content\/blog\//,
  /^src\/lib\/(search-text|news-limits)\.mjs$/,
  /^scripts\/(embed-posts|search-inputs|search-index|search-eval|search-eval-scope|cloudflare-api)\.mjs$/,
  /^tests\/fixtures\/search-queries\.json$/,
  /^\.github\/workflows\/search-index\.yml$/,
]

export const needsEvaluation = (files) =>
  files.some((file) => searchPaths.some((pattern) => pattern.test(file)))

if (import.meta.main) {
  const base = process.argv[2]
  let files
  try {
    files = execFileSync('git', ['diff', '--name-only', base, 'HEAD'], { encoding: 'utf8' })
      .split('\n')
      .filter(Boolean)
  } catch {
    // No usable base, such as a first push or a force push: evaluate.
    files = null
  }
  console.log(`eval=${files === null || needsEvaluation(files)}`)
}
