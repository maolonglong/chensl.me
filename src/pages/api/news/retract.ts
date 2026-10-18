import type { APIRoute } from 'astro'
import { env } from 'cloudflare:workers'
import { queryIssue, retraction, setHidden } from '../../../lib/news'
import { authorizedJson, reply } from '../../../lib/news-api'
import { indexIssue, purgeSearchCache, removeIssue } from '../../../lib/search'

export const prerender = false

// Hides one day's issue from the pages and the feed ({ "date": "YYYY-MM-DD" }), or shows it
// again with "hidden": false. Nothing is deleted from D1; the issue's search vectors are deleted
// on retraction and written again on restore.
export const POST: APIRoute = async ({ request, clientAddress }) => {
  const input = await authorizedJson(request, clientAddress, retraction)
  if ('response' in input) return input.response
  const { date, hidden } = input.data
  if (!(await setHidden(env.NEWS, date, hidden))) return reply(404, { error: 'not_found', date })
  let search
  if (hidden) search = await removeIssue(env, date)
  else {
    const issue = await queryIssue(env.NEWS, date)
    search = issue ? await indexIssue(env, issue) : 'failed'
  }
  await purgeSearchCache()
  return reply(200, { status: hidden ? 'hidden' : 'visible', date, search })
}
