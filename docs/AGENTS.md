# AGENTS.md — Documentation standard

Read this before you write or edit `AGENTS.md`, a file in `docs/`, an Agent Note, a project skill, `README.md`, or a code comment that explains a decision. It defines where each fact lives, what may enter a document, the writing rules, the word budgets, and the checks. The [`maintain-docs`](../.agents/skills/maintain-docs/SKILL.md) skill is the procedure that applies these rules: placement, fact-check, audit, and validation.

## One home per fact

Each fact has one home. Other places link to it.

| Home | Holds | Leaves to other homes |
|---|---|---|
| Root [`AGENTS.md`](../AGENTS.md) | Standing orders that every session needs, one to three lines each, and the routing table to the other homes | Procedures, rationale, product and design detail |
| Subtree `AGENTS.md` ([`docs/`](AGENTS.md), [`.agents/notes/`](../.agents/notes/AGENTS.md)) | Rules for the files in that folder | Rules that the root file already carries |
| [`docs/architecture.md`](architecture.md) | Core principles, and how the site builds, serves, and runs scripts, with pointers to the owning files | Values and lists that the code holds |
| [`docs/product.md`](product.md) | What readers see and rely on, and the test that guards each promise | How it is built |
| [`docs/design.md`](design.md) | Visual intent and deliberate differences from Kami | Token values, which live in `src/styles/global.css` |
| [`docs/testing.md`](testing.md) | Test layers, previews, and the evidence each kind of change needs | Test inventories, which the test titles are |
| [Agent Notes](../.agents/notes/AGENTS.md) | Decisions: the problem, what was chosen, what was rejected, and the consequences | Current behavior that code and tests show |
| Project skills in `.agents/skills/` | Procedures that an agent runs: documents, review, ship, dependency upgrades | Rationale (link the Agent Note) |
| `README.md` | The human homepage: what the site is, setup, how to write a post, and a short deployment overview | Agent rules and maintenance procedures |
| Code comment | The local contract or reason for code that looks wrong or surprising | Reasons that span files (write an Agent Note) |
| Commit body | History: the trigger, the change, and the verification that ran | Current state |
| Test or check | Every rule that a script can decide | — |

## Admission rule

A sentence enters a document only if code, configuration, and tests cannot carry it. That leaves intent, rationale, rejected options, external and legal facts, approval boundaries, and procedures.

Everything else is a cache: a copy of a lookup that goes stale when the source changes. Examples are token values, front matter fields, script contents, limiter budgets, cookie attributes, and lists of what a test asserts. Link to the source file or test instead.

State a value only when a test pins it, and name that test. A value without a test is a cache.

## Promotion

A lesson moves toward enforcement:

1. The commit body records an incident: what broke, why, and the fix.
2. A trap in [`code-review`](../.agents/skills/code-review/SKILL.md) records a lesson that review must catch again. It cites the commit.
3. A test or check enforces the rule when a script can decide it. Then delete the trap. A prose rule that a check enforces keeps only what a writer needs to comply, and names the check.

## Writing rules

- Write the current state. History belongs to commits and Agent Notes.
- Write English prose in ASD-STE100 Simplified Technical English: short sentences, active voice, one idea per sentence, one term for each concept.
- Give each paragraph one physical line, including a paragraph that continues a list item (`tests/docs.test.mjs`).
- State the target behavior. Use a prohibition only for a hard limit, and pair it with the target.
- When you shorten text, keep each actor, condition, order, modality (must, may, never), exception, and failure. A lower word count alone is not an improvement.
- A comment states the local contract or the reason for code that looks wrong: an invariant, an order, a security limit, a surprising failure. It does not narrate control flow, walk through a test, or restate the code. Link the Agent Note for a reason that spans files.
- Use bold only for the clause that changes behavior or for the lead term of a list item.
- Paths in backticks are relative to the repository root. Links are relative to the document, including links between Agent Notes, so the link check covers them.
- Cite a commit by its hash in backticks, and a removed file as `<commit>:<path>` at a commit where the file exists. Cite only commits in the history of `main`: `main` is never rewritten, so those hashes are stable. A local or branch commit changes when it is rebased, and a squash merge leaves the branch commits out of `main`.
- A change to documented behavior updates its home in the same commit.

## Slop checklist

Find and fix these in every document you touch:

- A cache: a value, list, or behavior that a source file or test already holds.
- A duplicate: the same rule in two homes. Search for a distinctive phrase, keep one home, and link the others.
- History in a current-state document: "now", "no longer", "was changed to".
- Status annotations that rot: "implemented", "future", "TODO" in prose.
- A reasoning transcript: the steps that led to a result, proof of an obvious branch, or a local option that lost. Keep the result and its lasting reason.
- A reference that only the writing session can resolve: "decision 3", "as discussed", "the reviewer asked", a section of an uncommitted draft. Restate the fact so that a reader at HEAD can check it.
- The same reason repeated beside each sibling, instead of once at the shared owner.
- A no-op: an instruction that the agent follows by default.
- A paragraph that carries several rules. Split it, or move the detail to its home.
- Emphasis everywhere, so nothing stands out.
- Plans in an implemented Agent Note: "should", "will", migration steps, acceptance checklists.

## Word budgets

`tests/docs.test.mjs` sets a word ceiling for each standing document: root `AGENTS.md`, each subtree `AGENTS.md`, and each file in `docs/`. When the check fails:

1. Relocate content that belongs in another home, and leave a link.
2. Condense content that belongs here but can be shorter.
3. Raise the ceiling only when the words need the space, and give the reason in the commit body.

A ceiling is a guardrail, not a reduction target. When you add or raise a ceiling, set it about 5% above the current count, so that a small addition passes and a large one makes you relocate first. Lower a ceiling only together with a cut that leaves this headroom.

## Checks

`tests/docs.test.mjs` enforces each rule in this file that a script can decide; its test titles name them. Each failure message names the file and the fix. `tests/docs-rejects.test.mjs` runs it on a fixture with one defect for each rule, so a check that stops failing is caught. A new check adds its defect to that fixture. [Evidence for each change](testing.md#evidence-for-each-change) says when to run them.
