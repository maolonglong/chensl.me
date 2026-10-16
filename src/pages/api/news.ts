import type { APIRoute } from 'astro'
import { env } from 'cloudflare:workers'
import { newsIssue, saveIssue } from '../../lib/news'

export const prerender = false

const maxBodyBytes = 64 * 1024
const headers = { 'Cache-Control': 'private, no-store' }
const reply = (status: number, body: Record<string, unknown>) =>
  Response.json(body, { status, headers })

// Both sides are hashed to a fixed length first, so the comparison time reveals neither the
// token nor its length.
async function tokenMatches(provided: string, expected: string) {
  const encoder = new TextEncoder()
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(provided)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ])
  return crypto.subtle.timingSafeEqual(a, b)
}

export const POST: APIRoute = async ({ request, clientAddress }) => {
  // Read the body before any early response: local Wrangler dropped the connection when a
  // response left the request body unread.
  const body = await request.text()
  // The limiter runs before authentication, so it also slows token guessing.
  const { success } = await env.VOTE_LIMITER.limit({ key: `news:${clientAddress}` })
  if (!success) return reply(429, { error: 'rate_limited' })

  const expected = env.NEWS_TOKEN
  if (!expected) return reply(503, { error: 'not_configured' })
  const authorization = request.headers.get('authorization') ?? ''
  const token = authorization.match(/^Bearer (\S+)$/)?.[1] ?? ''
  if (!(await tokenMatches(token, expected))) {
    return Response.json(
      { error: 'unauthorized' },
      { status: 401, headers: { ...headers, 'WWW-Authenticate': 'Bearer' } },
    )
  }

  if (!/^application\/json\b/i.test(request.headers.get('content-type') ?? '')) {
    return reply(415, { error: 'unsupported_media_type' })
  }
  if (new TextEncoder().encode(body).byteLength > maxBodyBytes) {
    return reply(413, { error: 'payload_too_large' })
  }
  let json: unknown
  try {
    json = JSON.parse(body)
  } catch {
    return reply(400, { error: 'invalid_json' })
  }
  const parsed = newsIssue.safeParse(json)
  if (!parsed.success) {
    return reply(422, {
      error: 'invalid_issue',
      issues: parsed.error.issues.map(({ path, message }) => ({ path, message })),
    })
  }

  const status = await saveIssue(env.NEWS, parsed.data)
  return reply(status === 'created' ? 201 : 200, {
    status,
    date: parsed.data.date,
    url: new URL(`/news/${parsed.data.date}/`, request.url).href,
  })
}
