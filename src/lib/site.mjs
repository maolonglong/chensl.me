// The site's identity. The layout, the feeds, llms.txt, and the share cards read these, so a
// rename changes one file.
export const siteTitle = '~chensl'
export const siteDescription = '陈劭珑的个人网站与技术博客'
// astro.config.mjs sets `site` from siteUrl. Astro code reads it as Astro.site; modules that also
// run in plain Node, such as the share-card renderer, import siteUrl.
export const siteUrl = 'https://chensl.me'
export const newsFeedTitle = '~chensl AI News'
export const newsDescription = '每天 AI 圈发生了什么：模型、产品和工具的动态摘要'
