import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import sharp from 'sharp'
import { root, run, temporaryDirectory, write } from './support.mjs'

const checker = path.join(root, 'scripts/check-site.mjs')
const adapterCacheRule = '/_astro/*\n  Cache-Control: public, max-age=31536000, immutable\n'

const png = (width, height) =>
  sharp({ create: { width, height, channels: 3, background: '#f5f4ed' } })
    .png()
    .toBuffer()

const cardMeta = (card, width = 1200, height = 630) =>
  `<meta property="og:image" content="https://chensl.me${card}"><meta property="og:image:width" content="${width}"><meta property="og:image:height" content="${height}">`

async function writeArticle(fixture, id, body = '<article>Article</article>') {
  await write(fixture, `dist/og/blog/${id}.png`, await png(1200, 630))
  await write(fixture, `dist/blog/${id}/index.html`, `${cardMeta(`/og/blog/${id}.png`)}${body}`)
}

async function checkerFixture() {
  const fixture = await temporaryDirectory('site-checker-')
  await write(fixture, 'dist/index.html', '<link rel="canonical" href="https://chensl.me/">')
  await write(fixture, 'dist/blog/index.html', '<main id="main"></main>')
  await write(fixture, 'dist/404.html', '<main id="main"></main>')
  const feed =
    '<rss version="2.0"><channel><title>x</title><link>https://chensl.me/</link><description>x</description></channel></rss>'
  await write(fixture, 'dist/index.xml', feed)
  await write(fixture, 'dist/llms.txt', '# ~chensl\n\n> Summary\n\n## Articles\n')
  const headers = await readFile(path.join(root, 'public/_headers'), 'utf8')
  await write(
    fixture,
    'dist/_headers',
    `${adapterCacheRule}\n${headers}`.replace(
      'Content-Security-Policy:',
      "Content-Security-Policy: script-src 'self' 'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=' https://giscus.app https://static.cloudflareinsights.com;",
    ),
  )
  return fixture
}

test('site checker accepts valid output including SVGs, allowed HTTPS image origins, and share cards', async () => {
  const fixture = await checkerFixture()
  const headers = await readFile(path.join(fixture, 'dist/_headers'), 'utf8')
  await write(
    fixture,
    'dist/_headers',
    headers.replace("img-src 'self'", "img-src 'self' https://images.example"),
  )
  await write(
    fixture,
    'dist/vector.svg',
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"></svg>',
  )
  await write(
    fixture,
    'dist/index.html',
    `<link rel="alternate Canonical" href="https://chensl.me/">
<img src="/vector.svg" alt="Vector" loading="lazy" decoding="async">
<img src="https://images.example/image.png" alt="Remote" loading="lazy" decoding="async">
<a href="https://example.test/missing/">external</a>`,
  )
  await writeArticle(fixture, 'first')
  await write(fixture, 'server/chunks/worker.mjs', 'export {}')
  const result = run(process.execPath, [checker], fixture)
  assert.equal(result.status, 0, result.stderr)
})

test('site checker rejects broken links, images, share cards, feeds, Pagefind counts, and Worker bundle leaks', async () => {
  const fixture = await checkerFixture()
  await writeArticle(fixture, 'first')
  await write(fixture, 'dist/assets/nested/file.txt', 'asset')
  await write(
    fixture,
    'dist/index.html',
    `<link rel="canonical" href="https://chensl.me/">
<meta property="og:image" content="/missing-card.png">
<meta name="twitter:image" content="https://chensl.me/missing-twitter.png">
<a href="/missing/">x</a>
<a href="/blog/#missing">y</a>
<a href="/assets/nested/">directory</a>
<a href="https://chensl.me/missing-abs/">abs</a>
<img src="https://other.example/x.png" alt="x" loading="lazy" decoding="async">`,
  )
  await write(
    fixture,
    'dist/index.xml',
    '<rss version="2.0"><img src="/missing.png"><content:encoded>&lt;img src=&quot;/escaped.png&quot;&gt;</content:encoded></rss>',
  )
  await write(fixture, 'dist/blog/missing/index.html', '<article>No card</article>')
  await write(fixture, 'dist/og/blog/small.png', await png(1200, 1200))
  await write(fixture, 'dist/blog/small/index.html', cardMeta('/og/blog/small.png'))
  await write(fixture, 'dist/og/blog/text.png', 'not a png')
  await write(fixture, 'dist/blog/text/index.html', cardMeta('/og/blog/text.png'))
  await write(fixture, 'dist/og/blog/undeclared.png', await png(1200, 630))
  await write(
    fixture,
    'dist/blog/undeclared/index.html',
    '<meta property="og:image" content="/og/blog/undeclared.png">',
  )
  await write(fixture, 'dist/blog/copy/index.html', cardMeta('/og/blog/first.png'))
  await write(
    fixture,
    'dist/blog/index.html',
    '<header class="site-header"></header><main id="main"></main><footer class="site-footer"></footer>',
  )
  await write(fixture, 'dist/search/index.html', '<main id="main"></main>')
  await write(
    fixture,
    'dist/pagefind/pagefind-entry.json',
    JSON.stringify({ languages: { zh: { page_count: 1 } } }),
  )
  await write(fixture, 'server/chunks/data-layer-content.mjs', 'export {}')
  await write(fixture, 'server/chunks/og.mjs', "import { Renderer } from '@takumi-rs/core'")
  await write(fixture, 'src/data/github-repos.json', JSON.stringify({ 'owner/unused': {} }))

  const result = run(process.execPath, [checker], fixture)
  assert.equal(result.status, 1, result.stdout)
  for (const pattern of [
    /missing internal URL "\/missing\/"/,
    /missing internal anchor "\/blog\/#missing"/,
    /missing internal URL "\/assets\/nested\/"/,
    /missing internal URL "https:\/\/chensl\.me\/missing-abs\/"/,
    /missing internal URL "\/missing-card\.png"/,
    /missing internal URL "https:\/\/chensl\.me\/missing-twitter\.png"/,
    /blocked by CSP img-src: "https:\/\/other\.example\/x\.png"/,
    /non-absolute RSS image URL "\/missing\.png"/,
    /non-absolute RSS image URL "\/escaped\.png"/,
    /blog\/missing\/index\.html needs an og:image that is a built file/,
    /og\/blog\/small\.png must be a 1200x630 PNG, not 1200x1200/,
    /og\/blog\/text\.png must be a 1200x630 PNG, not another format/,
    /blog\/undeclared\/index\.html must declare og:image:width 1200/,
    /blog\/(?:copy|first)\/index\.html shares its og:image og\/blog\/first\.png/,
    /blog\/index\.html footer must link the article feed \/index\.xml once/,
    /search\/index\.html CSP script-src must allow 'wasm-unsafe-eval'/,
    /Pagefind indexed 1 pages; the build has 6 articles/,
    /Worker bundle includes the article content store/,
    /Worker bundle includes the share-card renderer/,
    /owner\/unused is in src\/data\/github-repos\.json but no article shows it as a card/,
  ]) {
    assert.match(result.stderr, pattern)
  }
})

test('site checker enforces _headers rules for CSP, charsets, immutable caching, and giscus CORS', async () => {
  const fixture = await checkerFixture()
  const headers = await readFile(path.join(fixture, 'dist/_headers'), 'utf8')
  const policy = headers.match(/script-src[^;]+/)[0]
  await write(
    fixture,
    'dist/about/index.html',
    `<meta http-equiv="content-security-policy" content="${policy} 'wasm-unsafe-eval'">`,
  )
  await write(
    fixture,
    'dist/_headers',
    `${headers}\n/_astro/fonts/*\n  Cache-Control: public, max-age=31536000, immutable\n`
      .replace('text/markdown; charset=utf-8', 'text/markdown')
      .replace('https://giscus.app', '')
      .replace(/^\s*Access-Control-Allow-Origin:\s*\*\s*$/m, ''),
  )
  const result = run(process.execPath, [checker], fixture)
  assert.equal(result.status, 1, result.stdout)
  for (const pattern of [
    /text\/markdown; charset=utf-8/,
    /CSP script-src must allow https:\/\/giscus\.app/,
    /about\/index\.html CSP script-src must not allow 'wasm-unsafe-eval'/,
    /\/_astro\/fonts\/font\.woff2 one immutable Cache-Control/,
    /allow cross-origin CSS/,
  ]) {
    assert.match(result.stderr, pattern)
  }
})
