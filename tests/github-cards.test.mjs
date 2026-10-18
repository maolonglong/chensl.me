import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { createMarkdownProcessor } from '@astrojs/markdown-remark'
import { articleFromHtml } from '../scripts/search-inputs.mjs'
import { remarkSite } from '../src/lib/markdown.mjs'
import { formatCount, statsLine } from '../src/lib/github-repo.mjs'
import { remarkReadingStats } from '../src/lib/reading-time.mjs'

// The build renders a complete repository card from the committed snapshot. These tests use the
// real snapshot entries for sony/gobreaker and the archived maolonglong/zig-buddy2.
const snapshot = JSON.parse(
  readFileSync(new URL('../src/data/github-repos.json', import.meta.url), 'utf8'),
)
const markdown = await createMarkdownProcessor({ remarkPlugins: [remarkSite] })
const render = async (body) => (await markdown.render(body)).code

test('counts use a lowercase k from a thousand on, and the stats line drops missing parts', () => {
  const cases = [
    [0, '0'],
    [999, '999'],
    [1000, '1k'],
    [3708, '3.7k'],
    [12_345, '12.3k'],
    [1_250_000, '1.3m'],
  ]
  for (const [count, shown] of cases) assert.equal(formatCount(count), shown, String(count))
  assert.equal(
    statsLine({ language: 'Go', stars: 3708, forks: 230, pushedAt: '2026-02-07T09:21:38Z' }),
    'Go · ★ 3.7k · fork 230 · 2026 年 2 月更新',
  )
  // The month is the Asia/Shanghai month, like every date on the site.
  assert.equal(
    statsLine({ language: null, stars: 3, forks: 0, pushedAt: '2024-01-31T16:30:00Z' }),
    '★ 3 · fork 0 · 2024 年 2 月更新',
  )
  assert.equal(
    statsLine({ language: 'Zig', stars: 1, forks: 1, pushedAt: null }),
    'Zig · ★ 1 · fork 1',
  )
})

test('a standalone repository link renders the snapshot card with its key for the refresh', async () => {
  const html = await render('<https://github.com/Sony/gobreaker>\n')
  const repo = snapshot['sony/gobreaker']
  assert.match(html, /^<p class="repo-card" data-repo="sony\/gobreaker">/)
  assert.match(html, /<a href="https:\/\/github\.com\/Sony\/gobreaker">/)
  assert.match(html, /<span class="repo-card-name">sony\/gobreaker<\/span>/)
  assert.match(html, new RegExp(`<span class="repo-card-description">${repo.description}</span>`))
  assert.ok(html.includes(`>${statsLine(repo)}</span>`), html)
  assert.doesNotMatch(html, /已归档/)
  assert.doesNotMatch(html, /<(?:img|script|svg|iframe)\b/)
})

test('an archived repository shows the label, and other GitHub links stay plain', async () => {
  const html = await render(
    [
      '<https://github.com/maolonglong/zig-buddy2>',
      '正文里的 <https://github.com/sony/gobreaker> 链接。',
      '<https://github.com/sony/gobreaker/blob/master/README.md>',
      '<https://github.com/example-owner/not-in-snapshot>',
    ].join('\n\n'),
  )
  assert.equal(html.match(/class="repo-card"/g)?.length, 1)
  assert.match(html, /<span class="repo-card-archived" data-pagefind-ignore="">已归档<\/span>/)
  assert.match(html, /<a href="https:\/\/github\.com\/example-owner\/not-in-snapshot">/)
})

test('search text keeps the description and leaves out the stats line and the archived label', async () => {
  const html = await render('开头。\n\n<https://github.com/maolonglong/zig-buddy2>\n')
  const { text } = articleFromHtml(`<h1>标题</h1><div class="prose">${html}</div>`)
  const repo = snapshot['maolonglong/zig-buddy2']
  assert.ok(text.includes(repo.description), text)
  assert.ok(text.includes('maolonglong/zig-buddy2'), text)
  assert.ok(!text.includes('★'), text)
  assert.ok(!text.includes('fork'), text)
  assert.ok(!text.includes('已归档'), text)
})

test('reading time counts the name and description, like search, but not the stats line or label', async () => {
  const processor = await createMarkdownProcessor({
    remarkPlugins: [remarkSite, remarkReadingStats],
  })
  const stats = async (body) => (await processor.render(body)).metadata.frontmatter.readingStats
  const repo = snapshot['maolonglong/zig-buddy2']
  assert.deepEqual(
    await stats('开头。\n\n<https://github.com/maolonglong/zig-buddy2>\n'),
    await stats(`开头。\n\n${repo.name} ${repo.description}\n`),
  )
})
