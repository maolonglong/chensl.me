import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const hash = (content: string | Buffer) =>
  createHash('sha256').update(content).digest('hex').slice(0, 12)
const fontUrl = (file: string) =>
  `/${file}?v=${hash(readFileSync(path.join(root, 'public', file)))}`
const family = 'fonts/tsanger-jinkai02'
const ranges = JSON.parse(readFileSync(path.join(root, 'data/serif.json'), 'utf8')).coreRanges
const fontFace = (file: string, range: string) => `@font-face {
    font-family: "TsangerJinKai02";
    src: url('${fontUrl(file)}') format("woff2");
    font-weight: 400 500;
    font-style: normal;
    font-display: swap;
    unicode-range: ${range};
}`
// Overlapping faces resolve in reverse order. Complete fallbacks precede the core.
const serifCss = readdirSync(path.join(root, 'public', family, 'subsets'))
  .sort()
  .map((file) => {
    const [, start, end] = file.replace('.woff2', '').split('-')
    return fontFace(`${family}/subsets/${file}`, `U+${start}-${end}`)
  })
  .concat(fontFace(`${family}/core-400.woff2`, ranges))
  .join('\n')

export const codeFontCss = [
  ['Regular', 400, 'normal'],
  ['Bold', 700, 'normal'],
  ['Italic', 400, 'italic'],
  ['BoldItalic', 700, 'italic'],
]
  .map(
    ([face, weight, style]) => `@font-face {
    font-family: "JetBrains Mono";
    src: url('${fontUrl(`fonts/jetbrains-mono-2.304/JetBrainsMono-${face}.woff2`)}') format("woff2");
    font-weight: ${weight};
    font-style: ${style};
    font-display: swap;
}`,
  )
  .join('\n')

export const stylesheets = [
  { name: 'serif', css: serifCss },
  ...['light', 'dark'].map((theme) => ({
    name: `giscus-${theme}`,
    css: readFileSync(path.join(root, `src/styles/giscus-${theme}.css`), 'utf8'),
  })),
].map(({ name, css }) => ({ name: `${name}.${hash(css)}`, css }))

export const serifHref = `/css/${stylesheets[0].name}.css`
export const giscusThemes = {
  light: `/css/${stylesheets[1].name}.css`,
  dark: `/css/${stylesheets[2].name}.css`,
}
