import { defineConfig } from 'astro/config'
import { unified } from '@astrojs/markdown-remark'
import { remarkSite, rehypeSite, codeThemes, codeCaption } from './src/lib/markdown.mjs'

export default defineConfig({
  site: 'https://chensl.me',
  output: 'static',
  trailingSlash: 'always',
  compressHTML: true,
  markdown: {
    processor: unified({
      smartypants: false,
      remarkPlugins: [remarkSite],
      rehypePlugins: [rehypeSite],
      remarkRehype: { footnoteLabel: '脚注', footnoteBackLabel: '返回正文' },
    }),
    shikiConfig: { themes: codeThemes, defaultColor: false, transformers: [codeCaption] },
  },
})
