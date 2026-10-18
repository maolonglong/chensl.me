import type { APIRoute } from 'astro'
import { env } from 'cloudflare:workers'
import { newsIssue, newsUrl, saveIssue } from '../../lib/news'
import { authorizedJson, reply } from '../../lib/news-api'
import { purgeIssue } from '../../lib/news-cache'
import { syncIssue } from '../../lib/search'

export const prerender = false

// Publishes an issue immediately. Each changed write appends a version; see saveIssue.
export const POST: APIRoute = async ({ request, clientAddress }) => {
  const input = await authorizedJson(request, clientAddress, newsIssue)
  if ('response' in input) return input.response
  const { data } = input

  const { status, version } = await saveIssue(env.NEWS, data)
  // An unchanged resend also repairs a failed index write. D1, not this request's payload,
  // decides the version and visibility to index after concurrent writes.
  const search = await syncIssue(env, data.date)
  // An unchanged resend purges again, which repairs a failed purge.
  const cache = await purgeIssue(data.date)
  return reply(status === 'created' ? 201 : 200, {
    status,
    version,
    search,
    cache,
    date: data.date,
    url: new URL(newsUrl(data.date), request.url).href,
  })
}
