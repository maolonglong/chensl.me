import { expect, expectAll, inside, test } from './site.mjs'

function probeZoom() {
  const dialog = document.querySelector('dialog.image-zoom')
  const open = !!dialog?.open
  const target = dialog?.querySelector('.image-zoom-target')
  const source = document.querySelector('.prose img[data-zoomed]')
  const zoomables = [...document.querySelectorAll('.prose img[data-zoomable]')]
  const first = zoomables[0]
  return {
    open,
    zoomableCount: zoomables.length,
    firstCursor: first ? getComputedStyle(first).cursor : null,
    firstRole: first?.getAttribute('role') ?? null,
    firstTabIndex: first?.tabIndex ?? null,
    sourceBox: (source ?? first)?.getBoundingClientRect().toJSON() ?? null,
    sourceVisibility: source ? getComputedStyle(source).visibility : null,
    targetBox: open && target ? target.getBoundingClientRect().toJSON() : null,
    dialogScrollWidth: open ? dialog.scrollWidth : 0,
    dialogClientWidth: open ? dialog.clientWidth : 0,
    dialogScrollLeft: open ? Math.round(dialog.scrollLeft) : 0,
    activeTag: document.activeElement?.tagName ?? null,
    activeIsFirst: document.activeElement === first,
    width: innerWidth,
    height: innerHeight,
  }
}

test('articles without images do not mount image zoom controls', async ({ page, open }) => {
  await open('/blog/dockertest/')
  const count = await page.locator('dialog.image-zoom, .prose img[data-zoomable]').count()
  expect(count).toBe(0)
})

test('desktop only marks shrunken standalone images as zoomable and fits them to the viewport', async ({
  page,
  open,
  capture,
}) => {
  await page.setViewportSize({ width: 1280, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })

  // The overlayfs diagram is 504x432, so inside the 640px desktop column it already sits at 1:1.
  await open('/blog/overlayfs/')
  expect(await page.locator('.prose img[data-zoomable]').count()).toBe(0)

  await open('/blog/2023-review/')
  const initial = await page.evaluate(() => {
    // Wrap the last image in a link: linked images must stay links, not zoom triggers.
    const last = [...document.querySelectorAll('.prose img')].at(-1)
    const link = document.createElement('a')
    link.href = '#linked'
    last.before(link)
    link.append(last)
    window.dispatchEvent(new Event('resize'))
    return {
      linkedZoomable: last.hasAttribute('data-zoomable'),
    }
  })
  expect(initial.linkedZoomable).toBe(false)

  const rest = await page.evaluate(probeZoom)
  expectAll('/blog/2023-review/ desktop rest', rest, {
    'shrunken standalone images are zoomable': rest.zoomableCount === 2,
    'hover cursor is zoom-in': rest.firstCursor === 'zoom-in',
    'zoomable image has button role': rest.firstRole === 'button',
    'zoomable image is keyboard focusable': rest.firstTabIndex === 0,
  })

  const first = page.locator('.prose img[data-zoomable]').first()
  await first.scrollIntoViewIfNeeded()
  await first.click()
  const opened = await page.evaluate(probeZoom)
  expectAll('/blog/2023-review/ desktop opened', opened, {
    'dialog opens': opened.open,
    'source image hides while zoomed': opened.sourceVisibility === 'hidden',
    'zoomed image grows past the reading column':
      opened.targetBox?.width >= opened.sourceBox.width * 1.8,
    'zoomed image sits inside the viewport': inside(opened.targetBox, opened),
    'desktop dialog does not overflow horizontally':
      opened.dialogScrollWidth <= opened.dialogClientWidth,
  })
  await capture(page, 'image-zoom-desktop-light')

  await page.emulateMedia({ colorScheme: 'dark' })
  await capture(page, 'image-zoom-desktop-dark')
  await page.emulateMedia({ colorScheme: 'light' })

  // Keyboard: Escape closes and restores focus to the image; Enter reopens; wheel closes.
  await page.keyboard.press('Escape')
  // Reduced motion still crossfades the dialog out, so the close lands a beat after Escape.
  await page.locator('dialog.image-zoom').waitFor({ state: 'hidden' })
  const afterEscape = await page.evaluate(probeZoom)
  expectAll('/blog/2023-review/ after Escape', afterEscape, {
    'dialog closes on Escape': !afterEscape.open,
    'focus returns to the source image': afterEscape.activeIsFirst,
  })

  await page.keyboard.press('Enter')
  expect((await page.evaluate(probeZoom)).open).toBe(true)
  await page.mouse.wheel(0, 120)
  await page.locator('dialog.image-zoom').waitFor({ state: 'hidden' })
  expect((await page.evaluate(probeZoom)).open).toBe(false)
})

test.describe('on a touch screen', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } })

  test('mobile zooms images to a pannable scale and centers around the tap position', async ({
    page,
    open,
    capture,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })

    // On a 390px screen the 504x432 overlayfs diagram shrinks to 350px, so it becomes zoomable.
    await open('/blog/overlayfs/')
    const overlayImg = page.locator('.prose img[data-zoomable]').first()
    await expect(overlayImg).toBeVisible()
    await overlayImg.click()
    const overlayOpened = await page.evaluate(probeZoom)
    expectAll('/blog/overlayfs/ mobile opened', overlayOpened, {
      'dialog opens on shrunken diagram': overlayOpened.open,
      'zooms to intrinsic 504px width': Math.round(overlayOpened.targetBox?.width) === 504,
      'horizontally scrollable inside 390px view':
        overlayOpened.dialogScrollWidth > overlayOpened.dialogClientWidth,
    })
    await page.locator('dialog.image-zoom').click()
    await page.locator('dialog.image-zoom').waitFor({ state: 'hidden' })
    expect((await page.evaluate(probeZoom)).open).toBe(false)

    // Wide screenshot on mobile zooms past 2x column width and pans horizontally.
    await open('/blog/2023-review/')
    const first = page.locator('.prose img[data-zoomable]').first()
    await first.scrollIntoViewIfNeeded()
    const box = await first.boundingBox()
    await page.mouse.click(box.x + box.width * 0.75, box.y + box.height * 0.5)
    const opened = await page.evaluate(probeZoom)
    expectAll('/blog/2023-review/ mobile opened', opened, {
      'dialog opens': opened.open,
      'zoomed width is at least 2x the inline width':
        opened.targetBox?.width >= opened.sourceBox.width * 2,
      'zoomed height fits within the viewport':
        opened.targetBox?.top >= 0 && opened.targetBox?.bottom <= opened.height,
      'horizontal scroll offsets toward the tapped right side':
        opened.dialogScrollLeft > (opened.dialogScrollWidth - opened.dialogClientWidth) * 0.5,
    })
    await capture(page, 'image-zoom-mobile-light')

    await page.emulateMedia({ colorScheme: 'dark' })
    await capture(page, 'image-zoom-mobile-dark')

    await page.locator('dialog.image-zoom').click()
    await page.locator('dialog.image-zoom').waitFor({ state: 'hidden' })
    expect((await page.evaluate(probeZoom)).open).toBe(false)
  })
})
