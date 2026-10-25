import { z } from 'astro/zod'

// A clock time with no offset. A date-only value is not included: UTC midnight is already the
// same Shanghai calendar day on every build machine.
const unzonedTime = /^(\d{4}-\d{2}-\d{2})[Tt ](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)$/

export function parsePostDate(value: string): Date {
  const time = value.trim().match(unzonedTime)
  if (time) return new Date(`${time[1]}T${time[2]}+08:00`)
  return new Date(value)
}

// A quoted timestamp is a string, so the file rewrite never sees it as a bare time.
const postDate = z.preprocess(
  (value) => (typeof value === 'string' ? parsePostDate(value) : value),
  z.coerce.date(),
)

export const blogSchema = z.strictObject({
  title: z.string().trim().min(1),
  description: z.string().optional(),
  pubDate: postDate,
  updatedDate: postDate.optional(),
  draft: z.boolean().default(false),
  comments: z.boolean().default(true),
  creation: z
    .strictObject({
      mode: z.enum(['handmade', 'ai-assisted', 'ai-generated']),
      note: z.string().trim().min(1).optional(),
    })
    .optional(),
})

export function isPublishedPost(
  data: { draft?: unknown; pubDate?: unknown },
  now = Date.now(),
  dev = false,
): boolean {
  if (dev) return true
  if (data.draft === true) return false
  if (data.pubDate instanceof Date) return data.pubDate.valueOf() <= now
  if (typeof data.pubDate === 'string') return parsePostDate(data.pubDate).valueOf() <= now
  return true
}

const frontMatterTime = new RegExp(
  `^(pubDate|updatedDate):[ \\t]*(${unzonedTime.source.slice(1, -1)})([ \\t]*(?:[ \\t]+#.*)?)$`,
  'gm',
)

export function rewriteUnzonedFrontMatter(source: string): string {
  return source.replace(/^---\r?\n[\s\S]*?\r?\n---/, (block) =>
    block.replace(frontMatterTime, '$1: $2+08:00$5'),
  )
}
