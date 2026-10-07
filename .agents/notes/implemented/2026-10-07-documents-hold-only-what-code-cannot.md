# Agent Note: Documents hold only what code cannot carry

Status: implemented

## Problem

82 of the first 501 commits changed `AGENTS.md`, `README.md`, or `docs/`, and many of them only corrected text that had gone stale. The cause was the same each time: a document copied a fact that code owns, and the code changed. Examples:

- `191bc16` corrected design values that no longer matched the CSS.
- `8c5c00b` corrected a README field list and a claim about which file filters drafts.
- `47fc88b` and `260d99a` corrected review traps that described replaced behavior or a deleted helper.
- `4e845ad` corrected the README field list a second time, and a deploy command that never worked.

The maintenance guide (`6b0a84d:docs/maintenance.md`) mixed six kinds of content in one file: development workflow, the CSP rules, content rules, the upvote rules with their verification and approval steps, dependency upgrades, and shipping. Some decisions lived only in one agent's private memory, where other agents could not see them.

## Decision

The repository follows the [documentation standard](../../../docs/AGENTS.md), which adapts two references: OpenAI's harness engineering report (a short `AGENTS.md` as a map, the repository as the system of record, mechanical checks on the knowledge base) and the documentation workflow of `deepseek-ai/deepseek-harness`, as read at [its commit 5badb15009](https://github.com/deepseek-ai/deepseek-harness/tree/5badb15009).

- Each kind of content has one home: root `AGENTS.md` for standing orders and routing; subtree `AGENTS.md` files for the rules of their folder; `docs/architecture.md`, `docs/product.md`, `docs/design.md`, and `docs/testing.md` for reference; Agent Notes for decisions; project skills for procedures.
- A sentence enters a document only if code, configuration, and tests cannot carry it. A value appears only with the test that pins it.
- The standard holds the rules, and the [`docs`](../../skills/docs/SKILL.md) skill holds the procedure: placement, fact-check, prose coverage, the supersession check, and the note audit. DeepSeek splits the same way, between `docs/AGENTS.md` and its `dsh-doc`, `dsh-prose-standard`, and `dsh-archive-agent-notes` skills.
- Agent Notes follow DeepSeek's lifecycle, format, supersession check, and retention rules. Only notes dated before the format started may waive their alternatives.
- `tests/docs.test.mjs` checks links, anchors, paths, cited commits, one physical line per paragraph, a word budget for each standing document, the Agent Note format, and the skill names and links.
- Decisions that only an agent's private memory held are Agent Notes.

## Alternatives considered

**Keep the maintenance guide and remove only the copied facts.** This was the first proposal in the same session. The owner rejected it: the file would still mix several kinds of content with no rule for what goes where.

**One central decision list instead of one file per decision.** A list is shorter, but code and documents cannot link to one decision, and the deepseek-harness format gives each decision a problem, rejected options, and consequences.

**Procedures in a cookbook folder under `docs/` instead of skills.** The owner chose skills: an agent loads a skill when its description matches the task, while a cookbook page depends on a routing line.

**A word budget for root `AGENTS.md` only.** This was the first version of this decision. Only that file is in every session, but the other standing documents grow too. A ceiling makes an agent relocate or condense before it adds, as DeepSeek's budgets do.

**DeepSeek's class folders** (`feature/`, `bug-fix/`, `architecture/`, and others) under each lifecycle. With about a dozen notes, a folder listing and a search find a note at once, and a class adds one more choice for each note.

**DeepSeek's frozen archive** for implemented notes that no longer guide work. The retention rules either keep a note or delete it, and git keeps the deleted text. An archive pays off when many notes have historical value but no future use.

**Chinese counterparts for each document**, with a pairing check. The documents are in English, and one maintainer reads them. A pair doubles the cost of each edit.

**A postmortem folder.** Commit bodies record incidents, `code-review` traps cite them, and the promotion rule moves each lesson toward a check. That covers every incident so far.

**Release tags and pull-request numbers in place of commit hashes**, as DeepSeek's reference check requires. DeepSeek squash-merges pull requests, so a branch commit is not a stable name. Here `main` is never rewritten and there are no pull requests, so a commit hash is the only stable name, and the check confirms that it exists.

**A rules file in each source folder**, as DeepSeek has for `packages/`, `scripts/`, and `.github/`. The source tree is small, the root routing table reaches each home, and a link works with every agent harness, while the loading of a nested file depends on the harness.

**Execution plans, a tech-debt tracker, quality grades, and generated references** from the OpenAI report. This repository has one maintainer and little change. `ponytail:` comments and the `ponytail-debt` skill already track debt.

## Reopen when

- A lifecycle folder holds about 50 notes, so a listing no longer fits on one screen: add class folders.
- Many implemented notes have historical value but no future use: add a frozen archive.
- An incident needs a causal chain that does not fit a commit body: add a postmortem folder.
- The repository starts to merge pull requests by squash or to rewrite `main`: cite pull requests instead of commits.

## Consequences

Agents must follow the routing table in root `AGENTS.md` to reach a reference document; a skill loads by its description. The admission rule depends on review: `tests/docs.test.mjs` catches broken references, wrapped paragraphs, and growth, but not a copied value. The `code-review` skill carries the trap for that. If copied facts come back often, the next step is a check that, for example, rejects a CSS value in a document without a named test.
