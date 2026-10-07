# Design

Read this before you change layout, styles, fonts, or browser interactions. It states the visual intent and the reasons behind it. The values live in `src/styles/global.css` (tokens and Markdown typography) and in each component's scoped styles; a value appears here only with the test that pins it. Reuse a `src/styles/global.css` token before you add a value.

## Intent

- A warm neutral page with ink-blue links, JinKai type, an introductory home, a year-grouped archive, and single-column articles.
- Header, main, and footer share one reading column. Short pages keep the footer at the bottom.
- Ink-blue means a link. Emphasis, list markers, and headings use other means.
- Every interactive control works with a keyboard, has a visible focus ring and an accessible name, and has a touch target of at least 44 px (`e2e/contents.spec.mjs`, `e2e/back-to-top.spec.mjs`).

## Kami as the reference

[Kami](https://github.com/tw93/Kami) is the visual reference, not the specification. Read only the Principles, Color, Typography, Spacing, and Depth & Separation sections of [Kami's design reference](../.agents/skills/kami/references/design.md). Kami's landing-page defaults for plain links, Latin-first font stacks, and self-scrolling tables do not apply here.

Article text follows the `.prose` rules of Kami's site pages. These differences are deliberate:

- **Dark theme.** Kami defines no dark palette, so the dark theme is this site's own. Kami's link color fails contrast on the dark background, so dark links use lighter tints.
- **Headings, `strong`, and table headers** use the near-black heading color. The single W04 weight gives 500 no visible extra stroke, so color sets them apart ([decision](../.agents/notes/implemented/2026-09-23-serve-jinkai-w04-only.md)).
- **List markers** are muted, not ink-blue as in Kami's print spec, because ink-blue means a link.
- **Alerts** use the code background fill, because Kami's ivory barely separates from the page.
- **Code blocks** follow Kami's landing page: an ivory fill, a thin border, and near-black base text. Token colors follow Kami's syntax table.
- **Code captions and code on narrow screens** use smaller sizes than Kami's type scale: a file label sits below the code it names, and Kami itself shrinks code on phones.

## Color

Beyond Kami's light palette, the site adds these chromatic values: the dark-mode link tints, the selection and visited tints in `src/styles/global.css`, and the red, green, and amber diff and state colors in the giscus themes (`src/styles/giscus*.css`). The diff colors carry addition and deletion meaning. Add a new chromatic value here with its reason before you use it. `tests/design.test.mjs` requires AA contrast for the giscus themes and for code comments.

## Typography

- JinKai comes first for mixed Chinese and Latin text. W04 alone covers weights 400 to 500, and synthesized bold is off.
- Fonts are self-hosted with `font-display: swap` and content-versioned URLs, without preloads. Code fonts are declared on every page, and the browser loads them only when a page uses them (`tests/fonts.test.mjs`, `e2e/page-shell.spec.mjs`).
- The fonts are not under the repository's code license; read [NOTICE.md](../public/fonts/tsanger-jinkai02/NOTICE.md) before you add or change one.
- A cold visit to the home page loads at most 100 KiB of JinKai (`tests/fonts.test.mjs`, `e2e/page-shell.spec.mjs`).
- Every heading level is at least as large as the article body (`e2e/page-shell.spec.mjs`). At equal size, weight, color, and more space above than below set the heading apart.
- `<em>` stays upright and carries CJK emphasis dots. `<strong>` uses weight 500 in the heading color.

## Components

- **Contents.** One prerendered list: a hover rail beside the column where a pointer can hover and the column leaves room, a native popover elsewhere (`e2e/contents.spec.mjs`).
- **Theme.** The toggle cycles auto, light, and dark. Auto follows the OS. The choice persists, and the page still switches when storage fails (`e2e/appearance.spec.mjs`).
- **Scroll boxes.** Code, tables, and display math scroll inside focusable, labelled wrappers, so the page never scrolls sideways. The `<table>` itself never becomes the scroll box, because that removes its table role (`tests/markdown.test.mjs`, `e2e/code.spec.mjs`).
- **Creation label.** It follows the article date in the date's neutral typography, with no icon, badge, or interaction. Its note sits before the stale notice. Home and archive lists omit it.
- **Icons** are inline SVG, not font glyphs or an icon library.
- **Code captions** carry no `title` attribute on the code wrapper, which would add a tooltip.
- **Links** in article text and the footer are underlined. Archive links show a visited color.
