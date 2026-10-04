import { defineConfig } from 'astro/config'
import { readFileSync } from 'node:fs'
import sitemap from '@astrojs/sitemap'
import cloudflare from '@astrojs/cloudflare'
import { unified } from '@astrojs/markdown-remark'
import { remarkSite, rehypeSite, codeThemes, codeCaption } from './src/lib/markdown.mjs'
import { siteFonts } from './src/lib/fonts.mjs'

export default defineConfig({
  site: 'https://chensl.me',
  adapter: cloudflare({ imageService: 'compile', prerenderEnvironment: 'node' }),
  session: false,
  fonts: await siteFonts(),
  integrations: [
    sitemap(),
    {
      name: 'theme-bootstrap',
      hooks: {
        'astro:config:setup'({ injectScript }) {
          injectScript(
            'head-inline',
            readFileSync(new URL('./src/scripts/theme-bootstrap.js', import.meta.url), 'utf8'),
          )
        },
      },
    },
    {
      name: 'markdown-images',
      hooks: {
        'astro:config:setup'({ injectRoute }) {
          // Literal extensions keep image URLs slash-free even with trailingSlash: 'always' in dev.
          for (const extension of [
            'avif',
            'gif',
            'jpeg',
            'jpg',
            'png',
            'apng',
            'svg',
            'tiff',
            'webp',
          ]) {
            injectRoute({
              pattern: `/blog/[...image].${extension}`,
              entrypoint: './src/lib/markdown-images.ts',
              prerender: true,
            })
          }
        },
      },
    },
  ],
  output: 'static',
  trailingSlash: 'always',
  compressHTML: true,
  security: {
    csp: {
      directives: [
        "default-src 'self'",
        'frame-src https://giscus.app',
        "connect-src 'self' https://cloudflareinsights.com",
      ],
      scriptDirective: {
        resources: ["'self'", 'https://giscus.app', 'https://static.cloudflareinsights.com'],
      },
      // Shiki, table alignment and the no-script fallback retain inline styles;
      // giscus' client script injects its default stylesheet.
      styleDirective: { resources: ["'self'", 'https://giscus.app', "'unsafe-inline'"] },
    },
  },
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
