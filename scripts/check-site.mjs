import { existsSync } from 'node:fs'
import { open, readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { createMarkdownProcessor } from '@astrojs/markdown-remark'
import rehypeParse from 'rehype-parse'
import { unified } from 'unified'
import { visit } from 'unist-util-visit'
import { cardHeight, cardWidth } from '../src/lib/og.mjs'
import { isPostId } from '../src/lib/post-id.mjs'
import { articleInputs } from './search-inputs.mjs'

const root = process.cwd()
const outputDir = path.resolve(root, process.argv[2] ?? 'dist')
const errors = []

async function walk(directory) {
  return (await readdir(directory, { recursive: true, withFileTypes: true }))
    .filter((entry) => !entry.isDirectory())
    .map((entry) => path.join(entry.parentPath, entry.name))
}

// The HTML parser decodes character references, so attribute values arrive as browsers read them.
const htmlParser = unified().use(rehypeParse)
const parseHtml = (html) => htmlParser.parse(html)

function elements(tree, tagNames) {
  const found = []
  visit(tree, 'element', (node) => {
    if (tagNames.includes(node.tagName)) found.push(node)
  })
  return found
}

function pageUrlFor(file) {
  const relative = path.relative(outputDir, file).split(path.sep).join('/')
  const page = relative.endsWith('index.html') ? relative.slice(0, -'index.html'.length) : relative
  return `${siteOrigin}/${page}`
}

// Resolves an attribute value against its page; null when the value is not a valid URL.
const resolveUrl = (value, file) => URL.parse(value, pageUrlFor(file))

function isInternalUrl(value, file) {
  const url = resolveUrl(value, file)
  // A malformed URL counts as internal so internalReferenceError reports it.
  return (
    !url || ((url.protocol === 'http:' || url.protocol === 'https:') && url.origin === siteOrigin)
  )
}

function internalReferenceError(value, file) {
  const url = resolveUrl(value, file)
  if (!url) {
    return `contains malformed URL ${JSON.stringify(value)}`
  }

  let relative
  try {
    relative = decodeURIComponent(url.pathname).replace(/^\/+/, '')
  } catch {
    return `contains malformed URL encoding ${JSON.stringify(value)}`
  }

  const candidates = new Set([relative])
  if (!relative || relative.endsWith('/')) {
    candidates.add(path.posix.join(relative, 'index.html'))
  } else if (!path.posix.extname(relative)) {
    candidates.add(path.posix.join(relative, 'index.html'))
    candidates.add(`${relative}.html`)
  }
  const target = [...candidates].find((candidate) => outputFiles.has(candidate))
  // The Worker renders /news/ on request from D1, so those pages are never in the build.
  if (
    !target &&
    /^news\/(?:$|\d{4}-\d{2}-\d{2}\/$|index\.xml$|archive\/(?:\d{4}-\d{2}\/)?$)/.test(relative)
  )
    return null
  if (!target) {
    return `references missing internal URL ${JSON.stringify(value)}`
  }

  if (!url.hash || !target.endsWith('.html') || url.hash.startsWith('#:~:text=')) {
    return null
  }

  let fragment
  try {
    fragment = decodeURIComponent(url.hash.slice(1))
  } catch {
    return `contains malformed URL fragment ${JSON.stringify(value)}`
  }
  if (fragment && !anchorsByFile.get(target)?.has(fragment)) {
    return `references missing internal anchor ${JSON.stringify(value)}`
  }
  return null
}

if (!existsSync(outputDir)) {
  console.error(`${outputDir} does not exist; build the site before running checks.`)
  process.exit(1)
}

const files = await walk(outputDir)
const outputFiles = new Set(
  files.map((file) => path.relative(outputDir, file).split(path.sep).join('/')),
)
for (const required of [
  'index.html',
  'blog/index.html',
  '404.html',
  'index.xml',
  'llms.txt',
  '_headers',
]) {
  if (!outputFiles.has(required)) {
    errors.push(`Missing required output dist/${required}`)
  }
}

const htmlFiles = files.filter((file) => file.endsWith('.html'))
const treeByFile = new Map(
  await Promise.all(htmlFiles.map(async (file) => [file, parseHtml(await readFile(file, 'utf8'))])),
)
// One pass per page collects what the checks below read, so each tree is walked once.
const hasClass = (node, name) => node.properties.className?.includes(name)
const pages = new Map()
const anchorsByFile = new Map()
for (const [file, tree] of treeByFile) {
  const page = { references: [], metas: [], hasHeader: false, footer: null }
  const anchors = new Set()
  visit(tree, 'element', (node) => {
    const { tagName, properties } = node
    if (properties.id) anchors.add(properties.id)
    if (tagName === 'a' && properties.name) anchors.add(properties.name)
    if (tagName === 'a' || tagName === 'img' || tagName === 'link' || tagName === 'script') {
      page.references.push(node)
    } else if (tagName === 'meta') {
      page.metas.push(node)
    } else if (tagName === 'header' && hasClass(node, 'site-header')) {
      page.hasHeader = true
    } else if (tagName === 'footer' && hasClass(node, 'site-footer')) {
      page.footer = node
    }
  })
  pages.set(file, page)
  anchorsByFile.set(path.relative(outputDir, file).split(path.sep).join('/'), anchors)
}
const homeTree = treeByFile.get(path.join(outputDir, 'index.html'))
const canonicalUrl = (homeTree ? elements(homeTree, ['link']) : []).find((link) =>
  link.properties.rel?.some((value) => value.toLowerCase() === 'canonical'),
)?.properties.href
const canonical = URL.parse(canonicalUrl)
if (!canonical) {
  errors.push('Unable to determine the site origin from the dist/index.html canonical URL')
}
const siteOrigin = canonical?.origin ?? 'https://site.invalid'

const headers = outputFiles.has('_headers')
  ? await readFile(path.join(outputDir, '_headers'), 'utf8')
  : ''
// The indented header lines under one `_headers` route.
const headerRule = (route) =>
  headers.match(
    new RegExp(`^${route.replace(/[.*]/g, '\\$&')}\\s*\\n((?:[ \\t].*(?:\\n|$))*)`, 'm'),
  )?.[1] ?? ''
// The source list of one CSP directive; empty when the policy does not set it.
const sources = (policy, directive) =>
  policy
    ?.match(new RegExp(`(?:^|;)\\s*${directive}\\s+([^;]+)`, 'i'))?.[1]
    .trim()
    .split(/\s+/) ?? []
const csp = headerRule('/*').match(/^\s*Content-Security-Policy:\s*(.+)$/im)?.[1]
const imgSourceTokens = sources(csp, 'img-src')
if (!imgSourceTokens.length) {
  errors.push('dist/_headers must define img-src in the global Content-Security-Policy')
}
for (const [directive, source] of [
  ['frame-src', 'https://giscus.app'],
  ['connect-src', 'https://cloudflareinsights.com'],
]) {
  if (!sources(csp, directive).includes(source)) {
    errors.push(`dist/_headers CSP ${directive} must allow ${source}`)
  }
}
// Header and meta policies are enforced independently, not merged as allowlists.
for (const [file, page] of pages) {
  const policies = [csp]
  for (const meta of page.metas) {
    if (meta.properties.httpEquiv?.join(' ').toLowerCase() === 'content-security-policy') {
      policies.push(meta.properties.content ?? '')
    }
  }
  const scriptPolicies = policies.filter((policy) =>
    /(?:^|;)\s*(?:script-src|default-src)\s/.test(policy ?? ''),
  )
  if (!scriptPolicies.length) errors.push(`${file} needs a hash-based script CSP`)
  for (const policy of scriptPolicies) {
    const scriptSources = sources(policy, 'script-src')
    const tokens = scriptSources.length ? scriptSources : sources(policy, 'default-src')
    if (
      tokens.includes("'unsafe-inline'") ||
      tokens.includes("'unsafe-eval'") ||
      !tokens.some((token) => /^'sha(?:256|384|512)-[^']+'$/.test(token))
    ) {
      errors.push(`${file} needs a hash-based script CSP without unsafe-inline or unsafe-eval`)
    }
    for (const source of ['https://giscus.app', 'https://static.cloudflareinsights.com']) {
      if (!tokens.includes(source)) errors.push(`${file} CSP script-src must allow ${source}`)
    }
    // Pagefind compiles WebAssembly, which needs this source; no other page runs WebAssembly.
    const isSearchPage = path.relative(outputDir, file) === path.join('search', 'index.html')
    if (tokens.includes("'wasm-unsafe-eval'") !== isSearchPage) {
      errors.push(
        isSearchPage
          ? `${file} CSP script-src must allow 'wasm-unsafe-eval' for Pagefind`
          : `${file} CSP script-src must not allow 'wasm-unsafe-eval' outside /search/`,
      )
    }
  }
}
// Workers Assets defaults to `max-age=0, must-revalidate`, which would revalidate every font.
// Cloudflare joins the values of every rule that matches a path, and the Cloudflare adapter
// prepends its own /_astro/* rule, so count the Cache-Control values that one path receives.
const routeMatches = (route, pathname) =>
  new RegExp(
    `^${route
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replaceAll('*', '.*')
      .replace(/:\w+/g, '[^/]+')}$`,
  ).test(pathname)
for (const pathname of ['/_astro/fonts/font.woff2', '/css/style.css']) {
  const values = [...headers.matchAll(/^(\/\S*)[ \t]*\n((?:[ \t].*(?:\n|$))*)/gm)]
    .filter(([, route]) => routeMatches(route, pathname))
    .flatMap(([, , lines]) => [...lines.matchAll(/^\s*Cache-Control:\s*(.*)$/gim)])
    .map(([, value]) => value)
  if (values.length !== 1 || !/\bimmutable\b/.test(values[0])) {
    errors.push(
      `dist/_headers must give ${pathname} one immutable Cache-Control, not ${JSON.stringify(values)}`,
    )
  }
}
if (!/^\s*Access-Control-Allow-Origin:\s*\*\s*$/im.test(headerRule('/css/*'))) {
  errors.push('dist/_headers must allow cross-origin CSS so giscus can load its custom themes')
}
for (const [file, page] of pages) {
  const relative = path.relative(root, file)
  for (const { tagName, properties } of page.references) {
    const url = tagName === 'a' || tagName === 'link' ? properties.href : properties.src
    if (url && isInternalUrl(url, file)) {
      const error = internalReferenceError(url, file)
      if (error) {
        errors.push(`${relative} ${error}`)
      }
    }

    if (tagName !== 'img') {
      continue
    }
    if (!properties.alt?.trim()) {
      errors.push(`${relative} contains an image without descriptive alt text`)
    }
    if (properties.loading !== 'lazy' || properties.decoding !== 'async') {
      errors.push(`${relative} contains an image without lazy loading and async decoding`)
    }
    const src = properties.src ?? ''
    const imageUrl = resolveUrl(src, file)
    // ponytail: supports our CSP's self/data/exact HTTPS origins; extend with tests before adopting wildcards or path sources.
    const imageAllowed =
      imageUrl &&
      ((imageUrl.origin === siteOrigin && imgSourceTokens.includes("'self'")) ||
        (imageUrl.protocol === 'data:' && imgSourceTokens.includes('data:')) ||
        (imageUrl.protocol === 'https:' && imgSourceTokens.includes(imageUrl.origin)))
    if (!imageAllowed) {
      errors.push(`${relative} contains an image blocked by CSP img-src: ${JSON.stringify(src)}`)
    }
    if (
      isInternalUrl(src, file) &&
      !imageUrl?.pathname.toLowerCase().endsWith('.svg') &&
      (properties.width == null || properties.height == null)
    ) {
      errors.push(
        `${relative} contains a local image without intrinsic dimensions: ${JSON.stringify(src)}`,
      )
    }
  }

  for (const meta of page.metas) {
    const key = (meta.properties.property ?? meta.properties.name ?? '').toLowerCase()
    const value = meta.properties.content
    if ((key === 'og:image' || key === 'twitter:image') && value && isInternalUrl(value, file)) {
      const error = internalReferenceError(value, file)
      if (error) errors.push(`${relative} ${error}`)
    }
  }
}

// The footer is where readers find the article feed, so every prerendered page with the site
// header links it there. AI News pages render in the Worker and link their own feed instead
// (e2e/news.spec.mjs).
for (const [file, page] of pages) {
  if (!page.hasHeader) continue
  const feeds = (page.footer ? elements(page.footer, ['a']) : []).filter(
    ({ properties }) => properties.type === 'application/rss+xml',
  )
  if (feeds.length !== 1 || feeds[0].properties.href !== '/index.xml') {
    const relative = path.relative(outputDir, file).split(path.sep).join('/')
    errors.push(`${relative} footer must link the article feed /index.xml once`)
  }
}

// Every article shares its own build-time card. Crawlers read the size from the meta tags, so the
// PNG header must match them.
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
async function pngSize(file) {
  const handle = await open(file, 'r')
  try {
    const bytes = Buffer.alloc(24)
    const { bytesRead } = await handle.read(bytes, 0, 24, 0)
    if (bytesRead < 24 || !bytes.subarray(0, 8).equals(pngSignature)) return null
    return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)]
  } finally {
    await handle.close()
  }
}
const articleCards = new Map()
for (const [file, page] of pages) {
  const relative = path.relative(outputDir, file).split(path.sep).join('/')
  if (!/^blog\/[^/]+\/index\.html$/.test(relative)) continue
  const meta = Object.fromEntries(
    page.metas.map(({ properties }) => [
      (properties.property ?? properties.name ?? '').toLowerCase(),
      properties.content,
    ]),
  )
  const image = meta['og:image'] && resolveUrl(meta['og:image'], file)
  const target = image && image.origin === siteOrigin && decodeURIComponent(image.pathname).slice(1)
  if (!target || !outputFiles.has(target)) {
    errors.push(`${relative} needs an og:image that is a built file`)
    continue
  }
  const size = await pngSize(path.join(outputDir, target))
  if (!size || size[0] !== cardWidth || size[1] !== cardHeight) {
    errors.push(
      `${relative} og:image ${target} must be a ${cardWidth}x${cardHeight} PNG, not ${size?.join('x') ?? 'another format'}`,
    )
  }
  if (
    meta['og:image:width'] !== String(cardWidth) ||
    meta['og:image:height'] !== String(cardHeight)
  ) {
    errors.push(
      `${relative} must declare og:image:width ${cardWidth} and og:image:height ${cardHeight}`,
    )
  }
  if (articleCards.has(target)) {
    errors.push(`${relative} shares its og:image ${target} with ${articleCards.get(target)}`)
  }
  articleCards.set(target, relative)
}

const markdownFiles = new Set([...outputFiles].filter((file) => /^blog\/.+\/index\.md$/.test(file)))
// Local Wrangler adds UTF-8 to text/* automatically, masking missing production headers.
for (const [route, type] of [
  ['/llms.txt', 'text/plain'],
  ['/blog/*/index.md', 'text/markdown'],
]) {
  const rule = headerRule(route)
  if (!new RegExp(`^\\s*Content-Type:\\s*${type};\\s*charset=utf-8\\s*$`, 'im').test(rule)) {
    errors.push(`dist/_headers must set ${type}; charset=utf-8 for ${route}`)
  }
}
// Validate with the same Astro Markdown engine used by the site, so reference images and HTML
// are checked while examples inside code stay literal. This never rewrites the exported body.
const markdownProcessor = await createMarkdownProcessor({
  syntaxHighlight: false,
  smartypants: false,
})
for (const markdown of markdownFiles) {
  const file = path.join(outputDir, markdown)
  const { code } = await markdownProcessor.render(await readFile(file, 'utf8'))
  for (const image of elements(parseHtml(code), ['img'])) {
    const src = image.properties.src ?? ''
    if (isInternalUrl(src, file)) {
      const error = internalReferenceError(src, file)
      if (error) errors.push(`${markdown} ${error}`)
    }
  }
}
for (const file of files.filter((file) => file.endsWith('.xml'))) {
  // Feed items carry escaped HTML, so parse the decoded text once more.
  const feed = parseHtml(await readFile(file, 'utf8'))
  let text = ''
  visit(feed, 'text', (node) => {
    text += node.value
  })
  for (const image of [...elements(feed, ['img']), ...elements(parseHtml(text), ['img'])]) {
    const src = image.properties.src ?? ''
    if (!/^(?:https?:|data:)/i.test(src)) {
      errors.push(
        `${path.relative(root, file)} contains non-absolute RSS image URL ${JSON.stringify(src)}`,
      )
    }
  }
}

// Search: Pagefind indexes every article, and every article has an embedding entry, which
// scripts/embed-posts.mjs writes. A changed article keeps its old entry until the next run, so
// a stale entry is only a warning; a missing one leaves the article out of semantic search.
if (outputFiles.has('search/index.html')) {
  const articles = await articleInputs(outputDir)
  const articleCount = articles.length
  const entry = outputFiles.has('pagefind/pagefind-entry.json')
    ? JSON.parse(await readFile(path.join(outputDir, 'pagefind/pagefind-entry.json'), 'utf8'))
    : null
  const indexed = Object.values(entry?.languages ?? {}).reduce(
    (sum, language) => sum + language.page_count,
    0,
  )
  if (indexed !== articleCount) {
    errors.push(`Pagefind indexed ${indexed} pages; the build has ${articleCount} articles`)
  }
  const relatedFile = path.join(root, 'src/data/related-posts.json')
  const { posts } = existsSync(relatedFile)
    ? JSON.parse(await readFile(relatedFile, 'utf8'))
    : { posts: {} }
  const changed = []
  for (const { id, hash } of articles) {
    if (!posts[id]) {
      errors.push(
        `Article ${id} has no entry in src/data/related-posts.json: run scripts/embed-posts.mjs`,
      )
    } else if (posts[id].hash !== hash) changed.push(id)
  }
  if (changed.length) {
    console.warn(
      `Warning: articles changed since their embedding (${changed.join(', ')}); run scripts/embed-posts.mjs`,
    )
  }
}

// The Worker serves fresh data only for repositories in the card snapshot
// (src/lib/github-endpoint.ts). An entry that no article shows as a card would keep an unused
// repository open to the endpoint.
const githubReposFile = path.join(root, 'src/data/github-repos.json')
if (existsSync(githubReposFile)) {
  const shown = new Set()
  for (const tree of treeByFile.values()) {
    visit(tree, 'element', (node) => {
      if (hasClass(node, 'repo-card') && node.properties.dataRepo)
        shown.add(node.properties.dataRepo)
    })
  }
  for (const key of Object.keys(JSON.parse(await readFile(githubReposFile, 'utf8')))) {
    if (!shown.has(key))
      errors.push(
        `${key} is in src/data/github-repos.json but no article shows it as a card: run node scripts/github-repos.mjs`,
      )
  }
}

// Upvote Actions only accept slug-shaped article IDs, so every article URL must match.
for (const file of outputFiles) {
  const id = file.match(/^blog\/([^/]+)\/index\.html$/)?.[1]
  if (id && !isPostId(id)) {
    errors.push(`Article URL /blog/${id}/ is outside the upvote ID contract [a-z0-9_-]+`)
  }
}

// The AI News pages read through live content collections, and any astro:content import bundles
// the content store into the Worker. The owner accepted that cost; this cap keeps it from growing
// unnoticed. The store was 924,982 bytes on 2026-10-16; the cap leaves about 30% for new posts.
const contentStoreLimitBytes = 1_200_000
const serverDir = path.resolve(outputDir, '../server')
if (existsSync(serverDir)) {
  let contentStoreBytes = 0
  const contentStoreFiles = []
  for (const file of await walk(serverDir)) {
    if (path.basename(file).includes('data-layer-content')) {
      contentStoreBytes += (await stat(file)).size
      contentStoreFiles.push(path.relative(root, file))
    }
  }
  if (contentStoreBytes > contentStoreLimitBytes) {
    errors.push(
      `Worker content store is ${contentStoreBytes} bytes, over the ${contentStoreLimitBytes}-byte limit: ${contentStoreFiles.join(', ')}`,
    )
  }
}

// Share cards render at build time in Node. The Worker never renders an image, so no renderer
// code may reach its bundle.
if (existsSync(serverDir)) {
  for (const file of await walk(serverDir)) {
    if (
      /\.(?:m?js|wasm|node)$/.test(file) &&
      /@takumi-rs|takumi_wasm|subset-font/.test(await readFile(file, 'utf8'))
    ) {
      errors.push(`Worker bundle includes the share-card renderer: ${path.relative(root, file)}`)
    }
  }
}

if (errors.length) {
  console.error(`Site checks failed (${errors.length}):`)
  for (const error of errors) {
    console.error(`- ${error}`)
  }
  process.exit(1)
}

console.log(`Site checks passed (${files.length} output files).`)
