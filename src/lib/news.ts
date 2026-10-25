import { z } from 'astro/zod'

// migrations/news/0004_item_search.sql reserves 32 issue_items_fts rowids per day (day * 32 + key).
const maxNewsItems = 30

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
  // A vendor or tool name (OpenAI, DeepSeek, pi), kept as written. Free text, not an enum.
  tag: text(32).regex(/^[\p{L}\p{N}](?:[\p{L}\p{N} .+&_-]*[\p{L}\p{N}+])?$/u),
})

export const newsIssue = z.strictObject({
  date: isoDate,
  title: text(120),
  summary: text(1000),
  items: z.array(newsItem).min(1).max(maxNewsItems),
})

export type NewsItem = z.infer<typeof newsItem>
export type NewsIssue = z.infer<typeof newsIssue>
export type StoredIssue = NewsIssue & { createdAt: string; updatedAt: string; version: number }

export const isIssueDate = (value: string | undefined): value is string =>
  isoDate.safeParse(value).success

export const isMonth = (value: string | undefined): value is string =>
  /^\d{4}-(?:0[1-9]|1[0-2])$/.test(value ?? '')

// /news/ shows only the latest visible issue; older ones are in /news/archive/.
export const recentIssueCount = 1
export const feedIssueCount = 20

export const retraction = z.strictObject({
  date: isoDate,
  // false restores a retracted issue.
  hidden: z.boolean().default(true),
})

interface IssueRow {
  date: string
  title: string
  summary: string
  items_json: string
  created_at: string
  updated_at: string
  version: number
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
  return parsed.success
    ? { ...parsed.data, createdAt: row.created_at, updatedAt: row.updated_at, version: row.version }
    : null
}

// All page reads go through src/lib/news-pages.ts; this is their only SQL.
// Retracted issues (hidden_at set) are never returned. Dates are the primary key of a
// WITHOUT ROWID table, so lookups, ranges and ORDER BY date use it.
const columns = 'date, title, summary, items_json, created_at, updated_at, version'
const visible = 'hidden_at IS NULL'

export type IssueQuery = { limit: number } | { month: string }

export async function queryIssues(db: D1Database, query: IssueQuery) {
  const statement =
    'month' in query
      ? db
          .prepare(
            `SELECT ${columns} FROM issues WHERE ${visible} AND date >= ? AND date < ? ORDER BY date DESC LIMIT 31`,
          )
          .bind(`${query.month}-01`, `${query.month}-32`)
      : db
          .prepare(`SELECT ${columns} FROM issues WHERE ${visible} ORDER BY date DESC LIMIT ?`)
          .bind(query.limit)
  const { results } = await statement.all<IssueRow>()
  return results.map(fromRow).filter((issue) => issue !== null)
}

export async function queryIssue(db: D1Database, date: string) {
  const row = await db
    .prepare(`SELECT ${columns} FROM issues WHERE ${visible} AND date = ?`)
    .bind(date)
    .first<IssueRow>()
  return row ? fromRow(row) : null
}

export async function queryMonths(db: D1Database) {
  const { results } = await db
    .prepare(
      `SELECT substr(date, 1, 7) AS month, COUNT(*) AS count FROM issues WHERE ${visible} GROUP BY month ORDER BY month DESC LIMIT 600`,
    )
    .all<{ month: string; count: number }>()
  return results
}

export type SaveResult = 'created' | 'updated' | 'unchanged'

// Writes only append. Each changed write becomes the next version in issue_versions, and the
// issues row is refreshed from the newest version, so older versions stay for rollback.
// A retry with the same content as the newest version adds nothing, so redelivery is safe.
// created_at on issues keeps the first publication time, which the feed uses as pubDate.
export async function saveIssue(
  db: D1Database,
  issue: NewsIssue,
): Promise<{ status: SaveResult; version: number }> {
  const itemsJson = JSON.stringify(issue.items)
  const now = new Date().toISOString()
  const [existing, inserted, , current] = await db.batch([
    db.prepare('SELECT 1 FROM issues WHERE date = ?').bind(issue.date),
    db
      .prepare(
        `INSERT INTO issue_versions (date, version, title, summary, items_json, created_at)
         SELECT ?1, COALESCE((SELECT MAX(version) FROM issue_versions WHERE date = ?1), 0) + 1,
           ?2, ?3, ?4, ?5
         WHERE NOT EXISTS (SELECT 1 FROM issues
           WHERE date = ?1 AND title = ?2 AND summary = ?3 AND items_json = ?4)`,
      )
      .bind(issue.date, issue.title, issue.summary, itemsJson, now),
    db
      .prepare(
        `INSERT INTO issues (date, version, title, summary, items_json, created_at, updated_at)
         SELECT date, version, title, summary, items_json, created_at, created_at
         FROM issue_versions WHERE date = ?1 ORDER BY version DESC LIMIT 1
         ON CONFLICT (date) DO UPDATE SET version = excluded.version, title = excluded.title,
           summary = excluded.summary, items_json = excluded.items_json,
           updated_at = excluded.updated_at`,
      )
      .bind(issue.date),
    db.prepare('SELECT version FROM issues WHERE date = ?').bind(issue.date),
  ])
  const { version } = current.results[0] as { version: number }
  if (!existing.results.length) return { status: 'created', version }
  return { status: inserted.meta.changes ? 'updated' : 'unchanged', version }
}

// Retraction only flips hidden_at; content and versions stay. Returns false for an unknown date.
export async function setHidden(db: D1Database, date: string, hidden: boolean) {
  // COALESCE keeps the first retraction time when a date is retracted twice.
  const result = await db
    .prepare(
      'UPDATE issues SET hidden_at = CASE WHEN ?1 THEN COALESCE(hidden_at, ?2) END WHERE date = ?3',
    )
    .bind(hidden ? 1 : 0, new Date().toISOString(), date)
    .run()
  return result.meta.changes > 0
}

// Workers Cache keeps a news response for a day; the news API purges its tags after each write
// or retraction (src/lib/news-cache.ts). Browsers recheck after a minute.
export const newsCacheControl = 'public, max-age=60, s-maxage=86400'

// Cache tags of one issue: `news` is on every news response, the date tag on its own page.
export const issueCacheTags = (date: string) => ['news', `news-${date}`]

// Groups keep the order in which each tag first appears in the issue.
export function groupByTag(items: NewsItem[]) {
  const groups = new Map<string, NewsItem[]>()
  for (const item of items) groups.set(item.tag, [...(groups.get(item.tag) ?? []), item])
  return [...groups].map(([tag, items]) => ({ tag, items }))
}

export const issueTags = (issue: NewsIssue) => groupByTag(issue.items).map(({ tag }) => tag)

export const newsUrl = (date: string) => `/news/${date}/`
