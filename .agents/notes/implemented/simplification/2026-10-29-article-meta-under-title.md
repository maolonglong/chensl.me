# Agent Note: Put article metadata under the title and keep contents on a corner button

Status: implemented

## Problem

A wide article (`min-width: 76rem`) stacked the date, length, reading time, and creation label in the left margin, one fact per line, and parked the contents list below them as a plain sticky list. The same article under that width kept one metadata line under the title and opened the contents from a corner button. The wide header was a second document: Chinese headings in the margin wrapped into a column of their own, and the page did not match the narrow one. The facts belong in the sentence under the title.

## Decision

At every width, the date, length, reading time, and creation label stay one sans line under the title, middots included. The contents list stays a corner button that opens one popover above the button. Back-to-top sits above that button, in the same view corner. Crossing 76rem moves neither control. The list still opens without JavaScript, through the native popover. `e2e/page-shell.spec.mjs` checks the metadata line. `e2e/contents.spec.mjs` checks the button, the popover, and that widening keeps the popover open. `e2e/back-to-top.spec.mjs` checks the corner.

## Alternatives considered

**Stack the metadata in the left margin and start a plain contents list below it at `min-width: 76rem`.** This shipped in `1f2dc59` as the margin half of [the frame signature](../feature/2026-10-29-frame-signature.md). It lost because the wide header was a different document from the narrow one, and Chinese headings wrapped into a second column.

**Put the metadata and the contents list together in the right margin on a wide view.** The facts would leave the sentence under the title, and the wide page would still differ from the narrow one.

**A full left rail on every page.** [The frame signature note](../feature/2026-10-29-frame-signature.md) already rejects it. The article page does not get a private version of that rail.

## Consequences

- This note supersedes the margin half of [the frame signature](../feature/2026-10-29-frame-signature.md). The masthead cat stays in that note.
- Metadata stays in the column under the title, and the contents list stays on the corner button. Putting either in the margin needs a new decision that answers this note.
- Popover entries keep the 44px target at every width (`e2e/contents.spec.mjs`). A plain list with tighter padding would miss it.
