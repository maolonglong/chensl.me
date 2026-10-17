import type { APIRoute } from 'astro'
import { env } from 'cloudflare:workers'
import {
  newsKeywordSearch,
  normalizeQuery,
  semanticEnabled,
  semanticSearch,
} from '../../lib/search'

export const prerender = false

// GET /api/search/?q=… returns semantic hits (articles and AI News) and AI News keyword hits.
// Article keyword search runs in the browser with Pagefind. Each half fails on its own: the
// response then carries an empty list and `partial: true`, and is not cached.
export const GET: APIRoute = async ({ url, clientAddress }) => {
  const query = normalizeQuery(url.searchParams.get('q'))
  if (!query) return reply(400, { error: 'invalid_query' }, 'private, no-store')
  // Workers Cache answers repeated queries before this code runs, so the limiter counts misses.
  const { success } = await env.READ_LIMITER.limit({ key: `search:${clientAddress}` })
  if (!success) return reply(429, { error: 'rate_limited' }, 'private, no-store')

  const settle = async <T>(work: Promise<T>, label: string) => {
    try {
      return await work
    } catch (error) {
      console.error(`search ${label} failed`, error)
      return null
    }
  }
  const [semantic, news] = await Promise.all([
    settle(semanticSearch(env, query), 'semantic'),
    settle(newsKeywordSearch(env.NEWS, query), 'news keyword'),
  ])
  const partial = semantic === null || news === null
  return reply(
    200,
    {
      query,
      semantic: semantic ?? [],
      news: news ?? [],
      semanticEnabled: semanticEnabled(env),
      ...(partial && { partial }),
    },
    partial ? 'private, no-store' : 'public, max-age=60, s-maxage=300',
  )
}

const reply = (status: number, body: Record<string, unknown>, cacheControl: string) =>
  Response.json(body, { status, headers: { 'Cache-Control': cacheControl } })
