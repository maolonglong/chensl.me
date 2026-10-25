# AGENTS.md — Documentation standard

Read this before you write or edit `AGENTS.md`, a file in `docs/`, an Agent Note, a project skill, `README.md`, or a code comment that explains a decision. The [`csm-doc`](../.agents/skills/csm-doc/SKILL.md) skill is the procedure that applies it.

## One home per fact

Each fact has one home. Other places link to it.

| Home | Holds | Leaves to other homes |
|---|---|---|
| Root [`AGENTS.md`](../AGENTS.md) | Standing orders that every session needs, and the routing table | Procedures, rationale, product and design detail |
| Subtree `AGENTS.md` ([`docs/`](AGENTS.md), [`.agents/notes/`](../.agents/notes/AGENTS.md)) | Rules for the files in that folder | Rules that the root file already carries |
| [`docs/architecture.md`](architecture.md) | Bird's-eye view, entry points, code map with invariants and boundaries, cross-cutting concerns | Values and lists that the code holds |
| [`docs/product.md`](product.md) | What readers see and rely on, and the test that guards each promise | How it is built |
| [`docs/design.md`](design.md) | Visual intent and the deliberate choices behind it | Token values, which live in `src/styles/global.css` |
| [`docs/testing.md`](testing.md) | Test layers, previews, and the evidence each kind of change needs | Test inventories, which the test titles are |
| [Agent Notes](../.agents/notes/AGENTS.md) | Decisions: the problem, what was chosen, what was rejected, and the consequences | Current behavior that code and tests show |
| Project skills in `.agents/skills/` | Procedures that an agent runs | Rationale (link the Agent Note) |
| `README.md` | Setup, how to write a post, and a short deployment overview | Agent rules and maintenance procedures |
| Code comment | The local contract or the reason for code that looks wrong | Reasons that span files (write an Agent Note) |
| Commit body | History: the trigger, the change, and the verification that ran | Current state |
| Test or check | Every rule that a script can decide | — |

## Admission rule

A sentence enters a document only if code, configuration, and tests cannot carry it: intent, rationale, rejected options, external and legal facts, approval boundaries, and procedures. Anything else is a cache, such as a token value, a front matter field, or a list of what a test asserts; link the source instead. State a value only when a test pins it, and name that test.

When a check can decide a rule, write the check and keep only what a writer needs to comply.

## Writing rules

- Write the current state. History belongs to commits and Agent Notes.
- Write direct, specific English: short sentences, active voice, one term for each concept. State the target behavior; use a prohibition only for a hard limit, paired with the target.
- Give each paragraph one physical line (`tests/docs.test.mjs`).
- When you shorten text, keep each actor, condition, modality, exception, and failure.
- Paths in backticks are relative to the repository root. Links are relative to the document, so the link check covers them.
- Cite a commit by its hash in backticks, and a removed file as `<commit>:<path>` at a commit where the file exists; cite only commits on `main`, which is never rewritten.
- A change to documented behavior updates its home in the same commit.

Before you finish, remove caches, duplicates, history in a current-state document, references that only the writing session can resolve, and instructions that an agent follows by default.

## Checks

`tests/docs.test.mjs` enforces each rule here that a script can decide: links and anchors resolve, named paths and commits exist, paragraphs are one line, skills are linked from `.claude/skills/`, and Agent Notes follow their format. The pre-commit hook in `prek.toml` runs it. [Evidence for each change](testing.md#evidence-for-each-change) says when to run it by hand.
