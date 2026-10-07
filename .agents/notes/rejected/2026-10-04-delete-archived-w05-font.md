# Agent Note: Delete the archived W05 font

Status: rejected — W05 is the archival copy of the upstream source that NOTICE.md records, not dead code

## Problem

`vendor/fonts/tsanger-jinkai02/TsangerJinKai02-W05.ttf` is about 250 KB, and the site never serves it: [the site serves W04 alone](../implemented/2026-09-23-serve-jinkai-w04-only.md). A cleanup review on 2026-10-04 flagged it as unused.

## Proposal

Delete the W05 file from `vendor/`, and remove it from `public/fonts/tsanger-jinkai02/NOTICE.md`.

<!-- agent-note-format: alternatives-not-recorded -->

## Rejection

The owner decided to keep it. The vendor directory archives the upstream source files with their SHA-256 digests in NOTICE.md, so that the fonts can be regenerated and their provenance checked. W05 is part of that source. "Unused by the build" does not make an archive entry dead code.
