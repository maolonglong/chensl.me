# AGENTS.md — Agent Notes

An Agent Note records one decision about this repository: the problem, what was chosen, what was given up, and why. It holds the reasons that code, tests, and other documents cannot carry. Follow the [documentation standard](../../docs/AGENTS.md) for writing rules.

## When to write one

Write or update an Agent Note in the same commit when a change makes a lasting decision that code and tests do not explain:

- You choose between real alternatives, and a later agent could pick the other one.
- You remove something, and a later agent could bring it back.
- You reject a proposal that looks attractive, such as a simplification that would break a hidden requirement.

Local and mechanical edits need no note. When a note already owns the decision, update that note.

Before you propose to remove, replace, or reintroduce something, search the notes for its topic: `grep -ril <topic> .agents/notes/`. A note that covers it is the starting point: answer its rationale and its reopen condition, not only the general case.

## Layout

The path encodes the status: `.agents/notes/<lifecycle>/YYYY-MM-DD-topic.md`. The date is the day the decision was first proposed, from git history.

- `proposed/`: work that is decided in principle but not built.
- `implemented/`: the decision is in the code. Keep its paths, names, and mechanisms current in the same commit that changes them. Rewrite facts in place; do not append history.
- `rejected/`: the proposal was declined. Keep it while it stops a plausible mistake. Delete it when nobody would propose it again.

Browse the folders or search. An index file would only copy the paths.

A note never changes into a different decision. To reverse or replace a decision, write a new note, say which note it supersedes, and link both ways. Delete the old note only when the new note keeps all of its unique rationale, rejected options, and consequences.

## Format

`tests/docs.test.mjs` checks this format. The first three lines are:

```markdown
# Agent Note: <title>

Status: <status>
```

The status matches the folder: `Status: proposed`, `Status: implemented`, or `Status: rejected — <the reason, in one line>`. The rejection reason is the fact that readers come for.

The body starts with `## Problem`, written so that it stands without the solution. Then use these sections; add free-form technical sections between them when needed:

| Lifecycle | Sections after Problem |
|---|---|
| `proposed/` | `## Proposal`, `## Alternatives considered`, `## Acceptance criteria`, `## Risks` |
| `implemented/` | `## Decision` (present tense), `## Alternatives considered`, `## Consequences` (what it cost and what it bought) |
| `rejected/` | `## Proposal`, `## Alternatives considered` |

An implemented note has no `## Proposal`, `## Plan`, or `## Acceptance criteria`: it describes what is, not what will be. A `## Reopen when` section is optional in any lifecycle; use it when a known change in the world would make the other option better.

### Alternatives considered

Give each real alternative one bold-led paragraph that says why it lost. Record alternatives; do not invent them. When the record (commits, review threads, the owner's words) names no alternative, write this exact line in place of the section:

```markdown
<!-- agent-note-format: alternatives-not-recorded -->
```

## Moving between lifecycles

Move the file, change the `Status:` line, and rewrite the sections in the same commit. `proposed/` to `implemented/` turns the Proposal into a present-tense Decision and folds Acceptance criteria and Risks into Consequences. `proposed/` to `rejected/` adds the reason to the status line and keeps the rest.
