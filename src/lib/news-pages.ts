import { getLiveCollection } from 'astro:content'
import type { IssueQuery, StoredIssue } from './news'

// The live loader reports a failed read as an error beside missing entries. Surface the error
// instead of rendering an empty page.
// Each loader also tags the response with its cache hint (src/live.config.ts) for purging by tag
// (src/lib/news-cache.ts).
export async function loadIssues(filter: IssueQuery, headers: Headers): Promise<StoredIssue[]> {
  const { entries, error, cacheHint } = await getLiveCollection('news', filter)
  if (!entries) throw error
  setCacheTag(headers, cacheHint?.tags)
  return entries.map((entry) => entry.data)
}

export function setCacheTag(headers: Headers, tags: string[] | undefined) {
  if (tags?.length) headers.set('Cache-Tag', tags.join(','))
}

export interface NewsMonth {
  month: string
  count: number
}

export async function loadMonths(headers: Headers): Promise<NewsMonth[]> {
  const { entries, error, cacheHint } = await getLiveCollection('newsMonths')
  if (!entries) throw error
  setCacheTag(headers, cacheHint?.tags)
  return entries.map((entry) => entry.data)
}
