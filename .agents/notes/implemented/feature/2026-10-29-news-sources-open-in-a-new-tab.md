# Agent Note: AI News sources open in a new tab

Status: implemented

## Problem

An AI News issue is a list of independent sources. A reader opens several and comes back to the same place in the list. A phone has no middle-click. Following a title in the current tab replaces the issue, and the way back is Back after a long source page.

## Decision

Each linked item title on `/news/` and `/news/<date>/` opens in a new tab: `target="_blank"` and `rel="noopener noreferrer"` on the anchor in `src/components/NewsGroups.astro`. The accessible name is the title, a space, then `（新标签页打开）`. The phrase sits in a `.visually-hidden` span with no whitespace text node before it, so the title line gains no gap. The north-east arrow stays decorative. Every other external link stays in the current tab, including article prose, repository cards, and the home-page profile links. `/news/index.xml` keeps a plain anchor, and the feed app chooses the tab. Issue data and the `http`/`https` limit stay as in [Bot-written AI News](./2026-10-16-bot-written-news-on-d1.md). `e2e/news.spec.mjs` checks the new tab, the name, and that the feed has neither.

## Alternatives considered

**Open every external link in a new tab.** A citation or a repository card is one step out of a document. Back returns to that sentence, and a desktop reader who wants another tab can middle-click. Forcing the tab removes the current-tab choice.

**Keep news titles in the current tab.** Back can restore the issue, but each source is a detour, and a phone cannot middle-click. The issue's job is to stay put while the reader opens sources.

**Put the new-tab phrase only in the arrow's CSS alternative text.** The arrow's alternative text is empty on purpose, and CSS alternative text is uneven across browsers. Text inside the link is what the accessible name is built from.

## Consequences

- A later edit that adds `target="_blank"` to prose links, repository cards, or profile links has to answer this note. Those links are one departure from a document.
- The feed HTML stays a plain anchor. Copying the page attributes into `src/pages/news/index.xml.ts` would push a tab choice into feed apps.
- The hidden phrase is part of the title text that tests read.

## Reopen when

Screen readers used to read this site announce `target="_blank"` without the hidden phrase. Drop the phrase only after that announcement is checked on those readers.
