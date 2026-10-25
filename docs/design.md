# Design

Read this before you change layout, styles, fonts, or browser interactions. It states the visual intent and the reasons behind it. The values live in `src/styles/global.css` (tokens, chrome type, and Markdown typography) and in each component's scoped styles; a value appears here only with the test that pins it. Pick a `src/styles/global.css` token before you add a value: sizes come from the `--size-*` ladder and spacing from the `--space-*` scale, never from a step between them.

## Intent

The site reads like a small printed journal: warm paper, ink type, and hairline rules. Three ideas carry it ([decision](../.agents/notes/implemented/feature/2026-10-25-editorial-redesign.md)):

- **Two type voices.** Reading text is serif: Source Serif sets Latin letters and digits, and JinKai sets Chinese. Chrome is sans: navigation, dates, counts, labels, and buttons. A reader can tell content from controls by the face alone.
- **Ruled sections.** A section opens with a hairline and a small sans label (`.section-label`). Rules divide sections and rows; boxes are for code, notes, and floating controls only.
- **Ink-blue means a link in running text.** Lists of titles, navigation, and news items use the heading color and underline on hover, so ink-blue stays rare enough to signal a link.

## Layout

- The header and the footer span the shell (`--shell`). Every page column is the reading measure (`.measure`), centred under it.
- Short pages keep the footer at the bottom of the view (`e2e/page-shell.spec.mjs`).
- Where the view leaves a margin beside the column, an article's contents sit there as a plain list; elsewhere a corner button opens them as a popover (`e2e/contents.spec.mjs`). The list does not depend on hover.

## Interaction

- Every control works with a keyboard, has a visible focus ring and an accessible name. Floating buttons and contents entries in the popover are 44 px targets; the header tools are 40 px circles that never overlap (`e2e/contents.spec.mjs`, `e2e/back-to-top.spec.mjs`, `e2e/navigation.spec.mjs`).
- Hover affordances sit behind `@media (hover: hover)`, and every pressable control moves on press. `prefers-reduced-motion: reduce` zeroes every transition in `src/styles/global.css`; keyframe animations run only under `no-preference` (`e2e/footnotes.spec.mjs`).
- A link that leads to more of the same (`.arrow-link`) ends with an arrow that steps forward on hover. It is the one signature motion.

## Kami and Anthropic as references

[Kami](https://github.com/tw93/Kami) supplies the warm palette, ink-blue, and the 400/500 weight pair; Anthropic's site supplies the serif-body, sans-chrome split. Neither is the specification. These choices are deliberate:

- **Page color.** The page is ivory; parchment is the fill for code, notes, and inline code. Kami's parchment page made every fill look grey.
- **Dark theme.** Kami defines none, so it is this site's own. Dark text uses grayscale smoothing, because light strokes on a dark page look heavier.
- **Headings, `strong`, and table headers** use the heading color. JinKai W04 has one weight, so color sets them apart ([decision](../.agents/notes/implemented/simplification/2026-09-23-serve-jinkai-w04-only.md)).
- **List markers** are muted, not ink-blue, because ink-blue means a link.
- **Code blocks** are a parchment fill with no border. Token colors follow Kami's syntax table.

## Color

Beyond Kami's light palette, the site adds these chromatic values: the dark-mode link tints, the selection tint in `src/styles/global.css`, and the red, green, and amber diff and state colors in the giscus themes (`src/styles/giscus*.css`). The diff colors carry addition and deletion meaning. Add a new chromatic value here with its reason before you use it. `tests/design.test.mjs` requires AA contrast for the giscus themes and for code comments.

## Typography

- The serif stack is Source Serif for the Latin range in `src/lib/latin-range.mjs`, then JinKai. CJK punctuation, curly quotes, the middle dot, and dashes stay outside the Latin range, so they keep JinKai's full-width forms. Share cards use the same stack (`tests/og.test.mjs`).
- JinKai W04 alone covers weights 400 to 500, synthesized bold is off, and the served Source Serif keeps only that slice of its weight axis.
- Fonts are self-hosted with `font-display: swap` and content-versioned URLs, without preloads. Code fonts are declared on every page, and the browser loads them only when a page uses them (`tests/fonts.test.mjs`, `e2e/code.spec.mjs`). Repository cards use the sans face, so a card alone never loads the code font.
- A cold visit to the home page loads at most 120 KiB of JinKai and 150 KiB of fonts in total, and `/news/` loads cached JinKai slices for its D1 text (`tests/fonts.test.mjs`, `e2e/page-shell.spec.mjs`).
- The fonts are not under the repository's code license; read [NOTICE.md](../public/fonts/tsanger-jinkai02/NOTICE.md) before you add or change one.
- Every heading level is at least as large as the article body (`e2e/page-shell.spec.mjs`). At equal size, weight, color, and more space above than below set the heading apart.
- `<em>` stays upright and carries CJK emphasis dots. `<strong>` uses weight 500 in the heading color.

## Components

- **Theme.** The toggle cycles auto, light, and dark. Auto follows the OS. The choice persists, and the page still switches when storage fails (`e2e/appearance.spec.mjs`).
- **Scroll boxes.** Code, tables, and display math scroll inside focusable, labelled wrappers, so the page never scrolls sideways. The `<table>` itself never becomes the scroll box, because that removes its table role (`tests/markdown.test.mjs`, `e2e/code.spec.mjs`).
- **Article header.** The date, length, reading time, and creation label share one sans metadata line. A stale notice is a quiet parchment note below it (`e2e/page-shell.spec.mjs`, `e2e/creation.spec.mjs`).
- **Article end.** The upvote, then the earlier and later articles, then the comments under a section label.
- **Search** is one ruled input line and a result list: title, type and date, excerpt. No filters or suggestions.
- **Icons** are inline SVG, not font glyphs or an icon library.
- **Site icon.** A sleeping cat, hand-drawn in `scripts/icons/` (`tests/icons.test.mjs`).
- **Repository cards** are a hairline frame with the code block corners and muted text, with no avatar or language color (`e2e/github-cards.spec.mjs`).
- **Code captions** carry no `title` attribute on the code wrapper, which would add a tooltip.
- **Links** in article text and the footer are underlined; external prose links and AI News items add a north-east arrow. Underline rules set `text-decoration-line` rather than the `text-decoration` shorthand, which resets thickness (`e2e/navigation.spec.mjs`).
- **Share cards** are 1200×630 PNGs (`scripts/check-site.mjs`). They use the light theme's page, border, rule, and text tokens, with no gradient or shadow. `~chensl` sits at the top left, the title in the middle, and the date or section label with `chensl.me` at the bottom. A title longer than two lines ends with an ellipsis (`tests/og.test.mjs`). [Decision](../.agents/notes/implemented/feature/2026-10-17-build-time-share-cards.md).
