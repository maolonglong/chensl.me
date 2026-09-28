import { ActionError, defineAction } from 'astro:actions'
import { getEntry } from 'astro:content'
import { z } from 'astro/zod'
import { env } from 'cloudflare:workers'

const input = z.object({ postId: z.string().min(1).max(200) })
const visitorCookie = '__Host-blog-voter'
const visitorId = z.uuid()

async function requirePost(postId: string) {
  const post = await getEntry('blog', postId)
  if (!post || post.data.draft || post.data.pubDate.valueOf() > Date.now()) {
    throw new ActionError({ code: 'NOT_FOUND', message: 'Article not found.' })
  }
}

async function readVotes(postId: string, visitor: string) {
  const row = await env.VOTES.prepare(
    'SELECT COUNT(*) AS count, COALESCE(MAX(visitor_id = ?), 0) AS voted FROM votes WHERE post_id = ?',
  )
    .bind(visitor, postId)
    .first<{ count: number; voted: number }>()
  return { count: row!.count, voted: Boolean(row!.voted) }
}

export const server = {
  getVotes: defineAction({
    input,
    async handler({ postId }, { cookies }) {
      await requirePost(postId)
      const existing = visitorId.safeParse(cookies.get(visitorCookie)?.value)
      const visitor = existing.success ? existing.data : crypto.randomUUID()
      const state = await readVotes(postId, visitor)
      cookies.set(visitorCookie, visitor, {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        path: '/',
        maxAge: 60 * 60 * 24 * 365,
      })
      return state
    },
  }),
  upvote: defineAction({
    input,
    async handler({ postId }, { cookies, clientAddress }) {
      await requirePost(postId)
      const visitor = visitorId.safeParse(cookies.get(visitorCookie)?.value)
      if (!visitor.success) {
        throw new ActionError({ code: 'FORBIDDEN', message: 'Cookies are required to vote.' })
      }
      const { success } = await env.VOTE_LIMITER.limit({ key: clientAddress })
      if (!success) {
        throw new ActionError({ code: 'TOO_MANY_REQUESTS', message: 'Please try again later.' })
      }
      await env.VOTES.prepare(
        'INSERT INTO votes (post_id, visitor_id) VALUES (?, ?) ON CONFLICT DO NOTHING',
      )
        .bind(postId, visitor.data)
        .run()
      return readVotes(postId, visitor.data)
    },
  }),
}
