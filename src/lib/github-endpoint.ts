import snapshot from '../data/github-repos.json' with { type: 'json' }
import { repoFields } from './github-repo.mjs'

// GET /api/github/repos/<owner>/<repo>/ returns fresh numbers for a repository card. src/worker.ts
// calls it before the Astro handler, like /api/search/. Workers Cache answers most requests from
// the headers below without running the Worker; this code runs only on a miss or a background
// refresh, so the rate limiter and the GitHub call apply to those.
//
// Only repositories in src/data/github-repos.json, the build snapshot of the cards in articles,
// are served. Any other path, letter case, or query string gets a 404 and never reaches GitHub, so
// the endpoint is not an open proxy and cannot spend the token's quota on arbitrary requests.
const repoPath = /^\/api\/github\/repos\/([a-z0-9-]+\/[a-z0-9._-]+)\/$/
const repos: Record<string, (typeof snapshot)[keyof typeof snapshot]> = snapshot
const upstreamTimeoutMs = 5000

export async function handleGitHubRepo(
  request: Request,
  env: Cloudflare.Env,
  upstream: typeof fetch = fetch,
) {
  if (request.method !== 'GET' && request.method !== 'HEAD')
    return reply(405, { error: 'method_not_allowed' }, uncached, { Allow: 'GET, HEAD' })
  const url = new URL(request.url)
  const key = url.search ? undefined : url.pathname.match(repoPath)?.[1]
  if (!key || !Object.hasOwn(repos, key))
    return reply(404, { error: 'not_found' }, { 'Cache-Control': 'public, max-age=3600' })

  const clientAddress = request.headers.get('cf-connecting-ip') ?? 'unknown'
  const { success } = await env.READ_LIMITER.limit({ key: `github:${clientAddress}` })
  if (!success) return reply(429, { error: 'rate_limited' }, uncached)

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'chensl.me',
    'X-GitHub-Api-Version': '2022-11-28',
  }
  // Local runs have no secret. Without it the request is unauthenticated and shares the
  // Cloudflare egress quota of 60 requests an hour, so it often falls back to the snapshot.
  if (env.GITHUB_TOKEN) headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`
  let status: number | string
  try {
    const response = await upstream(`https://api.github.com/repos/${key}`, {
      headers,
      signal: AbortSignal.timeout(upstreamTimeoutMs),
    })
    status = response.status
    if (response.ok) {
      const fields = repoFields(await response.json())
      if (fields)
        return reply(200, fields, {
          'Cache-Control': 'public, max-age=600',
          'CDN-Cache-Control': 'max-age=3600, stale-while-revalidate=86400',
        })
      status = 'unexpected body'
    } else await response.body?.cancel()
  } catch (error) {
    status = error instanceof Error ? error.name : 'error'
  }
  // The card already shows the snapshot, so the browser keeps it; the short TTL lets the next
  // miss retry GitHub. A background refresh that fails also stores this for five minutes.
  console.error('github repo refresh failed', key, status)
  return reply(200, { ...repos[key], stale: true }, { 'Cache-Control': 'public, max-age=300' })
}

const uncached = { 'Cache-Control': 'private, no-store' }

const reply = (
  status: number,
  body: Record<string, unknown>,
  cache: Record<string, string>,
  headers: Record<string, string> = {},
) => Response.json(body, { status, headers: { ...cache, ...headers } })
