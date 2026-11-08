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

const srgbY = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => (parseInt(hex.slice(i, i + 2), 16) / 255) ** 2.4)
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b
  return y < 0.022 ? y + (0.022 - y) ** 1.414 : y
}
// APCA lightness contrast |Lc|: perceptual, so a dark theme cannot pass on WCAG 2 ratios alone.
const apca = (text, bg) => {
  const t = srgbY(text),
    b = srgbY(bg)
  const c = b > t ? (b ** 0.56 - t ** 0.57) * 1.14 : (b ** 0.65 - t ** 0.62) * 1.14
  return Math.abs(c) < 0.1 ? 0 : (Math.abs(c) - 0.027) * 100
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

test('site tokens meet WCAG and APCA floors across every surface they appear on', () => {
  const css = readFileSync(path.join(root, 'src/styles/global.css'), 'utf8')
  for (const [index, mode] of ['light', 'dark'].entries()) {
    // Hex pairs only: non-hex tokens such as the rgb() fill are not contrast-checked here.
    const tokens = Object.fromEntries(
      [...css.matchAll(/--([\w-]+):\s*light-dark\((#[a-f\d]{6}),\s*(#[a-f\d]{6})\);/g)].map(
        ([, name, light, dark]) => [name, [light, dark][index]],
      ),
    )
    const rules = [
      {
        token: 'heading-color',
        on: ['background-color', 'surface-color', 'elevated-color'],
        wcag: 10,
        lc: 90,
      },
      {
        token: 'text-color',
        on: ['background-color', 'surface-color'],
        wcag: 7,
        lc: 85,
      },
      // A highlight covers a few words, not a reading column, so its floor sits one step lower.
      { token: 'text-color', on: ['mark-background-color'], wcag: 7, lc: 80 },
      {
        token: 'muted-color',
        on: ['background-color', 'surface-color', 'elevated-color'],
        wcag: 4.5,
        lc: 60,
      },
      { token: 'link-color', on: ['background-color', 'surface-color'], wcag: 4.5, lc: 60 },
    ]
    for (const { token, on, wcag, lc } of rules) {
      for (const surface of on) {
        const ratio = contrast(tokens[token], tokens[surface])
        assert.ok(
          ratio >= wcag,
          `${mode}: ${token} (${tokens[token]}) on ${surface} (${tokens[surface]}): WCAG ${ratio.toFixed(2)}:1 < ${wcag}:1`,
        )
        const lightness = apca(tokens[token], tokens[surface])
        assert.ok(
          lightness >= lc,
          `${mode}: ${token} (${tokens[token]}) on ${surface} (${tokens[surface]}): Lc ${lightness.toFixed(1)} < ${lc}`,
        )
      }
    }
    const border = contrast(tokens['border-color'], tokens['background-color'])
    const rule = contrast(tokens['rule-color'], tokens['background-color'])
    assert.ok(border >= 1.25, `${mode}: border on background WCAG ${border.toFixed(2)}:1 < 1.25:1`)
    assert.ok(rule >= 1.5, `${mode}: rule on background WCAG ${rule.toFixed(2)}:1 < 1.5:1`)
    assert.ok(
      rule > border,
      `${mode}: rule (${rule.toFixed(2)}:1) must outweigh border (${border.toFixed(2)}:1)`,
    )
  }
})

test('code tokens meet WCAG and APCA floors on the code fill and distinguish core syntax roles', () => {
  const css = readFileSync(path.join(root, 'src/styles/global.css'), 'utf8')
  const tokensByMode = ['light', 'dark'].map((index) =>
    Object.fromEntries(
      [...css.matchAll(/--([\w-]+):\s*light-dark\((#[a-f\d]{6}),\s*(#[a-f\d]{6})\);/g)].map(
        ([, name, light, dark]) => [name, [light, dark][index]],
      ),
    ),
  )
  for (const [mode, theme] of Object.entries(codeThemes)) {
    const bg = theme.colors['editor.background']
    const fg = theme.colors['editor.foreground']
    const link = tokensByMode[mode === 'light' ? 0 : 1]['link-color']
    assert.ok(contrast(fg, bg) >= 12, `${mode}: editor.foreground ${fg} on ${bg}`)
    for (const { scope, settings } of theme.tokenColors) {
      const ratio = contrast(settings.foreground, bg)
      assert.ok(
        ratio >= 4.5,
        `${mode}: ${scope[0]} ${settings.foreground} on the code fill ${bg}: ${ratio.toFixed(2)}:1`,
      )
      const lightness = apca(settings.foreground, bg)
      const isComment = scope.some((name) => name.startsWith('comment'))
      if (isComment) {
        assert.ok(
          lightness >= 60,
          `${mode}: comment ${settings.foreground} on ${bg}: Lc ${lightness.toFixed(1)} < 60`,
        )
      } else {
        assert.ok(
          lightness >= 68 && lightness <= 78,
          `${mode}: ${scope[0]} ${settings.foreground} on ${bg}: Lc ${lightness.toFixed(1)} outside 68-78`,
        )
      }
    }
    const colorFor = (role) =>
      theme.tokenColors.find(({ scope }) => scope.includes(role))?.settings.foreground
    const roles = ['keyword', 'string', 'entity.name.function', 'comment']
    for (const role of roles) {
      const color = colorFor(role)
      assert.ok(color, `${mode}: missing token role ${role}`)
      assert.notEqual(color, fg, `${mode}: ${role} (${color}) must differ from editor.foreground`)
    }
    // A keyword in the link hue would read as a link, not as syntax.
    assert.notEqual(
      colorFor('keyword'),
      link,
      `${mode}: keyword color must differ from --link-color ${link}`,
    )
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

test('pressed controls shrink subtly, to no less than 0.95', () => {
  const files = [
    path.join(root, 'src/styles/global.css'),
    path.join(root, 'src/styles/floating-controls.css'),
    ...walk(path.join(root, 'src')).filter((file) => file.endsWith('.astro')),
  ]
  for (const file of files) {
    const rel = path.relative(root, file)
    const content = readFileSync(file, 'utf8')
    for (const [, selector, body] of content.matchAll(/([^{}]*:active[^{}]*)\{([^{}]*)\}/g)) {
      for (const [, value] of body.matchAll(/scale\(([\d.]+)\)/g)) {
        const scale = Number(value)
        assert.ok(
          scale >= 0.95 && scale < 1,
          `${rel}: ${selector.trim()} presses to scale(${value})`,
        )
      }
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
