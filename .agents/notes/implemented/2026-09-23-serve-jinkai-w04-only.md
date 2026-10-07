# Agent Note: Serve JinKai W04 alone on the web

Status: implemented

## Problem

Every page downloaded two JinKai subsets: W04 for body text and W05 for headings and bold text. A cold visit to the home page cost 508 KiB of fonts before an article loaded. W05 only made headings and bold text a little heavier, and Kami's own guidance reserves W05 for PDF output.

## Decision

The site serves only W04. `src/lib/fonts.mjs` declares it for weights 400 to 500, so headings and `<strong>` use the regular glyphs. `font-synthesis: none` in `src/styles/global.css` stops the browser from faking a bold. Size and color carry the hierarchy.

The W05 source file stays in `vendor/fonts/tsanger-jinkai02/` as an archival copy of the upstream source; [NOTICE.md](../../../public/fonts/tsanger-jinkai02/NOTICE.md) records its digest. See [the rejected proposal to delete it](../rejected/2026-10-04-delete-archived-w05-font.md).

`tests/fonts.test.mjs` pins the result: every JinKai face declares weights 400 to 500, and the cold-visit font cost stays within its budget.

## Alternatives considered

**Serve W05 for weights above 400.** This was the previous layout. It doubled the cold-visit font cost for a weight difference that Kami does not use on screen.

## Consequences

The cold-visit font cost dropped by about half. Bold text inside a paragraph differs from body text by color only, which is weaker than a heavier stroke.
