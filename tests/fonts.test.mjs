import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import fontverter from 'fontverter'
import { Blob, Face } from 'harfbuzzjs'
import { astroProject, behaviorFixture, buildAstro, frontmatter, root, write } from './support.mjs'

// Font declarations, precedence, versioning, conditional code fonts, and the cold-visit transfer budget.

test('JinKai declarations preserve precedence, versioning, and cold-visit budget', async () => {
  const { dist } = await behaviorFixture()
  const index = await readFile(path.join(dist, 'index.html'), 'utf8')
  const faces = [...index.matchAll(/@font-face\s*\{([^}]+)\}/g)]
    .map(([, body]) => body)
    .filter((body) => body.includes('TsangerJinKai02'))
  assert.equal(faces.length, 257)
  for (const face of faces) {
    assert.match(face, /font-weight:\s*400 500/)
    assert.match(face, /font-display:\s*swap/)
    assert.match(face, /\/_astro\/fonts\/[^)'"]+\.woff2/)
  }
  const candidates = faces.reverse().map((face) => ({
    url: face.match(/url\(["']?([^)'"]+)/)?.[1],
    ranges: (face.match(/unicode-range:\s*([^;}]+)/)?.[1] ?? '').split(',').map((token) => {
      const [start, end] = token.trim().slice(2).split('-')
      return [Number.parseInt(start, 16), Number.parseInt(end ?? start, 16)]
    }),
  }))
  const text = index.replace(/<(script|style)\b[\s\S]*?<\/\1>/g, '').replace(/<[^>]+>/g, '')
  const needed = new Set()
  for (const character of text) {
    const codepoint = character.codePointAt(0)
    const face = candidates.find((candidate) =>
      candidate.ranges.some(([start, end]) => codepoint >= start && codepoint <= end),
    )
    if (face?.url) needed.add(face.url)
  }
  let total = 0
  for (const url of needed) {
    const file = await readFile(path.join(dist, url.split('?')[0].replace(/^\//, '')))
    assert.ok(!url.includes('?'), 'font cache keys must use fingerprinted paths')
    assert.equal(file.toString('ascii', 0, 4), 'wOF2')
    total += file.length
  }
  assert.equal(needed.size, 1, 'home must use only its small common subset')
  assert.ok(total <= 100 * 1024, `${Math.round(total / 1024)} KiB exceeds 100 KiB`)
  const source = new Face(
    new Blob(
      await readFile(path.join(root, 'vendor/fonts/tsanger-jinkai02/TsangerJinKai02-W04.ttf')),
    ),
  )
  const coverage = new Set()
  for (const candidate of candidates) {
    const buffer = await readFile(path.join(dist, candidate.url))
    const face = new Face(new Blob(await fontverter.convert(buffer, 'sfnt')))
    for (const cp of face.collectUnicodes()) coverage.add(cp)
  }
  assert.deepEqual(
    [...coverage].sort((a, b) => a - b),
    [...source.collectUnicodes()],
  )
})

test('shared layouts declare code fonts without preloading them', async () => {
  const { dist } = await behaviorFixture()
  for (const file of ['index.html', 'blog/render/index.html', 'blog/older/index.html']) {
    const html = await readFile(path.join(dist, file), 'utf8')
    assert.match(html, /font-family:\s*['"]?JetBrains Mono/, file)
    assert.doesNotMatch(html, /rel=["']preload["']/)
  }
})

test('font subsets follow edited content and remain deterministic across builds', async () => {
  const fixture = await astroProject('astro-font-update-')
  await write(
    fixture,
    'src/pages/index.astro',
    `---\nimport BaseLayout from '../layouts/BaseLayout.astro'\n---\n<BaseLayout><p>龘 &amp; &#20598;</p></BaseLayout>`,
  )
  await write(fixture, 'src/content/blog/post.md', `${frontmatter('Article', '2025-01-01')}麤`)
  const dist = await buildAstro(fixture)
  async function subsets() {
    const html = await readFile(path.join(dist, 'index.html'), 'utf8')
    const faces = [...html.matchAll(/@font-face\s*\{([^}]+)\}/g)]
      .map(([, face]) => face)
      .filter((face) => face.includes('TsangerJinKai02'))
    return Promise.all(
      faces.slice(-2).map(async (css) => {
        const url = css.match(/url\(["']?([^)'"]+)/)[1]
        const bytes = await readFile(path.join(dist, url))
        const face = new Face(new Blob(await fontverter.convert(bytes, 'sfnt')))
        return { url, chars: [...face.collectUnicodes()], copyright: face.getName(0, 'en') }
      }),
    )
  }
  const first = await subsets()
  assert.ok(first[1].chars.includes('龘'.codePointAt(0)))
  assert.ok(first[1].chars.includes('偶'.codePointAt(0)), 'decode HTML character references')
  assert.ok(first[0].chars.includes('麤'.codePointAt(0)))
  assert.ok(!first[1].chars.includes('麤'.codePointAt(0)))
  assert.equal(
    first[0].chars.some((cp) => first[1].chars.includes(cp)),
    false,
  )
  assert.ok(first.every((face) => face.copyright.length > 0))
  await buildAstro(fixture)
  assert.deepEqual(await subsets(), first)
  await write(
    fixture,
    'src/pages/index.astro',
    `---\nimport BaseLayout from '../layouts/BaseLayout.astro'\n---\n<BaseLayout><p>龘麤</p></BaseLayout>`,
  )
  await buildAstro(fixture)
  const updated = await subsets()
  assert.ok(updated[1].chars.includes('麤'.codePointAt(0)))
  assert.notEqual(updated[1].url, first[1].url)
})
