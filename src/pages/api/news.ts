import type { APIRoute } from 'astro'
import { env } from 'cloudflare:workers'
import { newsIssue, saveIssue } from '../../lib/news'
import { invalid, readAuthorizedJson, reply } from '../../lib/news-api'
import { indexIssue } from '../../lib/search'

export const prerender = false

// Publishes an issue immediately. Each changed write appends a version; see saveIssue.
export const POST: APIRoute = async ({ request, clientAddress }) => {
  const input = await readAuthorizedJson(request, clientAddress)
  if ('response' in input) return input.response
  const parsed = newsIssue.safeParse(input.json)
  if (!parsed.success) return invalid(parsed.error.issues)

  const { status, version } = await saveIssue(env.NEWS, parsed.data)
  // Every accepted write re-embeds the issue, also an unchanged one, so a resend repairs an
  // index write that failed before. FTS5 follows through triggers (migrations/news/0003_search.sql).
  const search = await indexIssue(env, parsed.data)
  return reply(status === 'created' ? 201 : 200, {
    status,
    version,
    search,
    date: parsed.data.date,
    url: new URL(`/news/${parsed.data.date}/`, request.url).href,
  })
}
