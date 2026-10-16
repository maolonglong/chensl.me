import rss from '@astrojs/rss'
import type { APIContext } from 'astro'
import { getLiveCollection } from 'astro:content'
import {
  feedIssueCount,
  isWebUrl,
  issueTags,
  newsCacheControl,
  newsUrl,
  type StoredIssue,
} from '../../lib/news'

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
      return `<li><p>[${escapeHtml(item.tag)}] <strong>${heading}</strong></p><p>${escapeHtml(item.summary)}</p></li>`
    })
    .join('')
  return `<p>${escapeHtml(issue.summary)}</p><ol>${items}</ol>`
}

export async function GET(context: APIContext) {
  const { entries, error } = await getLiveCollection('news', { limit: feedIssueCount })
  if (!entries) throw error
  const issues = entries.map((entry) => entry.data)
  const response = await rss({
    title: '~chensl AI News',
    description: '每天 AI 圈发生了什么：模型、产品和工具的动态摘要',
    site: new URL('/news/', context.site).href,
    customData: '<language>zh-CN</language>',
    items: issues.map((issue) => ({
      title: `${issue.date}：${issue.title}`,
      description: issue.summary,
      pubDate: new Date(issue.createdAt),
      link: new URL(newsUrl(issue.date), context.site).href,
      categories: issueTags(issue),
      content: itemHtml(issue),
    })),
  })
  response.headers.set('Cache-Control', newsCacheControl)
  return response
}
