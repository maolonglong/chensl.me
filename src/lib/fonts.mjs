import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fontProviders } from 'astro/config'
import subsetFont from 'subset-font'
import { Blob, Face } from 'harfbuzzjs'
import { unified } from 'unified'
import rehypeParse from 'rehype-parse'
import { visit } from 'unist-util-visit'

const parser = unified().use(rehypeParse, { fragment: true })

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

  // Conservatively scan source, including template strings and decoded HTML entities. The
  // Astro config holds Markdown labels, such as the footnote heading.
  // This runs before Astro resolves fonts, with no dependence on a previous build.
  const sources = (await readdir(path.join(root, 'src'), { recursive: true }))
    .sort()
    .map((file) => path.join('src', file))
  for (const file of [...sources, 'astro.config.mjs']) {
    if (!/\.(astro|md|ts|mjs|css)$/.test(file)) continue
    const input = await readFile(path.join(root, file), 'utf8')
    let text = input
    visit(parser.parse(input), 'text', (node) => {
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
  // Common and article subsets are mutually exclusive.
  for (const [name, points] of [
    ['articles', articles],
    ['common', common],
  ]) {
    if (!points.size) continue
    const text = [...points]
      .sort((a, b) => a - b)
      .map((point) => String.fromCodePoint(point))
      .join('')
    const file = path.join(directory, `${name}.woff2`)
    await writeFile(
      file,
      await subsetFont(source, text, { targetFormat: 'woff2', preserveNameIds }),
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
