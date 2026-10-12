# Agent Note: Unzoned article times are Shanghai time

Status: implemented

## Problem

An article clock time with no offset was read as UTC. `23:00` on a date then falls on the next calendar day in Shanghai. js-yaml builds that `Date` before the collection schema runs, and the `Date` is identical to one written with `Z`, so the schema cannot tell the two apart.

## Decision

`loadWithShanghaiFrontMatter` in `src/lib/post-date.ts` rewrites a clock time with no offset to `+08:00` while the blog loader reads the Markdown file. A date with no clock stays UTC midnight, which is already the same Shanghai calendar day on every machine. The schema then sees a zoned timestamp. Quoted timestamps stay strings, and `parsePostDate` handles those. The loader cannot patch js-yaml: Astro parses front matter with a separate copy, and the `Date` it builds is identical to one written with `Z`.

## Alternatives considered

**Reject a time that has no offset.** The missing offset means Shanghai time. A rejection would fail a draft for a slip that explicit `+08:00`, already used by every current article, does not need.

**Subtract eight hours from every parsed `Date`.** Values written with `+08:00` or `Z` would move too.

## Consequences

An unzoned clock time is Shanghai local time, on every build machine. Date-only values and explicit offsets stay as they were. `tests/content.test.mjs` pins the rule.
