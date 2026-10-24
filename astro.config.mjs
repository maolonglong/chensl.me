import { defineConfig } from 'astro/config'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import * as pagefind from 'pagefind'
import sitemap from '@astrojs/sitemap'
import cloudflare from '@astrojs/cloudflare'
import { unified } from '@astrojs/markdown-remark'
import remarkMath from 'remark-math'
import { remarkSite, rehypeSite, codeThemes, codeCaption } from './src/lib/markdown.mjs'
import { remarkReadingStats } from './src/lib/reading-time.mjs'
import { siteFonts } from './src/lib/fonts.mjs'
import { siteUrl } from './src/lib/site.mjs'

export default defineConfig({
  site: siteUrl,
  adapter: cloudflare({ imageService: 'compile', prerenderEnvironment: 'node' }),
  session: false,
  fonts: await siteFonts(),
  vite: {
    // Keep JinKai slices as separate cached files: an inlined slice would put its glyphs into
    // the shared stylesheet that every page blocks on.
    build: { assetsInlineLimit: (file) => (file.endsWith('.woff2') ? false : undefined) },
  },
  integrations: [
    // /search/ is an empty form until a visitor types a query, so crawlers get nothing from it.
    sitemap({ filter: (page) => new URL(page).pathname !== '/search/' }),
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
      // Article keyword search for /search/. Only elements marked data-pagefind-body are indexed,
      // which are the article pages; the selectors drop article chrome that is not the article's
      // own text. Pagefind's extended binary segments Chinese text.
      name: 'pagefind',
      hooks: {
        async 'astro:build:done'({ dir, logger }) {
          const { index } = await pagefind.createIndex({
            excludeSelectors: ['.post-meta', '.post-creation-note', '.post-notice', '.toc'],
          })
          const { errors, page_count } = await index.addDirectory({ path: fileURLToPath(dir) })
          if (errors.length) throw new Error(`Pagefind failed: ${errors.join('; ')}`)
          await index.writeFiles({ outputPath: fileURLToPath(new URL('pagefind/', dir)) })
          await pagefind.close()
          logger.info(`Pagefind indexed ${page_count} pages.`)
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
      remarkPlugins: [remarkSite, remarkMath, remarkReadingStats],
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
