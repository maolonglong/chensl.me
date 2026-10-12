import { defineCollection } from 'astro:content'
import { glob } from 'astro/loaders'
import { z } from 'astro/zod'
import { loadWithShanghaiFrontMatter, parsePostDate } from './lib/post-date'

// A quoted timestamp is a string, so the file rewrite never sees it as a bare time.
const postDate = z.preprocess(
  (value) => (typeof value === 'string' ? parsePostDate(value) : value),
  z.coerce.date(),
)

const blogLoader = glob({ pattern: '**/*.md', base: './src/content/blog' })
const loadBlog = blogLoader.load
blogLoader.load = (context) => loadWithShanghaiFrontMatter(() => loadBlog(context))

export const collections = {
  blog: defineCollection({
    loader: blogLoader,
    schema: z.strictObject({
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
    }),
  }),
}
