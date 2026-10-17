import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { behaviorFixture } from './support.mjs'

// Document contracts: the CSP precedes scripts and hashes them, metadata escapes hostile titles,
// and each page names its share card.

test('CSP precedes executable scripts and hashes their emitted bytes', async () => {
  const { dist } = await behaviorFixture()
  for (const page of ['index.html', 'blog/render/index.html', '404.html']) {
    const html = await readFile(path.join(dist, page), 'utf8')
    const policy = html.match(/<meta http-equiv="content-security-policy" content="([^"]+)"/)
    assert.ok(policy, `${page}: missing CSP`)
    const scripts = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script[^>]*>/gi)].filter(
      ([, attributes]) => !attributes.includes('application/ld+json'),
    )
    assert.ok(scripts.length, `${page}: missing scripts`)
    for (const script of scripts) {
      assert.ok(policy.index < script.index, `${page}: executable script precedes CSP`)
      if (script[1].includes('src=')) continue
      const hash = createHash('sha256').update(script[2]).digest('base64')
      assert.ok(policy[1].includes(`'sha256-${hash}'`), `${page}: untrusted inline script`)
    }
  }
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

test('pages point to their own 1200x630 share card; the 404 page has none', async () => {
  const { dist } = await behaviorFixture()
  // Parse with Python's HTML parser, so the assertion reads attribute values as a crawler does.
  const metadata = (html) => {
    const parsed = spawnSync(
      'python3',
      [
        '-c',
        `
from html.parser import HTMLParser
import json, sys
found = {}
class Parser(HTMLParser):
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        key = attrs.get('property') or attrs.get('name')
        if tag == 'meta' and key and (key.startswith('og:image') or key.startswith('twitter:')):
            found[key] = attrs.get('content')
Parser().feed(sys.stdin.read())
print(json.dumps(found))
`,
      ],
      { input: html, encoding: 'utf8' },
    )
    assert.equal(parsed.status, 0, parsed.stderr)
    return JSON.parse(parsed.stdout)
  }
  for (const [page, card, alt] of [
    ['index.html', 'home.png', '陈劭珑的个人网站与技术博客'],
    ['blog/index.html', 'blog.png', '技术文章：系统性能、Go/Zig/Rust 与 Agent 工程实践'],
    ['blog/render/index.html', 'blog/render.png', 'Escaped <title> & "quote"'],
  ]) {
    const meta = metadata(await readFile(path.join(dist, page), 'utf8'))
    const image = `https://chensl.me/og/${card}`
    assert.deepEqual(
      meta,
      {
        'og:image': image,
        'og:image:type': 'image/png',
        'og:image:width': '1200',
        'og:image:height': '630',
        'og:image:alt': alt,
        'twitter:card': 'summary_large_image',
        'twitter:title': meta['twitter:title'],
        'twitter:description': meta['twitter:description'],
        'twitter:image': image,
        'twitter:image:alt': alt,
      },
      page,
    )
    const png = await readFile(path.join(dist, 'og', card))
    assert.equal(png.subarray(1, 4).toString(), 'PNG', card)
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1200, 630], card)
  }
  assert.deepEqual(metadata(await readFile(path.join(dist, '404.html'), 'utf8')), {})
})
