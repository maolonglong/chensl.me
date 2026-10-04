import { existsSync } from 'node:fs'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { createMarkdownProcessor } from '@astrojs/markdown-remark'

const root = process.cwd()
const outputDir = path.resolve(root, process.argv[2] ?? 'dist')
const errors = []

async function walk(directory) {
  return (await readdir(directory, { recursive: true, withFileTypes: true }))
    .filter((entry) => !entry.isDirectory())
    .map((entry) => path.join(entry.parentPath, entry.name))
}

function getAttributes(tag) {
  const attributes = new Map()
  const pattern = /\b([\w:-]+)=(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g
  for (const match of tag.matchAll(pattern)) {
    attributes.set(match[1].toLowerCase(), match[2] ?? match[3] ?? match[4])
  }
  return attributes
}

function decodeXmlEntities(value) {
  const named = { amp: '&', apos: "'", gt: '>', lt: '<', quot: '"' }
  return value.replace(
    /&(?:#(\d+)|#x([\da-f]+)|(amp|apos|gt|lt|quot));/gi,
    (match, decimal, hex, name) => {
      if (name) {
        return named[name.toLowerCase()]
      }

      const codePoint = Number.parseInt(decimal ?? hex, decimal ? 10 : 16)
      return codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : match
    },
  )
}

function pageUrlFor(file) {
  const relative = path.relative(outputDir, file).split(path.sep).join('/')
  const page = relative.endsWith('index.html') ? relative.slice(0, -'index.html'.length) : relative
  return `${siteOrigin}/${page}`
}

// Resolves an attribute value against its page; null when the value is not a valid URL.
function resolveUrl(value, file) {
  try {
    return new URL(value.replaceAll('&amp;', '&'), pageUrlFor(file))
  } catch {
    return null
  }
}

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
const htmlByFile = new Map(
  await Promise.all(htmlFiles.map(async (file) => [file, await readFile(file, 'utf8')])),
)
const homeHtml = htmlByFile.get(path.join(outputDir, 'index.html')) ?? ''
const canonicalTag = [...homeHtml.matchAll(/<link\b[^>]*>/gi)].find((match) =>
  getAttributes(match[0])
    .get('rel')
    ?.split(/\s+/)
    .some((value) => value.toLowerCase() === 'canonical'),
)?.[0]
const canonicalUrl = canonicalTag ? getAttributes(canonicalTag).get('href') : null
let siteOrigin = 'https://site.invalid'
try {
  siteOrigin = new URL(canonicalUrl).origin
} catch {
  errors.push('Unable to determine the site origin from the dist/index.html canonical URL')
}

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
for (const [file, html] of htmlByFile) {
  const policies = [csp]
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attributes = getAttributes(tag)
    if (attributes.get('http-equiv')?.toLowerCase() === 'content-security-policy') {
      policies.push(decodeXmlEntities(attributes.get('content') ?? ''))
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
  }
}
// Workers Assets defaults to `max-age=0, must-revalidate`, which would revalidate every font.
for (const immutable of ['/_astro/fonts/*', '/css/*']) {
  const rule = headerRule(immutable)
  if (!/^\s*Cache-Control:.*\bimmutable\b/im.test(rule)) {
    errors.push(
      `dist/_headers must mark ${immutable} as immutable so fingerprinted assets are not revalidated`,
    )
  }
  if (immutable === '/css/*' && !/^\s*Access-Control-Allow-Origin:\s*\*\s*$/im.test(rule)) {
    errors.push('dist/_headers must allow cross-origin CSS so giscus can load its custom themes')
  }
}
const anchorsByFile = new Map()
for (const [file, html] of htmlByFile) {
  const anchors = new Set()
  for (const match of html.matchAll(/<[a-z][^>]*>/gi)) {
    const attributes = getAttributes(match[0])
    const id = attributes.get('id')
    const name = match[0].toLowerCase().startsWith('<a') ? attributes.get('name') : null
    if (id) {
      anchors.add(decodeXmlEntities(id))
    }
    if (name) {
      anchors.add(decodeXmlEntities(name))
    }
  }
  anchorsByFile.set(path.relative(outputDir, file).split(path.sep).join('/'), anchors)
}

for (const [file, html] of htmlByFile) {
  const relative = path.relative(root, file)
  for (const match of html.matchAll(/<(?:a|img|link|script)\b[^>]*>/gi)) {
    const tag = match[0]
    const attributes = getAttributes(tag)
    const lowerTag = tag.toLowerCase()
    const url = attributes.get(
      lowerTag.startsWith('<a') || lowerTag.startsWith('<link') ? 'href' : 'src',
    )
    if (url && isInternalUrl(url, file)) {
      const error = internalReferenceError(url, file)
      if (error) {
        errors.push(`${relative} ${error}`)
      }
    }

    if (!lowerTag.startsWith('<img')) {
      continue
    }
    const alt = attributes.get('alt')
    if (!alt?.trim()) {
      errors.push(`${relative} contains an image without descriptive alt text`)
    }
    if (attributes.get('loading') !== 'lazy' || attributes.get('decoding') !== 'async') {
      errors.push(`${relative} contains an image without lazy loading and async decoding`)
    }
    const src = attributes.get('src') ?? ''
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
      (!attributes.has('width') || !attributes.has('height'))
    ) {
      errors.push(
        `${relative} contains a local image without intrinsic dimensions: ${JSON.stringify(src)}`,
      )
    }
  }

  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attributes = getAttributes(match[0])
    const key = (attributes.get('property') ?? attributes.get('name') ?? '').toLowerCase()
    const value = attributes.get('content')
    if ((key === 'og:image' || key === 'twitter:image') && value && isInternalUrl(value, file)) {
      const error = internalReferenceError(value, file)
      if (error) errors.push(`${relative} ${error}`)
    }
  }
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
  for (const [tag] of code.matchAll(/<img\b[^>]*>/gi)) {
    const src = decodeXmlEntities(getAttributes(tag).get('src') ?? '')
    if (isInternalUrl(src, file)) {
      const error = internalReferenceError(src, file)
      if (error) errors.push(`${markdown} ${error}`)
    }
  }
}
for (const file of files.filter((file) => file.endsWith('.xml'))) {
  const xml = decodeXmlEntities(await readFile(file, 'utf8'))
  for (const match of xml.matchAll(/<img\b[^>]*>/gi)) {
    const src = getAttributes(match[0]).get('src') ?? ''
    if (!/^(?:https?:|data:)/i.test(src)) {
      errors.push(
        `${path.relative(root, file)} contains non-absolute RSS image URL ${JSON.stringify(src)}`,
      )
    }
  }
}

// Upvote Actions only accept slug-shaped article IDs, so every article URL must match.
for (const file of outputFiles) {
  const id = file.match(/^blog\/([^/]+)\/index\.html$/)?.[1]
  if (id && !/^[a-z0-9_-]+$/.test(id)) {
    errors.push(`Article URL /blog/${id}/ is outside the upvote ID contract [a-z0-9_-]+`)
  }
}

// Actions validate articles through the built pages. Bundling the content store would grow the
// Worker, and its cold-start cost, with every post.
const serverDir = path.resolve(outputDir, '../server')
if (existsSync(serverDir)) {
  for (const file of await walk(serverDir)) {
    if (path.basename(file).includes('data-layer-content')) {
      errors.push(`Worker bundle must not include the content store: ${path.relative(root, file)}`)
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
