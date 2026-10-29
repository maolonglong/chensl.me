# Agent Note: Give the page frame a signature: the masthead cat

Status: implemented

## Problem

After the [Apple sans editorial redesign](2026-10-26-apple-sans-editorial-redesign.md), the site had no mark of its own. With the name `~chensl` covered, a page could pass for any minimal Apple-style blog. Impeccable's guidance for reading surfaces (<https://github.com/pbakaus/impeccable>, its read-mode reference) asks for the opposite. The column stays calm, and the frame commits: masthead, section openers, and the setting of the parts around the text. Its test is whether the page could belong to no other product.

## Decision

The frame's mark is the masthead cat. The reading column, the type scale, the color roles, and the zero-web-font page are unchanged.

The site icon's sleeping cat (`scripts/icons/cat.svg`) is inlined into the site title in `src/layouts/BaseLayout.astro` as the masthead logo. It is drawn in `currentColor` with a non-scaling stroke, centered on the name's line. Article metadata and the contents button belong to [the article header note](../simplification/2026-10-29-article-meta-under-title.md).

## Alternatives considered

**Dimension-line rules: a short tick at each end of every section rule, with the cat lying on a masthead rule.** It shipped briefly. On the live pages the extra marks, on top of the existing hairlines, made the site read busy instead of clean, and [the whitespace sections note](../simplification/2026-10-29-whitespace-sections.md) removed them together with the section rules.

**A Latin display face for the frame (masthead, titles, section names), with a newspaper thick-and-thin rule.** It gave the strongest typographic voice in the prototype. It would bring back a web font on every page and overturn the zero-web-font decision. Grotesk display faces are also becoming a common default, so the distinction would be weaker than it looks.

**A full left rail on every page, with the brand, section names, and line numbers that hang into the gutter.** This is the strongest form of the apparatus idea. It would widen the frame past `--measure` and break the shared column edge of the header, column, and footer (`e2e/page-shell.spec.mjs`). It would also replace the code-block fill with ruled listings.

**Metadata and a plain contents list in the left margin at `min-width: 76rem`.** It shipped in `1f2dc59` with the cat. [The article header note](../simplification/2026-10-29-article-meta-under-title.md) reverses it and holds why it lost.

**A home-page timeline that sets every article as a tick on one 2021–2026 axis.** It is a navigation idea. The ticks are far below the 44 px target size, and the axis repeats the article list. It would fit the `/blog/` archive better than the home page, if it comes back.

## Consequences

- The site icon has two copies: `scripts/icons/cat.svg` for favicons and the inline masthead SVG. They change together.
- `e2e/page-shell.spec.mjs` checks the masthead cat. Article metadata and the contents button are checked with [the article header note](../simplification/2026-10-29-article-meta-under-title.md).
