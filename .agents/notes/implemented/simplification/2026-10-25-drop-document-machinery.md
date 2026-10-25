# Agent Note: Drop the sealed note archive, the word budgets, and the reject fixture

Status: implemented

## Problem

The documentation process had grown three layers that guarded the documents rather than the site. A sealed archive froze four retired Agent Notes with SHA-256 seals, a second lifecycle, a checker, and a procedure in `csm-doc`. Word budgets gave each standing document a ceiling that every substantive edit had to raise in the same commit. `8771ac9:tests/docs-rejects.test.mjs` built a fixture repository with one defect per document rule, to prove that the document checker itself could fail. For a personal site with one maintainer, these layers cost a step on most commits and taught agents to manage the process instead of the product. The owner asked for a review that would remove what does not pay for itself.

## Decision

- Agent Notes have three lifecycles: `proposed/`, `implemented/`, and `rejected/`. A note that no longer guides a change is deleted; git keeps its text. The four archived notes and `SEALS.sha256` are deleted.
- No document has a word budget. The finishing sweep in the [documentation standard](../../../../docs/AGENTS.md) and review catch sprawl.
- `8771ac9:tests/docs-rejects.test.mjs` and its `prek.toml` hook are deleted. `tests/docs.test.mjs` keeps the checks that guard references: links and anchors, named paths and commits, and skill links.
- `docs/AGENTS.md`, `.agents/notes/README.md`, and `csm-doc` shrink to match.

This supersedes the archived decision that added class folders and the sealed archive (`8771ac9:.agents/notes/archived/process/2026-10-08-agent-note-classes-and-archive.md`): the class folders stay, the archive goes. It updates the [documentation decision](../process/2026-10-07-documents-hold-only-what-code-cannot.md) and the [pre-commit hook](../process/2026-10-08-pre-commit-document-checks.md) in place.

## Alternatives considered

**Keep the archive and stop adding to it.** It would still carry a lifecycle, a checker, and a procedure for four notes whose text git already keeps.

**Keep budgets for root `AGENTS.md` only**, the one file in every session. Its standing orders are short and reviewed whenever they change; a ceiling adds a step without a reader who benefits.

**Keep the reject fixture.** It proves the checker can fail, but the checker is small enough to read, and each of its rules has failed on real commits.

## Consequences

Commits that touch documents no longer adjust budgets or seals. Growth in a standing document is caught by review, not by a test. A retired note's text is found with `git log --all -- .agents/notes/`, not in the tree.

## Reopen when

The repository gains maintainers, and documents start to sprawl faster than review catches it.
