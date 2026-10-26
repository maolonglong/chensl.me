# Agent Note: Article image zoom with a native dialog and pannable narrow views

Status: implemented

## Problem

Articles include wide screenshots, contribution heatmaps, and 16:9 lecture slides with code and tables. Inside the 40rem reading column—and even more on a phone screen—that text is too small to read. On a narrow screen the column already fills the width, so a modal that only fits an image to `100vw` barely enlarges it.

## Decision

`rehypeSite` in `src/lib/markdown.mjs` sets `frontmatter.images` when an article contains an image, and `src/pages/blog/[...id].astro` mounts `src/components/ImageZoom.astro` only on those articles.

- **Progressive enhancement.** The Markdown pipeline still emits plain `<img>` elements, so RSS, Markdown exports, and no-script visits see no extra markup or inert controls.
- **Shrunken standalone images only.** The script marks `.prose img` as zoomable (`data-zoomable`, `role="button"`, `tabindex="0"`) only when the image is not inside a link and its intrinsic width is at least 1.15 times its rendered width (`e2e/image-zoom.spec.mjs`). A small diagram that already sits at 1:1 on desktop stays static there and becomes zoomable on a narrow screen where the column shrinks it.
- **Native `<dialog>` in the top layer.** Opening calls `showModal()` on a `<dialog class="image-zoom">` with a blurred `--background-color` backdrop, so it sits above floating controls in the browser's top layer, traps focus, and closes on `Escape` while returning focus to the source image. Under `prefers-reduced-motion: no-preference`, Web Animations runs a FLIP transition between the inline image and the modal target while the inline image hides with `visibility: hidden`.
- **Fit on wide views, pan on narrow views.** When fitting the viewport width enlarges the image by at least 40% (or reaches its intrinsic width), the modal fits it within the viewport with `--gutter` clearance and dismisses on mouse wheel input. When fitting the viewport would barely enlarge the image, the modal scales it past the viewport width (up to its intrinsic size and bounded by viewport height) inside the scrollable dialog and centers `scrollLeft` on the tapped horizontal ratio so the reader can pan across it.

## Alternatives considered

**`medium-zoom`.** It injects inline styles, takes a static background color string rather than CSS `light-dark()` tokens, does not add keyboard focus or button semantics to images, and clamps zoomed images to the viewport width on mobile so wide screenshots barely grow on phones.

**`PhotoSwipe` or `GLightbox`.** Both ship a dark gallery chrome with toolbars, counters, and stylesheets that violate the size-ladder and color-transition rules in `tests/design.test.mjs`, and add 15+ KB of runtime code for multi-image carousels that an article does not need.

**Build-time `<button>` or `<dialog>` wrappers around every `<img>`.** The same Markdown pipeline feeds RSS (`src/pages/index.xml.ts`), and pages without scripts must not expose dead buttons (`e2e/appearance.spec.mjs`).

**Fit to `100vw` on all screens.** On a 390 px phone, an image in `.prose` is already 350 px wide; fitting to the viewport increases its width by at most 11%, leaving slide code and heatmaps unreadable.

## Consequences

Articles with images load a small inline script and scoped stylesheet. Zoom never scales an image past its intrinsic dimensions, so low-resolution images stay sharp rather than stretching to fill a wide monitor.
