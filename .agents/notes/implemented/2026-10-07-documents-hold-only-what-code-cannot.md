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

The repository follows the [documentation standard](../../../docs/AGENTS.md), which adapts two references: OpenAI's harness engineering report (a short `AGENTS.md` as a map, the repository as the system of record, mechanical checks on the knowledge base) and the documentation workflow of `deepseek-ai/deepseek-harness` (one home per fact, Agent Notes as decision records, procedures as skills, link and format checks).

- Each kind of content has one home: root `AGENTS.md` for standing orders and routing; `docs/architecture.md`, `docs/product.md`, `docs/design.md`, and `docs/testing.md` for reference; Agent Notes for decisions; project skills for procedures.
- A sentence enters a document only if code, configuration, and tests cannot carry it. A value appears only with the test that pins it.
- `tests/docs.test.mjs` checks links, anchors, paths, cited commits, the `AGENTS.md` word budget, and the Agent Note format.
- Decisions that only an agent's private memory held are Agent Notes.

## Alternatives considered

**Keep the maintenance guide and remove only the copied facts.** This was the first proposal in the same session. The owner rejected it: the file would still mix several kinds of content with no rule for what goes where.

**One central decision list instead of one file per decision.** A list is shorter, but code and documents cannot link to one decision, and the deepseek-harness format gives each decision a problem, rejected options, and consequences.

**Procedures in a cookbook folder under `docs/` instead of skills.** The owner chose skills: an agent loads a skill when its description matches the task, while a cookbook page depends on a routing line.

**Adopt the rest of both references:** execution plans, a tech-debt tracker, quality grades, generated reference, postmortems, word budgets for every document, and bilingual pairs. This repository has one maintainer and little change. `ponytail:` comments and the `ponytail-debt` skill already track debt. Commit bodies record incidents, and `code-review` traps cite them. Only root `AGENTS.md` is in every session, so only it has a budget.

## Consequences

Agents must follow the routing table in root `AGENTS.md` to reach a reference document; a skill loads by its description. The admission rule depends on review: `tests/docs.test.mjs` catches broken references, but not a copied value. The `code-review` skill carries the trap for that. If copied facts come back often, the next step is a check that, for example, rejects a CSS value in a document without a named test.
