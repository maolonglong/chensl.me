# Agent Notes Reference

This file defines the layout, classes, retention rules, and format for Agent Notes. Read [`AGENTS.md`](AGENTS.md) first for when to write or search notes, and follow the [documentation standard](../../docs/AGENTS.md) for writing rules.

## Layout

The path encodes the status and the class: `.agents/notes/<lifecycle>/<class>/YYYY-MM-DD-topic.md`. The date is the day the decision was first proposed, from git history.

- `proposed/`: work that is decided in principle but not built.
- `implemented/`: the decision is in the code. Keep its paths, names, and mechanisms current in the same commit that changes them. Rewrite facts in place; do not append history.
- `rejected/`: the proposal was declined.

Browse the folders or search; an index would only copy the paths. Link between notes with relative Markdown links, so the link check follows them.

## Classes

The class is the kind of decision. `tests/docs.test.mjs` holds the closed set.

| Class | Covers |
|---|---|
| `feature` | A new capability that readers or agents can use. |
| `bug-fix` | A fix for a defect, when the fix carries a lasting reason. |
| `simplification` | Removes code, behavior, or output without adding a capability. |
| `architecture` | How the shipped site is built and served: structure, runtime, and security. |
| `process` | Tooling, policy, and workflow around the code: documents, dependencies, hooks. |
| `testing` | Test infrastructure and strategy. |

A proposal to remove something is `simplification`, also when it is rejected.

## Retention

- **Keep** a note while its rationale, alternatives, negative guarantee, security rule, or reopen condition can still guide a change, and a rejected note while the idea is still a tempting mistake.
- **Delete** a note that only describes how a page looks or a mechanical change, a note whose decision no longer guides anything, and a rejected idea that is obsolete. Git keeps the history; repair or remove the inbound links.

A note never changes into a different decision. To reverse or replace one, write a new note that says which note it supersedes, and link both ways. Delete the old note only when the new one keeps all of its unique rationale, rejected options, and consequences.

## Format

`tests/docs.test.mjs` checks this format. The first three lines are:

```markdown
# Agent Note: <title>

Status: <status>
```

The status matches the folder: `Status: proposed`, `Status: implemented`, or `Status: rejected — <the reason, in one line>`.

The body starts with `## Problem`, written so that it stands without the solution. Then:

| Lifecycle | Sections after Problem |
|---|---|
| `proposed/` | `## Proposal`, `## Alternatives considered`, `## Acceptance criteria`, `## Risks` |
| `implemented/` | `## Decision` (present tense), `## Alternatives considered`, `## Consequences` |
| `rejected/` | `## Proposal`, `## Alternatives considered` |

An implemented note has no `## Proposal`, `## Plan`, or `## Acceptance criteria`. A `## Reopen when` section is optional; use it when a known change in the world would make the other option better.

Give each real alternative one bold-led paragraph that says why it lost. Record alternatives; do not invent them. A note dated before 2026-10-07 whose record names none uses this exact line in place of the section:

```markdown
<!-- agent-note-format: alternatives-not-recorded (pre-format Agent Note) -->
```

To move a note between lifecycles, move the file, change the `Status:` line, and rewrite the sections in the same commit.
