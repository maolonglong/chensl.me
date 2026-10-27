import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import {
  blogSchema,
  isPublishedPost,
  parsePostDate,
  rewriteUnzonedFrontMatter,
} from '../src/lib/post-date.ts'
import { isStaleSince } from '../src/lib/stale.ts'
import { astroProject, behaviorFixture, frontmatter, root, run, write } from './support.mjs'

// Collection validation, publication rules, document contracts, stale notices, and exports.

test('a clock time with no timezone is Shanghai time', () => {
  assert.equal(parsePostDate('2024-06-15T23:00:00').toISOString(), '2024-06-15T15:00:00.000Z')
  assert.equal(parsePostDate('2024-06-15 23:00:00').toISOString(), '2024-06-15T15:00:00.000Z')
  assert.equal(parsePostDate('2024-06-15T23:00:00+08:00').toISOString(), '2024-06-15T15:00:00.000Z')
  assert.equal(parsePostDate('2024-06-15T23:00:00Z').toISOString(), '2024-06-15T23:00:00.000Z')
  assert.equal(parsePostDate('2024-06-15').toISOString(), '2024-06-15T00:00:00.000Z')
  const now = Date.parse('2024-06-15T15:00:00.000Z')
  assert.equal(isPublishedPost({ pubDate: '2024-06-15T23:00:00' }, now), true)
  assert.equal(isPublishedPost({ pubDate: '2024-06-15T23:00:01' }, now), false)
  assert.equal(isPublishedPost({ draft: true, pubDate: '2024-06-15' }, now), false)
  assert.equal(isPublishedPost({ draft: true, pubDate: '2024-06-15T23:00:01' }, now, true), true)
  const source =
    '---\npubDate: 2024-06-15T23:00:00\nupdatedDate: 2024-06-15T23:00:00+08:00\n---\n\n23:00 stays in the body\n'
  const rewritten = rewriteUnzonedFrontMatter(source)
  assert.match(rewritten, /pubDate: 2024-06-15T23:00:00\+08:00/)
  assert.match(rewritten, /updatedDate: 2024-06-15T23:00:00\+08:00\n/)
  assert.match(rewritten, /23:00 stays in the body/)
  assert.equal(
    rewriteUnzonedFrontMatter(
      '---\npubDate: 2024-06-15T23:00:00 # publication\nupdatedDate: 2024-06-16T23:00:00 # modification\n---\n',
    ),
    '---\npubDate: 2024-06-15T23:00:00+08:00 # publication\nupdatedDate: 2024-06-16T23:00:00+08:00 # modification\n---\n',
  )
})

test('staleness starts strictly after two calendar years, including across a leap year', () => {
  const now = Date.parse('2025-03-01T12:34:56Z')
  assert.equal(isStaleSince(new Date('2023-03-01T12:34:56Z'), now), false)
  assert.equal(isStaleSince(new Date('2023-03-01T12:34:55.999Z'), now), true)
  assert.equal(isStaleSince(new Date('2023-03-01T12:34:56.001Z'), now), false)
})

test('collection schema rejects missing required metadata, unknown fields, and invalid creation declarations', () => {
  assert.equal(blogSchema.safeParse({ pubDate: '2025-01-01' }).success, false)
  assert.equal(
    blogSchema.safeParse({ title: 'Unfinished', pubDate: '2025-01-01', darft: true }).success,
    false,
  )
  for (const creation of [
    { mode: 'automatic' },
    { note: 'Only a note.' },
    { mode: 'ai-assisted', note: '   ' },
  ]) {
    assert.equal(
      blogSchema.safeParse({ title: 'Post', pubDate: '2025-01-01', creation }).success,
      false,
    )
  }
  assert.equal(
    blogSchema.safeParse({
      title: 'Valid',
      pubDate: '2025-01-01',
      creation: { mode: 'ai-assisted', note: 'Human-led.' },
    }).success,
    true,
  )
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

test('CSP precedes executable scripts and hashes their emitted bytes, and metadata escapes hostile titles', async () => {
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
  const html = await readFile(path.join(dist, 'blog/render/index.html'), 'utf8')
  assert.match(html, /<title>[^<]*Escaped &lt;title&gt; &amp; (?:&quot;|&#34;)quote/)
  assert.match(html, /rel="canonical" href="https:\/\/chensl\.me\/blog\/render\/"/)
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
    'https://chensl.me/news/',
    'https://chensl.me/news/archive/',
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

test('drafts and future posts are filtered, dates sort by instants, and giscus respects comments: false', async () => {
  const { dist } = await behaviorFixture()
  const home = await readFile(path.join(dist, 'index.html'), 'utf8')
  const archive = await readFile(path.join(dist, 'blog/index.html'), 'utf8')
  assert.match(home, /👋 Hi! 我是陈劭珑/)
  assert.doesNotMatch(archive, /Secret draft|Future post/)
  assert.doesNotMatch(archive, /\bpost-description\b/)
  assert.ok(archive.indexOf('Escaped &lt;title&gt;') < archive.indexOf('Below'))
  assert.ok(archive.indexOf('Below') < archive.indexOf('Older'))
  await assert.rejects(readFile(path.join(dist, 'blog/draft/index.html'), 'utf8'))
  await assert.rejects(readFile(path.join(dist, 'blog/future/index.html'), 'utf8'))

  const withComments = await readFile(path.join(dist, 'blog/render/index.html'), 'utf8')
  assert.match(withComments, /<section[^>]*\bclass="comments"/)
  assert.match(withComments, /https:\/\/giscus\.app\/client\.js/)
  const withoutComments = await readFile(path.join(dist, 'blog/older/index.html'), 'utf8')
  assert.doesNotMatch(withoutComments, /\bclass="comments"|giscus\.app\/client\.js/)
})

test('stale notices and creation declarations render across pages, RSS, and Markdown exports', async () => {
  const { fixture, dist } = await behaviorFixture()
  const exports = (await readdir(path.join(dist, 'blog'), { recursive: true }))
    .filter((file) => file.endsWith('/index.md'))
    .sort()
  assert.deepEqual(exports, ['below/index.md', 'older/index.md', 'render/index.md'])
  for (const id of ['render', 'below', 'older']) {
    const source = await readFile(
      path.join(fixture, 'src/content/blog', id === 'render' ? 'render/index.md' : `${id}.md`),
      'utf8',
    )
    const body = source.replace(/^---\n[\s\S]*?\n---\n/, '').trim()
    const markdown = await readFile(path.join(dist, `blog/${id}/index.md`), 'utf8')
    assert.equal(
      markdown.slice(-body.length),
      body,
      `${id}: original Markdown body must be verbatim`,
    )
    assert.ok(markdown.includes(`Canonical: https://chensl.me/blog/${id}/\n`))
    assert.doesNotMatch(markdown, /两年多以前|post-notice/)
    const html = await readFile(path.join(dist, `blog/${id}/index.html`), 'utf8')
    assert.match(
      html,
      new RegExp(
        `<link rel="alternate" type="text/markdown" href="https://chensl.me/blog/${id}/index.md"`,
      ),
    )
  }

  // render: fresh (< 2 years), no creation declaration.
  const renderHtml = await readFile(path.join(dist, 'blog/render/index.html'), 'utf8')
  assert.match(renderHtml, /<p class="post-notice"[^>]*\bhidden\b[^>]*>/)
  assert.doesNotMatch(renderHtml, /class="post-creation/)
  const renderMd = await readFile(path.join(dist, 'blog/render/index.md'), 'utf8')
  assert.match(
    renderMd,
    /^# Escaped <title> & "quote"\n\nPublished: 2025-01-02\nUpdated: 2025-01-03\n/,
  )
  assert.doesNotMatch(renderMd, /^Creation:/m)

  // below: unzoned Shanghai dates with YAML comments, updated > 2 years ago, ai-assisted + note.
  const belowHtml = await readFile(path.join(dist, 'blog/below/index.html'), 'utf8')
  assert.match(
    belowHtml,
    /<time datetime="2024-06-15T15:00:00\.000Z"[^>]*>2024-06-15<\/time>[\s\S]*?<span class="post-creation"[^>]*>AI 辅助<\/span>/,
  )
  assert.match(
    belowHtml,
    /<p class="post-creation-note meta"[^>]*>\s*AI 用于整理结构和润色，特殊文本 &amp; &lt;script&gt;unexpected\(\)&lt;\/script&gt; 应当原样可读。\s*<\/p>/,
  )
  assert.match(
    belowHtml,
    /<p class="post-notice"(?![^>]*\bhidden\b)[^>]*data-stale-since="2024-06-16T15:00:00\.000Z"[^>]*>\s*这篇文章最后更新于两年多以前，部分内容可能已经过时。\s*<\/p>/,
  )
  const belowMd = await readFile(path.join(dist, 'blog/below/index.md'), 'utf8')
  assert.match(
    belowMd,
    /Published: 2024-06-15\nUpdated: 2024-06-16\nCanonical: https:\/\/chensl\.me\/blog\/below\/\nCreation: AI 辅助\nCreation note: AI 用于整理结构和润色，特殊文本 & \\<script\\>unexpected\(\)\\<\/script\\> 应当原样可读。\n/,
  )

  // older: published > 2 years ago without updatedDate, handmade without note.
  const olderHtml = await readFile(path.join(dist, 'blog/older/index.html'), 'utf8')
  assert.match(olderHtml, /<span class="post-creation"[^>]*>手作<\/span>/)
  assert.doesNotMatch(olderHtml, /class="post-creation-note/)
  assert.match(
    olderHtml,
    /<p class="post-notice"(?![^>]*\bhidden\b)[^>]*data-stale-since="2024-01-01T00:00:00\.000Z"[^>]*>\s*这篇文章写于两年多以前，部分内容可能已经过时。\s*<\/p>/,
  )
  const olderMd = await readFile(path.join(dist, 'blog/older/index.md'), 'utf8')
  assert.doesNotMatch(olderMd, /^Updated:|^Creation note:/m)
  assert.match(olderMd, /^Creation: 手作$/m)

  const rss = await readFile(path.join(dist, 'index.xml'), 'utf8')
  assert.doesNotMatch(rss, /两年多以前|post-notice/)
  assert.match(rss, /创作方式：AI 辅助。AI 用于整理结构和润色/)
  assert.match(rss, /&lt;p&gt;创作方式：手作&lt;\/p&gt;/)

  for (const name of ['pixel.png', 'café.png', 'shape.svg']) {
    assert.deepEqual(
      await readFile(path.join(dist, 'blog/render', name)),
      await readFile(path.join(fixture, 'src/content/blog/render', name)),
      `relative image ${name} must remain available without rewriting the body`,
    )
  }
})

test('llms.txt lists absolute Markdown exports newest first with optional descriptions', async () => {
  const { dist } = await behaviorFixture()
  const llms = await readFile(path.join(dist, 'llms.txt'), 'utf8')
  assert.equal(
    llms,
    `# ~chensl

> 陈劭珑的个人网站与技术博客

## Articles

- [Escaped \\<title\\> & "quote"](https://chensl.me/blog/render/index.md): A concise description.
- [Below](https://chensl.me/blog/below/index.md)
- [Older](https://chensl.me/blog/older/index.md)
`,
  )
  for (const [, url] of llms.matchAll(/\]\(([^)]+)\)/g)) {
    await readFile(path.join(dist, new URL(url).pathname))
  }
})
