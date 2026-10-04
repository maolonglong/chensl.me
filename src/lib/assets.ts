import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const hash = (content: string | Buffer) =>
  createHash('sha256').update(content).digest('hex').slice(0, 12)

const read = (file: string) => readFileSync(path.join(root, 'src/styles', file), 'utf8')

// giscus takes one stylesheet URL per theme: shared light-dark() colors plus the theme's own values.
export const stylesheets = ['light', 'dark'].map((theme) => {
  const css = `${read('giscus.css')}\n${read(`giscus-${theme}.css`)}`
  return { name: `giscus-${theme}.${hash(css)}`, css }
})

export const giscusThemes = {
  light: `/css/${stylesheets[0].name}.css`,
  dark: `/css/${stylesheets[1].name}.css`,
}
