import type { APIRoute } from 'astro'
import { env } from 'cloudflare:workers'
import { newsIssue, newsUrl, saveIssue } from '../../lib/news'
import { authorizedJson, reply } from '../../lib/news-api'
import { indexIssue, purgeSearchCache, removeIssue } from '../../lib/search'

export const prerender = false

// Publishes an issue immediately. Each changed write appends a version; see saveIssue.
export const POST: APIRoute = async ({ request, clientAddress }) => {
  const input = await authorizedJson(request, clientAddress, newsIssue)
  if ('response' in input) return input.response
  const { data } = input

  const { status, version, hidden } = await saveIssue(env.NEWS, data)
  // Every accepted write to a visible issue re-embeds it, also an unchanged one, so a resend
  // repairs an index write that failed before. A retracted issue stays out of Vectorize until
  // POST /api/news/retract/ restores it. FTS5 follows through triggers (0003_search.sql).
  const search = hidden ? await removeIssue(env, data.date) : await indexIssue(env, data)
  await purgeSearchCache()
  return reply(status === 'created' ? 201 : 200, {
    status,
    version,
    search,
    date: data.date,
    url: new URL(newsUrl(data.date), request.url).href,
  })
}
