import { env } from 'cloudflare:workers'
import {
  issueCacheTags,
  queryIssue,
  queryIssues,
  queryMonths,
  type IssueQuery,
  type StoredIssue,
} from './news'

export function setCacheTag(headers: Headers, tags: Iterable<string>) {
  const unique = [...new Set(tags)]
  if (unique.length) headers.set('Cache-Tag', unique.join(','))
}

// Each news page tags its response with `news` and any issue-specific `news-<date>` tags for
// purging by tag (src/lib/news-cache.ts).
export async function loadIssues(filter: IssueQuery, headers: Headers): Promise<StoredIssue[]> {
  const issues = await queryIssues(env.NEWS, filter)
  setCacheTag(headers, ['news', ...issues.flatMap((issue) => issueCacheTags(issue.date))])
  return issues
}

export async function loadIssue(date: string, headers: Headers): Promise<StoredIssue | null> {
  const issue = await queryIssue(env.NEWS, date)
  if (issue) setCacheTag(headers, issueCacheTags(issue.date))
  return issue
}

export interface NewsMonth {
  month: string
  count: number
}

export async function loadMonths(headers: Headers): Promise<NewsMonth[]> {
  const months = await queryMonths(env.NEWS)
  setCacheTag(headers, ['news'])
  return months
}
