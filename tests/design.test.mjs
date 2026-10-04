import assert from 'node:assert/strict'
import { test } from 'node:test'
import { stylesheets } from '../src/lib/assets.ts'
import { codeThemes } from '../src/lib/markdown.mjs'

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

test('giscus themes meet AA contrast for reading and controls', () => {
  for (const [index, mode] of ['light', 'dark'].entries()) {
    const { css } = stylesheets[index]
    // A light-dark() pair resolves to its light or dark value in the theme's color scheme.
    const tokens = Object.fromEntries(
      [
        ...css.matchAll(
          /--([\w-]+):\s*(?:light-dark\((#[a-f\d]{6}),\s*(#[a-f\d]{6})\)|(#[a-f\d]{6}));/g,
        ),
      ].map(([, name, light, dark, plain]) => [name, plain ?? [light, dark][index]]),
    )
    assert.match(css, new RegExp(`color-scheme:\\s*${mode};`))
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
