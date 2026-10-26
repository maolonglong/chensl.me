import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { Renderer } from '@takumi-rs/core'
import fontverter from 'fontverter'
import { cardLayout, renderCard, sansPath } from '../src/lib/og-card.mjs'
import { cardHeight, cardWidth } from '../src/lib/og.mjs'
import { root } from './support.mjs'

// Share cards: the title stays inside two lines, and each card's font subset holds every glyph it draws.

const titleFontSize = 64
const titleLineHeight = 1.3
const titleOf = async (card) => {
  const { node, fonts } = await cardLayout(card)
  const layout = await new Renderer().measure(node, { width: cardWidth, height: cardHeight, fonts })
  return layout.children.find((child) => child.runs.some((run) => card.title.includes(run.text)))
}

for (const [name, title] of [
  [
    'a long Chinese title',
    '用 Nix 管理两台 Apple 芯片 Mac 的配置：从 flake 到 home-manager 再到 nix-darwin 的一年实践与踩坑记录',
  ],
  [
    'an unbreakable identifier',
    'Supercalifragilisticexpialidocious_and_an_even_longer_identifier_without_any_spaces_at_all',
  ],
]) {
  test(`card titles stop at two lines inside the card for ${name}`, async () => {
    const node = await titleOf({ title, label: '2026-10-17' })
    const lines = new Set(
      node.runs.map((run) => Math.round(run.y / (titleFontSize * titleLineHeight))),
    )
    assert.equal(lines.size, 2, JSON.stringify(node.runs))
    assert.ok(node.height <= 2 * titleFontSize * titleLineHeight + 1, `height ${node.height}`)
    for (const run of node.runs) assert.ok(run.x + run.width <= node.width + 0.5, run.text)
  })
}

test('a short title stays on one line', async () => {
  const node = await titleOf({ title: 'Rust GAT', label: '2023-01-01' })
  assert.equal(new Set(node.runs.map((run) => Math.round(run.y))).size, 1)
})

test('card subsets draw the same pixels as the full Noto Sans SC face, ellipsis included', async () => {
  const card = {
    title:
      '从 Amp 看 Agent 产品设计：薄 Agent，厚流程。再加一段让标题超出两行的文字，确认省略号也来自 Noto Sans SC',
    label: '2026-07-11 · AI 辅助',
  }
  const png = await renderCard(card)
  assert.deepEqual(
    [png.readUInt32BE(16), png.readUInt32BE(20)],
    [cardWidth, cardHeight],
    'PNG IHDR size',
  )
  const { node } = await cardLayout(card)
  const full = await fontverter.convert(await readFile(path.join(root, sansPath)), 'truetype')
  const reference = await new Renderer().render(node, {
    width: cardWidth,
    height: cardHeight,
    format: 'png',
    fonts: [{ name: 'Noto Sans SC', data: full }],
  })
  assert.ok(png.equals(reference), 'a glyph missing from the subset falls back to another font')
})
