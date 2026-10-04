import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { codeThemes } from '../src/lib/markdown.mjs'
import { root } from './support.mjs'

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

// Style sources meet the contrast contracts for giscus and code.

test('giscus themes meet AA contrast for reading and controls', async () => {
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

test('code comments meet AA contrast on the code fill', () => {
  for (const [mode, theme] of Object.entries(codeThemes)) {
    const comment = theme.tokenColors.find(({ scope }) => scope.includes('comment')).settings
    const ratio = contrast(comment.foreground, theme.colors['editor.background'])
    assert.ok(
      ratio >= 4.5,
      `${mode}: comment ${comment.foreground} on the code fill: ${ratio.toFixed(2)}:1`,
    )
  }
})
