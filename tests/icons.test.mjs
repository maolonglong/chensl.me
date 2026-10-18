import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import sharp from 'sharp'
import { root } from './support.mjs'

// Site icons: the committed files match their sources, and each platform gets the shape it needs.

const publicFile = (name) => path.join(root, 'public', name)

test('the committed icons match scripts/icons/ and the color tokens', () => {
  const result = spawnSync(process.execPath, ['scripts/build-icons.mjs', '--check'], {
    cwd: root,
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr || result.stdout)
})

test('the manifest lists PNG icons of their declared sizes, with an opaque maskable icon', async () => {
  const manifest = JSON.parse(await readFile(publicFile('site.webmanifest'), 'utf8'))
  for (const icon of manifest.icons) {
    const { width, height, format } = await sharp(publicFile(icon.src)).metadata()
    assert.equal(format, 'png', icon.src)
    assert.equal(`${width}x${height}`, icon.sizes, icon.src)
  }
  const maskable = manifest.icons.filter((icon) => icon.purpose === 'maskable')
  assert.equal(maskable.length, 1)
  assert.equal((await sharp(publicFile(maskable[0].src)).stats()).isOpaque, true)
})

// iOS shows transparent pixels of a home screen icon as black.
test('the Apple touch icon is an opaque 180 px square', async () => {
  const icon = sharp(publicFile('apple-touch-icon.png'))
  const { width, height } = await icon.metadata()
  assert.deepEqual([width, height], [180, 180])
  assert.equal((await icon.stats()).isOpaque, true)
})

test('favicon.ico holds 16 px and 32 px frames, and favicon.svg follows the color scheme', async () => {
  const ico = await readFile(publicFile('favicon.ico'))
  const sizes = Array.from({ length: ico.readUInt16LE(4) }, (_, index) => ico[6 + 16 * index])
  assert.deepEqual(sizes, [16, 32])
  assert.match(
    await readFile(publicFile('favicon.svg'), 'utf8'),
    /@media \(prefers-color-scheme:dark\)/,
  )
})
