import type { APIContext } from 'astro'
import { postUrl, publishedPosts } from '../lib/posts'

export const prerender = true

const plainText = (value: string) =>
  value.replace(/\s*\n\s*/g, ' ').replace(/[\\`*_[\]<>]/g, '\\$&')

export async function GET({ site }: APIContext) {
  const articles = (await publishedPosts()).map((post) => {
    const description = post.data.description?.trim()
    return `- [${plainText(post.data.title)}](${new URL(`${postUrl(post)}index.md`, site)})${description ? `: ${plainText(description)}` : ''}`
  })
  // Keep dev responses UTF-8; production static assets rely on public/_headers.
  return new Response(
    ['# ~chensl', '', '> 陈劭珑的个人网站与技术博客', '', '## Articles', '', ...articles, ''].join(
      '\n',
    ),
    { headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
  )
}
