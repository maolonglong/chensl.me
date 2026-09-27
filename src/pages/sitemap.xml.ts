import type { APIRoute } from 'astro'
import { publishedPosts, postUrl } from '../lib/posts'

export const GET: APIRoute = async ({ site }) => {
  const posts = await publishedPosts()
  const entries = ['/', '/blog/', ...posts.map(postUrl)]
  const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries.map((url) => `<url><loc>${new URL(url, site).href}</loc></url>`).join('')}</urlset>`
  return new Response(xml, { headers: { 'Content-Type': 'application/xml' } })
}
