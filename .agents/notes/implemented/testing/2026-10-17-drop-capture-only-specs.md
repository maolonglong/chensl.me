# Agent Note: Drop specs that only capture screenshots

Status: implemented

## Problem

`e2e/appearance.spec.mjs` ran specs whose only result was a screenshot: page shells at two widths and two color schemes, the header and a table at six widths, a code caption in both schemes, the contents rail while focused, dismissed, and hovered, and a quote with its footnotes. A passing run proved that the page loaded. It did not prove layout, color, or interaction. `docs/testing.md` already says a screenshot is evidence only after a person looks at it, and CI never looks.

## Decision

A browser spec asserts behavior that a reader can observe. The suite keeps no spec whose only result is a screenshot. `e2e/appearance.spec.mjs` keeps the specs that assert: the theme cycle and its persistence, a wide formula scrolling inside its wrapper, copy success and failure, native contents without page scripts, and a theme switch when storage throws. Contents geometry stays in `e2e/contents.spec.mjs`. Font loading stays in `tests/fonts.test.mjs` and `e2e/page-shell.spec.mjs`.

The same cut removes two search assertions that restated the implementation. `tests/search.test.mjs` no longer asserts `semanticMaxGap` and `semanticMinScore.news` equal to the constants those names already hold, and no longer counts `indexIssues` upsert and delete calls. Ranking and vector identity stay asserted with literal scores and vector IDs.

## Alternatives considered

**Keep the capture-only specs as a visual archive.** A green run still says nothing about the picture. A person who wants a picture can open the page.

**Replace each capture with a geometry or color assertion.** That would pin states the remaining specs do not name. The owner asked to delete and clean tests, and these specs had no assertion to preserve.

**Keep the `indexIssues` call-count test and assert the vector IDs.** `newsVectors` already lists those IDs for one issue. A second test that multiplies the same count by the number of issues restates the loop.

## Consequences

CI no longer writes the dropped screenshots, so a layout regression in an unasserted state (the six header widths, the quote, the footnotes, the caption colors) is invisible until someone looks. `pnpm test:e2e` skips those browser loads.

## Reopen when

A layout regression ships because no spec asserted it. Add an assertion for that state, and keep the screenshot only beside the assertion.
