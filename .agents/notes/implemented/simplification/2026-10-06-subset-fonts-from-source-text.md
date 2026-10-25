# Agent Note: Subset JinKai from source text, with no fallback blocks

Status: implemented

## Problem

The site shipped 255 JinKai fallback blocks (11 MB, 128 code points each) beside the subsets that `src/lib/fonts.mjs` builds. `bc876c2` added the blocks so that a new article rendered in JinKai without a manual font regeneration. That reason expired when `src/lib/fonts.mjs` began to build the subsets from source text on every build and dev-server start. The blocks then covered only text that is not in the source.

## Decision

At build time and dev-server startup, `src/lib/fonts.mjs` scans the source text and builds two disjoint subsets: a common subset for page templates, shared UI, and published article titles and descriptions, which the home page and the archive list, and an article subset for the remaining blog characters. The scan reads `src/` and `astro.config.mjs`, which holds Markdown labels such as the footnote heading. A character outside the source text falls through to the JinKai slices, which [a later note](../feature/2026-10-16-jinkai-unicode-range-slices.md) added for text that exists only at runtime.

`tests/fonts.test.mjs` requires every page character that JinKai supports to reach a declared face, on the home page and on an article page.

## Alternatives considered

**Keep the fallback blocks.** They cost 255 files and 11 MB of output to cover text that the source does not contain, such as text that a browser extension inserts.

**W3C Incremental Font Transfer.** It would serve any character on demand from one font. No browser shipped it when this decision was made.

## Consequences

The site output dropped from 336 to 81 files. A character that the scan misses loads a slice instead of the subset; the font test still requires page text to reach a subset. Text that is edited in the dev server shows in the fallback font until the server restarts.

## Reopen when

A stable browser ships Incremental Font Transfer (`tech(incremental)` in `@font-face`).
