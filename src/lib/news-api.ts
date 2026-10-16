import { env } from 'cloudflare:workers'

const maxBodyBytes = 64 * 1024
const headers = { 'Cache-Control': 'private, no-store' }

export const reply = (status: number, body: Record<string, unknown>) =>
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

// Shared gate for the bot's write endpoints: rate limit, NEWS_TOKEN bearer auth, JSON only,
// 64 KB at most. Returns the parsed JSON body, or the error Response to send.
export async function readAuthorizedJson(
  request: Request,
  clientAddress: string,
): Promise<{ json: unknown } | { response: Response }> {
  // Read the body before any early response: local Wrangler dropped the connection when a
  // response left the request body unread.
  const body = await request.text()
  // The limiter runs before authentication, so it also slows token guessing.
  const { success } = await env.VOTE_LIMITER.limit({ key: `news:${clientAddress}` })
  if (!success) return { response: reply(429, { error: 'rate_limited' }) }

  const expected = env.NEWS_TOKEN
  if (!expected) return { response: reply(503, { error: 'not_configured' }) }
  const authorization = request.headers.get('authorization') ?? ''
  const token = authorization.match(/^Bearer (\S+)$/)?.[1] ?? ''
  if (!(await tokenMatches(token, expected))) {
    return {
      response: Response.json(
        { error: 'unauthorized' },
        { status: 401, headers: { ...headers, 'WWW-Authenticate': 'Bearer' } },
      ),
    }
  }

  if (!/^application\/json\b/i.test(request.headers.get('content-type') ?? '')) {
    return { response: reply(415, { error: 'unsupported_media_type' }) }
  }
  if (new TextEncoder().encode(body).byteLength > maxBodyBytes) {
    return { response: reply(413, { error: 'payload_too_large' }) }
  }
  try {
    return { json: JSON.parse(body) }
  } catch {
    return { response: reply(400, { error: 'invalid_json' }) }
  }
}

export const invalid = (issues: { path: PropertyKey[]; message: string }[]) =>
  reply(422, {
    error: 'invalid_request',
    issues: issues.map(({ path, message }) => ({ path, message })),
  })
