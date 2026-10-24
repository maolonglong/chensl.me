import type { APIRoute } from 'astro'
import { env } from 'cloudflare:workers'
import { retraction, setHidden } from '../../../lib/news'
import { authorizedJson, reply } from '../../../lib/news-api'
import { purgeIssue } from '../../../lib/news-cache'

export const prerender = false

// Hides one day's issue from the pages, the feed, and search ({ "date": "YYYY-MM-DD" }), or shows
// it again with "hidden": false. Nothing is deleted from D1.
export const POST: APIRoute = async ({ request, clientAddress }) => {
  const input = await authorizedJson(request, clientAddress, retraction)
  if ('response' in input) return input.response
  const { date, hidden } = input.data
  if (!(await setHidden(env.NEWS, date, hidden))) return reply(404, { error: 'not_found', date })
  const cache = await purgeIssue(date)
  return reply(200, { status: hidden ? 'hidden' : 'visible', date, cache })
}
