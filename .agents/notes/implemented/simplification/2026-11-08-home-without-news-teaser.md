# Agent Note: Home without the AI News teaser

Status: implemented

## Problem

The home AI News section was one sentence describing AI News plus a link, while the header links AI News on every page.

## Decision

Home holds the introduction and the five newest articles (`src/pages/index.astro`).

## Alternatives considered

**Show the latest issue title.** Home is prerendered, so this needs on-demand rendering or a client fetch, which adds JavaScript to a page that ships none.

**Keep the teaser.** It repeated what the header link already says.

## Consequences

`/news/` still links the archive and the feed, and the footer keeps the feed link.

## Reopen when

Home becomes on-demand for another reason.
