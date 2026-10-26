# Agent Note: An editorial redesign with two type voices and ruled sections

Status: implemented

## Problem

The site applied Kami's document defaults to every surface. One face, JinKai, set the body, the headings, the navigation, the dates, and every Latin word, so on a technical blog full of names like DuckDB and Agent, the Latin glyphs carried JinKai's handwritten shapes. With one weight, hierarchy came only from color, and ink-blue colored every archive title, every AI News item, and the navigation. The home page held only a greeting, so a visitor had to open the archive to find an article. Header, text, and footer shared one 42rem column, and each component picked its own font sizes and spacing.

## Decision

- **Two type voices.** Reading text is serif: Source Serif 4 for the Latin range in `src/lib/latin-range.mjs`, then JinKai. Chrome is a system sans: navigation, dates, counts, labels, buttons. `src/lib/fonts.mjs` serves Source Serif as roman and italic 30 KB Latin subsets with weights 400 to 500. Share cards use the roman subset.
- **A ladder and a scale.** `src/styles/global.css` defines `--size-*` and `--space-*` tokens. Components use only those steps.
- **Shell and measure.** Header and footer span `--shell`; each page column is the 40rem reading measure, centred.
- **Ruled sections.** A section opens with a hairline and a small sans label. Code and notes are parchment fills on an ivory page.
- **Ink-blue for running-text links only.** Lists of titles, navigation, and news items use the heading color.
- **Pages.** The home page lists the five newest articles and points to AI News. An article ends with the upvote, the earlier and later articles, and the comments. AI News reads as a dated issue with ruled tag sections.
- **Contents.** Where the view leaves a margin, the contents sit beside the column as a plain list, with or without hover; elsewhere a corner button opens a popover. This replaces the hover rail that opened into a card.

Article titles and descriptions now appear on the home page, so `src/lib/fonts.mjs` puts their characters into the common JinKai subset. The home page's cold-visit budget moves from 100 KiB of JinKai to 120 KiB of JinKai and 150 KiB of fonts in total.

## Alternatives considered

**Keep JinKai for Latin text.** It costs no download, but its Latin glyphs do not match the Chinese strokes, and a technical blog sets Latin in almost every sentence.

**Mark `<em>` with CJK emphasis dots instead of serving an italic Latin subset.** `d497ad4` set `text-emphasis: filled dot` on `em` while JinKai was the only reading face. In Markdown articles, `*...*` wraps Latin journal titles and terms, and `text-emphasis` puts a dot under every Latin letter.

**Switch Chinese body text to a Song face, such as Source Han Serif.** It reads more like print, but JinKai is the site's identity, and a second CJK family would double the font cost.

**A self-hosted sans for chrome.** It would look the same on every system, but it adds a third download for text that is short and functional.

**Add Anthropic's clay as a second accent.** Warm cream, a serif, and terracotta is the look that generated design falls into first; ink-blue alone keeps the page from reading as a template.

**Keep the hover rail for contents.** It took the least space, but it needed a hover pointer, a dismissal state machine for Escape, and 365 lines of CSS. A plain list in the margin is readable at rest and works on touch screens.

## Consequences

Home pages and archives now load about 30 KB more font. Pages show two families on purpose, so a new component must pick its voice: reading text or chrome. Tests that pinned the old geometry, such as the 44 px header targets and the rail card, now check the behavior of the new layout instead.

## Reopen when

Browsers ship Incremental Font Transfer, which would make a Song face for Chinese body text cheap to try.
