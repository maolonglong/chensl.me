// Writes the site icons in public/ from the hand-drawn sources in scripts/icons/:
//
//   node scripts/build-icons.mjs           # write the files
//   node scripts/build-icons.mjs --check   # fail when a committed file differs from the sources
//
// cat.svg is the full drawing, cat-32.svg and cat-16.svg are simplified for tab sizes. The colors
// come from the tokens in src/styles/global.css, so the icons add no color of their own.
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { parseArgs } from 'node:util'
import sharp from 'sharp'

const root = path.resolve(import.meta.dirname, '..')
const publicDir = path.join(root, 'public')

const css = await readFile(path.join(root, 'src/styles/global.css'), 'utf8')
function token(name) {
  const match = css.match(
    new RegExp(`--${name}:\\s*light-dark\\((#[0-9a-f]{6}),\\s*(#[0-9a-f]{6})\\)`),
  )
  if (!match) throw new Error(`src/styles/global.css has no light-dark() pair for --${name}`)
  return { light: match[1], dark: match[2] }
}
const stroke = token('link-color')
// The dark page color is close to a dark browser tab strip, so the dark tile uses the code fill.
const tile = { light: token('background-color').light, dark: token('code-background-color').dark }

async function source(name) {
  const svg = await readFile(path.join(import.meta.dirname, 'icons', name), 'utf8')
  const [, attributes, body] = svg.match(/<svg([^>]*)>([\s\S]*)<\/svg>/)
  const size = Number(attributes.match(/viewBox="0 0 (\d+) \1"/)[1])
  const strokeWidth = attributes.match(/stroke-width="([\d.]+)"/)[1]
  const paths = body
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim()
    .replace(/\s*\n\s*/g, '')
  return { size, strokeWidth, paths }
}

const strokeAttributes = 'fill="none" stroke-linecap="round" stroke-linejoin="round"'
const tileRadius = (size) => +(size * 0.22).toFixed(2)

// The cat as a group in a `size` viewBox, scaled by `scale` around the center.
function cat(drawing, size, { scale = 1, attributes = '' } = {}) {
  const factor = (size / drawing.size) * scale
  const offset = +((size * (1 - scale)) / 2).toFixed(3)
  const translate = offset ? `translate(${offset} ${offset}) ` : ''
  const transform = factor === 1 ? '' : ` transform="${translate}scale(${factor})"`
  return `<g${attributes}${transform} ${strokeAttributes} stroke-width="${drawing.strokeWidth}">${drawing.paths}</g>`
}

// A raster source in the light colors. 'tile' has rounded corners and is transparent outside them;
// 'square' is full bleed and opaque.
function raster(drawing, { shape, scale }) {
  const { size } = drawing
  const radius = shape === 'tile' ? tileRadius(size) : 0
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" rx="${radius}" fill="${tile.light}"/>${cat(drawing, size, { scale, attributes: ` stroke="${stroke.light}"` })}</svg>`
}

// The tab icon follows the color scheme. A media query in an SVG image measures the size it is
// drawn at, so a 16 px tab (a 1x screen) gets the 16 px drawing and larger sizes get the 32 px one.
function favicon(large, small) {
  const size = large.size
  const style = [
    `.b{fill:${tile.light}}.c{stroke:${stroke.light}}.s{display:none}`,
    `@media (prefers-color-scheme:dark){.b{fill:${tile.dark}}.c{stroke:${stroke.dark}}}`,
    '@media (max-width:24px){.l{display:none}.s{display:inline}}',
  ].join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}"><style>${style}</style><rect width="${size}" height="${size}" rx="${tileRadius(size)}" class="b"/>${cat(large, size, { attributes: ' class="c l"' })}${cat(small, size, { attributes: ' class="c s"' })}</svg>\n`
}

async function png(svg, pixels) {
  const size = Number(svg.match(/viewBox="0 0 (\d+)/)[1])
  return sharp(Buffer.from(svg), { density: (72 * pixels) / size })
    .resize(pixels, pixels)
    .png({ compressionLevel: 9 })
    .toBuffer()
}

// An ICO file that stores PNG frames, which every browser that reads favicon.ico accepts.
function ico(frames) {
  const header = Buffer.alloc(6 + 16 * frames.length)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(frames.length, 4)
  let offset = header.length
  frames.forEach(({ pixels, data }, index) => {
    const entry = 6 + 16 * index
    header.writeUInt8(pixels % 256, entry)
    header.writeUInt8(pixels % 256, entry + 1)
    header.writeUInt16LE(1, entry + 4)
    header.writeUInt16LE(32, entry + 6)
    header.writeUInt32LE(data.length, entry + 8)
    header.writeUInt32LE(offset, entry + 12)
    offset += data.length
  })
  return Buffer.concat([header, ...frames.map(({ data }) => data)])
}

const [full, tab, tiny] = await Promise.all(
  ['cat.svg', 'cat-32.svg', 'cat-16.svg'].map((name) => source(name)),
)
const tab16 = await png(raster(tiny, { shape: 'tile' }), 16)
const tab32 = await png(raster(tab, { shape: 'tile' }), 32)
const outputs = {
  'favicon.svg': favicon(tab, tiny),
  'favicon.ico': ico([
    { pixels: 16, data: tab16 },
    { pixels: 32, data: tab32 },
  ]),
  'favicon-16x16.png': tab16,
  'favicon-32x32.png': tab32,
  // iOS rounds the corners itself and shows transparent pixels as black.
  'apple-touch-icon.png': await png(raster(full, { shape: 'square' }), 180),
  'android-chrome-192x192.png': await png(raster(full, { shape: 'tile' }), 192),
  'android-chrome-512x512.png': await png(raster(full, { shape: 'tile' }), 512),
  // Launchers may crop to any shape inside the central circle of radius 40%; the cat stays in it.
  'maskable-512x512.png': await png(raster(full, { shape: 'square', scale: 0.9 }), 512),
}

const { values } = parseArgs({ options: { check: { type: 'boolean', default: false } } })
const stale = []
for (const [name, data] of Object.entries(outputs)) {
  const file = path.join(publicDir, name)
  if (!values.check) {
    await writeFile(file, data)
    continue
  }
  const current = await readFile(file).catch(() => null)
  if (!current || !(await samePixels(name, current, data))) stale.push(`public/${name}`)
}
if (stale.length) {
  console.error(`Stale icons: ${stale.join(', ')}. Run node scripts/build-icons.mjs.`)
  process.exit(1)
}

// PNG bytes can differ between zlib builds, so raster files compare decoded pixels.
async function samePixels(name, current, expected) {
  if (name.endsWith('.svg')) return current.toString() === expected
  const [a, b] = [current, expected].map((data) =>
    name.endsWith('.ico') ? icoFrames(data) : [data],
  )
  if (a.length !== b.length) return false
  for (let index = 0; index < a.length; index++) {
    const decode = (data) => sharp(data).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const [x, y] = await Promise.all([decode(a[index]), decode(b[index])])
    if (x.info.width !== y.info.width || x.info.height !== y.info.height) return false
    if (!x.data.every((value, i) => Math.abs(value - y.data[i]) <= 2)) return false
  }
  return true
}

function icoFrames(data) {
  return Array.from({ length: data.readUInt16LE(4) }, (_, index) => {
    const entry = 6 + 16 * index
    const offset = data.readUInt32LE(entry + 12)
    return data.subarray(offset, offset + data.readUInt32LE(entry + 8))
  })
}
