import assert from 'node:assert/strict'
import { readFile, readdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import {
  astroProject,
  behaviorFixture,
  buildAstro,
  frontmatter,
  root,
  run,
  write,
} from './support.mjs'

// Collection validation, publication rules, standalone pages, and the sitemap.

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

test('Astro rejects misspelled publication fields instead of publishing a draft', async () => {
  const fixture = await astroProject('astro-unknown-metadata-')
  await write(
    fixture,
    'src/content/blog/unfinished.md',
    `${frontmatter('Unfinished article', '2025-01-01', 'darft: true\n')}Private draft.`,
  )
  const result = run(path.join(root, 'node_modules/.bin/astro'), ['build'], fixture)
  assert.notEqual(result.status, 0, 'unknown frontmatter must fail the build')
  assert.match(result.stderr + result.stdout, /darft/)
})

for (const [name, creation, field] of [
  ['unknown mode', { mode: 'automatic' }, 'mode'],
  ['missing mode', { note: 'Only a note.' }, 'mode'],
  ['blank note', { mode: 'ai-assisted', note: '   ' }, 'note'],
]) {
  test(`Astro rejects a creation declaration with ${name}`, async () => {
    const fixture = await astroProject('astro-invalid-creation-')
    await write(
      fixture,
      'src/content/blog/invalid.md',
      `${frontmatter('Invalid creation', '2025-01-01', `creation: ${JSON.stringify(creation)}\n`)}Body.`,
    )
    const result = run(path.join(root, 'node_modules/.bin/astro'), ['build'], fixture)
    assert.notEqual(result.status, 0, `${name} must fail the build`)
    assert.match(result.stderr + result.stdout, new RegExp(`creation[\\s\\S]*${field}`))
  })
}

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

test('drafts and future posts are filtered and dates sort by instants', async () => {
  const { dist } = await behaviorFixture()
  const archive = await readFile(path.join(dist, 'blog/index.html'), 'utf8')
  assert.doesNotMatch(archive, /Secret draft|Future post/)
  assert.ok(archive.indexOf('Escaped &lt;title&gt;') < archive.indexOf('Below'))
  assert.ok(archive.indexOf('Below') < archive.indexOf('Older'))
  await assert.rejects(readFile(path.join(dist, 'blog/draft/index.html'), 'utf8'))
  await assert.rejects(readFile(path.join(dist, 'blog/future/index.html'), 'utf8'))
})

test('Markdown exports preserve the raw body and publish only visible articles', async () => {
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
    // Astro's collection body excludes frontmatter and trims only the outer whitespace.
    const body = source.replace(/^---\n[\s\S]*?\n---\n/, '').trim()
    const markdown = await readFile(path.join(dist, `blog/${id}/index.md`), 'utf8')
    assert.equal(
      markdown.slice(-body.length),
      body,
      `${id}: original Markdown body must be verbatim`,
    )
    assert.ok(markdown.includes(`Canonical: https://chensl.me/blog/${id}/\n`))
    const html = await readFile(path.join(dist, `blog/${id}/index.html`), 'utf8')
    assert.match(
      html,
      new RegExp(
        `<link rel="alternate" type="text/markdown" href="https://chensl.me/blog/${id}/index.md"`,
      ),
    )
  }
  const markdown = await readFile(path.join(dist, 'blog/render/index.md'), 'utf8')
  assert.match(
    markdown,
    /^# Escaped <title> & "quote"\n\nPublished: 2025-01-02\nUpdated: 2025-01-03\n/,
  )
  assert.doesNotMatch(await readFile(path.join(dist, 'blog/older/index.md'), 'utf8'), /^Updated:/m)
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

let staleBuild
async function staleFixture() {
  if (!staleBuild)
    staleBuild = (async () => {
      const fixture = await astroProject('astro-stale-notice-')
      const recent = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      const writtenNotice = '这篇文章写于两年多以前，部分内容可能已经过时。'
      const updatedNotice = '这篇文章最后更新于两年多以前，部分内容可能已经过时。'
      const cases = [
        { id: 'old', pubDate: '2000-01-01', notice: writtenNotice, hidden: false },
        {
          id: 'recently-updated',
          pubDate: '2000-01-01',
          updatedDate: recent,
          notice: updatedNotice,
          hidden: true,
        },
        {
          id: 'old-update',
          pubDate: '2000-01-01',
          updatedDate: '2001-01-01',
          notice: updatedNotice,
          hidden: false,
        },
        { id: 'fresh', pubDate: recent, notice: writtenNotice, hidden: true },
      ]
      for (const { id, pubDate, updatedDate } of cases) {
        await write(
          fixture,
          `src/content/blog/${id}.md`,
          `${frontmatter(id, pubDate, updatedDate ? `updatedDate: ${updatedDate}\n` : '')}Original body.`,
        )
      }
      return { dist: await buildAstro(fixture), cases }
    })()
  return staleBuild
}

test('stale article notices use the last modification date and stay out of content exports', async () => {
  const { dist, cases } = await staleFixture()
  for (const { id, pubDate, updatedDate, notice, hidden } of cases) {
    const html = await readFile(path.join(dist, `blog/${id}/index.html`), 'utf8')
    const header = html.match(/<header class="post-header"[^>]*>([\s\S]*?)<\/header>/)?.[1]
    assert.ok(header, `${id}: missing article header`)
    const notices = [...header.matchAll(/<p class="post-notice"([^>]*)>([^<]*)<\/p>/g)]
    assert.deepEqual(
      notices.map(([, , text]) => text.trim()),
      [notice],
      id,
    )
    const attributes = notices[0][1]
    assert.equal(
      attributes.match(/\bdata-stale-since="([^"]+)"/)?.[1],
      new Date(updatedDate ?? pubDate).toISOString(),
      `${id}: last modification date`,
    )
    assert.equal(/\shidden(?=\s|$)/.test(attributes), hidden, `${id}: build-time visibility`)
    assert.match(header, /class="post-meta"[^>]*>[\s\S]*?<\/p>\s*<p class="post-notice"/)
    const markdown = await readFile(path.join(dist, `blog/${id}/index.md`), 'utf8')
    assert.doesNotMatch(markdown, /两年多以前|post-notice/)
    assert.ok(markdown.endsWith('Original body.'))
  }
  for (const file of ['index.xml', 'index.html', 'blog/index.html']) {
    assert.doesNotMatch(
      await readFile(path.join(dist, file), 'utf8'),
      /两年多以前|post-notice/,
      file,
    )
  }
})
