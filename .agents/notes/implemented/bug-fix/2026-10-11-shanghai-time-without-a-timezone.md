# Agent Note: Unzoned article times are Shanghai time

Status: implemented

## Problem

An article clock time with no offset was read as UTC. `23:00` on a date then falls on the next calendar day in Shanghai. js-yaml builds that `Date` before the collection schema runs, and the `Date` is identical to one written with `Z`, so the schema cannot tell the two apart.

## Decision

The blog loader wraps `parseData` in `src/content.config.ts`, which `glob` calls for initial loading, changes, and additions. It reads the source, uses `rewriteUnzonedFrontMatter` in `src/lib/post-date.ts` to add `+08:00` to bare clock times while preserving YAML comments, and parses it with Astro's front matter parser. Only `pubDate` and `updatedDate` replace the loader's parsed values before schema validation. A date with no clock stays UTC midnight. Quoted timestamps stay strings, and `parsePostDate` handles those. The content digest includes the date interpretation so entries cached without normalization are revalidated.

## Alternatives considered

**Reject a time that has no offset.** The missing offset means Shanghai time. A rejection would fail a draft for a slip that explicit `+08:00`, already used by every current article, does not need.

**Subtract eight hours from every parsed `Date`.** Values written with `+08:00` or `Z` would move too.

**Replace the global file reader while `glob.load()` runs.** File watchers run after the reader has been restored, so editing only the body changes the date interpretation. Keeping the replacement active would affect other collections and file readers.

## Consequences

An unzoned clock time is Shanghai local time during builds and development reloads. Date-only values and explicit offsets stay as they were. Each changed entry needs one extra file read and front matter parse; Markdown rendering and the stored body remain owned by `glob`. `tests/content.test.mjs` pins the rule.
