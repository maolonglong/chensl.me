import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createMarkdownProcessor } from '@astrojs/markdown-remark'
import { fontProviders } from 'astro/config'
import subsetFont from 'subset-font'
import { Blob, Face } from 'harfbuzzjs'
import { unified } from 'unified'
import rehypeParse from 'rehype-parse'
import remarkMath from 'remark-math'
import { visit } from 'unist-util-visit'
import { rehypeSite, remarkSite } from './markdown.mjs'

const parser = unified().use(rehypeParse, { fragment: true })
const markdownProcessor = createMarkdownProcessor({
  remarkPlugins: [remarkSite, remarkMath],
  rehypePlugins: [rehypeSite],
  syntaxHighlight: false,
})

// Google Fonts' Noto Sans SC slicing: each entry is one @font-face unicode-range list, ordered
// from the most to the least frequent characters. Source and date: public/fonts/tsanger-jinkai02/NOTICE.md.
const sliceSource = 'vendor/fonts/google-fonts-noto-sans-sc-slices.json'
// Supported characters that no Google slice lists, mostly rare ideographs, in code point order.
const remainderSliceSize = 500

function parseRanges(tokens) {
  return tokens.map((token) => {
    const [start, end = start] = token.split('-').map((hex) => Number.parseInt(hex, 16))
    return [start, end]
  })
}

// Every character JinKai supports lands in exactly one slice. Slices depend only on the font
// and the slice table, never on site text, so their URLs stay cached across content edits.
export function sliceCodepoints(supported, table) {
  const assigned = new Set()
  const slices = []
  for (const ranges of table) {
    const points = []
    for (const [start, end] of parseRanges(ranges))
      for (let point = start; point <= end; point++)
        if (supported.has(point) && !assigned.has(point)) {
          assigned.add(point)
          points.push(point)
        }
    if (points.length) slices.push(points)
  }
  const rest = [...supported].filter((point) => !assigned.has(point)).sort((a, b) => a - b)
  for (let index = 0; index < rest.length; index += remainderSliceSize)
    slices.push(rest.slice(index, index + remainderSliceSize))
  return slices
}

const textOf = (points) =>
  [...points]
    .sort((a, b) => a - b)
    .map((point) => String.fromCodePoint(point))
    .join('')

// Slices take about a minute to build, so they are cached by font and table digest. Parallel
// test builds share the cache: each writes a temporary file and renames it into place.
async function buildSlices(root, source, supported, preserveNameIds) {
  const table = JSON.parse(await readFile(path.join(root, sliceSource), 'utf8'))
  const digest = createHash('sha256')
    .update(source)
    .update(JSON.stringify(table))
    .update(String(remainderSliceSize))
    .digest('hex')
    .slice(0, 16)
  const directory = path.join(root, 'node_modules/.cache/site-fonts', digest)
  await mkdir(directory, { recursive: true })
  const existing = new Set(await readdir(directory))
  const slices = sliceCodepoints(supported, table)
  return Promise.all(
    slices.map(async (points, index) => {
      const name = `slice-${String(index).padStart(3, '0')}.woff2`
      const file = path.join(directory, name)
      if (!existing.has(name)) {
        const temporary = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}`
        await writeFile(
          temporary,
          await subsetFont(source, textOf(points), { targetFormat: 'woff2', preserveNameIds }),
        )
        await rename(temporary, file)
      }
      return { file, points }
    }),
  )
}

// The slice faces form a second family, next after the Astro-managed one in --font-serif.
// The browser tries it only for a character outside the site subsets and then downloads the
// one slice whose range holds it. The ranges total about 110 KB, too much to inline in every
// page as Astro inlines its font faces, so BaseLayout imports this file and Vite bundles it
// into the shared, cached stylesheet and fingerprints the slice URLs.
export const sliceFamily = 'TsangerJinKai02 Slices'
async function writeSliceStylesheet(directory, slices) {
  const css = slices
    .map(
      ({ file, points }) =>
        `@font-face{font-family:"${sliceFamily}";src:url("${path
          .relative(directory, file)
          .split(path.sep)
          .join(
            '/',
          )}") format("woff2");font-weight:400 500;font-style:normal;font-display:swap;unicode-range:${unicodeRanges(points).join(',')}}`,
    )
    .join('\n')
  await writeFile(path.join(directory, 'slices.css'), `${css}\n`)
}

function unicodeRanges(points) {
  const ranges = []
  for (const point of [...points].sort((a, b) => a - b)) {
    const last = ranges.at(-1)
    if (last && point === last[1] + 1) last[1] = point
    else ranges.push([point, point])
  }
  return ranges.map(([start, end]) =>
    start === end ? `U+${start.toString(16)}` : `U+${start.toString(16)}-${end.toString(16)}`,
  )
}

export async function siteFonts() {
  const root = process.cwd()
  const source = await readFile(
    path.join(root, 'vendor/fonts/tsanger-jinkai02/TsangerJinKai02-W04.ttf'),
  )
  const face = new Face(new Blob(source))
  const supported = new Set(face.collectUnicodes())
  const preserveNameIds = [...new Set(face.listNames().map(({ nameId }) => nameId))]
  const common = new Set()
  const articles = new Set()
  const markdown = await markdownProcessor

  // Conservatively scan source, including template strings and decoded HTML entities. The
  // Astro config holds Markdown labels, such as the footnote heading.
  // This runs before Astro resolves fonts, with no dependence on a previous build.
  const sources = (await readdir(path.join(root, 'src'), { recursive: true }))
    .sort()
    .map((file) => path.join('src', file))
  for (const file of [...sources, 'astro.config.mjs']) {
    if (!/\.(astro|md|ts|mjs|css)$/.test(file)) continue
    const input = await readFile(path.join(root, file), 'utf8')
    let html = input
    if (file.endsWith('.md')) {
      try {
        const body = input.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '')
        html += (await markdown.render(body)).code
      } catch {
        // Invalid Markdown or TeX fails in the collection loader with the article filename.
      }
    }
    let text = input
    visit(parser.parse(html), 'text', (node) => {
      text += node.value
    })
    const target = file.startsWith(path.join('src', 'content', 'blog', path.sep))
      ? articles
      : common
    for (const character of text) {
      const point = character.codePointAt(0)
      if (supported.has(point)) target.add(point)
    }
  }
  for (const point of common) articles.delete(point)

  const variants = []
  const directory = path.join(root, '.astro/site-fonts')
  await mkdir(directory, { recursive: true })
  await writeSliceStylesheet(directory, await buildSlices(root, source, supported, preserveNameIds))

  // Common and article subsets are mutually exclusive.
  for (const [name, points] of [
    ['articles', articles],
    ['common', common],
  ]) {
    if (!points.size) continue
    const file = path.join(directory, `${name}.woff2`)
    await writeFile(
      file,
      await subsetFont(source, textOf(points), { targetFormat: 'woff2', preserveNameIds }),
    )
    variants.push({
      src: [file],
      weight: '400 500',
      style: 'normal',
      unicodeRange: unicodeRanges(points),
    })
  }
  return [
    {
      provider: fontProviders.local(),
      name: 'TsangerJinKai02',
      cssVariable: '--font-jinkai',
      display: 'swap',
      fallbacks: [],
      optimizedFallbacks: false,
      options: { variants },
    },
    {
      provider: fontProviders.local(),
      name: 'JetBrains Mono',
      cssVariable: '--font-jetbrains',
      display: 'swap',
      fallbacks: [],
      optimizedFallbacks: false,
      options: {
        variants: [
          ['Regular', 400, 'normal'],
          ['Bold', 700, 'normal'],
          ['Italic', 400, 'italic'],
          ['BoldItalic', 700, 'italic'],
        ].map(([name, weight, style]) => ({
          src: [`./src/assets/fonts/jetbrains-mono-2.304/JetBrainsMono-${name}.woff2`],
          weight,
          style,
        })),
      },
    },
  ]
}
