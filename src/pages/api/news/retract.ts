import type { APIRoute } from 'astro'
import { env } from 'cloudflare:workers'
import { retraction, setHidden } from '../../../lib/news'
import { invalid, readAuthorizedJson, reply } from '../../../lib/news-api'

export const prerender = false

// Hides one day's issue from the pages and the feed ({ "date": "YYYY-MM-DD" }), or shows it
// again with "hidden": false. Nothing is deleted.
export const POST: APIRoute = async ({ request, clientAddress }) => {
  const input = await readAuthorizedJson(request, clientAddress)
  if ('response' in input) return input.response
  const parsed = retraction.safeParse(input.json)
  if (!parsed.success) return invalid(parsed.error.issues)

  const { date, hidden } = parsed.data
  if (!(await setHidden(env.NEWS, date, hidden))) return reply(404, { error: 'not_found', date })
  return reply(200, { status: hidden ? 'hidden' : 'visible', date })
}
