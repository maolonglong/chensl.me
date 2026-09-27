import { getCollection, type CollectionEntry } from 'astro:content'

export async function publishedPosts() {
  const now = Date.now()
  return (
    await getCollection(
      'blog',
      ({ data }) => import.meta.env.DEV || (!data.draft && data.pubDate.valueOf() <= now),
    )
  ).sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf() || a.id.localeCompare(b.id))
}

export const postUrl = (post: CollectionEntry<'blog'>) => `/blog/${post.id}/`
export const displayDate = (date: Date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
