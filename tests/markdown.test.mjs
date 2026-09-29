import assert from 'node:assert/strict'
import { lstat, readFile } from 'node:fs/promises'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { remarkSite } from '../src/lib/markdown.mjs'
import { behaviorFixture, root } from './support.mjs'

// Markdown output contracts: images, RSS URLs, captions, tables, alerts, footnotes, and the TOC.

function imageWithAlt(html, alt) {
  const tag = html.match(new RegExp(`<img\\b[^>]*alt="${alt}"[^>]*>`))?.[0]
  assert.ok(tag, `missing image alt=${alt}`)
  return tag
}

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

test('Markdown preserves code captions and accessible aligned tables', async () => {
  const { dist } = await behaviorFixture()
  const html = await readFile(path.join(dist, 'blog/render/index.html'), 'utf8')
  assert.match(html, /<figure class="code-figure">\s*<figcaption>db\/user\.go<\/figcaption>/)
  assert.doesNotMatch(html, /class="highlight"[^>]*\btitle=/)
  // The wrapper is the horizontal scroller, so it (not the <pre>) is the keyboard stop.
  const blocks = html.match(/<div class="highlight"[^>]*>\s*<pre\b[^>]*>/g) ?? []
  assert.equal(blocks.length, 2, 'expected a titled and an untitled code block')
  for (const block of blocks) {
    const [wrapper, pre] = block.split(/(?=<pre\b)/)
    assert.match(wrapper, /tabindex="0"/)
    assert.match(wrapper, /role="region"/)
    assert.match(wrapper, /aria-label="[^"]+"/)
    assert.doesNotMatch(pre, /tabindex=/)
  }
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

test('Markdown alerts drop the marker and lead with a labelled heading', async () => {
  const { dist } = await behaviorFixture()
  const html = await readFile(path.join(dist, 'blog/render/index.html'), 'utf8')
  assert.match(
    html,
    /<blockquote class="alert alert-tip">\s*<p class="alert-heading">建议<\/p>\s*<p><strong>Bold<\/strong> lead<\/p>\s*<\/blockquote>/,
  )
  assert.match(
    html,
    /<blockquote class="alert alert-note">\s*<p class="alert-heading">提示<\/p>\s*<p>Plain text<\/p>\s*<\/blockquote>/,
  )
  assert.doesNotMatch(html, /\[!(TIP|NOTE)\]/)
})

test('an alert marker followed by inline markup leaves no empty text node', () => {
  const text = (value) => ({ type: 'text', value })
  const tree = {
    type: 'root',
    children: [
      {
        type: 'blockquote',
        children: [
          {
            type: 'paragraph',
            children: [
              text('[!TIP]\n'),
              { type: 'strong', children: [text('Bold')] },
              text(' lead'),
            ],
          },
        ],
      },
    ],
  }
  remarkSite()(tree)
  const [heading, body] = tree.children[0].children
  assert.equal(heading.data.hProperties.className[0], 'alert-heading')
  assert.deepEqual(
    body.children.map((child) => child.type),
    ['strong', 'text'],
  )
})

test('native footnotes preserve accessible labels and distinct repeated backreferences', async () => {
  const { dist } = await behaviorFixture()
  const html = await readFile(path.join(dist, 'blog/render/index.html'), 'utf8')
  const notes = html.match(/<section data-footnotes[^>]*>[\s\S]*?<\/section>/)?.[0]
  assert.ok(notes, 'missing footnotes')
  assert.match(notes, /<span[^>]*id="footnote-label"[^>]*>脚注<\/span>/)
  assert.match(notes, /class="visually-hidden"/)
  assert.doesNotMatch(notes, /<hr\b|<h[1-6]\b/)
  assert.match(notes, /href="#user-content-fnref-shared"/)
  assert.match(notes, /href="#user-content-fnref-shared-2"/)
  assert.match(notes, /↩<sup>2<\/sup>/)
  const backreferences = [...notes.matchAll(/<a\b[^>]*data-footnote-backref[^>]*>/g)]
  assert.deepEqual(
    backreferences.map(([tag]) => [
      tag.match(/href="([^"]+)"/)[1],
      tag.match(/aria-label="([^"]+)"/)[1],
    ]),
    [
      ['#user-content-fnref-shared', '返回正文中脚注 1 的引用'],
      ['#user-content-fnref-shared-2', '返回正文中脚注 1 的第 2 次引用'],
      ['#user-content-fnref-other', '返回正文中脚注 2 的引用'],
    ],
  )
  assert.match(html, /data-footnote-ref[^>]*aria-describedby="footnote-label"/)
  assert.doesNotMatch(html, /class="footnote-(?:ref|backref)"/)
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
