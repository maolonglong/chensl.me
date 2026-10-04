import type { APIContext } from 'astro'
import type { CollectionEntry } from 'astro:content'
import { displayDate, postUrl, publishedPosts } from '../../../lib/posts'

export const prerender = true

export async function getStaticPaths() {
  return (await publishedPosts()).map((post) => ({ params: { id: post.id }, props: { post } }))
}

export function GET({ props, site }: APIContext) {
  const post: CollectionEntry<'blog'> = props.post
  const header = [
    `# ${post.data.title}`,
    '',
    `Published: ${displayDate(post.data.pubDate)}`,
    ...(post.data.updatedDate ? [`Updated: ${displayDate(post.data.updatedDate)}`] : []),
    `Canonical: ${new URL(postUrl(post), site)}`,
  ].join('\n')
  // Keep dev responses UTF-8; production static assets rely on public/_headers.
  return new Response(`${header}\n\n${post.body ?? ''}`, {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  })
}
