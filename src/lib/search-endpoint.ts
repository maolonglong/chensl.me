import { newsKeywordSearch, semanticEnabled, semanticSearch } from './search'
import { normalizeQuery } from './search-fuse'

// GET /api/search/?q=… returns semantic hits (articles and AI News) and AI News keyword hits.
// Article keyword search runs in the browser with Pagefind. src/worker.ts calls this before the
// Astro handler, which would add several milliseconds of CPU to every request. Each half fails
// on its own: the response then carries an empty list and `partial: true`.
// Search is not cached: Vectorize acceptance does not mean queries can see the new vectors.
export async function handleSearch(request: Request, env: Cloudflare.Env) {
  if (request.method !== 'GET' && request.method !== 'HEAD')
    return reply(405, { error: 'method_not_allowed' }, { Allow: 'GET, HEAD' })
  const query = normalizeQuery(new URL(request.url).searchParams.get('q'))
  if (!query) return reply(400, { error: 'invalid_query' })
  const clientAddress = request.headers.get('cf-connecting-ip') ?? 'unknown'
  const { success } = await env.READ_LIMITER.limit({ key: `search:${clientAddress}` })
  if (!success) return reply(429, { error: 'rate_limited' })

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
      ...(partial && { partial }),
    },
    // A failed AI or Vectorize call shows as partial; this header reports binding availability.
    { 'X-Semantic-Search': semanticEnabled(env) ? 'on' : 'off' },
  )
}

const reply = (
  status: number,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store', ...headers } })
