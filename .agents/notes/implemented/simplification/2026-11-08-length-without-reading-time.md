# Agent Note: Length without reading time

Status: implemented

## Problem

"约 3500 字 · 12 分钟" showed minutes derived from the same count at a fixed rate: 300 Chinese characters, or 238 English words per Brysbaert 2019, a minute. It was a second number with no new information, and it was wrong for code-heavy articles because code does not count.

## Decision

The article header shows the rounded length; the JSON-LD keeps the exact `wordCount` (`tests/reading-time.test.mjs`, `e2e/reading-time.spec.mjs`).

## Alternatives considered

**Keep minutes only.** The owner chose length, a measured fact, over an estimate.

**Keep both.** Two numbers derived from one count.

## Consequences

- A reintroduction of reading time starts from the prior choice: 300 Chinese characters or 238 English words a minute.
- This refines [article meta under the title](2026-10-29-article-meta-under-title.md), which had minutes on the same line.
