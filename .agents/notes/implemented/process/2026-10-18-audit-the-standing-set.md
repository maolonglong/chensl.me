# Agent Note: Audit the standing set when a change spans documents

Status: implemented

## Problem

The slop checklist runs on documents a change touches, and `csm-doc` audits the notes only "when you review the notes as a set". Neither has a trigger. A change that spans several standing documents can leave each one locally correct and the set contradictory, and no event requires the set-level pass. The [AI News section](../../../../docs/product.md#ai-news) is the first application: before this change, one paragraph carried ten rules in 107 words, and the change that added it passed the per-document audit.

## Decision

[`csm-doc`](../../../skills/csm-doc/SKILL.md) scopes the audit by the change, not the file: when a change touches two or more standing documents, the audit covers the whole standing set. The note audit gains one criterion: a note whose decision depends on an external fact, such as a version, an upstream behavior, or a limit, and that has no `## Reopen when` condition is a finding. The [documentation decision](2026-10-07-documents-hold-only-what-code-cannot.md) still owns the admission rule and the word budgets; this note adds only the audit scope.

## Alternatives considered

**A calendar or CI schedule for the audit.** A schedule runs at a time unrelated to the change, and it needs an owner and a reminder outside the repository. A cross-document change is the moment the set can contradict itself.

**Audit every standing document on every change.** Five documents cost little, but the rule would run on every typo fix and make the common path slower than the failure it prevents.

**Require `## Reopen when` in the format check.** A required section invites a placeholder, and a placeholder is worse than an absent condition because it looks checked. The judgment belongs in the audit, where a note can say why its premise does not expire.

## Consequences

A change that spans documents now costs a set-level read; a single-document change keeps the narrow audit. The reopen criterion adds one question to the note audit and no field to the note format. Both criteria remain judgment, so they run only when someone follows the procedure.

## Reopen when

- Cross-document changes become common enough that the set-level read dominates the change.
- A check can decide that a note's premise expired, such as a version named in a note no longer matching `package.json`.
