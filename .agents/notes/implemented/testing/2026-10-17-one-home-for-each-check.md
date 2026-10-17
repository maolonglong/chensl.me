# Agent Note: One home for each check

Status: implemented

## Problem

Three checks repeated evidence that another check already held. `e2e/page-shell.spec.mjs` loaded `/blog/overlayfs/` twice, with page scripts and without, and asserted the same notice both times. `e2e/navigation.spec.mjs` opened four pages to find the footer feed link, while `scripts/check-site.mjs` fails the build unless every prerendered page links the article feed once. `tests/search.test.mjs` asserted which heading names a merged chunk and how consecutive short sections join. A reader sees neither, and the chunker can change both without changing a search result.

## Decision

Each promise has one check, at the seam where a failure shows. A static check that reads the whole build owns what it can decide for every page. A browser spec adds evidence only when it observes a different failure: the bytes a font request carries, the script a CSP blocks, the pixels a renderer draws. A unit test asserts the contract that the design note states, not the policy the code chose to meet it. The chunk contract lives in `src/lib/search-text.mjs`.

The stale notice keeps its no-script check, and that check asserts the notice follows the date in the header. The footer check keeps `/`, where it asserts the exact `RSS` text that a static check cannot see. The chunk suite asserts the section limits, the overlap, and the short-section merge. No test asserts which heading wins when short sections merge.

## Alternatives considered

**Keep the browser checks as a second opinion.** The build check already fails on a broken footer and names the file. Four more page loads do not narrow the cause, and the same argument would justify a browser spec for every static rule.

**Pin the merge policy because search quality depends on it.** Quality is measured by the labeled queries in `tests/fixtures/search-queries.json`, which fail the index job on a ranking regression. The merge policy is a means to that end, and a test that pins it fails on a refactor that keeps the ranking.

**Write the merge policy into a document instead.** `docs/AGENTS.md` calls a value without a test a cache. The policy is a local contract, so the comment in `src/lib/search-text.mjs` holds it.

## Consequences

A change to how chunks merge passes the unit suite. A ranking regression shows only when `scripts/search-eval.mjs` runs against an index. The footer check loads three fewer pages and the stale suite loads one fewer.

## Reopen when

A regression ships that only one of the removed assertions would have caught.
