import { expect, test } from './site.mjs'

// Article header metadata: date, rounded length, reading time, creation declaration, and JSON-LD wordCount.
for (const width of [375, 1280]) {
  for (const mode of ['light', 'dark']) {
    test(`article metadata, reading time, and creation label at ${width}px in ${mode}`, async ({
      page,
      open,
      capture,
    }) => {
      await page.setViewportSize({ width, height: 844 })
      await page.emulateMedia({ colorScheme: mode })
      await open('/blog/harness-engineering/')
      const meta = await page.locator('.post-meta').evaluate((element) => {
        const date = getComputedStyle(element.querySelector('time'))
        const parts = [
          ...element.querySelectorAll('.post-length, .post-reading-time, .post-creation'),
        ]
        return {
          text: element.textContent.replace(/\s+/g, ' ').trim(),
          sameType: parts.map((part) => {
            const style = getComputedStyle(part)
            return (
              style.fontSize === date.fontSize &&
              style.color === date.color &&
              style.fontFamily === date.fontFamily &&
              style.fontWeight === '400' &&
              style.fontStyle === 'normal'
            )
          }),
          unbroken: parts.every((part) => part.getClientRects().length === 1),
        }
      })
      expect(meta.text).toMatch(/^\d{4}-\d{2}-\d{2} · 约 \d+ 字 · \d+ 分钟 · AI 辅助$/)
      expect(meta.sameType).toEqual([true, true, true])
      expect(meta.unbroken).toBe(true)
      const schema = JSON.parse(
        await page.locator('script[type="application/ld+json"]').textContent(),
      )
      expect(schema['@type']).toBe('BlogPosting')
      expect(schema.wordCount).toBe(978)
      await expect(page.locator('[data-pagefind-body] .post-meta')).toHaveCount(1)
      await capture(page, `reading-time-${width}-${mode}`)
    })
  }
}
