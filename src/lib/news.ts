import { z } from 'astro/zod'

// Calendar dates in Asia/Shanghai, the day the issue covers. The key is also the page URL.
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`)
    return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value)
  }, 'Invalid calendar date')

const text = (max: number) => z.string().trim().min(1).max(max)

// Only http and https links reach the page, so a stored item cannot carry javascript: or data:.
export const isWebUrl = (value: string) => {
  const url = URL.parse(value)
  return url !== null && (url.protocol === 'https:' || url.protocol === 'http:')
}

export const newsItem = z.strictObject({
  title: text(200),
  summary: text(1000),
  url: z.string().max(2048).refine(isWebUrl, 'URL must use http or https'),
  tag: text(32),
})

export const newsIssue = z.strictObject({
  date: isoDate,
  title: text(120),
  summary: text(1000),
  items: z.array(newsItem).min(1).max(30),
})

export type NewsItem = z.infer<typeof newsItem>
export type NewsIssue = z.infer<typeof newsIssue>
export type StoredIssue = NewsIssue & { createdAt: string }

export const isIssueDate = (value: string | undefined): value is string =>
  isoDate.safeParse(value).success

interface IssueRow {
  date: string
  title: string
  summary: string
  items_json: string
  created_at: string
}

// Rows were validated on write; parsing again keeps a hand-edited row from reaching the page.
function fromRow(row: IssueRow): StoredIssue | null {
  let items: unknown
  try {
    items = JSON.parse(row.items_json)
  } catch {
    return null
  }
  const { date, title, summary } = row
  const parsed = newsIssue.safeParse({ date, title, summary, items })
  return parsed.success ? { ...parsed.data, createdAt: row.created_at } : null
}

export async function listIssues(db: D1Database, limit: number) {
  const { results } = await db
    .prepare(
      'SELECT date, title, summary, items_json, created_at FROM issues ORDER BY date DESC LIMIT ?',
    )
    .bind(limit)
    .all<IssueRow>()
  return results.map(fromRow).filter((issue) => issue !== null)
}

export async function getIssue(db: D1Database, date: string) {
  const row = await db
    .prepare('SELECT date, title, summary, items_json, created_at FROM issues WHERE date = ?')
    .bind(date)
    .first<IssueRow>()
  return row ? fromRow(row) : null
}

export type SaveResult = 'created' | 'updated' | 'unchanged'

// A repeated delivery of the same issue changes nothing; a corrected one replaces the content
// and keeps created_at, so the feed item keeps its date.
export async function saveIssue(db: D1Database, issue: NewsIssue): Promise<SaveResult> {
  const itemsJson = JSON.stringify(issue.items)
  const [existing] = await db.batch<{ title: string; summary: string; items_json: string }>([
    db.prepare('SELECT title, summary, items_json FROM issues WHERE date = ?').bind(issue.date),
    db
      .prepare(
        `INSERT INTO issues (date, title, summary, items_json, created_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (date) DO UPDATE SET title = excluded.title, summary = excluded.summary,
           items_json = excluded.items_json`,
      )
      .bind(issue.date, issue.title, issue.summary, itemsJson, new Date().toISOString()),
  ])
  const before = existing.results[0]
  if (!before) return 'created'
  return before.title === issue.title &&
    before.summary === issue.summary &&
    before.items_json === itemsJson
    ? 'unchanged'
    : 'updated'
}

export const newsCacheControl = 'public, max-age=60, s-maxage=300'

export const newsUrl = (date: string) => `/news/${date}/`
