import assert from 'node:assert/strict'
import { test } from 'node:test'
import { articleQuery, cleanQuery, fuse, normalizeQuery } from '../src/lib/search-fuse.ts'
import {
  clipSnippet,
  hanPairs,
  newsKeywordFallbackQuery,
  newsKeywordLimit,
  newsKeywordQuery,
} from '../src/lib/search-text.mjs'

test('query normalization strips control characters and quotes, and snippet clipping preserves surrogate pairs', () => {
  assert.equal(normalizeQuery('abc\0def\tghi'), 'abc def ghi')
  assert.equal(normalizeQuery('\0\x1f'), null)
  assert.equal(normalizeQuery('"""'), null)
  assert.equal(normalizeQuery('"芯片"'), '芯片')
  assert.equal(normalizeQuery('"OpenAI" 芯片'), 'OpenAI 芯片')
  assert.equal(cleanQuery('  a\0"b"  '), 'a b')
  const exact120 = `${'a'.repeat(118)}𠀀b`
  assert.equal(clipSnippet(exact120), exact120)
  assert.doesNotThrow(() => encodeURIComponent(clipSnippet(exact120)))
  const over120 = `${'a'.repeat(118)}𠀀bc`
  assert.equal(clipSnippet(over120), `${'a'.repeat(118)}𠀀…`)
  assert.doesNotThrow(() => encodeURIComponent(clipSnippet(over120)))
})

test('article queries space Han characters for Pagefind and quote multi-token words', () => {
  assert.deepEqual(articleQuery('函数式编程'), {
    query: '函 数 式 编 程',
    phrases: ['"函 数 式 编 程"'],
  })
  assert.deepEqual(articleQuery('Docker 单元测试'), {
    query: 'Docker 单 元 测 试',
    phrases: ['"单 元 测 试"'],
  })
  assert.deepEqual(articleQuery('abc𠀀'), {
    query: 'abc𠀀',
    phrases: ['"abc 𠀀"'],
  })
  assert.deepEqual(articleQuery('gobreak'), { query: 'gobreak', phrases: [] })
  assert.deepEqual(articleQuery('C++'), { query: 'C++', phrases: [] })
  assert.deepEqual(articleQuery('锁'), { query: '锁', phrases: [] })
})

test('news keyword queries bind literal terms and split Han compounds by word boundaries', () => {
  assert.deepEqual(newsKeywordQuery('AI 芯片').binds, ['%AI%', '%芯片%'])
  assert.deepEqual(newsKeywordQuery('芯片 AI').binds, ['%芯片%', '%AI%'])
  assert.deepEqual(newsKeywordQuery('OpenAI 芯片').binds, ['"OpenAI"', '%芯片%'])

  const pairs = newsKeywordFallbackQuery('安全漏洞')
  assert.ok(pairs)
  assert.equal(pairs.sql.includes('MATCH'), false)
  assert.deepEqual(pairs.binds, ['%安全%', '%漏洞%'])
  // Intl.Segmenter keeps three-character and two-character words intact instead of cutting mid-word.
  assert.deepEqual(hanPairs('开源大模型排行'), ['开源', '模型', '排行'])
  assert.deepEqual(hanPairs('容器文件系统'), ['容器', '文件', '系统'])
  // A trailing character is not its own term. Mixed and short queries do not split.
  assert.deepEqual(newsKeywordFallbackQuery('安全漏洞修')?.binds, ['%安全%', '%漏洞%'])
  assert.deepEqual(newsKeywordFallbackQuery('aaa 安全漏洞')?.binds, ['"aaa"', '%安全%', '%漏洞%'])
  assert.equal(newsKeywordFallbackQuery('docker'), null)
  assert.equal(newsKeywordFallbackQuery('智谱'), null)
  assert.equal(newsKeywordFallbackQuery('AI 芯片'), null)
  assert.equal(newsKeywordFallbackQuery('新模型'), null)
  // One repeated pair would be a single LIKE. The term limit can also drop the second pair.
  assert.equal(newsKeywordFallbackQuery('安全安全'), null)
  assert.equal(newsKeywordFallbackQuery('aaa bbb ccc ddd 安全漏洞'), null)
  assert.equal(newsKeywordLimit, 10)
})

test('reciprocal rank fusion interleaves article and news lists by rank', () => {
  const hit = (url) => ({ url })
  assert.deepEqual(
    fuse([
      [hit('/blog/a/'), hit('/blog/b/')],
      [hit('/news/1/'), hit('/news/2/')],
    ]).map(({ url }) => url),
    ['/blog/a/', '/news/1/', '/blog/b/', '/news/2/'],
  )
})
