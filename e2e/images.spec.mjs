import { expect, test } from './site.mjs'

const alt = '2023 年 GitHub 贡献热力图，共 1,647 次贡献'
const name = `放大图片：${alt}`

test('article images open larger in a dialog and close back to the same control', async ({
  page,
  open,
  capture,
}) => {
  await open('/blog/2023-review/')
  await expect(page.locator('.image-zoom-open')).toHaveCount(3)
  await expect(page.locator('dialog.image-zoom')).not.toHaveAttribute('open', '')
  const trigger = page.getByRole('button', { name })
  const inline = trigger.locator('img')
  await expect(inline).toHaveAttribute('alt', alt)
  await expect(inline).toHaveAttribute('aria-hidden', 'true')
  const before = await inline.boundingBox()
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: '放大的图片' })
  const view = dialog.locator('img')
  await expect(dialog).toBeVisible()
  await expect(view).toHaveAttribute('alt', alt)
  expect(await view.evaluate((element) => element.currentSrc)).toBe(
    await inline.evaluate((element) => element.currentSrc),
  )
  const after = await view.boundingBox()
  const close = dialog.getByRole('button', { name: '关闭' })
  const plate = await close.boundingBox()
  expect(after.width).toBeGreaterThan(before.width)
  expect(plate.width).toBeGreaterThanOrEqual(44)
  expect(plate.height).toBeGreaterThanOrEqual(44)
  await expect(close).toBeFocused()
  await capture(page, 'image-zoom-open-1280-light')
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2)
  await expect(dialog).toBeHidden()
  await page.keyboard.press('Enter')
  await expect(dialog).toBeVisible()
  await page.mouse.click(8, 8)
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()
})

for (const mode of ['light', 'dark']) {
  test(`enlarged image at 375px in ${mode}`, async ({ page, open, capture }) => {
    await page.setViewportSize({ width: 375, height: 844 })
    await page.emulateMedia({ colorScheme: mode })
    await open('/blog/2023-review/')
    const inline = page.getByRole('button', { name }).locator('img')
    const before = await inline.boundingBox()
    await page.getByRole('button', { name }).click()
    const dialog = page.getByRole('dialog', { name: '放大的图片' })
    const view = dialog.locator('img')
    await expect(dialog).toBeVisible()
    const natural = await inline.evaluate((image) => image.naturalWidth)
    await expect.poll(() => view.evaluate((image) => image.naturalWidth)).toBe(natural)
    const box = await view.boundingBox()
    expect(box.height).toBeLessThanOrEqual(page.viewportSize().height)
    expect(box.width).toBeGreaterThan(before.width + 40)
    await capture(page, `image-zoom-open-375-${mode}`)
    await page.keyboard.press('Escape')
    await capture(page, `image-zoom-closed-375-${mode}`)
  })
}

test('a wide dark page shows the enlarged image inside the viewport', async ({
  page,
  open,
  capture,
}) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await open('/blog/2023-review/')
  await page.getByRole('button', { name }).click()
  await expect(page.getByRole('dialog', { name: '放大的图片' })).toBeVisible()
  await capture(page, 'image-zoom-open-1280-dark')
})

test.describe('touch opens and dismisses the enlarged image', () => {
  test.use({ hasTouch: true, viewport: { width: 375, height: 844 } })

  test('a tap opens the dialog and a tap outside the image closes it', async ({ page, open }) => {
    await open('/blog/2023-review/')
    const trigger = page.getByRole('button', { name })
    await trigger.tap()
    const dialog = page.getByRole('dialog', { name: '放大的图片' })
    await expect(dialog).toBeVisible()
    await page.touchscreen.tap(8, 8)
    await expect(dialog).toBeHidden()
  })
})

test.describe('article images without page scripts', () => {
  test.use({ javaScriptEnabled: false })

  test('the image stays in the column and the dialog stays shut', async ({ page, open }) => {
    await open('/blog/2023-review/')
    const image = page.locator(`.prose img[alt="${alt}"]`)
    await expect(image).toBeVisible()
    expect(await image.evaluate((element) => element.parentElement.tagName)).toBe('P')
    await expect(page.locator('.image-zoom-open')).toHaveCount(0)
    await expect(page.locator('dialog.image-zoom')).toBeHidden()
    await expect(page.getByRole('heading', { name: '2023 年终总结' })).toBeVisible()
  })
})

test('an article without images has no zoom buttons', async ({ page, open }) => {
  await open('/blog/dockertest/')
  await expect(page.locator('.prose img')).toHaveCount(0)
  await expect(page.locator('.image-zoom-open')).toHaveCount(0)
  await expect(page.locator('dialog.image-zoom')).toBeHidden()
})
