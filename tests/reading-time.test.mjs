import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createMarkdownProcessor } from '@astrojs/markdown-remark'
import remarkMath from 'remark-math'
import { readingLength, remarkReadingStats } from '../src/lib/reading-time.mjs'

// Length and reading time come from the article text a reader reads: Chinese counts by character,
// other scripts by word, and code and display math do not count.
const processor = createMarkdownProcessor({
  remarkPlugins: [remarkMath, remarkReadingStats],
  syntaxHighlight: false,
})
const stats = async (markdown) =>
  (await (await processor).render(markdown)).metadata.frontmatter.readingStats

test('Chinese counts characters and skips punctuation', async () => {
  assert.deepEqual(await stats('这是一个测试。真的，「只是」测试！'), {
    characters: 12,
    words: 0,
    wordCount: 12,
    minutes: 1,
  })
})

test('English counts words, with contractions, hyphens and decimals as one word', async () => {
  assert.equal((await stats("Harness engineering isn't new: a well-known 6.7% gain.")).words, 8)
})

test('mixed text counts Chinese characters and the Latin words between them', async () => {
  assert.deepEqual(await stats('用 OpenAI 的 Codex 写 1BRC，**跑通了**测试。'), {
    characters: 8,
    words: 3,
    wordCount: 11,
    minutes: 1,
  })
})

test('code blocks and display math do not count, inline code does', async () => {
  const markdown = [
    '运行 `pnpm check` 即可。',
    '',
    '```js',
    'const 中文 = "these words are code and do not count"',
    '```',
    '',
    '    indented code is code too',
    '',
    '$$',
    'E = mc^2',
    '$$',
    '',
    '<pre>raw HTML is not article text</pre>',
  ].join('\n')
  assert.deepEqual(await stats(markdown), { characters: 4, words: 2, wordCount: 6, minutes: 1 })
})

test('links, lists, quotes and footnotes count their text', async () => {
  const markdown = [
    '> 引用里的字',
    '',
    '- [链接文字](https://example.com/a-long-url-that-is-not-read)',
    '',
    '正文[^1]',
    '',
    '[^1]: 脚注 note',
  ].join('\n')
  assert.deepEqual(await stats(markdown), { characters: 13, words: 1, wordCount: 14, minutes: 1 })
})

test('reading time adds 300 Chinese characters and 238 English words a minute', async () => {
  const chinese = '字'.repeat(1500)
  const english = Array.from({ length: 476 }, () => 'word').join(' ')
  assert.equal((await stats(`${chinese}\n\n${english}`)).minutes, 7)
  assert.equal((await stats('字')).minutes, 1)
  assert.equal((await stats('```\ncode only\n```')).minutes, 0)
})

test('the shown length rounds to hundreds from 100 on', () => {
  assert.equal(readingLength(87), '约 87 字')
  assert.equal(readingLength(149), '约 100 字')
  assert.equal(readingLength(4351), '约 4400 字')
})
