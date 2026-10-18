import { expect, expectAll, test } from './site.mjs'

// A footnote jump, and the jump back from the note, lands clear of the top edge and briefly marks
// its target, so the reader sees where they arrived. harness-engineering has numbered footnotes
// in the middle of its text.
const article = '/blog/harness-engineering/'
const reference = 'sup > a#user-content-fnref-1'
const backReference = '#user-content-fn-1 [data-footnote-backref]'
const transparent = 'rgba(0, 0, 0, 0)'

// Runs in the page. Holds the target's animations at their first frame, so the state and a
// screenshot show the mark, then reports where the target sits and how it is marked.
function holdTarget() {
  const target = document.getElementById(decodeURIComponent(location.hash.slice(1)))
  if (!target) return null
  const animations = target.getAnimations()
  for (const animation of animations) {
    animation.pause()
    animation.currentTime = 0
  }
  return {
    id: target.id,
    top: Math.round(target.getBoundingClientRect().top),
    height: innerHeight,
    background: getComputedStyle(target).backgroundColor,
    page: getComputedStyle(document.body).backgroundColor,
    durations: animations.map((animation) => animation.effect.getComputedTiming().duration),
  }
}

// Runs in the page. Ends the target's animations and reports the background that remains.
function finishTarget() {
  const target = document.getElementById(decodeURIComponent(location.hash.slice(1)))
  for (const animation of target.getAnimations()) animation.finish()
  return getComputedStyle(target).backgroundColor
}

async function jump(page, link, id, label) {
  await page.locator(link).click()
  await expect(page).toHaveURL(new RegExp(`#${id}$`))
  const state = await page.evaluate(holdTarget)
  expectAll(label, state, {
    'the hash names the target': state?.id === id,
    'the target clears the top edge': state?.top >= state?.height * 0.15,
    'the target is in view': state?.top < state?.height,
    'the target starts marked': ![transparent, state?.page].includes(state?.background),
    'the mark is brief':
      state?.durations.length > 0 && state.durations.every((ms) => ms > 0 && ms <= 3000),
  })
  return state
}

for (const hasTouch of [false, true]) {
  test.describe(hasTouch ? 'on a touch screen' : 'with a hovering pointer', () => {
    const width = hasTouch ? 390 : 1280
    test.use({ hasTouch, viewport: { width, height: 844 } })

    for (const mode of ['light', 'dark']) {
      test(`footnote jumps mark their target at ${width}px in ${mode}`, async ({
        page,
        open,
        capture,
      }) => {
        await page.emulateMedia({ colorScheme: mode })
        await open(article)

        await jump(page, reference, 'user-content-fn-1', `${width}px ${mode} to the note`)
        await capture(page, `footnote-note-${width}-${mode}`)
        expect(await page.evaluate(finishTarget), 'the note mark fades out').toBe(transparent)

        await jump(page, backReference, 'user-content-fnref-1', `${width}px ${mode} back`)
        await capture(page, `footnote-back-${width}-${mode}`)
        expect(await page.evaluate(finishTarget), 'the reference mark fades out').toBe(transparent)
      })
    }
  })
}

test('footnote jumps keep a static mark with reduced motion', async ({ page, open, capture }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await open(article)
  for (const [link, id] of [
    [reference, 'user-content-fn-1'],
    [backReference, 'user-content-fnref-1'],
  ]) {
    await page.locator(link).click()
    await expect(page).toHaveURL(new RegExp(`#${id}$`))
    const state = await page.evaluate(holdTarget)
    expectAll(`reduced motion to ${id}`, state, {
      'the target clears the top edge': state?.top >= state?.height * 0.15,
      'the target is marked': ![transparent, state?.page].includes(state?.background),
      'the mark does not animate': state?.durations.length === 0,
    })
    await capture(page, `footnote-reduced-motion-${id}`)
  }
})
