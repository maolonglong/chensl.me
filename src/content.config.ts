import { readFile } from 'node:fs/promises'
import { parseFrontmatter } from '@astrojs/markdown-remark'
import { defineCollection } from 'astro:content'
import { glob } from 'astro/loaders'
import { z } from 'astro/zod'
import { parsePostDate, rewriteUnzonedFrontMatter } from './lib/post-date'

// A quoted timestamp is a string, so the file rewrite never sees it as a bare time.
const postDate = z.preprocess(
  (value) => (typeof value === 'string' ? parsePostDate(value) : value),
  z.coerce.date(),
)

const blogLoader = glob({ pattern: '**/*.md', base: './src/content/blog' })
const loadBlog = blogLoader.load
blogLoader.load = (context) =>
  loadBlog({
    ...context,
    // Entries cached before date normalization must pass through parseData again.
    generateDigest: (contents) =>
      context.generateDigest({ contents, postDateTimezone: 'Asia/Shanghai' }),
    parseData: async (entry) => {
      // glob supplies filePath on initial sync, changes and additions.
      const source = await readFile(entry.filePath!, 'utf8')
      const { frontmatter } = parseFrontmatter(rewriteUnzonedFrontMatter(source))
      return context.parseData({
        ...entry,
        data: {
          ...entry.data,
          pubDate: frontmatter.pubDate,
          updatedDate: frontmatter.updatedDate,
        },
      })
    },
  })

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
