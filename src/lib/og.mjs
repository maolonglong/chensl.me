// Share cards: the URL and alt text for each page. Imported by BaseLayout, which also runs in the
// Worker for /news/, so this module must stay free of the renderer and of Node APIs.

export const cardWidth = 1200
export const cardHeight = 630

// The fixed cards. /news/<date>/ shares the AI News card, so the Worker never renders an image.
export const fixedCards = {
  home: { title: '陈劭珑的个人网站与技术博客', label: '首页' },
  blog: { title: '技术文章：系统性能、Go/Zig/Rust 与 Agent 工程实践', label: '博客' },
  news: { title: 'AI News：每天 AI 圈发生了什么', label: 'AI 日报' },
  'news-archive': { title: 'AI News 归档', label: 'AI 日报' },
}

export const articleCard = (id) => `blog/${id}`
export const cardPath = (card) => `/og/${card}.png`

// Pages without their own card, such as a future standalone page, use the home card.
export function cardFor(pathname, article) {
  if (article) return articleCard(pathname.replace(/^\/blog\/|\/$/g, ''))
  if (pathname === '/blog/') return 'blog'
  if (pathname.startsWith('/news/archive/')) return 'news-archive'
  if (pathname.startsWith('/news/')) return 'news'
  return 'home'
}
