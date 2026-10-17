import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import sharp from 'sharp'
import { root, run, temporaryDirectory, write } from './support.mjs'

const checker = path.join(root, 'scripts/check-site.mjs')

// scripts/check-site.mjs rejects broken links, images, and policies, and accepts valid output.

const adapterCacheRule = '/_astro/*\n  Cache-Control: public, max-age=31536000, immutable\n'

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
    // The Cloudflare adapter prepends this rule to the built _headers.
    `${adapterCacheRule}\n${headers}`.replace(
      'Content-Security-Policy:',
      "Content-Security-Policy: script-src 'self' 'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=' https://giscus.app https://static.cloudflareinsights.com;",
    ),
  )
  return fixture
}

const png = (width, height) =>
  sharp({ create: { width, height, channels: 3, background: '#f5f4ed' } })
    .png()
    .toBuffer()

const cardMeta = (card, width = 1200, height = 630) =>
  `<meta property="og:image" content="https://chensl.me${card}"><meta property="og:image:width" content="${width}"><meta property="og:image:height" content="${height}">`

// An article page with its own valid share card, as the build emits it.
async function writeArticle(fixture, id, body = '<article>Article</article>') {
  await write(fixture, `dist/og/blog/${id}.png`, await png(1200, 630))
  await write(fixture, `dist/blog/${id}/index.html`, `${cardMeta(`/og/blog/${id}.png`)}${body}`)
}

for (const type of ['text/plain', 'text/markdown']) {
  test(`site checker requires a UTF-8 charset rule for ${type} exports`, async () => {
    const fixture = await checkerFixture()
    await write(fixture, 'dist/blog/nested/article/index.html', '<article>Article</article>')
    await write(fixture, 'dist/blog/nested/article/index.md', '# Article\n')
    const headers = await readFile(path.join(fixture, 'dist/_headers'), 'utf8')
    // Supply valid rules independently of the source configuration, then remove one charset.
    const otherHeaders = headers.replace(
      /^\/(?:llms\.txt|blog\/\*\/index\.md)\s*\n(?:[ \t].*(?:\n|$))*/gm,
      '',
    )
    const validHeaders = `${otherHeaders}\n/llms.txt\n  Content-Type: text/plain; charset=utf-8\n\n/blog/*/index.md\n  Content-Type: text/markdown; charset=utf-8\n`
    await write(fixture, 'dist/_headers', validHeaders)
    const valid = run(process.execPath, [checker], fixture)
    assert.equal(valid.status, 0, valid.stderr)

    await write(fixture, 'dist/_headers', validHeaders.replace(`${type}; charset=utf-8`, type))
    const result = run(process.execPath, [checker], fixture)
    assert.equal(result.status, 1, result.stdout)
    assert.ok(result.stderr.includes(`${type}; charset=utf-8`), result.stderr)
  })
}

test('site checker rejects broken Markdown images', async () => {
  const fixture = await checkerFixture()
  await writeArticle(fixture, 'article')
  await write(
    fixture,
    'dist/blog/article/index.md',
    `# Article

![inline](./missing.png)
![reference][diagram]

[diagram]: <./missing%20diagram.svg> "Diagram"
<img src="./missing-html.png" alt="HTML">
`,
  )
  const result = run(process.execPath, [checker], fixture)
  assert.equal(result.status, 1)
  for (const image of ['missing.png', 'missing%20diagram.svg', 'missing-html.png']) {
    assert.ok(result.stderr.includes(image), result.stderr)
  }
})

test('site checker accepts real Markdown images and ignores image syntax in code', async () => {
  const fixture = await checkerFixture()
  await writeArticle(fixture, 'article')
  await write(
    fixture,
    'dist/blog/article/index.md',
    `# Article

![local](./diagram.png?v=1#image)
![remote](https://cdn.example.test/image.png)

\`![example](missing.png)\`

\`\`\`md
![example](missing.png)
\`\`\`
`,
  )
  await write(fixture, 'dist/blog/article/diagram.png', 'image')
  const result = run(process.execPath, [checker], fixture)
  assert.equal(result.status, 0, result.stderr)
})

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

test('site checker rejects directory links without an index page', async () => {
  const fixture = await checkerFixture()
  await write(fixture, 'dist/assets/nested/file.txt', 'asset')
  await write(
    fixture,
    'dist/index.html',
    `<link rel="canonical" href="https://chensl.me/">
<a href="/assets/nested">directory</a>
<a href="/assets/nested/">directory with slash</a>`,
  )
  const result = run(process.execPath, [checker], fixture)
  assert.equal(result.status, 1, result.stdout)
  assert.match(result.stderr, /missing internal URL "\/assets\/nested"/)
  assert.match(result.stderr, /missing internal URL "\/assets\/nested\/"/)
})

test('site checker caps the content store in the Worker bundle, nested chunks included', async () => {
  const fixture = await checkerFixture()
  await write(fixture, 'server/chunks/worker.mjs', 'export {}')
  // Two chunks that together stay at the 1,200,000-byte limit pass.
  await write(fixture, 'server/chunks/data-layer-content.a.mjs', 'x'.repeat(700_000))
  await write(fixture, 'server/chunks/nested/data-layer-content.b.mjs', 'x'.repeat(500_000))
  const valid = run(process.execPath, [checker], fixture)
  assert.equal(valid.status, 0, valid.stderr)

  // One more byte, in the nested chunk, fails and names both files.
  await write(fixture, 'server/chunks/nested/data-layer-content.b.mjs', 'x'.repeat(500_001))
  const result = run(process.execPath, [checker], fixture)
  assert.equal(result.status, 1, result.stdout)
  assert.match(result.stderr, /Worker content store is 1200001 bytes, over the 1200000-byte limit/)
  assert.ok(
    result.stderr.includes(path.join('server', 'chunks', 'nested', 'data-layer-content.b.mjs')),
    result.stderr,
  )
})

test('site checker rejects relative RSS images and CSP-blocked images', async () => {
  const fixture = await checkerFixture()
  await write(
    fixture,
    'dist/index.xml',
    '<rss version="2.0"><img src="/missing.png"><content:encoded>&lt;img src=&quot;/escaped.png&quot;&gt;</content:encoded></rss>',
  )
  await write(
    fixture,
    'dist/index.html',
    '<link rel="canonical" href="https://chensl.me/"><img src="https://other.example/x.png" alt="x" loading="lazy" decoding="async">',
  )
  const result = run(process.execPath, [checker], fixture)
  assert.equal(result.status, 1)
  assert.match(result.stderr, /non-absolute RSS image URL "\/missing\.png"/)
  assert.match(result.stderr, /non-absolute RSS image URL "\/escaped\.png"/)
  assert.match(result.stderr, /blocked by CSP img-src/)
})

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

test('site checker accepts a minimal valid site', async () => {
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

test('site checker handles canonical tokens and external links', async () => {
  const fixture = await checkerFixture()
  await write(
    fixture,
    'dist/index.html',
    `<link rel="alternate Canonical" href="https://chensl.me/">
<a href="https://example.test/missing/">external</a>`,
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
  const headers = await readFile(path.join(fixture, 'dist/_headers'), 'utf8')
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
    const headers = await readFile(path.join(fixture, 'dist/_headers'), 'utf8')
    // Remove the source from its directive with string operations, so no hostname is used as a regexp.
    const start = headers.indexOf(directive)
    const at = headers.indexOf(source, start)
    assert.ok(
      start >= 0 && at > start && at < headers.indexOf(';', start),
      `${directive} lists ${source}`,
    )
    await write(fixture, 'dist/_headers', headers.slice(0, at) + headers.slice(at + source.length))
    const result = run(process.execPath, [checker], fixture)
    assert.equal(result.status, 1, result.stdout)
    assert.ok(
      result.stderr.includes(`CSP ${directive} must allow ${source}`),
      `missing "CSP ${directive} must allow ${source}" in: ${result.stderr}`,
    )
  }
})

test('site checker rejects permissive or missing script CSP', async () => {
  for (const replacement of ["script-src 'self' 'unsafe-inline'", "script-src 'self'", '']) {
    const fixture = await checkerFixture()
    const headers = await readFile(path.join(fixture, 'dist/_headers'), 'utf8')
    await write(fixture, 'dist/_headers', headers.replace(/script-src[^;]+/, replacement))
    const result = run(process.execPath, [checker], fixture)
    assert.equal(result.status, 1, 'a script policy without trusted hashes must fail')
    assert.match(result.stderr, /hash-based script CSP/)
  }
})

test('site checker requires immutable caching for fonts and fingerprinted CSS', async () => {
  const fixture = await checkerFixture()
  const headers = await readFile(path.join(fixture, 'dist/_headers'), 'utf8')
  await write(fixture, 'dist/_headers', headers.replace(adapterCacheRule, ''))
  const result = run(process.execPath, [checker], fixture)
  assert.equal(result.status, 1, result.stdout)
  assert.match(result.stderr, /\/_astro\/fonts\/font\.woff2 one immutable Cache-Control/)
  assert.doesNotMatch(result.stderr, /\/css\/style\.css/)
})

test('site checker rejects a Cache-Control that two rules join for one path', async () => {
  const fixture = await checkerFixture()
  const headers = await readFile(path.join(fixture, 'dist/_headers'), 'utf8')
  // Cloudflare joins the values of every matching rule, so the font would get the value twice.
  await write(
    fixture,
    'dist/_headers',
    `${headers}\n/_astro/fonts/*\n  Cache-Control: public, max-age=31536000, immutable\n`,
  )
  const result = run(process.execPath, [checker], fixture)
  assert.equal(result.status, 1, result.stdout)
  assert.match(result.stderr, /\/_astro\/fonts\/font\.woff2 one immutable Cache-Control/)
})

test('site checker requires cross-origin access for giscus themes', async () => {
  const fixture = await checkerFixture()
  const headers = await readFile(path.join(fixture, 'dist/_headers'), 'utf8')
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

test('site checker requires each article to have its own 1200x630 PNG share card', async () => {
  const fixture = await checkerFixture()
  await writeArticle(fixture, 'first')
  await writeArticle(fixture, 'second')
  const valid = run(process.execPath, [checker], fixture)
  assert.equal(valid.status, 0, valid.stderr)

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
  const result = run(process.execPath, [checker], fixture)
  assert.equal(result.status, 1, result.stdout)
  assert.match(result.stderr, /blog\/missing\/index\.html needs an og:image that is a built file/)
  assert.match(result.stderr, /og\/blog\/small\.png must be a 1200x630 PNG, not 1200x1200/)
  assert.match(result.stderr, /og\/blog\/text\.png must be a 1200x630 PNG, not another format/)
  assert.match(result.stderr, /blog\/undeclared\/index\.html must declare og:image:width 1200/)
  assert.match(
    result.stderr,
    /blog\/(?:copy|first)\/index\.html shares its og:image og\/blog\/first\.png/,
  )
})

test('site checker rejects share-card renderer code in the Worker bundle', async () => {
  const fixture = await checkerFixture()
  await write(fixture, 'server/chunks/worker.mjs', 'export {}')
  const valid = run(process.execPath, [checker], fixture)
  assert.equal(valid.status, 0, valid.stderr)

  await write(fixture, 'server/chunks/og.mjs', "import { Renderer } from '@takumi-rs/core'")
  const result = run(process.execPath, [checker], fixture)
  assert.equal(result.status, 1, result.stdout)
  assert.ok(
    result.stderr.includes(
      `Worker bundle includes the share-card renderer: ${path.join('server', 'chunks', 'og.mjs')}`,
    ),
    result.stderr,
  )
})

test('site checker allows WebAssembly only on the search page', async () => {
  const fixture = await checkerFixture()
  const headers = await readFile(path.join(fixture, 'dist/_headers'), 'utf8')
  const policy = headers.match(/script-src[^;]+/)[0]
  const meta = `<meta http-equiv="content-security-policy" content="${policy} 'wasm-unsafe-eval'">`
  await write(fixture, 'dist/about/index.html', meta)
  // The search page inherits the global policy, which lacks the source.
  await write(fixture, 'dist/search/index.html', '<main id="main"></main>')
  const result = run(process.execPath, [checker], fixture)
  assert.equal(result.status, 1, result.stdout)
  assert.match(result.stderr, /about\/index\.html CSP script-src must not allow 'wasm-unsafe-eval'/)
  assert.match(result.stderr, /search\/index\.html CSP script-src must allow 'wasm-unsafe-eval'/)
})

test('site checker requires every article in the search index and the embeddings', async () => {
  const fixture = await checkerFixture()
  await writeArticle(fixture, 'indexed', '<h1>Indexed</h1><div class="prose">Text.</div>')
  await writeArticle(fixture, 'missing', '<h1>Missing</h1><div class="prose">Text.</div>')
  await write(fixture, 'dist/search/index.html', '<main id="main"></main>')
  await write(
    fixture,
    'dist/pagefind/pagefind-entry.json',
    JSON.stringify({ languages: { zh: { page_count: 1 } } }),
  )
  await write(
    fixture,
    'src/data/related-posts.json',
    JSON.stringify({ posts: { indexed: { hash: 'old', related: [] } } }),
  )
  const result = run(process.execPath, [checker], fixture)
  assert.equal(result.status, 1, result.stdout)
  assert.match(result.stderr, /Pagefind indexed 1 pages; the build has 2 articles/)
  assert.match(result.stderr, /Article missing has no entry in src\/data\/related-posts\.json/)
  assert.doesNotMatch(result.stderr, /Article indexed has no entry/)
  // A changed article only warns: its old embedding still serves until the next run.
  assert.match(result.stderr, /articles changed since their embedding \(indexed\)/)
})
