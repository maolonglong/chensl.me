// Share cards: the URL and alt text for each page. Imported by BaseLayout, which also runs in the
// Worker for /news/, so this module must stay free of the renderer and of Node APIs.

export const cardWidth = 1200
export const cardHeight = 630

// The fixed cards. src/layouts/BaseLayout.astro picks one from the page kind.
export const fixedCards = {
  home: { title: '陈劭珑的个人网站与技术博客', label: '首页' },
  blog: { title: '技术文章：系统性能、Go/Zig/Rust 与 Agent 工程实践', label: '博客' },
  news: { title: 'AI News：每天 AI 圈发生了什么', label: 'AI 日报' },
  'news-archive': { title: 'AI News 归档', label: 'AI 日报' },
}

export const articleCard = (id) => `blog/${id}`
export const cardPath = (card) => `/og/${card}.png`
