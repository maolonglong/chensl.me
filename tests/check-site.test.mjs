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
