import { expect, expectAll, test } from './site.mjs'

// Cold visits must load code fonts only for actual code, without adding copy UI for inline code.
// Every test starts with a fresh browser context, so each visit is cold.
for (const [route, hasInlineCode] of [
  ['/blog/2024-review/', false],
  ['/blog/thin-agent-thick-harness/', true],
]) {
  test(`${route} ${hasInlineCode ? 'loads' : 'skips'} code fonts without copy UI`, async ({
    page,
    open,
  }) => {
    await open(route)
    const state = await page.evaluate(() => {
      const sources = [...document.styleSheets]
        .filter((sheet) => !sheet.href || new URL(sheet.href).origin === location.origin)
        .flatMap((sheet) => [...sheet.cssRules])
        .filter(
          (rule) => rule instanceof CSSFontFaceRule && rule.style.fontFamily.includes('JetBrains'),
        )
        .map((rule) => new URL(rule.style.src.match(/url\(["']?([^"')]+)/)[1], location.href).href)
      return {
        blocks: document.querySelectorAll('pre').length,
        controls: document.querySelectorAll('.code-copy,.code-copy-status').length,
        requested: performance
          .getEntriesByType('resource')
          .some((entry) => sources.includes(entry.name)),
        codeFont: [...document.fonts].some(
          (font) => font.family.includes('JetBrains') && font.status === 'loaded',
        ),
      }
    })
    expect(state).toEqual({
      blocks: 0,
      controls: 0,
      requested: hasInlineCode,
      codeFont: hasInlineCode,
    })
  })
}

// Scoped article styles must reach rendered Markdown in both color schemes.
test('syntax colors match Shiki in light and dark', async ({ page, open }) => {
  await open('/blog/dockertest/')
  for (const scheme of ['light', 'dark']) {
    const colors = await page.evaluate((scheme) => {
      document.documentElement.dataset.theme = scheme
      const tokens = [...document.querySelectorAll('.astro-code span[style]')]
      const probe = document.createElement('span')
      document.body.append(probe)
      const matches = tokens.every((token) => {
        probe.style.color = token.style.getPropertyValue(`--shiki-${scheme}`)
        return getComputedStyle(token).color === getComputedStyle(probe).color
      })
      probe.remove()
      return {
        tokens: tokens.length,
        matches,
        line: getComputedStyle(document.querySelector('.astro-code .line')).display,
      }
    }, scheme)
    expect(colors.tokens, `${scheme}: highlighted tokens`).toBeGreaterThan(0)
    expect(colors.matches, `${scheme}: syntax colors must match Shiki`).toBe(true)
    expect(colors.line).toBe('inline-block')
  }
})

// The wrapper is the horizontal scroller, so the keyboard stop must be the wrapper itself:
// a focus ring drawn on the <pre> inside it is clipped by the scroller and never shows.
test.describe('keyboard access to scrolling code', () => {
  test.use({ viewport: { width: 320, height: 844 } })

  test('Tab stops on the scroll container of a code block', async ({ page, open }) => {
    await open('/blog/dockertest/')
    let stop = null
    for (let presses = 0; presses < 300 && !stop; presses++) {
      await page.keyboard.press('Tab')
      stop = await page.evaluate(() => {
        const el = document.activeElement
        if (!el.matches('pre, .highlight')) return null
        return {
          tag: el.tagName,
          scrolls: el.scrollWidth > el.clientWidth,
          role: el.getAttribute('role'),
        }
      })
    }
    expect(stop, 'Tab must reach a code block').toEqual({
      tag: 'DIV',
      scrolls: true,
      role: 'region',
    })
  })
})

// Every code block gets one copy button inside its top-right corner that stays put while the code
// scrolls, and a wide first line can always be scrolled out from under it. Hover-capable pointers
// reveal the button on hover; touch screens always show it.
for (const hasTouch of [false, true]) {
  test.describe(hasTouch ? 'on a touch screen' : 'with a hovering pointer', () => {
    test.use({ hasTouch, viewport: { width: 320, height: 844 } })

    test('code blocks copy with brief success feedback and no visible failure message', async ({
      page,
      context,
      open,
    }) => {
      await context.grantPermissions(['clipboard-read', 'clipboard-write'])
      await open('/blog/dockertest/')
      const copy = await page.evaluate(() => {
        const blocks = [...document.querySelectorAll('.highlight')]
        const button = (block) => block.parentElement.querySelectorAll('.code-copy')
        const placed = blocks.every((block) => {
          if (button(block).length !== 1) return false
          const b = button(block)[0].getBoundingClientRect()
          const r = block.getBoundingClientRect()
          return b.width >= 24 && b.top >= r.top && b.right <= r.right && b.right <= innerWidth
        })
        const wide = blocks.filter((block) => block.scrollWidth > block.clientWidth)
        const firstLineClear = wide.every((block) => {
          block.scrollLeft = block.scrollWidth
          const range = document.createRange()
          range.selectNodeContents(block.querySelector('.line'))
          return (
            range.getBoundingClientRect().right <= button(block)[0].getBoundingClientRect().left
          )
        })
        return {
          blocks: blocks.length,
          placed,
          wide: wide.length,
          firstLineClear,
          expected: blocks[0]?.querySelector('code').textContent.replace(/\n$/, ''),
        }
      })
      expectAll('Code blocks', copy, {
        'exist on the page': copy.blocks > 0,
        'each carry one copy button in the top-right corner': copy.placed,
        'include a block wide enough to scroll': copy.wide > 0,
        'let a scrolled first line clear the button': copy.firstLineClear,
      })

      // "已复制" is announced only after the browser accepts the write to the real clipboard.
      await page.locator('.code-copy').first().click()
      await expect(page.locator('.code-copy-status')).toHaveText('已复制', { timeout: 1000 })
      expect(
        await page.evaluate(() => navigator.clipboard.readText()),
        'Copy button must copy the code without its trailing newline',
      ).toBe(copy.expected)

      const button = page.locator('.code-copy').first()
      await expect(button).toHaveAttribute('data-state', 'done')
      await expect(button.locator('[data-copy-icon=done]')).toBeVisible()
      await expect(button.locator('[data-copy-icon=idle]')).toBeHidden()
      // A second success restarts the 1.5s feedback window.
      await page.waitForTimeout(1000)
      await button.click()
      await page.waitForTimeout(800)
      await expect(button).toHaveAttribute('data-state', 'done')
      await expect(button).not.toHaveAttribute('data-state', { timeout: 1200 })
      await expect(page.locator('.code-copy-status')).toBeEmpty()

      const failure = await page.evaluate(async () => {
        const write = navigator.clipboard.writeText
        navigator.clipboard.writeText = () =>
          Promise.reject(new DOMException('Denied', 'NotAllowedError'))
        const button = document.querySelector('.code-copy')
        const block = button.parentElement
        const before = block.getBoundingClientRect().height
        button.click()
        await new Promise((resolve) => setTimeout(resolve, 50))
        const result = {
          state: button.dataset.state ?? null,
          height: block.getBoundingClientRect().height,
          before,
          visibleText: block.innerText,
          announcement: document.querySelector('.code-copy-status').textContent.trim(),
        }
        navigator.clipboard.writeText = write
        return result
      })
      expect(failure.state).toBeNull()
      expect(failure.height).toBe(failure.before)
      expect(failure.visibleText.trim()).toBe(copy.expected)
      expect(failure.announcement).toBe('复制失败，请手动选择代码。')
      await button.click()
      await expect(button).toHaveAttribute('data-state', 'done')
      await expect(page.locator('.code-copy-status')).toHaveText('已复制')
    })
  })
}
