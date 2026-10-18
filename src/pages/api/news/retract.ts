import type { APIRoute } from 'astro'
import { env } from 'cloudflare:workers'
import { retraction, setHidden } from '../../../lib/news'
import { authorizedJson, reply } from '../../../lib/news-api'
import { syncIssue } from '../../../lib/search'

export const prerender = false

// Hides one day's issue from the pages and the feed ({ "date": "YYYY-MM-DD" }), or shows it
// again with "hidden": false. Nothing is deleted from D1; the issue's search vectors are deleted
// on retraction and written again on restore.
export const POST: APIRoute = async ({ request, clientAddress }) => {
  const input = await authorizedJson(request, clientAddress, retraction)
  if ('response' in input) return input.response
  const { date, hidden } = input.data
  if (!(await setHidden(env.NEWS, date, hidden))) return reply(404, { error: 'not_found', date })
  const search = await syncIssue(env, date)
  return reply(200, { status: hidden ? 'hidden' : 'visible', date, search })
}
