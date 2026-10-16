import rss from '@astrojs/rss'
import type { APIContext } from 'astro'
import { env } from 'cloudflare:workers'
import { isWebUrl, listIssues, newsCacheControl, newsUrl, type StoredIssue } from '../../lib/news'

export const prerender = false

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!,
  )

// Stored text is plain text, so every value is escaped before it enters the item HTML.
function itemHtml(issue: StoredIssue) {
  const items = issue.items
    .map((item) => {
      const title = escapeHtml(item.title)
      const heading = isWebUrl(item.url) ? `<a href="${escapeHtml(item.url)}">${title}</a>` : title
      return `<li><p><strong>${heading}</strong>（${escapeHtml(item.tag)}）</p><p>${escapeHtml(item.summary)}</p></li>`
    })
    .join('')
  return `<p>${escapeHtml(issue.summary)}</p><ol>${items}</ol>`
}

export async function GET(context: APIContext) {
  const issues = await listIssues(env.NEWS, 20)
  const response = await rss({
    title: '~chensl AI 晚报',
    description: '由 bot 每天整理的 AI 新闻摘要',
    site: new URL('/news/', context.site).href,
    customData: '<language>zh-CN</language>',
    items: issues.map((issue) => ({
      title: `${issue.date}：${issue.title}`,
      description: issue.summary,
      pubDate: new Date(issue.createdAt),
      link: new URL(newsUrl(issue.date), context.site).href,
      content: itemHtml(issue),
    })),
  })
  response.headers.set('Cache-Control', newsCacheControl)
  return response
}
