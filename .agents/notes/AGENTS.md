# AGENTS.md - Agent Notes

An Agent Note records one decision about this repository: the problem, what was chosen, what was given up, and why. It holds the reasons that code, tests, and other documents cannot carry. Read [`README.md`](README.md) when you create, classify, or move a note.

## When to write one

Write or update an Agent Note in the same commit when a change makes a lasting decision that code and tests do not explain:

- You choose between real alternatives, and a later agent could pick the other one.
- You remove something, and a later agent could bring it back.
- You reject a proposal that looks attractive, such as a simplification that would break a hidden requirement.

Local and mechanical edits need no note, and neither do small changes to how a page looks. When a note already owns the decision, update that note in place.

## Rules

- **Search before proposing.** Before you propose to remove, replace, or reintroduce something, search the notes: `grep -ril <topic> .agents/notes/`. Answer the matching note's rationale and reopen condition, not only the general case.
- **Supersession check.** Every new note starts with a [supersession check](../skills/csm-doc/SKILL.md#supersession-check) across the notes in the same commit.
- **Keep notes current.** When a change renames a path or alters a mechanism that an `implemented/` note names, update that note in place in the same commit; do not append chronological history.
