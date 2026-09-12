import assert from 'node:assert/strict'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { after, test } from 'node:test'

const root = path.resolve(import.meta.dirname, '..')
const checker = path.join(root, 'scripts/check-site.mjs')
const temporaryDirectories = []

after(async () => {
  await Promise.all(temporaryDirectories.map(directory => rm(directory, { force: true, recursive: true })))
})

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
  return spawnSync(command, args, { cwd, encoding: 'utf8' })
}

function imageWithAlt(html, alt) {
  const tag = html.match(new RegExp(`<img\\b[^>]*alt="${alt}"[^>]*>`))?.[0]
  assert.ok(tag, `missing image with alt=${JSON.stringify(alt)}`)
  return tag
}

test('image render hooks handle valid resource and URL variants', async () => {
  const fixture = await temporaryDirectory('hugo-render-hooks-')
  await mkdir(path.join(fixture, 'layouts/_markup'), { recursive: true })
  await mkdir(path.join(fixture, 'layouts/_partials'), { recursive: true })
  await mkdir(path.join(fixture, 'content/blog/render'), { recursive: true })
  await mkdir(path.join(fixture, 'static'), { recursive: true })

  for (const name of ['render-image.html', 'render-image.rss.xml']) {
    await cp(path.join(root, 'layouts/_markup', name), path.join(fixture, 'layouts/_markup', name))
  }
  await cp(path.join(root, 'layouts/_partials/seo.html'), path.join(fixture, 'layouts/_partials/seo.html'))
  for (const name of ['pixel.png', 'café image.png']) {
    await cp(path.join(root, 'static/favicon-16x16.png'), path.join(fixture, 'content/blog/render', name))
  }
  await cp(path.join(root, 'static/favicon-16x16.png'), path.join(fixture, 'static/pixel.png'))

  await write(fixture, 'hugo.toml', `baseURL = 'https://example.test/sub/'
title = 'Fixture'
[outputs]
  home = ['html', 'rss']
[params]
  description = 'Fixture'
`)
  await write(fixture, 'content/_index.md', `+++
title = 'Home'
image = '//cdn.example.test/card.png'
+++
`)
  await write(fixture, 'content/blog/render/index.md', `+++
title = 'Render'
date = 2026-01-01
+++
![svg](shape.svg)
![query](pixel.png?v=1#frag)
![encoded](caf%C3%A9%20image.png)
![upper](HTTPS://cdn.example.test/upper.png)
![protocol](//cdn.example.test/protocol.png)
![data](DATA:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==)
![root](/pixel.png?v=2#root)
`)
  await write(fixture, 'content/blog/render/shape.svg', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0h10v10H0z"/></svg>')
  await write(fixture, 'layouts/home.html', '{{ partial "seo.html" . }}{{ range site.RegularPages }}{{ .Content }}{{ end }}')
  await write(fixture, 'layouts/rss.xml', '<rss version="2.0"><channel>{{ range site.RegularPages }}<item><content>{{ .Content | transform.XMLEscape | safeHTML }}</content></item>{{ end }}</channel></rss>')

  const result = run(process.env.HUGO_BIN ?? 'hugo', ['--source', fixture, '--destination', path.join(fixture, 'out'), '--quiet'], root)
  assert.equal(result.status, 0, result.stderr)

  const html = await readFile(path.join(fixture, 'out/index.html'), 'utf8')
  const rss = await readFile(path.join(fixture, 'out/index.xml'), 'utf8')
  assert.match(html, /og:image" content="https:\/\/cdn\.example\.test\/card\.png"/)
  assert.match(imageWithAlt(html, 'svg'), /src="\/sub\/blog\/render\/shape\.svg"/)
  assert.doesNotMatch(imageWithAlt(html, 'svg'), /\bwidth=/)
  assert.match(imageWithAlt(html, 'query'), /src="\/sub\/blog\/render\/pixel\.png\?v=1#frag"/)
  assert.match(imageWithAlt(html, 'query'), /width="16" height="16"/)
  assert.match(imageWithAlt(html, 'encoded'), /src="\/sub\/blog\/render\/caf%C3%A9%20image\.png"/)
  assert.match(imageWithAlt(html, 'upper'), /src="HTTPS:\/\/cdn\.example\.test\/upper\.png"/)
  assert.match(imageWithAlt(html, 'protocol'), /src="https:\/\/cdn\.example\.test\/protocol\.png"/)
  assert.match(imageWithAlt(html, 'data'), /src="DATA:image\/gif;base64,/)
  assert.match(imageWithAlt(html, 'root'), /src="\/sub\/pixel\.png\?v=2#root"/)
  assert.match(rss, /https:\/\/example\.test\/sub\/blog\/render\/shape\.svg/)
  assert.match(rss, /https:\/\/cdn\.example\.test\/protocol\.png/)
})

async function checkerFixture() {
  const fixture = await temporaryDirectory('site-checker-')
  for (const relative of ['build.sh', 'justfile', 'mise.toml', 'mise.lock', '.github/workflows/ci.yml']) {
    await cp(path.join(root, relative), path.join(fixture, relative), { recursive: true })
  }
  await write(fixture, 'public/index.html', '<link rel="canonical" href="https://chensl.me/">')
  await write(fixture, 'public/blog/index.html', '<main id="main"></main>')
  await write(fixture, 'public/404.html', '<main id="main"></main>')
  const emptyFeed = '<rss version="2.0"><channel><title>Fixture</title><link>https://chensl.me/</link><description>Fixture</description></channel></rss>'
  await write(fixture, 'public/index.xml', emptyFeed)
  await write(fixture, 'public/blog/index.xml', emptyFeed)
  await cp(path.join(root, 'static/_headers'), path.join(fixture, 'public/_headers'))
  return fixture
}

test('site checker validates absolute same-origin links', async () => {
  const fixture = await checkerFixture()
  await write(fixture, 'public/index.html', `<link rel="canonical" href="https://chensl.me/">
<a href="https://chensl.me/missing/">absolute</a>
<a href="//chensl.me/also-missing/">protocol-relative</a>`)
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

test('site checker rejects malformed XML that resembles RSS', async () => {
  const fixture = await checkerFixture()
  await write(fixture, 'public/index.xml', '<rss version="2.0"><channel></rss>')
  const result = run(process.execPath, [checker], fixture)
  assert.equal(result.status, 1, result.stdout)
  assert.match(result.stderr, /contains malformed XML/)
})

test('site checker rejects XML entity declarations', async () => {
  const fixture = await checkerFixture()
  await write(fixture, 'public/index.xml', '<!DOCTYPE rss [<!ENTITY title "Fixture">]><rss version="2.0"><channel><title>&title;</title><link>https://chensl.me/</link><description>Fixture</description></channel></rss>')
  const result = run(process.execPath, [checker], fixture)
  assert.equal(result.status, 1, result.stdout)
  assert.match(result.stderr, /forbidden DTD or entity declaration/)
})

test('site checker validates RSS structure and item fields', async () => {
  const fixture = await checkerFixture()
  await write(fixture, 'public/index.xml', '<rss version="2.0"><channel><title>x</title><link>https://chensl.me/</link><description>x</description><item><title>x</title></item></channel></rss>')
  const result = run(process.execPath, [checker], fixture)
  assert.equal(result.status, 1, result.stdout)
  assert.match(result.stderr, /item 1 is missing link/)
  assert.match(result.stderr, /item 1 is missing guid/)
  assert.match(result.stderr, /item 1 is missing pubDate/)
})

test('site checker accepts local SVG images without raster dimensions', async () => {
  const fixture = await checkerFixture()
  await write(fixture, 'public/index.html', `<link rel="canonical" href="https://chensl.me/">
<img src="/vector.svg" alt="Vector" loading="lazy" decoding="async">`)
  await write(fixture, 'public/vector.svg', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"></svg>')
  const result = run(process.execPath, [checker], fixture)
  assert.equal(result.status, 0, result.stderr)
})

test('site checker handles canonical tokens and external manifest icons', async () => {
  const fixture = await checkerFixture()
  await write(fixture, 'public/index.html', `<link rel="alternate Canonical" href="https://chensl.me/">
<a href="https://example.test/missing/">external</a>`)
  await write(fixture, 'public/site.webmanifest', JSON.stringify({ icons: [{ src: 'https://cdn.example.test/icon.png' }] }))
  const result = run(process.execPath, [checker], fixture)
  assert.equal(result.status, 0, result.stderr)
})

test('site checker still rejects relative RSS images', async () => {
  const fixture = await checkerFixture()
  await write(fixture, 'public/index.xml', '<rss version="2.0"><img src="/missing.png"></rss>')
  const result = run(process.execPath, [checker], fixture)
  assert.equal(result.status, 1, result.stdout)
  assert.match(result.stderr, /non-absolute RSS image URL "\/missing\.png"/)
})

test('site checker enforces CSP image sources', async () => {
  const fixture = await checkerFixture()
  await write(fixture, 'public/local.png', 'png')
  await write(fixture, 'public/index.html', `<link rel="canonical" href="https://chensl.me/">
<img src="/local.png" alt="Local" loading="lazy" decoding="async" width="1" height="1">
<img src="https://other.example/image.png" alt="Remote" loading="lazy" decoding="async">
<img src="data:image/png;base64,eA==" alt="Data" loading="lazy" decoding="async">`)
  const result = run(process.execPath, [checker], fixture)
  assert.equal(result.status, 1, result.stdout)
  assert.doesNotMatch(result.stderr, /blocked by CSP img-src: "\/local\.png"/)
  assert.match(result.stderr, /blocked by CSP img-src: "https:\/\/other\.example\/image\.png"/)
  assert.match(result.stderr, /blocked by CSP img-src: "data:image\/png/)
})

test('site checker accepts an explicitly allowed HTTPS image origin', async () => {
  const fixture = await checkerFixture()
  await write(fixture, 'public/_headers', `/*
  Content-Security-Policy: default-src 'self'; img-src 'self' https://images.example; script-src 'self' https://static.cloudflareinsights.com; connect-src 'self' https://cloudflareinsights.com; object-src 'none'

/fonts/*
  Cache-Control: public, max-age=31536000, immutable

/css/*
  Cache-Control: public, max-age=31536000, immutable
`)
  await write(fixture, 'public/index.html', `<link rel="canonical" href="https://chensl.me/">
<img src="https://images.example/image.png" alt="Remote" loading="lazy" decoding="async">`)
  const result = run(process.execPath, [checker], fixture)
  assert.equal(result.status, 0, result.stderr)
})

test('site checker requires Cloudflare Web Analytics CSP sources', async () => {
  for (const [source, directive] of [
    ['https://static.cloudflareinsights.com', 'script-src'],
    ['https://cloudflareinsights.com', 'connect-src'],
  ]) {
    const fixture = await checkerFixture()
    const headers = await readFile(path.join(root, 'static/_headers'), 'utf8')
    await write(fixture, 'public/_headers', headers.replace(source, ''))
    const result = run(process.execPath, [checker], fixture)
    assert.equal(result.status, 1, result.stdout)
    assert.match(result.stderr, new RegExp(`CSP ${directive} must allow ${source.replaceAll('.', '\\.')}`))
  }
})

test('site checker requires immutable caching for fonts and fingerprinted CSS', async () => {
  const fixture = await checkerFixture()
  const headers = await readFile(path.join(root, 'static/_headers'), 'utf8')
  await write(fixture, 'public/_headers', headers.replace(/^\/fonts\/\*\n[\s\S]*?\n\n/m, ''))
  const result = run(process.execPath, [checker], fixture)
  assert.equal(result.status, 1, result.stdout)
  assert.match(result.stderr, /\/fonts\/\* as immutable/)
  assert.doesNotMatch(result.stderr, /\/css\/\* as immutable/)
})

test('site checker validates same-origin social images', async () => {
  const fixture = await checkerFixture()
  await write(fixture, 'public/index.html', `<link rel="canonical" href="https://chensl.me/">
<meta property="og:image" content="/missing-card.png">
<meta name="twitter:image" content="https://chensl.me/missing-twitter.png">`)
  const result = run(process.execPath, [checker], fixture)
  assert.equal(result.status, 1, result.stdout)
  assert.match(result.stderr, /missing internal URL "\/missing-card\.png"/)
  assert.match(result.stderr, /missing internal URL "https:\/\/chensl\.me\/missing-twitter\.png"/)
})

test('site checker rejects stale locked tool versions and Hugo checksums', async () => {
  const fixture = await checkerFixture()
  const lock = await readFile(path.join(fixture, 'mise.lock'), 'utf8')
  await write(fixture, 'mise.lock', lock
    .replace(/(\[\[tools\.hugo\]\]\s*version = ")[^"]+/, '$10.0.0')
    .replace(/(\[\[tools\.node\]\]\s*version = ")[^"]+/, '$10.0.0')
    .replace(/sha256:[a-f\d]{64}/g, `sha256:${'0'.repeat(64)}`))
  const result = run(process.execPath, [checker], fixture)
  assert.equal(result.status, 1, result.stdout)
  assert.match(result.stderr, /Hugo version mismatch: mise.toml=.*mise.lock=0.0.0/)
  assert.match(result.stderr, /Node.js version mismatch: mise.toml=.*mise.lock=0.0.0/)
  for (const platform of ['macos-arm64', 'macos-x64', 'linux-arm64', 'linux-x64']) {
    assert.ok(result.stderr.includes(`does not match mise.lock for ${platform}`))
  }
})

test('reading and syntax palettes meet AA contrast in both themes', async () => {
  const css = await readFile(path.join(root, 'assets/css/syntax.css'), 'utf8')
  const foregrounds = [...css.matchAll(/(?:[{;]\s*)color:\s*light-dark\((#[a-f\d]{6}),\s*(#[a-f\d]{6})\)/g)]
  const backgrounds = [...css.matchAll(/background-color:\s*light-dark\((#[a-f\d]{6}),\s*(#[a-f\d]{6})\)/g)]
  assert.ok(foregrounds.length > 0 && backgrounds.length > 0, 'missing syntax palette')
  const style = await readFile(path.join(root, 'assets/css/style.css'), 'utf8')
  const tokens = Object.fromEntries([...style.matchAll(/--([\w-]+):\s*light-dark\((#[a-f\d]{6}),\s*(#[a-f\d]{6})\)/g)]
    .map(([, name, light, dark]) => [name, [null, light, dark]]))
  const readingColors = [
    'text-color', 'heading-color', 'muted-color',
    'link-color', 'link-hover-color', 'visited-color', 'blockquote-color',
  ]
  for (const name of [...readingColors, 'background-color', 'selection-color', 'mark-background-color']) {
    assert.ok(tokens[name], `missing ${name}`)
  }
  const theme = await readFile(path.join(root, 'layouts/_partials/theme.html'), 'utf8')
  for (const [index, mode] of [[1, 'light'], [2, 'dark']]) {
    assert.match(theme, new RegExp(`content="${tokens['background-color'][index]}"[^>]+data-theme-color="${mode}"`))
  }
  const manifest = JSON.parse(await readFile(path.join(root, 'static/site.webmanifest'), 'utf8'))
  assert.equal(manifest.theme_color, tokens['background-color'][1])
  assert.equal(manifest.background_color, tokens['background-color'][1])
  const pairs = foregrounds.flatMap(foreground => backgrounds.map(background => [foreground, background]))
  pairs.push(...readingColors.map(name => [tokens[name], tokens['background-color']]))
  pairs.push([tokens['text-color'], tokens['selection-color']], [tokens['text-color'], tokens['mark-background-color']])
  const luminance = hex => hex.slice(1).match(/../g)
    .map(channel => Number.parseInt(channel, 16) / 255)
    .map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
    .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0)
  for (const mode of [1, 2]) {
    for (const [foreground, background] of pairs) {
      const values = [luminance(foreground[mode]), luminance(background[mode])].sort((a, b) => a - b)
      const contrast = (values[1] + 0.05) / (values[0] + 0.05)
      assert.ok(contrast >= 4.5, `${foreground[mode]} on ${background[mode]}: ${contrast.toFixed(2)}:1`)
    }
  }
})

test('page shell keeps headings in main and marks only the current navigation entry', async () => {
  const destination = await temporaryDirectory('hugo-page-shell-')
  const result = run(process.env.HUGO_BIN ?? 'hugo', ['--destination', destination, '--quiet'], root)
  assert.equal(result.status, 0, result.stderr)
  for (const [file, current] of [
    ['index.html', 'href="/" aria-current="page"'],
    ['blog/index.html', 'href="/blog/" aria-current="page"'],
    ['blog/buddy/index.html', 'href="/blog/" aria-current="location"'],
    ['404.html', null],
  ]) {
    const html = await readFile(path.join(destination, file), 'utf8')
    assert.equal([...html.matchAll(/<h1\b/g)].length, 1, file)
    assert.match(html, /<main\b[^>]*>[\s\S]*?<h1\b/)
    const nav = html.match(/<nav\b[^>]*>[\s\S]*?<\/nav>/)?.[0]
    assert.ok(nav, file)
    assert.equal([...nav.matchAll(/aria-current=/g)].length, current ? 1 : 0, file)
    if (current) assert.ok(nav.includes(current), file)
    const toggle = nav.match(/<button\b[^>]*data-theme-toggle[^>]*>([\s\S]*?)<\/button>/)?.[1]
    assert.ok(toggle, `missing theme toggle: ${file}`)
    assert.match(toggle, /<svg\b[^>]*viewBox="0 0 24 24"[^>]*aria-hidden="true"[^>]*focusable="false"/)
    assert.deepEqual([...toggle.matchAll(/data-theme-icon="([^"]+)"/g)].map(([, mode]) => mode), ['auto', 'light', 'dark'])
  }
  const blog = await readFile(path.join(destination, 'blog/index.html'), 'utf8')
  assert.match(blog, /<h1 class="visually-hidden">博客<\/h1>/)
  const lists = [...blog.matchAll(/<ul class="blog-posts">([\s\S]*?)<\/ul>/g)]
  assert.ok(lists.length > 0, 'missing post lists')
  for (const [, list] of lists) {
    const rows = [...list.matchAll(/<li>([\s\S]*?)<\/li>/g)]
    assert.ok(rows.length > 0, 'missing post links')
    for (const [, row] of rows) {
      assert.match(row.trim(), /^<a href="\/blog\/[^\"]+">\s*<span>[^<]+<\/span>\s*<time datetime="[^\"]+">\s*\d{2}-\d{2}\s*<\/time>\s*<\/a>$/)
    }
  }

  const alert = await readFile(path.join(destination, 'blog/thinking-vs-research/index.html'), 'utf8')
  assert.match(alert, /<blockquote class="alert alert-note">\s*<p class="alert-heading">提示<\/p>/)
  assert.doesNotMatch(alert, /\[!NOTE\]/)

  const quote = await readFile(path.join(destination, 'blog/2024-review/index.html'), 'utf8')
  assert.match(quote, /<blockquote>\s*<p>对技术的看法[\s\S]*?<cite>2023 年终总结 - 我叫尤加利/)
  assert.doesNotMatch(quote, /<blockquote class="alert/)
})

test('serif fonts resolve on every page and code fonts stay conditional under a subpath', async () => {
  const destination = await temporaryDirectory('hugo-code-fonts-')
  const result = run(process.env.HUGO_BIN ?? 'hugo', [
    '--baseURL', 'https://example.test/sub/', '--destination', destination, '--minify', '--quiet',
  ], root)
  assert.equal(result.status, 0, result.stderr)
  for (const [file, hasCode] of [
    ['index.html', false], ['blog/index.html', false], ['404.html', false],
    ['blog/buddy/index.html', true], ['blog/thin-agent-thick-harness/index.html', true],
  ]) {
    const html = await readFile(path.join(destination, file), 'utf8')
    const faces = [...html.matchAll(/@font-face\{[^}]+\}/g)]
    assert.equal(faces.length, hasCode ? 4 : 0, file)
    const stylesheet = html.match(/<link\b[^>]*href=["']?(\/sub\/css\/serif[^ "'>]+)[^>]*>/)?.[1]
    assert.ok(stylesheet, 'missing shared serif stylesheet')
    const css = await readFile(path.join(destination, stylesheet.slice('/sub/'.length)), 'utf8')
    const serifFaces = [...css.matchAll(/@font-face\{[^}]+\}/g)]
    assert.equal(serifFaces.length, 512)
    for (const weight of [400, 500]) {
      const weighted = serifFaces.filter(([face]) => face.includes(`font-weight:${weight};`))
      assert.equal(weighted.length, 256)
      const ranges = new Set()
      for (const [face] of weighted.filter(([face]) => face.includes('/subsets/'))) {
        const range = face.match(/unicode-range:([^;}]+)/)?.[1]
        assert.ok(range, face)
        assert.ok(!ranges.has(range), 'duplicate Unicode range')
        ranges.add(range)
      }
      assert.equal(ranges.size, 255)
    }
    // Overlapping ranges resolve in reverse source order, so the core subsets must be declared last.
    for (const [face] of serifFaces.slice(-2)) {
      assert.match(face, /url\([^)]*\/fonts\/tsanger-jinkai02\/core-[45]00\.woff2\)/)
      assert.ok((face.match(/unicode-range:([^;}]+)/)[1].match(/U\+/g) ?? []).length > 500, 'core range too coarse')
    }
    if (!hasCode) assert.doesNotMatch(html, /fonts\/jetbrains-mono/, file)
    for (const [face] of [...faces, ...serifFaces]) {
      assert.match(face, /font-display:swap/)
      const url = face.match(/url\(["']?(\/sub\/fonts\/[^)"']+)['"]?\)/)?.[1]
      assert.ok(url, face)
      const font = await readFile(path.join(destination, url.slice('/sub/'.length)))
      assert.equal(font.toString('ascii', 0, 4), 'wOF2')
      if (url.includes('/subsets/')) assert.ok(font.length < 128 * 1024, url)
      if (url.includes('/core-')) assert.ok(font.length < 320 * 1024, url)
    }
    assert.doesNotMatch(html, /rel=["']?preload/)
  }
  const license = await readFile(path.join(destination, 'fonts/jetbrains-mono-2.304/OFL.txt'), 'utf8')
  assert.match(license, /SIL OPEN FONT LICENSE Version 1\.1/)
})

test('a cold visit stays within the serif font transfer budget on every page', async () => {
  const budget = 640 * 1024
  const destination = await temporaryDirectory('hugo-font-budget-')
  const result = run(process.env.HUGO_BIN ?? 'hugo', [
    '--destination', destination, '--minify', '--quiet',
  ], root)
  assert.equal(result.status, 0, result.stderr)

  const index = await readFile(path.join(destination, 'index.html'), 'utf8')
  const stylesheet = index.match(/<link\b[^>]*href=["']?(\/css\/serif[^ "'>]+)/)?.[1]
  assert.ok(stylesheet, 'missing serif stylesheet')
  const css = await readFile(path.join(destination, stylesheet.slice(1)), 'utf8')
  // A character picks the last declared face whose range covers it, so match faces in reverse.
  const faces = [...css.matchAll(/@font-face\{([^}]+)\}/g)].reverse().map(([, body]) => ({
    weight: Number(body.match(/font-weight:(\d+)/)[1]),
    url: body.match(/url\(['"]?([^)'"]+)['"]?\)/)[1],
    ranges: body.match(/unicode-range:([^;}]+)/)[1].split(',').map(token => {
      const [start, end] = token.trim().slice(2).split('-')
      return [Number.parseInt(start, 16), Number.parseInt(end ?? start, 16)]
    }),
  }))
  assert.ok(faces.length > 0, 'missing serif faces')
  const sizes = new Map()
  const sizeOf = async url => {
    if (!sizes.has(url)) sizes.set(url, (await readFile(path.join(destination, url.slice(1)))).length)
    return sizes.get(url)
  }

  const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' }
  const plainText = markup => markup
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x([\da-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal) => String.fromCodePoint(Number(decimal)))
    .replace(/&(\w+);/g, (whole, name) => entities[name] ?? whole)

  // Headings and strong text use weight 500 and body text 400; charge every character to both.
  for (const page of [
    'index.html', 'blog/index.html', '404.html',
    'blog/buddy/index.html', 'blog/1brc-in-zig/index.html',
  ]) {
    const html = await readFile(path.join(destination, page), 'utf8')
    const codepoints = new Set([...plainText(html)].map(character => character.codePointAt(0)))
    const needed = new Set()
    for (const codepoint of codepoints) {
      for (const weight of [400, 500]) {
        const face = faces.find(candidate => candidate.weight === weight
          && candidate.ranges.some(([start, end]) => codepoint >= start && codepoint <= end))
        if (face) needed.add(face.url)
      }
    }
    let total = 0
    for (const url of needed) total += await sizeOf(url)
    assert.ok(total <= budget,
      `${page}: ${(total / 1024).toFixed(0)} KiB across ${needed.size} files exceeds ${budget / 1024} KiB`)
  }
})
