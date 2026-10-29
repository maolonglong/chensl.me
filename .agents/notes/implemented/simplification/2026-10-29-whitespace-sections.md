# Agent Note: Separate sections by whitespace, not rules

Status: implemented

## Problem

Under the [Apple sans editorial redesign](../feature/2026-10-26-apple-sans-editorial-redesign.md), a hairline marked the top of every structural unit: home sections, archive years, AI News days and month lists, the adjacent-article nav, footnotes, and the footer. The [frame signature](../feature/2026-10-29-frame-signature.md) then added a masthead rule and end ticks on each rule. On the live pages, the lines competed with the text. The site read busy and dated, not clean and modern, and the rules carried no information that the spacing and the section labels did not already carry.

## Decision

Whitespace and the small section labels separate sections; no structural rule does. The header, sections, archive year groups, AI News days, month lists, issue rows, the adjacent-article nav, footnotes, and the footer draw no rule, and no rule carries ticks. Lines remain only where they mean something inside content or a control: the article `hr` that an author writes, table header and row rules, the blockquote line, the search input line, and the upvote ring. `e2e/page-shell.spec.mjs` checks that the structural elements draw no top rule.

## Alternatives considered

**Keep the section rules and drop only the ticks and the masthead rule.** It returns to the pre-signature look. The section rules were already the main source of lines on the home page and the archive, so the page stays busier than the spacing needs.

**Keep only the ticks' removal and leave the masthead rule for the cat to lie on.** The cat reads as a logo without a ground line, and the masthead rule was one more line on every page.

## Consequences

- Space above a section label now does the work that a rule did. Do not shrink the section margins to tighten a page; reintroducing a rule needs a new decision that answers this note.
- `--rule-color` keeps its role for the content and control lines listed above.
