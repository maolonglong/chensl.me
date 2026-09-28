import { existsSync } from 'node:fs'
import { readFile, readdir } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const root = process.cwd()
const outputDir = path.join(root, 'dist')
const errors = []

async function walk(directory) {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await walk(entryPath)))
    } else {
      files.push(entryPath)
    }
  }
  return files
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

function pageUrlFor(file, basePath, siteOrigin) {
  const relative = path.relative(outputDir, file).split(path.sep).join('/')
  if (relative.endsWith('index.html')) {
    return `${siteOrigin}${basePath}${relative.slice(0, -'index.html'.length)}`
  }
  return `${siteOrigin}${basePath}${relative}`
}

function isInternalUrl(value, file, basePath, siteOrigin) {
  try {
    const url = new URL(value.replaceAll('&amp;', '&'), pageUrlFor(file, basePath, siteOrigin))
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.origin === siteOrigin
  } catch {
    return true
  }
}

function isSvgUrl(value, file, basePath, siteOrigin) {
  try {
    return new URL(value.replaceAll('&amp;', '&'), pageUrlFor(file, basePath, siteOrigin)).pathname
      .toLowerCase()
      .endsWith('.svg')
  } catch {
    return false
  }
}

function relativePathWithinBase(pathname, basePath) {
  if (basePath === '/') {
    return pathname.replace(/^\/+/, '')
  }
  if (pathname === basePath.slice(0, -1)) {
    return ''
  }
  if (!pathname.startsWith(basePath)) {
    return null
  }
  return pathname.slice(basePath.length)
}

function internalReferenceError(value, file, outputFiles, anchorsByFile, basePath, siteOrigin) {
  let url
  try {
    url = new URL(value.replaceAll('&amp;', '&'), pageUrlFor(file, basePath, siteOrigin))
  } catch {
    return `contains malformed URL ${JSON.stringify(value)}`
  }

  let relative
  try {
    relative = relativePathWithinBase(decodeURIComponent(url.pathname), basePath)
  } catch {
    return `contains malformed URL encoding ${JSON.stringify(value)}`
  }
  if (relative === null) {
    return `references URL outside the site base path ${JSON.stringify(value)}`
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
  console.error('dist/ does not exist; build the site before running checks.')
  process.exit(1)
}

const files = await walk(outputDir)
const outputFiles = new Set(
  files.map((file) => path.relative(outputDir, file).split(path.sep).join('/')),
)
for (const required of ['index.html', 'blog/index.html', '404.html', 'index.xml', '_headers']) {
  if (!outputFiles.has(required)) {
    errors.push(`Missing required output dist/${required}`)
  }
}

const htmlFiles = files.filter((file) => file.endsWith('.html'))
const htmlByFile = new Map(
  await Promise.all(htmlFiles.map(async (file) => [file, await readFile(file, 'utf8')])),
)
const headers = outputFiles.has('_headers')
  ? await readFile(path.join(outputDir, '_headers'), 'utf8')
  : ''
const globalHeaders = headers.match(/^\/\*\s*\n((?:[ \t].*(?:\n|$))*)/m)?.[1] ?? ''
const csp = globalHeaders.match(/^\s*Content-Security-Policy:\s*(.+)$/im)?.[1]
const imgSourceTokens =
  csp
    ?.match(/(?:^|;)\s*img-src\s+([^;]+)/i)?.[1]
    .trim()
    .split(/\s+/) ?? []
if (!csp || imgSourceTokens.length === 0) {
  errors.push('dist/_headers must define img-src in the global Content-Security-Policy')
}
for (const [directive, source] of [
  ['frame-src', 'https://giscus.app'],
  ['connect-src', 'https://cloudflareinsights.com'],
]) {
  const tokens =
    csp
      ?.match(new RegExp(`(?:^|;)\\s*${directive}\\s+([^;]+)`, 'i'))?.[1]
      .trim()
      .split(/\s+/) ?? []
  if (!tokens.includes(source)) {
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
    const tokens = (
      policy.match(/(?:^|;)\s*script-src\s+([^;]+)/)?.[1] ??
      policy.match(/(?:^|;)\s*default-src\s+([^;]+)/)?.[1] ??
      ''
    )
      .trim()
      .split(/\s+/)
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
  const rule =
    headers.match(
      new RegExp(`^${immutable.replace('*', '\\*')}\\s*\\n((?:[ \\t].*(?:\\n|$))*)`, 'm'),
    )?.[1] ?? ''
  if (!/^\s*Cache-Control:.*\bimmutable\b/im.test(rule)) {
    errors.push(
      `dist/_headers must mark ${immutable} as immutable so fingerprinted assets are not revalidated`,
    )
  }
  if (immutable === '/css/*' && !/^\s*Access-Control-Allow-Origin:\s*\*\s*$/im.test(rule)) {
    errors.push('dist/_headers must allow cross-origin CSS so giscus can load its custom themes')
  }
}
const homeHtml = htmlByFile.get(path.join(outputDir, 'index.html')) ?? ''
const canonicalTag = [...homeHtml.matchAll(/<link\b[^>]*>/gi)].find((match) =>
  getAttributes(match[0])
    .get('rel')
    ?.split(/\s+/)
    .some((value) => value.toLowerCase() === 'canonical'),
)?.[0]
const canonicalUrl = canonicalTag ? getAttributes(canonicalTag).get('href') : null
let basePath = '/'
let siteOrigin = 'https://site.invalid'
try {
  if (!canonicalUrl) {
    throw new Error('missing canonical URL')
  }
  const parsedCanonical = new URL(canonicalUrl)
  siteOrigin = parsedCanonical.origin
  basePath = parsedCanonical.pathname
  basePath = `/${basePath.replace(/^\/+|\/+$/g, '')}`
  basePath = basePath === '/' ? basePath : `${basePath}/`
} catch {
  errors.push('Unable to determine the site base path from dist/index.html')
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
    if (url && isInternalUrl(url, file, basePath, siteOrigin)) {
      const error = internalReferenceError(
        url,
        file,
        outputFiles,
        anchorsByFile,
        basePath,
        siteOrigin,
      )
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
    let imageUrl
    try {
      imageUrl = new URL(src.replaceAll('&amp;', '&'), pageUrlFor(file, basePath, siteOrigin))
    } catch {
      imageUrl = null
    }
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
      isInternalUrl(src, file, basePath, siteOrigin) &&
      !isSvgUrl(src, file, basePath, siteOrigin) &&
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
    if (
      (key === 'og:image' || key === 'twitter:image') &&
      value &&
      isInternalUrl(value, file, basePath, siteOrigin)
    ) {
      const error = internalReferenceError(
        value,
        file,
        outputFiles,
        anchorsByFile,
        basePath,
        siteOrigin,
      )
      if (error) errors.push(`${relative} ${error}`)
    }
  }
}

const xmlFiles = files.filter((file) => file.endsWith('.xml'))
const xmlDocuments = await Promise.all(
  xmlFiles.map(async (file) => ({
    file: path.relative(root, file),
    requiredFeed: path.relative(outputDir, file) === 'index.xml',
    xml: await readFile(file, 'utf8'),
  })),
)
const python = spawnSync(
  'python3',
  [
    '-c',
    String.raw`
import json, re, sys, xml.etree.ElementTree as ET
documents = json.load(sys.stdin)
errors = []
for document in documents:
    name, xml = document['file'], document['xml']
    if re.search(r'<!\s*(?:DOCTYPE|ENTITY)\b', xml, re.I):
        errors.append(f'{name} contains a forbidden DTD or entity declaration')
        continue
    try:
        root = ET.fromstring(xml)
    except ET.ParseError as error:
        errors.append(f'{name} contains malformed XML: {error}')
        continue
    if not document['requiredFeed']:
        continue
    if root.tag != 'rss':
        errors.append(f'{name} must have an rss root element')
        continue
    channel = root.find('channel')
    if channel is None:
        errors.append(f'{name} is missing rss/channel')
        continue
    for field in ('title', 'link', 'description'):
        if not (channel.findtext(field) or '').strip():
            errors.append(f'{name} is missing rss/channel/{field}')
    for index, item in enumerate(channel.findall('item'), 1):
        for field in ('title', 'link', 'guid', 'pubDate'):
            if not (item.findtext(field) or '').strip():
                errors.append(f'{name} item {index} is missing {field}')
print(json.dumps(errors))
`,
  ],
  { input: JSON.stringify(xmlDocuments), encoding: 'utf8' },
)
if (python.error?.code === 'ENOENT') {
  errors.push('Python 3 is required to validate generated XML')
} else if (python.status !== 0) {
  errors.push(`Python XML validation failed: ${(python.stderr || `exit ${python.status}`).trim()}`)
} else {
  try {
    errors.push(...JSON.parse(python.stdout))
  } catch {
    errors.push('Python XML validation returned invalid JSON')
  }
}

for (const file of xmlFiles) {
  const xml = await readFile(file, 'utf8')
  const relative = path.relative(root, file)
  const decodedXml = decodeXmlEntities(xml)
  for (const match of decodedXml.matchAll(/<img\b[^>]*>/gi)) {
    const src = getAttributes(match[0]).get('src') ?? ''
    if (!/^(?:https?:|data:)/i.test(src)) {
      errors.push(`${relative} contains non-absolute RSS image URL ${JSON.stringify(src)}`)
    }
  }
}

const manifestPath = path.join(outputDir, 'site.webmanifest')
if (existsSync(manifestPath)) {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  const manifestUrl = `${siteOrigin}${basePath}site.webmanifest`
  for (const icon of manifest.icons ?? []) {
    const url = new URL(icon.src, manifestUrl)
    if (url.origin !== siteOrigin) {
      continue
    }
    const target = relativePathWithinBase(url.pathname, basePath)
    if (target === null || !outputFiles.has(target)) {
      errors.push(`site.webmanifest references missing icon ${JSON.stringify(icon.src)}`)
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
