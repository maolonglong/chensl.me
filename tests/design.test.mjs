import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { root } from './support.mjs'

// Style sources meet the design contracts: giscus contrast and toolbar state, and heading scale.

test('giscus themes meet AA contrast for reading and controls', async () => {
  const luminance = (hex) =>
    hex
      .slice(1)
      .match(/../g)
      .map((channel) => Number.parseInt(channel, 16) / 255)
      .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
      .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0)
  const contrast = (foreground, background) => {
    const values = [luminance(foreground), luminance(background)].sort((a, b) => a - b)
    return (values[1] + 0.05) / (values[0] + 0.05)
  }
  for (const mode of ['light', 'dark']) {
    const css = await readFile(path.join(root, `src/styles/giscus-${mode}.css`), 'utf8')
    const tokens = Object.fromEntries(
      [...css.matchAll(/--([\w-]+):\s*(#[a-f\d]{6});/g)].map(([, name, value]) => [name, value]),
    )
    for (const [foreground, background] of [
      ['color-fg-default', 'color-canvas-default'],
      ['color-fg-muted', 'color-canvas-default'],
      ['color-accent-fg', 'color-canvas-default'],
      ['color-btn-text', 'color-btn-bg'],
      ['color-btn-primary-text', 'color-btn-primary-bg'],
    ]) {
      const ratio = contrast(tokens[foreground], tokens[background])
      assert.ok(ratio >= 4.5, `${mode}: ${foreground} on ${background}: ${ratio.toFixed(2)}:1`)
    }
  }
})

test('giscus themes distinguish the fixed-width toolbar state', async () => {
  for (const mode of ['light', 'dark']) {
    const css = await readFile(path.join(root, `src/styles/giscus-${mode}.css`), 'utf8')
    const selected = css.match(
      /\.gsc-comment-box:has\(\.gsc-is-fixed-width\) \.gsc-toolbar-item\s*\{([^}]+)\}/,
    )?.[1]
    assert.ok(selected, `${mode}: missing fixed-width toolbar state`)
    assert.match(selected, /color:\s*var\(--color-accent-fg\)/)
    assert.match(selected, /background-color:\s*var\(--color-accent-subtle\)/)
    assert.match(selected, /box-shadow:\s*inset 0 0 0 1px var\(--color-accent-muted\)/)
  }
})

test('every heading level outranks the article body size', async () => {
  const style =
    (await readFile(path.join(root, 'src/styles/global.css'), 'utf8')) +
    (await readFile(path.join(root, 'src/layouts/BaseLayout.astro'), 'utf8'))
  const rem = (declaration) => {
    const value = style.match(
      new RegExp(`(?:^|\\n)\\s*${declaration}\\s*\\{[^}]*?font-size:\\s*([\\d.]+)rem`, 's'),
    )?.[1]
    assert.ok(value, `missing font-size for ${declaration}`)
    return Number(value)
  }
  const body = rem(':global\\(body\\)')
  const deep = 'h4,\\nh5,\\nh6'
  for (const selector of ['h2', 'h3', deep]) {
    assert.ok(rem(selector) >= body, `${selector} does not outrank the ${body}rem article body`)
  }
  assert.ok(rem('h2') > rem('h3'), 'h2 must outrank h3')
  assert.ok(rem('h3') > rem(deep), 'h3 must outrank h4/h5/h6')
})
