import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { stylesheets } from '../src/lib/assets.ts'
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
  const giscusLight = readFileSync(path.join(root, 'src/styles/giscus.css'), 'utf8')
  assert.doesNotMatch(giscusLight, /light-dark\(#f5f4ed,/)
})

test('site tokens meet contrast rules across every surface they appear on', () => {
  const css = readFileSync(path.join(root, 'src/styles/global.css'), 'utf8')
  for (const [index, mode] of ['light', 'dark'].entries()) {
    const tokens = Object.fromEntries(
      [...css.matchAll(/--([\w-]+):\s*light-dark\((#[a-f\d]{6}),\s*(#[a-f\d]{6})\);/g)].map(
        ([, name, light, dark]) => [name, [light, dark][index]],
      ),
    )
    const rules = [
      { token: 'heading-color', on: ['background-color', 'surface-color'], min: 10 },
      {
        token: 'text-color',
        on: ['background-color', 'surface-color', 'mark-background-color'],
        min: 7,
      },
      { token: 'muted-color', on: ['background-color', 'surface-color'], min: 4.5 },
      { token: 'link-color', on: ['background-color', 'surface-color'], min: 4.5 },
    ]
    for (const { token, on, min } of rules) {
      for (const surface of on) {
        const ratio = contrast(tokens[token], tokens[surface])
        assert.ok(
          ratio >= min,
          `${mode}: ${token} (${tokens[token]}) on ${surface} (${tokens[surface]}): ${ratio.toFixed(2)}:1 < ${min}:1`,
        )
      }
    }
  }
})

test('code tokens meet AA contrast on the code fill and distinguish core syntax roles', () => {
  for (const [mode, theme] of Object.entries(codeThemes)) {
    const bg = theme.colors['editor.background']
    const fg = theme.colors['editor.foreground']
    assert.ok(contrast(fg, bg) >= 12, `${mode}: editor.foreground ${fg} on ${bg}`)
    for (const { scope, settings } of theme.tokenColors) {
      const ratio = contrast(settings.foreground, bg)
      assert.ok(
        ratio >= 4.5,
        `${mode}: ${scope[0]} ${settings.foreground} on the code fill ${bg}: ${ratio.toFixed(2)}:1`,
      )
    }
    const colorFor = (role) =>
      theme.tokenColors.find(({ scope }) => scope.includes(role))?.settings.foreground
    const roles = ['keyword', 'string', 'entity.name.function', 'comment']
    for (const role of roles) {
      const color = colorFor(role)
      assert.ok(color, `${mode}: missing token role ${role}`)
      assert.notEqual(color, fg, `${mode}: ${role} (${color}) must differ from editor.foreground`)
    }
    const unique = new Set(roles.map(colorFor))
    assert.equal(unique.size, roles.length, `${mode}: core syntax roles must have distinct colors`)
  }
})

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    return entry.isDirectory() ? walk(full) : [full]
  })
}

test('site styles use the size ladder and do not transition theme colors', () => {
  const files = [
    path.join(root, 'src/styles/global.css'),
    path.join(root, 'src/styles/floating-controls.css'),
    ...walk(path.join(root, 'src')).filter((file) => file.endsWith('.astro')),
  ]
  for (const file of files) {
    const rel = path.relative(root, file)
    const content = readFileSync(file, 'utf8')
    for (const [, value] of content.matchAll(/font-size:\s*([^;}\n]+);/g)) {
      assert.match(
        value.trim(),
        /^(?:var\(--size-[\w-]+\)|100%|inherit|[\d.]+em)$/,
        `${rel}: off-ladder font-size ${value.trim()}`,
      )
    }
    for (const [, value] of content.matchAll(/transition:\s*([^;]+);/g)) {
      assert.doesNotMatch(
        value,
        /(?<![\w-])color(?![\w-])/,
        `${rel}: transition on color ${value.trim()}`,
      )
    }
  }
})

test('theme-color metas and the web manifest match the page background tokens', () => {
  const css = readFileSync(path.join(root, 'src/styles/global.css'), 'utf8')
  const [, bgLight, bgDark] = css.match(
    /--background-color:\s*light-dark\((#[a-f\d]{6}),\s*(#[a-f\d]{6})\)/,
  )
  const theme = readFileSync(path.join(root, 'src/components/Theme.astro'), 'utf8')
  for (const [mode, hex] of [
    ['light', bgLight],
    ['dark', bgDark],
  ]) {
    const meta = theme.match(
      new RegExp(
        `<meta[^>]*name="theme-color"[^>]*content="${hex}"[^>]*media="\\(prefers-color-scheme: ${mode}\\)"`,
      ),
    )
    assert.ok(meta, `Theme.astro ${mode} theme-color must equal --background-color ${hex}`)
  }
  const manifest = JSON.parse(readFileSync(path.join(root, 'public/site.webmanifest'), 'utf8'))
  assert.equal(
    manifest.theme_color,
    bgLight,
    'manifest theme_color must equal the light background',
  )
  assert.equal(
    manifest.background_color,
    bgLight,
    'manifest background_color must equal the light background',
  )
})

test('Noto Sans SC license file preserves Adobe copyright and Reserved Font Name', () => {
  const ofl = readFileSync(path.join(root, 'public/fonts/noto-sans-sc/OFL.txt'), 'utf8')
  assert.match(ofl, /Adobe/)
  assert.match(ofl, /Reserved Font Name ['‘]Source['’]/)
})
