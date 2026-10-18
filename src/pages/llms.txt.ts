import type { APIContext } from 'astro'
import { escapeMarkdownText, postUrl, publishedPosts } from '../lib/posts'
import { siteDescription, siteTitle } from '../lib/site.mjs'

export const prerender = true

export async function GET({ site }: APIContext) {
  const articles = (await publishedPosts()).map((post) => {
    const description = post.data.description?.trim()
    return `- [${escapeMarkdownText(post.data.title)}](${new URL(`${postUrl(post)}index.md`, site)})${description ? `: ${escapeMarkdownText(description)}` : ''}`
  })
  // Keep dev responses UTF-8; production static assets rely on public/_headers.
  return new Response(
    [`# ${siteTitle}`, '', `> ${siteDescription}`, '', '## Articles', '', ...articles, ''].join(
      '\n',
    ),
    { headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
  )
}
