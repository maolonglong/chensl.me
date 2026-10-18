// Decides whether the search index job runs scripts/search-eval.mjs. An evaluation costs about
// 27,000 queried Vectorize dimensions and 0.8 neurons per attempt, so it runs only when the
// change can move the results: the articles, the embedding or ranking code, the fixture or the
// job itself. The job also evaluates after any index write (embed-posts.mjs sets `wrote`), which
// covers rendering changes. Prints `eval=true` or `eval=false`.
//
//   node scripts/search-eval-scope.mjs <base commit>   (pull requests: the base branch commit)
//   node scripts/search-eval-scope.mjs --runs <file>   (main: successful runs, newest first)
//
// On main the base is the newest successful run whose commit is an ancestor of HEAD. A run that
// failed, such as one whose head check refused an overtaken build, does not move the base, so
// the next run still evaluates its changes. Without a usable base the job evaluates.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const searchPaths = [
  /^src\/content\/blog\//,
  /^src\/lib\/(search-text|news-limits)\.mjs$/,
  /^scripts\/(embed-posts|search-inputs|search-index|search-eval|search-eval-scope|cloudflare-api)\.mjs$/,
  /^tests\/fixtures\/search-queries\.json$/,
  /^\.github\/workflows\/search-index\.yml$/,
]

export const needsEvaluation = (files) =>
  files.some((file) => searchPaths.some((pattern) => pattern.test(file)))

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: 'pipe' })

const isAncestor = (commit) => {
  try {
    git('merge-base', '--is-ancestor', commit, 'HEAD')
    return true
  } catch {
    return false
  }
}

const changedSince = (base) => {
  try {
    return git('diff', '--name-only', base, 'HEAD').split('\n').filter(Boolean)
  } catch {
    return null
  }
}

if (import.meta.main) {
  const args = process.argv.slice(2)
  let base = args[0]
  if (args[0] === '--runs') {
    let runs = []
    try {
      runs = JSON.parse(readFileSync(args[1], 'utf8'))
    } catch {
      // An unreadable run list leaves no base.
    }
    base = runs.map((run) => run.headSha).find((sha) => sha && isAncestor(sha))
  }
  const files = base ? changedSince(base) : null
  console.log(`eval=${files === null || needsEvaluation(files)}`)
}
