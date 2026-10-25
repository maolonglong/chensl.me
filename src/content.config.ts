import { readFile } from 'node:fs/promises'
import { parseFrontmatter } from '@astrojs/markdown-remark'
import { defineCollection } from 'astro:content'
import { glob } from 'astro/loaders'
import { blogSchema, rewriteUnzonedFrontMatter } from './lib/post-date'
import githubRepos from './data/github-repos.json'

const blogLoader = glob({ pattern: '**/*.md', base: './src/content/blog' })
const loadBlog = blogLoader.load
blogLoader.load = (context) =>
  loadBlog({
    ...context,
    // Entries cached before date normalization must pass through parseData again. The rendered
    // repository cards depend on the snapshot file, so a refresh of it renders the entries again.
    generateDigest: (contents) =>
      context.generateDigest({ contents, postDateTimezone: 'Asia/Shanghai', githubRepos }),
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
    schema: blogSchema,
  }),
}
