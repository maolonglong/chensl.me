import assert from 'node:assert/strict'
import { readFile, rm } from 'node:fs/promises'
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
