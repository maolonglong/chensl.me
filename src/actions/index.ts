import { ActionError, defineAction } from 'astro:actions'
import { z } from 'astro/zod'
import { env } from 'cloudflare:workers'

// Collection IDs are slugs; rejecting other characters keeps path syntax out of the lookup.
const input = z.object({
  postId: z
    .string()
    .regex(/^[a-z0-9_-]+$/)
    .max(200),
})
const visitorCookie = '__Host-blog-voter'
const visitorId = z.uuid()

// Drafts and future posts are not prerendered, so a built page means a published post.
// Asking the assets binding keeps the content store out of the Worker bundle.
// Redirects are not followed: assets redirects /blog/index/ toward the archive, which is not a post.
async function requirePost(postId: string, origin: URL) {
  const page = await env.ASSETS.fetch(new URL(`/blog/${postId}/`, origin), {
    method: 'HEAD',
    redirect: 'manual',
  })
  if (page.status !== 200)
    throw new ActionError({ code: 'NOT_FOUND', message: 'Article not found.' })
}

async function requireQuota(limiter: RateLimit, key: string) {
  const { success } = await limiter.limit({ key })
  if (!success) {
    throw new ActionError({ code: 'TOO_MANY_REQUESTS', message: 'Please try again later.' })
  }
}

const countVotes = (postId: string, visitor: string | null) =>
  env.VOTES.prepare(
    'SELECT COUNT(*) AS count, COALESCE(MAX(visitor_id = ?), 0) AS voted FROM votes WHERE post_id = ?',
  ).bind(visitor, postId)

const toState = (row: { count: number; voted: number } | null) => ({
  count: row!.count,
  voted: Boolean(row!.voted),
})

export const server = {
  getVotes: defineAction({
    input,
    async handler({ postId }, { cookies, clientAddress, url }) {
      await requireQuota(env.READ_LIMITER, clientAddress)
      await requirePost(postId, url)
      const existing = visitorId.safeParse(cookies.get(visitorCookie)?.value)
      // Reads never mint an identity or overwrite one created by a concurrent first vote.
      return toState(await countVotes(postId, existing.success ? existing.data : null).first())
    },
  }),
  upvote: defineAction({
    input,
    async handler({ postId }, { cookies, clientAddress, url }) {
      await requirePost(postId, url)
      await requireQuota(env.VOTE_LIMITER, clientAddress)
      const existing = visitorId.safeParse(cookies.get(visitorCookie)?.value)
      const visitor = existing.success ? existing.data : crypto.randomUUID()
      // One transactional round trip: the count includes this visitor's vote.
      const [, count] = await env.VOTES.batch<{ count: number; voted: number }>([
        env.VOTES.prepare(
          'INSERT INTO votes (post_id, visitor_id) VALUES (?, ?) ON CONFLICT DO NOTHING',
        ).bind(postId, visitor),
        countVotes(postId, visitor),
      ])
      if (!existing.success) {
        cookies.set(visitorCookie, visitor, {
          httpOnly: true,
          secure: true,
          sameSite: 'strict',
          path: '/',
          maxAge: 60 * 60 * 24 * 365,
        })
      }
      return toState(count.results[0])
    },
  }),
}
