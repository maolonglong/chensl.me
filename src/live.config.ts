import { defineLiveCollection } from 'astro:content'
import type { LiveLoader } from 'astro/loaders'
import {
  queryIssue,
  queryIssues,
  queryMonths,
  recentIssueCount,
  type IssueQuery,
  type StoredIssue,
} from './lib/news'

// AI News issues live in D1 (NEWS) and are read on each request. Pages call
// getLiveCollection('news', { limit } | { month }) and getLiveEntry('news', date); the loader
// never returns retracted issues. Cache hints carry tags and the last change time.
// astro sync loads this file in Node, so the Workers env is imported only when a request runs.
const db = async () => (await import('cloudflare:workers')).env.NEWS

const hint = (issue: StoredIssue) => ({
  tags: ['news', `news-${issue.date}`],
  lastModified: new Date(issue.updatedAt),
})

const toEntry = (issue: StoredIssue) => ({ id: issue.date, data: issue, cacheHint: hint(issue) })

function newsLoader(): LiveLoader<StoredIssue, { id: string }, IssueQuery> {
  return {
    name: 'news-d1-loader',
    loadCollection: async ({ filter }) => {
      const issues = await queryIssues(await db(), filter ?? { limit: recentIssueCount })
      return { entries: issues.map(toEntry), cacheHint: { tags: ['news'] } }
    },
    loadEntry: async ({ filter }) => {
      const issue = await queryIssue(await db(), filter.id)
      return issue ? toEntry(issue) : undefined
    },
  }
}

interface MonthCount {
  month: string
  count: number
}

// One entry per month that has visible issues, newest first, for the archive index.
function monthsLoader(): LiveLoader<MonthCount, never, never> {
  return {
    name: 'news-months-d1-loader',
    loadCollection: async () => ({
      entries: (await queryMonths(await db())).map((row) => ({ id: row.month, data: row })),
      cacheHint: { tags: ['news'] },
    }),
    loadEntry: async () => undefined,
  }
}

export const collections = {
  news: defineLiveCollection({ loader: newsLoader() }),
  newsMonths: defineLiveCollection({ loader: monthsLoader() }),
}
