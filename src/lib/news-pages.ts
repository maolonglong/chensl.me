import { getLiveCollection } from 'astro:content'
import type { IssueQuery, StoredIssue } from './news'

// The live loader reports a failed read as an error beside missing entries. Surface the error
// instead of rendering an empty page.
export async function loadIssues(filter: IssueQuery): Promise<StoredIssue[]> {
  const { entries, error } = await getLiveCollection('news', filter)
  if (!entries) throw error
  return entries.map((entry) => entry.data)
}

export interface NewsMonth {
  month: string
  count: number
}

export async function loadMonths(): Promise<NewsMonth[]> {
  const { entries, error } = await getLiveCollection('newsMonths')
  if (!entries) throw error
  return entries.map((entry) => entry.data)
}
