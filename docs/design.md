# Design

Read this before you change layout, styles, fonts, or browser interactions. It states the visual intent and the reasons behind it. The values live in `src/styles/global.css` (tokens, chrome type, and Markdown typography) and in each component's scoped styles; a value appears here only with the test that pins it. Pick a `src/styles/global.css` token before you add a value: sizes come from the `--size-*` ladder and spacing from the `--space-*` scale, never from a step between them (`tests/design.test.mjs`).

## Intent

The site reads like an engineering research publication: optical-white canvas, cool neutral surfaces, crisp hairline rules, and native sans-serif typography inspired by Apple Machine Learning Research and the Apple Human Interface Guidelines. Three ideas carry it ([decision](../.agents/notes/implemented/feature/2026-10-26-apple-sans-editorial-redesign.md)):

- **Hierarchy through weight, scale, and tracking.** System sans-serif (`--font-sans`) sets both reading text and UI chrome; monospace (`--font-mono`) sets code. Headings, section labels, `strong`, and table headers use weight 600, index titles (`.entry-title`) use weight 400 in `--heading-color` at `--size-list` with zero negative tracking so CJK strokes stay crisp, and metadata and secondary copy recede in weight 400 and `--muted-color`.
- **Ruled sections.** A section opens with a hairline and a small sans label (`.section-label`). Hairline rules divide sections and year groups while compact index rows breathe via whitespace; fills and frames are for code, notes, repository cards, and floating controls only.
- **Optical blue means a link or active control.** Lists of titles, navigation, and news items use the heading color and underline on hover, so `--link-color` stays rare enough to signal an interactive link or active state.

## Layout

- The header, the reading column (`.measure`), and the footer share one measure (`--measure`) and one left and right edge (`e2e/page-shell.spec.mjs`).
- Short pages keep the footer at the bottom of the view (`e2e/page-shell.spec.mjs`).
- Where the view leaves a margin beside the column, an article's contents sit there as a plain list; elsewhere a corner button opens them as a popover (`e2e/contents.spec.mjs`). The list does not depend on hover.

## Interaction

- Every control works with a keyboard, has a visible focus ring and an accessible name. Floating buttons, contents entries in the popover, and in-page controls like the upvote are 44 px targets; the header tools are 40 px circles that never overlap (`e2e/contents.spec.mjs`, `e2e/back-to-top.spec.mjs`, `e2e/navigation.spec.mjs`).
- Hover affordances sit behind `@media (hover: hover)`, and every pressable control moves on press. `prefers-reduced-motion: reduce` zeroes every transition in `src/styles/global.css`; keyframe animations run only under `no-preference` (`e2e/footnotes.spec.mjs`).
- A link that leads to more of the same (`.arrow-link`) ends with an arrow that steps forward on hover. It is the one signature motion.

## Apple editorial references

Apple Machine Learning Research and the Apple Human Interface Guidelines supply the optical-white canvas, cool neutral surfaces, optical blue link accent, and native sans-serif weight and tracking hierarchy. Neither is a rigid specification. These choices are deliberate:

- **Page and surface fills.** `--background-color` is the optical-white or obsidian-carbon canvas; `--surface-color` is the cool neutral fill for code blocks, notes, and inline code.
- **Dark theme.** Dark text uses grayscale smoothing, because light strokes on a dark page look heavier.
- **Headings, `strong`, and table headers** use weight 600 in the heading color, while compact list titles (`.entry-title`) use weight 400 in the heading color at `--size-list` (`0.9375rem`) with `letter-spacing: 0`.
- **List markers** are muted, not optical blue, because `--link-color` means a link or active control.
- **Code blocks** are a `--surface-color` fill with no border. Token colors in `src/lib/markdown.mjs` use a chroma-capped cool triad (sapphire for keywords and constants, cool indigo for functions and types, deep teal for strings) with matched perceptual contrast against `--surface-color`.

## Color

Beyond the core tokens in `src/styles/global.css`, `src/lib/markdown.mjs` and the giscus themes (`src/styles/giscus*.css`) add chroma-capped syntax hues (sapphire, cool indigo, deep teal) and diff/state colors (red, green, amber) for addition, deletion, and warning meaning. Add a new chromatic value here with its reason before you use it. `tests/design.test.mjs` requires AA contrast across every foreground-on-surface pair in `src/styles/global.css`, `src/styles/giscus*.css`, and `codeThemes`.

## Typography

- `--font-sans` sets reading text and UI chrome in the platform's native sans-serif, with `font-synthesis: none` so CJK glyphs never receive synthetic oblique shear.
- `--font-mono` sets code in self-hosted `JetBrains Mono` (`src/lib/fonts.mjs`) with `font-display: swap`, content-versioned URLs, and `preload={false}`. Repository cards use `--font-sans`, so a cold visit to a page without `<code>` downloads zero web fonts (`tests/fonts.test.mjs`, `e2e/code.spec.mjs`, `e2e/page-shell.spec.mjs`).
- Build-time share cards (`src/lib/og-card.mjs`) subset `NotoSansSC-SemiBold.woff2` (`src/assets/fonts/noto-sans-sc/NotoSansSC-SemiBold.woff2`) per card so every card embeds only its own glyphs without shipping the font to the Worker (`tests/og.test.mjs`).
- The fonts are not under the repository's code license; read [Noto Sans SC OFL.txt](../public/fonts/noto-sans-sc/OFL.txt) and [JetBrains Mono OFL.txt](../public/fonts/jetbrains-mono-2.304/OFL.txt) before you add or change one (`tests/design.test.mjs`).
- Every heading level is at least as large as the article body (`e2e/page-shell.spec.mjs`). At equal size, weight, color, and more space above than below set the heading apart.
- `<em>` sets Latin text in native italic without CJK emphasis dots (`e2e/page-shell.spec.mjs`). `<strong>` uses weight 600 in the heading color.

## Components

- **Theme.** The toggle cycles auto, light, and dark. Auto follows the OS. The choice persists, and the page still switches when storage fails (`e2e/appearance.spec.mjs`).
- **Scroll boxes.** Code, tables, and display math scroll inside focusable, labelled wrappers, so the page never scrolls sideways. The `<table>` itself never becomes the scroll box, because that removes its table role (`tests/markdown.test.mjs`, `e2e/code.spec.mjs`).
- **Article header.** The date, length, reading time, and creation label share one sans metadata line. A stale notice is a quiet surface note below it (`e2e/page-shell.spec.mjs`, `e2e/reading-time.spec.mjs`).
- **Article end.** The upvote, then the earlier and later articles, then the comments under a section label.
- **Search** is one ruled input line and a result list: title, type and date, excerpt. No filters or suggestions.
- **Icons** are inline SVG, not font glyphs or an icon library.
- **Site icon.** A sleeping cat, hand-drawn in `scripts/icons/` (`scripts/build-icons.mjs`).
- **Repository cards** are a hairline frame with the code block corners and muted text, with no avatar or language color (`e2e/github-cards.spec.mjs`).
- **Images.** Standalone article images that the column scales down open in a page-colored modal (`e2e/image-zoom.spec.mjs`). [Decision](../.agents/notes/implemented/feature/2026-10-26-article-image-zoom.md).
- **Code captions** carry no `title` attribute on the code wrapper, which would add a tooltip.
- **Links** in article text and the footer are underlined; external prose links and AI News items add a north-east arrow. Underline rules set `text-decoration-line` rather than the `text-decoration` shorthand, which resets thickness (`e2e/navigation.spec.mjs`).
- **Share cards** are 1200×630 PNGs (`scripts/check-site.mjs`). They use the light theme's page, border, rule, and text tokens, with no gradient or shadow. `~chensl` sits at the top left, the title in the middle, and the date or section label with `chensl.me` at the bottom. A title longer than two lines ends with an ellipsis (`tests/og.test.mjs`). [Decision](../.agents/notes/implemented/feature/2026-10-17-build-time-share-cards.md).
