# Agent Note: Serve JinKai in unicode-range slices for runtime text

Status: implemented

## Problem

News issues are read from D1 at request time, so their text is not in the source that `src/lib/fonts.mjs` scans. Characters such as 「美国」 in a news item reached no JinKai face and rendered in the next font of the `--font-serif` stack. This partly supersedes [Subset JinKai from source text](../simplification/2026-10-06-subset-fonts-from-source-text.md), which served no JinKai outside the source text.

## Decision

The build also cuts W04 into slices that together cover every character it supports, each character in exactly one slice. The slice boundaries come from Google Fonts' `unicode-range` slicing for Noto Sans SC, which orders slices from frequent to rare characters, so one news item touches few slices. Characters that no Google slice lists go into extra slices of 500 code points in code point order. The table is vendored in `vendor/fonts/google-fonts-noto-sans-sc-slices.json`.

The slices form a second family, `TsangerJinKai02 Slices`, placed right after the Astro-managed family in `--font-serif`. Pages keep loading the two source-text subsets first; the browser downloads a slice only for a character that neither subset holds. The slices depend only on the font and the table, never on site text, so their fingerprinted URLs stay cached across content edits, and the build caches them in `node_modules/.cache/site-fonts/`.

Their `@font-face` rules total about 140 KB, so `src/layouts/BaseLayout.astro` imports them as a stylesheet that Vite bundles into the shared cached CSS, instead of Astro's inline font faces in every page. Vite does not inline `.woff2` files, so no glyphs enter that stylesheet.

`tests/fonts.test.mjs` requires every supported character to fall in exactly one fingerprinted slice that contains its glyph. `e2e/page-shell.spec.mjs` inserts characters that are in no source file and requires a slice to load, and requires the home page to load none.

## Alternatives considered

**Fallback blocks of 128 code points.** The earlier design that the source-text note removed. Blocks in code point order scatter common characters across many files, so a short news item would fetch dozens of them.

**Subset the news text at request time.** It would need font tooling in the Worker and a per-issue font URL, and cached fonts would not carry over between issues.

**Only the slices, without the source-text subsets.** A cold home visit would fetch several slices instead of one small subset.

## Consequences

The output gains about 130 font files and 10 MB, within the static asset limits of Workers. The shared stylesheet grows by about 140 KB, about 45 KB compressed, which a cold visit downloads once. A cold build spends about 40 seconds on the slices.

## Reopen when

A stable browser ships Incremental Font Transfer, or the news text moves into the build.
