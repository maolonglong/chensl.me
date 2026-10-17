# Calibration examples

Each case comes from this repository's history. Use it to find the principle, not as a text template. A balanced version keeps every proposition that a reader needs at that place, with the fewest words.

## A rule that looks like a detail can be a promise

**Original** (`6b0a84d:AGENTS.md`): "Keep article URLs stable; the blog's only RSS feed is `/index.xml`. Use Astro's default heading and footnote anchors."

**Over-trimmed** (`45417b0`): "File and directory names are article URLs, so they stay stable."

**Balanced** (`d92d9b7`): "File and directory names are article URLs, and Astro's default heading and footnote anchors are fragment URLs, so both stay stable."

The anchor rule read like a style preference, so the rewrite dropped it. It is a URL promise: a changed anchor breaks every link to a heading or a footnote. The balanced version states the reason, so the next edit sees what the rule protects.

## Removing a cached value keeps the rule beside it

**Original** (`6b0a84d:docs/design.md`): "…the same `42rem` column; short pages keep the footer at the bottom. Reuse `src/styles/global.css` tokens." and "Preserve … meaningful diff signs."

**Over-trimmed** (`45417b0`): the values left the document, and the token rule and the diff meaning left with them.

**Balanced** (`d92d9b7`, with the path as it reads now): "Reuse a `src/styles/global.css` token before you add a value." and "The diff colors carry addition and deletion meaning."

The admission rule removes values that code holds, such as `42rem`. An instruction or a reason in the same sentence is not a value. Before you delete a sentence for its cached value, list its other propositions and keep each one.

## A check does not replace what a writer needs

**Overcorrected** (`45417b0:docs/AGENTS.md`): "A test or check enforces the rule when a script can decide it. Then delete the trap or the prose rule, so the rule has one home."

**Balanced** (`0b085d7`): "Then delete the trap. A prose rule that a check enforces keeps only what a writer needs to comply, and names the check."

Applied literally, the first version deletes the Agent Note format, because `tests/docs.test.mjs` checks it. A writer still needs the format to write a note that passes. The check owns enforcement; the document keeps what a writer needs before the check runs.
