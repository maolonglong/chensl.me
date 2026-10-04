import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { root, run, temporaryDirectory, write } from './support.mjs'

const checker = path.join(root, 'scripts/check-site.mjs')

// scripts/check-site.mjs rejects broken links, feeds, and policies, and accepts valid output.

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
    headers.replace(
      'Content-Security-Policy:',
      "Content-Security-Policy: script-src 'self' 'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=' https://giscus.app https://static.cloudflareinsights.com;",
    ),
  )
  return fixture
}

for (const type of ['text/plain', 'text/markdown']) {
  test(`site checker requires a UTF-8 charset rule for ${type} exports`, async () => {
    const fixture = await checkerFixture()
    await write(fixture, 'dist/blog/nested/article/index.html', '<article>Article</article>')
    await write(fixture, 'dist/blog/nested/article/index.md', '# Article\n')
    await write(
      fixture,
      'dist/llms.txt',
      '- [Article](https://chensl.me/blog/nested/article/index.md)\n',
    )
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

test('site checker rejects unpaired article pages and Markdown exports', async () => {
  const fixture = await checkerFixture()
  await write(fixture, 'dist/blog/page-only/index.html', '<article>Missing export</article>')
  await write(fixture, 'dist/blog/export-only/index.md', '# Missing page\n')
  const result = run(process.execPath, [checker], fixture)
  assert.equal(result.status, 1)
  assert.match(result.stderr, /page-only.*missing Markdown export/i)
  assert.match(result.stderr, /export-only.*missing article page/i)
})

test('site checker rejects broken Markdown images and llms.txt targets', async () => {
  const fixture = await checkerFixture()
  await write(fixture, 'dist/blog/article/index.html', '<article>Article</article>')
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
  await write(
    fixture,
    'dist/llms.txt',
    '# ~chensl\n\n## Articles\n\n- [Missing](https://chensl.me/blog/missing/index.md)\n',
  )
  const result = run(process.execPath, [checker], fixture)
  assert.equal(result.status, 1)
  for (const image of ['missing.png', 'missing%20diagram.svg', 'missing-html.png']) {
    assert.ok(result.stderr.includes(image), result.stderr)
  }
  assert.match(result.stderr, /llms.txt.*missing.*missing\/index.md/)
})

test('site checker accepts real Markdown images and ignores image syntax in code', async () => {
  const fixture = await checkerFixture()
  await write(fixture, 'dist/blog/article/index.html', '<article>Article</article>')
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
  await write(
    fixture,
    'dist/llms.txt',
    '# ~chensl\n\n## Articles\n\n- [Article](https://chensl.me/blog/article/index.md)\n',
  )
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

test('site checker rejects a content store nested in the sibling Worker bundle', async () => {
  const fixture = await checkerFixture()
  await write(fixture, 'server/chunks/nested/worker.mjs', 'export {}')
  const valid = run(process.execPath, [checker], fixture)
  assert.equal(valid.status, 0, valid.stderr)

  await write(fixture, 'server/chunks/nested/data-layer-content.fixture.mjs', 'export {}')
  const result = run(process.execPath, [checker], fixture)
  assert.equal(result.status, 1, result.stdout)
  assert.match(result.stderr, /Worker bundle must not include the content store:/)
  assert.ok(
    result.stderr.includes(
      path.join('server', 'chunks', 'nested', 'data-layer-content.fixture.mjs'),
    ),
  )
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
  await write(fixture, 'dist/_headers', headers.replace(/^\/_astro\/fonts\/\*\n[\s\S]*?\n\n/m, ''))
  const result = run(process.execPath, [checker], fixture)
  assert.equal(result.status, 1, result.stdout)
  assert.match(result.stderr, /\/_astro\/fonts\/\* as immutable/)
  assert.doesNotMatch(result.stderr, /\/css\/\* as immutable/)
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
