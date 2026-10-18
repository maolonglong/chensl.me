import type { APIRoute } from 'astro'
import { env } from 'cloudflare:workers'
import { queryIssue, retraction, setHidden } from '../../../lib/news'
import { authorizedJson, reply } from '../../../lib/news-api'
import { purgeIssue } from '../../../lib/news-cache'
import { syncIssue, type IndexResult } from '../../../lib/search'

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
  const cache = await purgeIssue(date)
  return reply(200, { status: await finalStatus(date, search), date, search, cache })
}

// A concurrent retraction or restore can win after this request's update. Report the D1 state
// that the index sync ended on, not this request's intent.
async function finalStatus(date: string, search: IndexResult) {
  if (search === 'indexed') return 'visible'
  if (search === 'removed') return 'hidden'
  return (await queryIssue(env.NEWS, date)) ? 'visible' : 'hidden'
}
