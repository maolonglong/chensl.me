# Agent Note: Give the page frame a signature: masthead cat, dimension-line rules, margin apparatus

Status: implemented

## Problem

After the [Apple sans editorial redesign](2026-10-26-apple-sans-editorial-redesign.md), the site had no mark of its own. Its only identity was a hairline under a small gray label and one blue accent. With the name `~chensl` covered, a page could pass for any minimal Apple-style blog. Impeccable's guidance for reading surfaces (<https://github.com/pbakaus/impeccable>, its read-mode reference) asks for the opposite. The column stays calm, and the frame commits: masthead, section openers, and the setting of the parts around the text. Its test is whether the page could belong to no other product.

## Decision

The frame carries three marks. The reading column, the type scale, the color roles, and the zero-web-font page are unchanged.

- **The masthead cat.** The site icon's sleeping cat (`scripts/icons/cat.svg`) is inlined into the site title in `src/layouts/BaseLayout.astro`. It is drawn in `currentColor` with a non-scaling stroke and lies on the masthead rule. The rule is a content-box background on `.site-header`, so it spans the column and not the gutters. The cat and the nav targets stand on it.
- **Dimension-line rules.** Every section rule ends in two short ticks, like a dimension line in an engineering drawing. The rules are on section labels, home section heads, archive year groups, AI News days and archive lists, the article's adjacent-article nav, footnotes, and the footer. `src/styles/global.css` draws them as background images on `.section-label`, `.footnotes`, and `.ruled`, so no pseudo-element or extra markup is needed. Row dividers inside lists and tables stay plain hairlines.
- **The margin apparatus.** Where the view leaves a margin beside an article (`min-width: 76rem`), the date, length, reading time, and creation label stack in it, one fact per line, level with the title. The contents list starts below them, with the same width and text edge. Narrower views keep the one-line metadata under the title.

## Alternatives considered

**A Latin display face for the frame (masthead, titles, section names), with a newspaper thick-and-thin rule.** It gave the strongest typographic voice in the prototype. It would bring back a web font on every page and overturn the zero-web-font decision. Grotesk display faces are also becoming a common default, so the distinction would be weaker than it looks.

**A full left rail on every page, with the brand, section names, and line numbers that hang into the gutter.** This is the strongest form of the apparatus idea. It would widen the frame past `--measure` and break the shared column edge of the header, column, and footer (`e2e/page-shell.spec.mjs`). It would also replace the code-block fill with ruled listings. Only the article page has enough apparatus to fill a margin, so the margin is used there and nowhere else.

**A home-page timeline that sets every article as a tick on one 2021–2026 axis.** It extends the dimension-line idea into navigation. The ticks are far below the 44 px target size, and the axis repeats the article list. It would fit the `/blog/` archive better than the home page, if it comes back.

## Consequences

- The site icon now has two copies: `scripts/icons/cat.svg` for favicons and the inline masthead SVG. They change together.
- `src/styles/floating-controls.css` starts the contents rail below at most four lines of metadata. A fifth metadata fact needs that offset raised.
- `e2e/page-shell.spec.mjs` checks the masthead cat and the margin metadata, and `e2e/contents.spec.mjs` checks that the contents start below the metadata. The dimension ticks are decoration, and only screenshots cover them.
