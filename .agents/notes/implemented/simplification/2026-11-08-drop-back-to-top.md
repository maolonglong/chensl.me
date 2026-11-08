# Agent Note: Drop back-to-top

Status: implemented

## Problem

Back-to-top was a second floating plate with a shadow stacked above the contents button, and it covered the text on phones. Home and End, the iOS status-bar tap, and the contents list already return a reader to the top or to any section, and bearblog has none.

## Decision

Remove it. The contents button holds the view corner alone (`src/styles/floating-controls.css`, `e2e/contents.spec.mjs`).

## Alternatives considered

**Keep it only on articles without contents.** The control would move between articles.

**An inline "back to top" link at the article end.** One more link beside the earlier and later navigation.

## Consequences

- `e2e/contents.spec.mjs` keeps the corner geometry checks and holds the reduced-motion transition test.
- The page bottom padding shrinks to one plate.
- This refines [article meta under the title](2026-10-29-article-meta-under-title.md), which had the button above the contents control.

## Reopen when

Reader feedback says long articles need it.
