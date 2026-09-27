import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { after, test } from 'node:test'

/*
 * Migration risk boundaries covered here, before implementation:
 * - Astro collection validation and publication rules (draft/future/date/timezone/order)
 * - Markdown output contracts (all image URL classes, RSS absolutes, captions, tables, TOC)
 * - document contracts (shell/nav, metadata escaping, canonical/social metadata)
 * - font declarations, precedence, versioning, conditional code fonts, and transfer budget
 * - checker security/integrity failures (links, anchors, CSP, malformed XML/RSS)
 * Source structure is deliberately not asserted. Fixture builds copy the eventual Astro project
 * surface once and exercise behavior through the real Astro CLI.
 */

const root = path.resolve(import.meta.dirname, '..')
const checker = path.join(root, 'scripts/check-site.mjs')
const temporaryDirectories = []

after(async () =>
  Promise.all(
    temporaryDirectories.map((directory) => rm(directory, { recursive: true, force: true })),
  ),
)

async function temporaryDirectory(prefix) {
  const directory = await mkdtemp(path.join(os.tmpdir(), prefix))
  temporaryDirectories.push(directory)
  return directory
}

async function write(directory, relative, content) {
  const file = path.join(directory, relative)
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, content)
}

function run(command, args, cwd) {
  return spawnSync(command, args, { cwd, encoding: 'utf8', env: { ...process.env, TZ: 'UTC' } })
}

async function astroProject(prefix) {
  const fixture = await temporaryDirectory(prefix)
  for (const relative of ['astro.config.mjs', 'src', 'public', 'data']) {
    try {
      await cp(path.join(root, relative), path.join(fixture, relative), { recursive: true })
    } catch (error) {
      if (error.code === 'ENOENT')
        throw new Error(`Astro migration must provide ${relative} before fixture verification`)
      throw error
    }
  }
  await cp(path.join(root, 'package.json'), path.join(fixture, 'package.json'))
  await rm(path.join(fixture, 'src/content/blog'), { recursive: true, force: true })
  await symlink(path.join(root, 'node_modules'), path.join(fixture, 'node_modules'), 'dir')
  return fixture
}

async function buildAstro(fixture) {
  const result = run(path.join(root, 'node_modules/.bin/astro'), ['build'], fixture)
  assert.equal(result.status, 0, result.stderr || result.stdout)
  return path.join(fixture, 'dist')
}

const frontmatter = (title, date, extra = '') =>
  `---\ntitle: ${JSON.stringify(title)}\npubDate: ${date}\n${extra}---\n`

let behaviorBuild
async function behaviorFixture() {
  if (!behaviorBuild)
    behaviorBuild = (async () => {
      const fixture = await astroProject('astro-behavior-')
      const png = await readFile(path.join(root, 'public/favicon-16x16.png'))
      await write(fixture, 'public/root.png', png)
      await write(fixture, 'src/content/blog/render/pixel.png', png)
      await write(fixture, 'src/content/blog/render/café.png', png)
      await write(
        fixture,
        'src/content/blog/render/shape.svg',
        '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 10 10"/>',
      )
      await write(
        fixture,
        'src/content/blog/render/index.md',
        `${frontmatter('Escaped <title> & "quote"', '2025-01-02T00:30:00+08:00')}
![bundle](pixel.png)
![encoded](café.png)
![svg](shape.svg)
![root](/root.png?v=2#root)
![remote](HTTPS://cdn.example.test/upper.png)
![protocol](https://cdn.example.test/protocol.png)
![data](DATA:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==)

[query](../below/?x=1&y=two%20words#section)
<a href="?x=3&#x26;y=4#hex">Hex entity</a>
<a href="?x=5&#38;y=6#decimal">Decimal entity</a>
<a href="?x=7&amp;y=8#named">Named entity</a>
<a href="?q=&quot;quoted&quot;&amp;y=9">Quoted value</a>
<a href="#first--special">Heading</a>
<a href="https://example.test/?x=1&amp;y=2#external">External</a>
<a href="mailto:author@example.test">Email</a>
<img src="/root.png?x=1&#38;y=2#crop" alt="query-image" width="16" height="16" loading="lazy" decoding="async">

## First & special
### Second
#### Excluded
## Third

| Driver | Actual development |
|:--|:--:|
| Redis | [Miniredis](https://github.com/alicebob/miniredis) |

\`\`\`go title="db/user.go"
package db
\`\`\`
`,
      )
      await write(
        fixture,
        'src/content/blog/below.md',
        `${frontmatter('Below', '2025-01-01')}## First\n\n### Second\n\n#### Excluded\n`,
      )
      await write(
        fixture,
        'src/content/blog/older.md',
        `${frontmatter('Older', '2024-01-01')}Published.`,
      )
      await write(
        fixture,
        'src/content/blog/draft.md',
        `${frontmatter('Secret draft', '2026-01-01', 'draft: true\n')}Hidden.`,
      )
      await write(
        fixture,
        'src/content/blog/future.md',
        `${frontmatter('Future post', '2999-01-01')}Hidden.`,
      )
      await write(fixture, 'src/pages/about.astro', '<h1>Independent page</h1>')
      const dist = await buildAstro(fixture)
      return { fixture, dist }
    })()
  return behaviorBuild
}

function imageWithAlt(html, alt) {
  const tag = html.match(new RegExp(`<img\\b[^>]*alt="${alt}"[^>]*>`))?.[0]
  assert.ok(tag, `missing image alt=${alt}`)
  return tag
}

test('sitemap discovers built pages and excludes unpublished content and endpoints', async () => {
  const { dist } = await behaviorFixture()
  const result = run(
    'python3',
    [
      '-c',
      `import json, pathlib, sys, xml.etree.ElementTree as E
root = pathlib.Path(sys.argv[1])
ns = {'s': 'http://www.sitemaps.org/schemas/sitemap/0.9'}
index = E.parse(root / 'sitemap-index.xml')
maps = [e.text for e in index.findall('s:sitemap/s:loc', ns)]
assert maps == ['https://chensl.me/sitemap-0.xml'], maps
pages = E.parse(root / 'sitemap-0.xml')
print(json.dumps(sorted(e.text for e in pages.findall('s:url/s:loc', ns))))`,
      dist,
    ],
    root,
  )
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(JSON.parse(result.stdout), [
    'https://chensl.me/',
    'https://chensl.me/about/',
    'https://chensl.me/blog/',
    'https://chensl.me/blog/below/',
    'https://chensl.me/blog/older/',
    'https://chensl.me/blog/render/',
  ])
  assert.match(
    await readFile(path.join(dist, 'robots.txt'), 'utf8'),
    /Sitemap: https:\/\/chensl\.me\/sitemap-index\.xml/,
  )
  assert.match(
    await readFile(path.join(dist, 'index.html'), 'utf8'),
    /<link rel="sitemap" href="\/sitemap-index\.xml"/,
  )
})

test('Astro rejects collection entries missing required metadata', async () => {
  const fixture = await astroProject('astro-invalid-metadata-')
  await write(fixture, 'src/content/blog/missing.md', '---\npubDate: 2025-01-01\n---\nNo title.\n')
  const result = run(path.join(root, 'node_modules/.bin/astro'), ['build'], fixture)
  assert.notEqual(result.status, 0, 'missing title must fail the build')
  assert.match(result.stderr + result.stdout, /title|schema|frontmatter/i)
})

test('home, archive, and RSS build without page Markdown entries', async () => {
  const fixture = await astroProject('astro-standalone-pages-')
  await rm(path.join(fixture, 'src/content/home.md'), { force: true })
  await rm(path.join(fixture, 'src/content/archive.md'), { force: true })
  await write(
    fixture,
    'src/content/blog/post.md',
    `${frontmatter('Only article', '2025-01-01')}Body.`,
  )
  const dist = await buildAstro(fixture)
  const home = await readFile(path.join(dist, 'index.html'), 'utf8')
  const archive = await readFile(path.join(dist, 'blog/index.html'), 'utf8')
  const rss = await readFile(path.join(dist, 'index.xml'), 'utf8')
  assert.match(home, /👋 Hi! 我是陈劭珑/)
  assert.match(home, /你喜欢简洁、稳定、可控的东西/)
  assert.match(home, /name="description" content="陈劭珑的个人网站与技术博客"/)
  assert.match(archive, /<title>博客 \| ~chensl<\/title>/)
  assert.match(archive, /陈劭珑的技术文章：系统性能、Go\/Zig\/Rust 与 Agent 工程实践/)
  assert.match(archive, /href="\/blog\/post\/"/)
  assert.match(rss, /<description>陈劭珑的个人网站与技术博客<\/description>/)
  assert.match(rss, /<title>Only article<\/title>/)
})

test('Astro rejects a missing local bundle image', async () => {
  const fixture = await astroProject('astro-missing-image-')
  await write(
    fixture,
    'src/content/blog/missing.md',
    `${frontmatter('Missing image', '2025-01-01')}![missing](absent.png)\n`,
  )
  const result = run(path.join(root, 'node_modules/.bin/astro'), ['build'], fixture)
  assert.notEqual(result.status, 0, 'a missing local image must fail the build')
  assert.match(result.stderr + result.stdout, /absent\.png|image.*(?:missing|not found)/i)
})

test('Astro optimizes local images and serves public downloads', async () => {
  const { dist } = await behaviorFixture()
  const html = await readFile(path.join(dist, 'blog/render/index.html'), 'utf8')
  for (const alt of ['bundle', 'encoded', 'svg']) {
    const image = imageWithAlt(html, alt)
    const src = image.match(/src="([^"]+)"/)[1]
    assert.match(src, /^\/_astro\//)
    assert.match(image, /\bwidth="(?:16|10)"/)
    assert.match(image, /\bheight="(?:16|10)"/)
    assert.match(image, /loading="lazy"/)
    await lstat(path.join(dist, decodeURIComponent(src)))
  }
  assert.match(imageWithAlt(html, 'root'), /src="\/root\.png\?v=2#root"/)
  assert.match(imageWithAlt(html, 'remote'), /src="HTTPS:\/\/cdn\.example\.test\/upper\.png"/)
  assert.match(imageWithAlt(html, 'protocol'), /src="https:\/\/cdn\.example\.test\/protocol\.png"/)
  assert.match(imageWithAlt(html, 'data'), /src="DATA:image\/gif;base64,/)
  assert.equal(
    await readFile(path.join(dist, 'downloads/semantic-view-sql-traps.sql'), 'utf8'),
    await readFile(path.join(root, 'public/downloads/semantic-view-sql-traps.sql'), 'utf8'),
  )
})

test('RSS image URLs are absolute and XML-safe', async () => {
  const { dist } = await behaviorFixture()
  const rss = await readFile(path.join(dist, 'index.xml'), 'utf8')
  await assert.rejects(lstat(path.join(dist, 'blog/index.xml')), { code: 'ENOENT' })
  const parsed = spawnSync(
    'python3',
    [
      '-c',
      'import sys, xml.etree.ElementTree as E; print(E.fromstring(sys.stdin.read()).find("channel/item/{http://purl.org/rss/1.0/modules/content/}encoded").text)',
    ],
    { input: rss, encoding: 'utf8' },
  )
  assert.equal(parsed.status, 0, parsed.stderr)
  const content = parsed.stdout
  for (const alt of ['bundle', 'encoded', 'svg']) {
    const src = imageWithAlt(content, alt).match(/src="([^"]+)"/)[1]
    assert.match(src, /^https:\/\/chensl\.me\/_astro\//)
    await lstat(path.join(dist, decodeURIComponent(new URL(src).pathname)))
  }
  assert.doesNotMatch(content, /__ASTRO/)
  assert.match(content, /https:\/\/cdn\.example\.test\/protocol\.png/)
  assert.doesNotMatch(content, /<img[^>]+src="\//)
})

test('RSS preserves URL semantics through XML and HTML decoding', async () => {
  const { dist } = await behaviorFixture()
  const rss = await readFile(path.join(dist, 'index.xml'), 'utf8')
  // Use an independent reader, rather than the serializer's own decoding utilities.
  const parsed = spawnSync(
    'python3',
    [
      '-c',
      `
import json, sys, xml.etree.ElementTree as E
from html.parser import HTMLParser
class Reader(HTMLParser):
    def __init__(self):
        super().__init__()
        self.urls = []
    def handle_starttag(self, tag, attrs):
        self.urls.extend(value for key, value in attrs if key in ('href', 'src'))
reader = Reader()
for item in E.fromstring(sys.stdin.read()).findall('channel/item'):
    reader.feed(item.findtext('{http://purl.org/rss/1.0/modules/content/}encoded', ''))
print(json.dumps(reader.urls))
`,
    ],
    { input: rss, encoding: 'utf8' },
  )
  assert.equal(parsed.status, 0, parsed.stderr)
  const urls = JSON.parse(parsed.stdout)
  for (const expected of [
    'https://chensl.me/blog/below/?x=1&y=two%20words#section',
    'https://chensl.me/blog/render/?x=3&y=4#hex',
    'https://chensl.me/blog/render/?x=5&y=6#decimal',
    'https://chensl.me/blog/render/?x=7&y=8#named',
    'https://chensl.me/blog/render/?q=%22quoted%22&y=9',
    'https://chensl.me/blog/render/#first--special',
    'https://example.test/?x=1&y=2#external',
    'mailto:author@example.test',
    'https://chensl.me/root.png?x=1&y=2#crop',
  ])
    assert.ok(
      urls.includes(expected),
      `Missing reader URL ${expected}; got ${JSON.stringify(urls)}`,
    )
})

test('drafts and future posts are filtered and dates sort by instants', async () => {
  const { dist } = await behaviorFixture()
  const archive = await readFile(path.join(dist, 'blog/index.html'), 'utf8')
  assert.doesNotMatch(archive, /Secret draft|Future post/)
  assert.ok(archive.indexOf('Escaped &lt;title&gt;') < archive.indexOf('Below'))
  assert.ok(archive.indexOf('Below') < archive.indexOf('Older'))
  await assert.rejects(readFile(path.join(dist, 'blog/draft/index.html'), 'utf8'))
  await assert.rejects(readFile(path.join(dist, 'blog/future/index.html'), 'utf8'))
})

test('Markdown preserves code captions and accessible aligned tables', async () => {
  const { dist } = await behaviorFixture()
  const html = await readFile(path.join(dist, 'blog/render/index.html'), 'utf8')
  assert.match(html, /<figure class="code-figure">\s*<figcaption>db\/user\.go<\/figcaption>/)
  assert.doesNotMatch(html, /class="highlight"[^>]*\btitle=/)
  const table = html.match(/<div class="table-scroll"[^>]*>[\s\S]*?<\/div>/)?.[0]
  assert.ok(table, 'missing table-scroll wrapper')
  assert.match(table, /tabindex="0"/)
  assert.match(table, /role="region"/)
  assert.match(table, /aria-label="[^"]+"/)
  assert.match(table, /<th style="text-align: center">Actual development<\/th>/)
  assert.match(
    table,
    /<td style="text-align: center"><a href="https:\/\/github\.com\/alicebob\/miniredis">Miniredis<\/a><\/td>/,
  )
  assert.doesNotMatch(html, /<table[^>]*style=/)
})

test('TOC uses exactly three H2/H3 headings as its threshold', async () => {
  const { dist } = await behaviorFixture()
  const below = await readFile(path.join(dist, 'blog/below/index.html'), 'utf8')
  assert.doesNotMatch(below, /id="article-toc"|class="toc-button"/)
  const html = await readFile(path.join(dist, 'blog/render/index.html'), 'utf8')
  assert.equal([...html.matchAll(/id="article-toc"/g)].length, 1)
  assert.equal([...html.matchAll(/class="toc-button"/g)].length, 1)
  assert.match(html, /<nav id="article-toc" class="toc" popover aria-label="目录">/)
  // Astro's default github-slugger removes '&' without collapsing its surrounding spaces.
  for (const id of ['first--special', 'second', 'third'])
    assert.match(html, new RegExp(`href="#${id}"`))
  assert.doesNotMatch(html, /href="#excluded"/)
})

test('SEO metadata and visible text escape hostile titles', async () => {
  const { dist } = await behaviorFixture()
  const html = await readFile(path.join(dist, 'blog/render/index.html'), 'utf8')
  assert.match(html, /<title>[^<]*Escaped &lt;title&gt; &amp; (?:&quot;|&#34;)quote/)
  assert.match(html, /rel="canonical" href="https:\/\/chensl\.me\/blog\/render\/"/)
  // HTML permits literal angle brackets inside quoted attributes. Assert the parsed value,
  // not a particular serializer's choice to encode those brackets.
  const parsed = spawnSync(
    'python3',
    [
      '-c',
      `
from html.parser import HTMLParser
import sys
class Parser(HTMLParser):
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'meta' and attrs.get('property') == 'og:title':
            print(attrs['content'])
Parser().feed(sys.stdin.read())
`,
    ],
    { input: html, encoding: 'utf8' },
  )
  assert.equal(parsed.status, 0, parsed.stderr)
  assert.equal(parsed.stdout.trim(), 'Escaped <title> & "quote"')
  assert.doesNotMatch(html, /<title>[^<]*<title>/)
})

async function checkerFixture() {
  const fixture = await temporaryDirectory('site-checker-')
  await write(fixture, 'dist/index.html', '<link rel="canonical" href="https://chensl.me/">')
  await write(fixture, 'dist/blog/index.html', '<main id="main"></main>')
  await write(fixture, 'dist/404.html', '<main id="main"></main>')
  const feed =
    '<rss version="2.0"><channel><title>x</title><link>https://chensl.me/</link><description>x</description></channel></rss>'
  await write(fixture, 'dist/index.xml', feed)
  await cp(path.join(root, 'public/_headers'), path.join(fixture, 'dist/_headers'))
  return fixture
}

test('site checker rejects missing links and anchors', async () => {
  const fixture = await checkerFixture()
  await write(
    fixture,
    'dist/index.html',
    '<link rel="canonical" href="https://chensl.me/"><a href="/missing/">x</a><a href="/blog/#missing">y</a>',
  )
  const result = run(process.execPath, [checker], fixture)
  assert.equal(result.status, 1)
  assert.match(result.stderr, /missing internal URL "\/missing\/"/)
  assert.match(result.stderr, /missing internal anchor "\/blog\/#missing"/)
})

test('site checker rejects malformed XML, entities, and incomplete RSS items', async () => {
  for (const [xml, expected] of [
    ['<rss><channel></rss>', /malformed XML/],
    ['<!DOCTYPE rss [<!ENTITY x "x">]><rss/>', /forbidden DTD or entity declaration/],
    [
      '<rss version="2.0"><channel><title>x</title><link>x</link><description>x</description><item><title>x</title></item></channel></rss>',
      /item 1 is missing link/,
    ],
  ]) {
    const fixture = await checkerFixture()
    await write(fixture, 'dist/index.xml', xml)
    const result = run(process.execPath, [checker], fixture)
    assert.equal(result.status, 1)
    assert.match(result.stderr, expected)
  }
})

test('site checker rejects relative RSS images and CSP-blocked images', async () => {
  const fixture = await checkerFixture()
  await write(fixture, 'dist/index.xml', '<rss version="2.0"><img src="/missing.png"></rss>')
  await write(
    fixture,
    'dist/index.html',
    '<link rel="canonical" href="https://chensl.me/"><img src="https://other.example/x.png" alt="x" loading="lazy" decoding="async">',
  )
  const result = run(process.execPath, [checker], fixture)
  assert.equal(result.status, 1)
  assert.match(result.stderr, /non-absolute RSS image URL/)
  assert.match(result.stderr, /blocked by CSP img-src/)
})

test('JinKai declarations preserve precedence, versioning, and cold-visit budget', async () => {
  const { dist } = await behaviorFixture()
  const index = await readFile(path.join(dist, 'index.html'), 'utf8')
  const href = index.match(/<link\b[^>]*href="(\/css\/serif[^"]+)"/)?.[1]
  assert.ok(href, 'missing serif stylesheet')
  const css = await readFile(path.join(dist, href.split('?')[0].slice(1)), 'utf8')
  const faces = [...css.matchAll(/@font-face\s*\{([^}]+)\}/g)].map(([, body]) => body)
  assert.equal(faces.length, 256)
  for (const face of faces) assert.match(face, /font-weight:\s*400 500/)
  assert.match(faces.at(-1), /core-400\.woff2\?v=[a-f\d]{12}/)
  assert.ok((faces.at(-1).match(/U\+/g) ?? []).length > 500)
  const candidates = faces.reverse().map((face) => ({
    url: face.match(/url\(["']?([^)'"]+)/)?.[1],
    ranges: (face.match(/unicode-range:\s*([^;}]+)/)?.[1] ?? '').split(',').map((token) => {
      const [start, end] = token.trim().slice(2).split('-')
      return [Number.parseInt(start, 16), Number.parseInt(end ?? start, 16)]
    }),
  }))
  const text = index.replace(/<(script|style)\b[\s\S]*?<\/\1>/g, '').replace(/<[^>]+>/g, '')
  const needed = new Set()
  for (const character of text) {
    const codepoint = character.codePointAt(0)
    const face = candidates.find((candidate) =>
      candidate.ranges.some(([start, end]) => codepoint >= start && codepoint <= end),
    )
    if (face?.url) needed.add(face.url)
  }
  let total = 0
  for (const url of needed) {
    const file = await readFile(path.join(dist, url.split('?')[0].replace(/^\//, '')))
    assert.equal(
      url.split('?')[1],
      `v=${createHash('sha256').update(file).digest('hex').slice(0, 12)}`,
    )
    assert.equal(file.toString('ascii', 0, 4), 'wOF2')
    total += file.length
  }
  assert.ok(total <= 640 * 1024, `${Math.round(total / 1024)} KiB exceeds 640 KiB`)
  const served = await readdir(path.join(dist, 'fonts/tsanger-jinkai02'), { recursive: true })
  assert.deepEqual(
    served.filter((name) => /(?:^|\/)(?:core-)?500[-.]/.test(name)),
    [],
  )
})

test('code fonts remain conditional and no page preloads fonts', async () => {
  const { dist } = await behaviorFixture()
  for (const [file, hasCode] of [
    ['index.html', false],
    ['blog/render/index.html', true],
  ]) {
    const html = await readFile(path.join(dist, file), 'utf8')
    assert.equal(/fonts\/jetbrains-mono/.test(html), hasCode, file)
    assert.doesNotMatch(html, /rel=["']preload["']/)
  }
})

// Retain the pre-migration checker and design regressions independently of Astro.
test('site checker validates absolute same-origin links', async () => {
  const fixture = await checkerFixture()
  await write(
    fixture,
    'dist/index.html',
    `<link rel="canonical" href="https://chensl.me/">
<a href="https://chensl.me/missing/">absolute</a>
<a href="//chensl.me/also-missing/">protocol-relative</a>`,
  )
  const result = run(process.execPath, [checker], fixture)
  assert.equal(result.status, 1, result.stdout)
  assert.match(result.stderr, /missing internal URL "https:\/\/chensl\.me\/missing\/"/)
  assert.match(result.stderr, /missing internal URL "\/\/chensl\.me\/also-missing\/"/)
})

test('site checker accepts valid feeds without images', async () => {
  const fixture = await checkerFixture()
  const result = run(process.execPath, [checker], fixture)
  assert.equal(result.status, 0, result.stderr)
})

test('site checker accepts local SVG images without raster dimensions', async () => {
  const fixture = await checkerFixture()
  await write(
    fixture,
    'dist/index.html',
    `<link rel="canonical" href="https://chensl.me/">
<img src="/vector.svg" alt="Vector" loading="lazy" decoding="async">`,
  )
  await write(
    fixture,
    'dist/vector.svg',
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"></svg>',
  )
  const result = run(process.execPath, [checker], fixture)
  assert.equal(result.status, 0, result.stderr)
})

test('site checker handles canonical tokens and external manifest icons', async () => {
  const fixture = await checkerFixture()
  await write(
    fixture,
    'dist/index.html',
    `<link rel="alternate Canonical" href="https://chensl.me/">
<a href="https://example.test/missing/">external</a>`,
  )
  await write(
    fixture,
    'dist/site.webmanifest',
    JSON.stringify({ icons: [{ src: 'https://cdn.example.test/icon.png' }] }),
  )
  const result = run(process.execPath, [checker], fixture)
  assert.equal(result.status, 0, result.stderr)
})

test('site checker enforces CSP image sources', async () => {
  const fixture = await checkerFixture()
  await write(fixture, 'dist/local.png', 'png')
  await write(
    fixture,
    'dist/index.html',
    `<link rel="canonical" href="https://chensl.me/">
<img src="/local.png" alt="Local" loading="lazy" decoding="async" width="1" height="1">
<img src="https://other.example/image.png" alt="Remote" loading="lazy" decoding="async">
<img src="data:image/png;base64,eA==" alt="Data" loading="lazy" decoding="async">`,
  )
  const result = run(process.execPath, [checker], fixture)
  assert.equal(result.status, 1, result.stdout)
  assert.doesNotMatch(result.stderr, /blocked by CSP img-src: "\/local\.png"/)
  assert.match(result.stderr, /blocked by CSP img-src: "https:\/\/other\.example\/image\.png"/)
  assert.match(result.stderr, /blocked by CSP img-src: "data:image\/png/)
})

test('site checker accepts an explicitly allowed HTTPS image origin', async () => {
  const fixture = await checkerFixture()
  const headers = await readFile(path.join(root, 'public/_headers'), 'utf8')
  await write(
    fixture,
    'dist/_headers',
    headers.replace("img-src 'self'", "img-src 'self' https://images.example"),
  )
  await write(
    fixture,
    'dist/index.html',
    `<link rel="canonical" href="https://chensl.me/">
<img src="https://images.example/image.png" alt="Remote" loading="lazy" decoding="async">`,
  )
  const result = run(process.execPath, [checker], fixture)
  assert.equal(result.status, 0, result.stderr)
})

test('site checker requires third-party CSP sources', async () => {
  for (const [source, directive] of [
    ['https://giscus.app', 'script-src'],
    ['https://giscus.app', 'frame-src'],
    ['https://static.cloudflareinsights.com', 'script-src'],
    ['https://cloudflareinsights.com', 'connect-src'],
  ]) {
    const fixture = await checkerFixture()
    const headers = await readFile(path.join(root, 'public/_headers'), 'utf8')
    const expression = new RegExp(`(${directive}[^;]*)${source.replaceAll('.', '\\.')}`)
    await write(fixture, 'dist/_headers', headers.replace(expression, '$1'))
    const result = run(process.execPath, [checker], fixture)
    assert.equal(result.status, 1, result.stdout)
    assert.match(
      result.stderr,
      new RegExp(`CSP ${directive} must allow ${source.replaceAll('.', '\\.')}`),
    )
  }
})

test('site checker requires immutable caching for fonts and fingerprinted CSS', async () => {
  const fixture = await checkerFixture()
  const headers = await readFile(path.join(root, 'public/_headers'), 'utf8')
  await write(fixture, 'dist/_headers', headers.replace(/^\/fonts\/\*\n[\s\S]*?\n\n/m, ''))
  const result = run(process.execPath, [checker], fixture)
  assert.equal(result.status, 1, result.stdout)
  assert.match(result.stderr, /\/fonts\/\* as immutable/)
  assert.doesNotMatch(result.stderr, /\/css\/\* as immutable/)
})

test('site checker requires cross-origin access for giscus themes', async () => {
  const fixture = await checkerFixture()
  const headers = await readFile(path.join(root, 'public/_headers'), 'utf8')
  await write(
    fixture,
    'dist/_headers',
    headers.replace(/^\s*Access-Control-Allow-Origin:\s*\*\s*$/m, ''),
  )
  const result = run(process.execPath, [checker], fixture)
  assert.equal(result.status, 1, result.stdout)
  assert.match(result.stderr, /allow cross-origin CSS/)
})

test('site checker validates same-origin social images', async () => {
  const fixture = await checkerFixture()
  await write(
    fixture,
    'dist/index.html',
    `<link rel="canonical" href="https://chensl.me/">
<meta property="og:image" content="/missing-card.png">
<meta name="twitter:image" content="https://chensl.me/missing-twitter.png">`,
  )
  const result = run(process.execPath, [checker], fixture)
  assert.equal(result.status, 1, result.stdout)
  assert.match(result.stderr, /missing internal URL "\/missing-card\.png"/)
  assert.match(result.stderr, /missing internal URL "https:\/\/chensl\.me\/missing-twitter\.png"/)
})

test('giscus themes meet AA contrast for reading and controls', async () => {
  const luminance = (hex) =>
    hex
      .slice(1)
      .match(/../g)
      .map((channel) => Number.parseInt(channel, 16) / 255)
      .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
      .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0)
  const contrast = (foreground, background) => {
    const values = [luminance(foreground), luminance(background)].sort((a, b) => a - b)
    return (values[1] + 0.05) / (values[0] + 0.05)
  }
  for (const mode of ['light', 'dark']) {
    const css = await readFile(path.join(root, `src/styles/giscus-${mode}.css`), 'utf8')
    const tokens = Object.fromEntries(
      [...css.matchAll(/--([\w-]+):\s*(#[a-f\d]{6});/g)].map(([, name, value]) => [name, value]),
    )
    for (const [foreground, background] of [
      ['color-fg-default', 'color-canvas-default'],
      ['color-fg-muted', 'color-canvas-default'],
      ['color-accent-fg', 'color-canvas-default'],
      ['color-btn-text', 'color-btn-bg'],
      ['color-btn-primary-text', 'color-btn-primary-bg'],
    ]) {
      const ratio = contrast(tokens[foreground], tokens[background])
      assert.ok(ratio >= 4.5, `${mode}: ${foreground} on ${background}: ${ratio.toFixed(2)}:1`)
    }
  }
})

test('giscus themes distinguish the fixed-width toolbar state', async () => {
  for (const mode of ['light', 'dark']) {
    const css = await readFile(path.join(root, `src/styles/giscus-${mode}.css`), 'utf8')
    const selected = css.match(
      /\.gsc-comment-box:has\(\.gsc-is-fixed-width\) \.gsc-toolbar-item\s*\{([^}]+)\}/,
    )?.[1]
    assert.ok(selected, `${mode}: missing fixed-width toolbar state`)
    assert.match(selected, /color:\s*var\(--color-accent-fg\)/)
    assert.match(selected, /background-color:\s*var\(--color-accent-subtle\)/)
    assert.match(selected, /box-shadow:\s*inset 0 0 0 1px var\(--color-accent-muted\)/)
  }
})

test('every heading level outranks the article body size', async () => {
  const style =
    (await readFile(path.join(root, 'src/styles/global.css'), 'utf8')) +
    (await readFile(path.join(root, 'src/layouts/BaseLayout.astro'), 'utf8'))
  const rem = (declaration) => {
    const value = style.match(
      new RegExp(`(?:^|\\n)\\s*${declaration}\\s*\\{[^}]*?font-size:\\s*([\\d.]+)rem`, 's'),
    )?.[1]
    assert.ok(value, `missing font-size for ${declaration}`)
    return Number(value)
  }
  const body = rem(':global\\(body\\)')
  const deep = 'h4,\\nh5,\\nh6'
  for (const selector of ['h2', 'h3', deep]) {
    assert.ok(rem(selector) >= body, `${selector} does not outrank the ${body}rem article body`)
  }
  assert.ok(rem('h2') > rem('h3'), 'h2 must outrank h3')
  assert.ok(rem('h3') > rem(deep), 'h3 must outrank h4/h5/h6')
})
