// Repository card data, shared by the build (src/lib/markdown.mjs, scripts/github-repos.mjs), the
// Worker (src/lib/github-endpoint.ts), and the page script (src/components/GitHubCards.astro), so
// a refreshed card shows exactly what the build would render. No Node APIs.

// Owner names allow letters, digits, and hyphens; repository names also dots and underscores.
export const repositoryUrl = /^https:\/\/github\.com\/([\w-]+\/[\w.-]+)\/?$/i

// The fields a card shows, from a GitHub REST "get a repository" response. Returns null when the
// response is not a repository, so a caller falls back to the snapshot.
export function repoFields(data) {
  if (typeof data?.full_name !== 'string' || typeof data.stargazers_count !== 'number') return null
  return {
    name: data.full_name,
    description: typeof data.description === 'string' ? data.description.trim() : '',
    stars: data.stargazers_count,
    forks: typeof data.forks_count === 'number' ? data.forks_count : 0,
    language: typeof data.language === 'string' ? data.language : null,
    archived: data.archived === true,
    pushedAt: typeof data.pushed_at === 'string' ? data.pushed_at : null,
  }
}

const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 })

// 3708 shows as 3.7k: Latin digits and a lowercase suffix in both themes and locales.
export const formatCount = (count) =>
  count < 1000 ? String(count) : compact.format(count).toLowerCase()

const month = new Intl.DateTimeFormat('en', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: 'numeric',
})

// A month, not a relative time: the build snapshot would make "3 days ago" wrong a week later.
export function formatMonth(iso) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const parts = Object.fromEntries(
    month.formatToParts(date).map(({ type, value }) => [type, value]),
  )
  return `${parts.year} 年 ${parts.month} 月`
}

// The stats line: 语言 · ★ 3.7k · fork 230 · 2026 年 2 月更新. A missing language or date drops its part.
export function statsLine(repo) {
  const updated = repo.pushedAt ? formatMonth(repo.pushedAt) : ''
  return [
    repo.language,
    `★ ${formatCount(repo.stars)}`,
    `fork ${formatCount(repo.forks)}`,
    updated && `${updated}更新`,
  ]
    .filter(Boolean)
    .join(' · ')
}

export const archivedLabel = '已归档'
