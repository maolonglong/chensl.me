import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const hash = (content: string | Buffer) =>
  createHash('sha256').update(content).digest('hex').slice(0, 12)

export const stylesheets = ['light', 'dark']
  .map((theme) => ({
    name: `giscus-${theme}`,
    css: readFileSync(path.join(root, `src/styles/giscus-${theme}.css`), 'utf8'),
  }))
  .map(({ name, css }) => ({ name: `${name}.${hash(css)}`, css }))

export const giscusThemes = {
  light: `/css/${stylesheets[0].name}.css`,
  dark: `/css/${stylesheets[1].name}.css`,
}
