# Agent Note: Keep the header to the sections and the controls

Status: implemented

## Problem

The header listed 首页, 博客, AI News, 搜索, and RSS as text links, then the theme toggle. 首页 repeated the site title, which already links home. RSS is a link that a reader uses once, to subscribe, but it took a place beside the sections on every page. On a phone the six items filled a whole line under the title.

## Decision

The header holds the site title, which links home, the 博客, AI News, and 搜索 links, and the theme toggle. The article feed link moves to the footer of every page. AI News pages link the news feed in the footer instead, which matches the feed that their head advertises. The head feed links for autodiscovery do not change.

`e2e/navigation.spec.mjs` pins the header links and the footer feed link. `scripts/check-site.mjs` requires the footer feed link on every prerendered page, and `e2e/news.spec.mjs` requires the news feed link on the AI News pages.

The owner asked for this layout as a first version to try.

## Alternatives considered

**Keep 首页 in the header.** It marks the home page as current, but the home page is the one page that a reader can always reach from the site title.

**Show RSS as an icon in the header.** It saves width, but it keeps a one-time action in the header beside the controls that a reader uses on every visit.

**Pad the header links to 44 px.** The owner rejected this layout ([note](../../rejected/bug-fix/2026-10-11-pad-header-and-archive-to-44px.md)). The header links keep their text spacing.

## Consequences

No header item is current on the home page. A reader who looks for the feed in the header finds it in the footer or through feed autodiscovery.

## Reopen when

The owner decides after the trial that the header needs 首页 or the feed link back.
