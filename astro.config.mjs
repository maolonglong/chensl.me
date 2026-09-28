import { defineConfig } from 'astro/config'
import sitemap from '@astrojs/sitemap'
import { unified } from '@astrojs/markdown-remark'
import { remarkSite, rehypeSite, codeThemes, codeCaption } from './src/lib/markdown.mjs'
import { siteFonts } from './src/lib/fonts.mjs'

export default defineConfig({
  site: 'https://chensl.me',
  fonts: await siteFonts(),
  integrations: [sitemap()],
  output: 'static',
  trailingSlash: 'always',
  compressHTML: true,
  markdown: {
    processor: unified({
      smartypants: false,
      remarkPlugins: [remarkSite],
      rehypePlugins: [rehypeSite],
      remarkRehype: {
        footnoteLabel: '脚注',
        footnoteBackLabel(referenceIndex, rereferenceIndex) {
          return `返回正文中脚注 ${referenceIndex + 1} 的${rereferenceIndex > 1 ? `第 ${rereferenceIndex} 次` : ''}引用`
        },
        footnoteLabelTagName: 'span',
        footnoteLabelProperties: { className: ['visually-hidden'] },
      },
    }),
    shikiConfig: { themes: codeThemes, defaultColor: false, transformers: [codeCaption] },
  },
})
