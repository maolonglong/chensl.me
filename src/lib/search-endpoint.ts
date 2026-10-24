import { newsKeywordSearch, type SearchTiming } from './search'
import { normalizeQuery } from './search-fuse'

// GET /api/search/?q=… returns AI News keyword hits from D1 FTS5.
// Article keyword search runs in the browser with Pagefind. src/worker.ts calls this before the
// Astro handler, which would add several milliseconds of CPU to every request.
export async function handleSearch(request: Request, env: Cloudflare.Env) {
  if (request.method !== 'GET' && request.method !== 'HEAD')
    return reply(405, { error: 'method_not_allowed' }, { Allow: 'GET, HEAD' })
  const query = normalizeQuery(new URL(request.url).searchParams.get('q'))
  if (!query) return reply(400, { error: 'invalid_query' })
  const clientAddress = request.headers.get('cf-connecting-ip') ?? 'unknown'
  const { success } = await env.READ_LIMITER.limit({ key: `search:${clientAddress}` })
  if (!success) return reply(429, { error: 'rate_limited' })

  const timing: SearchTiming = {}
  try {
    const news = await newsKeywordSearch(env.NEWS, query, timing)
    return reply(200, { query, news }, { 'Server-Timing': serverTiming(timing) })
  } catch (error) {
    console.error('search news keyword failed', error)
    return reply(500, { error: 'search_failed' }, { 'Server-Timing': serverTiming(timing) })
  }
}

const reply = (
  status: number,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store', ...headers } })

const serverTiming = (timing: SearchTiming) =>
  timing.d1 !== undefined ? `d1;dur=${Math.round(timing.d1)}` : ''
