# Agent Note: Open sections and keep index rows tight

Status: implemented

## Problem

After sections lost their rules, the home page and the archive still gave an index row about as much air as the space before a section. A code block hid its copy control until the pointer hovered. The column then read as even strips instead of a section, a tight list, and a heading bound to the text under it.

## Decision

A section opens looser than an index row. Home sections step up one space token, and archive years do the same. Home and archive rows use `--space-1` of padding. A wrapping title keeps the date on its first baseline (`align-items: baseline` on `.entry-head`). An h2 or h3 margin above is more than four times the margin below. The code copy control stays visible at opacity 0.75; hover only strengthens it. Press feedback is unchanged: text fades, and a bounded control shrinks to no less than `scale(0.95)`. `e2e/page-shell.spec.mjs` checks the openings, the rows, the first line, and the heading margins. `e2e/code.spec.mjs` checks the copy control.

## Alternatives considered

**Keep the previous row padding (`--space-3`) and reveal the copy control only on hover.** It is the density the pages had. Rows then carry almost as much air as a section opening, and the copy control disappears for anyone who does not hover.

**Move dates into a left gutter so titles share one edge.** That is a different page geometry. This change keeps the date on the right of the title.

**Put metadata and the contents list in the article margin.** [The article header note](../simplification/2026-10-29-article-meta-under-title.md) already rejects that. Rhythm does not bring it back.

## Consequences

- Do not pad index rows back up to the section opening. A later change that wants looser rows has to answer this note.
- Search results and AI News lists set their own row padding. They are not the home and archive rows.
- The [whitespace sections note](../simplification/2026-10-29-whitespace-sections.md) still forbids shrinking a section opening to make room for a rule.
