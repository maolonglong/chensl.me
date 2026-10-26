import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { behaviorFixture } from './support.mjs'

// Font declarations: pages use system sans-serif for text and declare only JetBrains Mono for code, without preloads.

test('shared layouts declare only JetBrains Mono with fingerprinted WOFF2 files and no preloads', async () => {
  const { dist } = await behaviorFixture()
  for (const file of ['index.html', 'blog/render/index.html', 'blog/older/index.html']) {
    const html = await readFile(path.join(dist, file), 'utf8')
    assert.match(html, /font-family:\s*['"]?JetBrains Mono/, file)
    assert.doesNotMatch(html, /rel=["']preload["']/, file)
    assert.doesNotMatch(html, /TsangerJinKai02|Source Serif/, file)
  }
  const index = await readFile(path.join(dist, 'index.html'), 'utf8')
  const faces = [...index.matchAll(/@font-face\s*\{([^}]+)\}/g)].map(([, body]) => body)
  assert.equal(faces.length, 4, 'only the four JetBrains Mono faces are declared')
  for (const face of faces) {
    assert.match(face, /font-family:\s*['"]?JetBrains Mono/)
    assert.match(face, /font-display:\s*swap/)
    const url = face.match(/url\(["']?([^)'"]+)/)?.[1]
    assert.ok(url, 'face must declare a font URL')
    assert.match(url, /^\/_astro\/fonts\/[^)'"?]+\.woff2$/, 'font URLs must be fingerprinted WOFF2')
    const bytes = await readFile(path.join(dist, url.replace(/^\//, '')))
    assert.equal(bytes.toString('ascii', 0, 4), 'wOF2')
  }
})
