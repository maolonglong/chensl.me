# Agent Note: Article images open in a native dialog

Status: implemented

## Problem

Article images are wider than the reading column. A screenshot or diagram is sharp in the file and small on the page. Readers need a way to see that image larger without leaving the article, and without a client framework.

## Decision

`src/components/ImageZoom.astro` adds one `<dialog>` to each article page. Its script wraps each `.prose img` that is not already inside a link or a button. The dialog shows that same optimized URL. Astro's default image layout is `none`, so the bitmap keeps its intrinsic pixels and the column only shrinks the display. Wider viewports fit the whole image in the dialog. At the layout's narrow breakpoint and below, the image keeps its intrinsic size and the height stays within the viewport. Alignment there is `safe center`, so an image that fits stays centered and an image that overflows begins at the scroll origin. Scrolling reaches both edges.

Escape, the close button, and a click on the dialog outside the image close it. `dialog.showModal()` traps focus and restores it. Without scripts, the image stays an ordinary image in the column. The Markdown pipeline, the RSS item, and the export body do not gain a wrapper.

`e2e/images.spec.mjs` asserts the open, close, keyboard, touch, and no-script behavior.

## Alternatives considered

**medium-zoom or PhotoSwipe.** Either library is a dependency and a second interaction model. The site already uses a native popover for the contents and a small component script for copy. A dialog matches that, and the CSP stays on Astro's script hashes.

**A `:target` or `<details>` zoom.** A fragment URL would share the address bar with heading anchors. Those anchors are stable article URLs. `<details>` would also change the reading layout.

**One popover per image in the Markdown pipeline.** The page, the RSS item, and the export share one rendered tree. Buttons and duplicate images would land in the feed. The dialog script stays outside that tree.

**A link to the original file.** The click leaves the article. The export route already publishes the original for the Markdown file. The page image is the optimized intrinsic file, so a second URL is unnecessary while layout stays `none`.

## Consequences

An image that is already a link does not zoom, so the link keeps the click. A wide viewport shows the whole image at once, so a screenshot wider than that viewport is still smaller than its file. Pinch-zoom remains the browser's own gesture. Revisit this when Markdown images are downscaled below their intrinsic size.

## Reopen when

Markdown image layout is no longer `none`.
