// Renders share cards at build time, in Node. Only the prerendered src/pages/og/ route imports
// this module, so the renderer and the font never enter the Worker bundle.
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { Renderer } from '@takumi-rs/core'
import fontverter from 'fontverter'
import subsetFont from 'subset-font'
import { cardHeight, cardWidth } from './og.mjs'
import { siteTitle, siteUrl } from './site.mjs'

const siteHost = new URL(siteUrl).host
export const sansPath = 'src/assets/fonts/noto-sans-sc/NotoSansSC-SemiBold.woff2'

const ellipsis = '…'

let shared
function load() {
  shared ??= (async () => {
    const root = process.cwd()
    const [woff2, css] = await Promise.all([
      readFile(path.join(root, sansPath)),
      readFile(path.join(root, 'src/styles/global.css'), 'utf8'),
    ])
    const font = await fontverter.convert(woff2, 'truetype')
    return { font, colors: lightColors(css) }
  })()
  return shared
}

// Cards use the light theme's tokens, so they add no color of their own.
function lightColors(css) {
  const color = (token) => {
    const value = css.match(new RegExp(`--${token}:\\s*light-dark\\((#[0-9a-f]{3,8}),`, 'i'))?.[1]
    if (!value) throw new Error(`src/styles/global.css has no light-dark() value for --${token}`)
    return value
  }
  return {
    background: color('background-color'),
    heading: color('heading-color'),
    text: color('text-color'),
    muted: color('muted-color'),
    border: color('border-color'),
    rule: color('rule-color'),
  }
}

const text = (value, style) => ({ type: 'text', text: value, style })
const container = (style, children) => ({ type: 'container', style, children })

/**
 * The node tree and fonts of one card, for renderCard and for layout tests.
 * @param {{ title: string, label: string }} card
 */
export async function cardLayout({ title, label }) {
  const { font, colors } = await load()
  // Each card embeds only its own glyphs from the build-time Noto Sans SC face.
  const glyphs = await subsetFont(font, siteTitle + title + label + siteHost + ellipsis, {
    targetFormat: 'truetype',
  })
  const node = container(
    {
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      padding: 72,
      backgroundColor: colors.background,
      border: `2px solid ${colors.border}`,
      fontFamily: '"Noto Sans SC"',
      letterSpacing: '-0.01em',
    },
    [
      text(siteTitle, { fontSize: 36, fontWeight: 600, color: colors.heading }),
      text(title, {
        fontSize: 64,
        fontWeight: 600,
        lineHeight: 1.3,
        color: colors.heading,
        letterSpacing: '-0.015em',
        wordBreak: 'keep-all',
        overflowWrap: 'anywhere',
        textWrap: 'balance',
        lineClamp: 2,
      }),
      container(
        {
          display: 'flex',
          justifyContent: 'space-between',
          paddingTop: 24,
          borderTop: `2px solid ${colors.rule}`,
          fontSize: 28,
          letterSpacing: 0,
        },
        [text(label, { color: colors.muted }), text(siteHost, { color: colors.text })],
      ),
    ],
  )
  return { node, fonts: [{ name: 'Noto Sans SC', data: glyphs }] }
}

/**
 * Returns a PNG of cardWidth × cardHeight. The title wraps to at most two lines and ends with an
 * ellipsis when it is longer.
 * @param {{ title: string, label: string }} card
 */
export async function renderCard(card) {
  const { node, fonts } = await cardLayout(card)
  // A Renderer keeps every face registered under a family name, so a shared one would collect the
  // subsets of all earlier cards. A fresh one renders each card with its own subset only.
  return new Renderer().render(node, { width: cardWidth, height: cardHeight, format: 'png', fonts })
}
