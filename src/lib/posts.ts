import { getCollection, type CollectionEntry } from 'astro:content'
import { isPublishedPost } from './post-date'

export const creationLabels = {
  handmade: '手作',
  'ai-assisted': 'AI 辅助',
  'ai-generated': 'AI 生成',
}

export const escapeMarkdownText = (value: string) =>
  value.replace(/\s*\n\s*/g, ' ').replace(/[\\`*_[\]<>]/g, '\\$&')

export async function publishedPosts() {
  const now = Date.now()
  const posts = await getCollection('blog', ({ data }) =>
    isPublishedPost(data, now, import.meta.env.DEV),
  )
  // The glob loader only logs a render error, such as invalid TeX, and keeps the entry without
  // `rendered`. Publishing it would ship an empty article, so stop instead.
  const failed = posts.find((post) => !post.rendered)
  if (failed) throw new Error(`${failed.filePath} failed to render; see the error logged above.`)
  return posts.sort(
    (a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf() || a.id.localeCompare(b.id),
  )
}

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export const postUrl = (post: CollectionEntry<'blog'>) => `/blog/${post.id}/`
export const displayDate = (date: Date) => dateFormatter.format(date)
