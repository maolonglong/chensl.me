# Agent Note: Class folders and a sealed archive for Agent Notes

Status: implemented

## Problem

The [documentation decision](2026-10-07-documents-hold-only-what-code-cannot.md) adopted the Agent Note lifecycle from `deepseek-ai/deepseek-harness`, but left out two of its parts: class folders under each lifecycle, and a frozen archive. Without an archive, an implemented note that no longer guides work has two outcomes: it stays among the active notes, or it is deleted and only git keeps its text. Without classes, a folder listing does not show what kind of decision a note records.

## Decision

The owner decided to adopt both parts. The [Agent Note rules](../../AGENTS.md#classes) hold the details.

- A note's path is `.agents/notes/<lifecycle>/<class>/YYYY-MM-DD-topic.md`. The six classes are DeepSeek's: `feature`, `bug-fix`, `simplification`, `architecture`, `process`, and `testing`.
- `archived/` is a fourth lifecycle. It takes only implemented notes whose decision is complete and whose rationale is unlikely to guide future work. The archiving commit moves the note, adds an `Archived:` line, and appends a SHA-256 line to `.agents/notes/archived/SEALS.sha256`. After that, the note never changes.
- `tests/docs.test.mjs` rejects a class outside the set, an archived note that differs from its seal, a seal without its file, and a seal file that drops a line that `main` has. The other document checks skip archived notes. `tests/docs-rejects.test.mjs` holds a defect for each of these rules.

No note qualified for the archive when it was built: each implemented note still has a reopen condition, a negative guarantee, or a security rule.

## Alternatives considered

**Keep flat lifecycle folders.** The documentation decision chose this: with about a dozen notes, a listing and a search find a note at once, and a class adds one more choice for each note. The owner chose the classes.

**Keep or delete, with no archive.** The documentation decision chose this: git keeps the text of a deleted note, and an archive pays off only when many notes have historical value but no future use. The owner chose the archive.

**Freeze archived notes through git history**, with no seal file: a check that each archived file has only the commit that added it. This needs no extra file. The owner chose DeepSeek's seal file.

**Build only the rules, and create the archive with its first note.** The owner chose to build the folder, the seal file, and the checks at once.

**DeepSeek's seal exceptions**, which let named sealed files change once. No sealed note needs one.

**Four classes**, without `bug-fix` and `testing`. The owner chose DeepSeek's six.

## Consequences

Each new note needs a class, and a move between lifecycles keeps it. Links to notes are one folder deeper. A note that becomes history keeps its full text in the tree, outside the active notes that agents search.

The archive guards the seals only where the hook runs. In CI, `main` is the pushed commit itself, so CI cannot see a commit that rewrites an archived note and its seal line together. The pre-commit hook compares with the `main` before the commit, but `git commit --no-verify` skips it.
