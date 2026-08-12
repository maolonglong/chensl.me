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
  for (const relative of ['build.sh', 'justfile', 'mise.toml', '.github/workflows/ci.yml']) {
    await cp(path.join(root, relative), path.join(fixture, relative), { recursive: true })
  }
  await write(fixture, 'public/index.html', '<link rel="canonical" href="https://chensl.me/">')
  await write(fixture, 'public/blog/index.html', '<main id="main"></main>')
  await write(fixture, 'public/404.html', '<main id="main"></main>')
  await write(fixture, 'public/index.xml', '<rss version="2.0"></rss>')
  await write(fixture, 'public/blog/index.xml', '<rss version="2.0"></rss>')
  await write(fixture, 'public/_headers', '')
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
