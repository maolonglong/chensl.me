# AGENTS.md — Documentation standard

Read this before you write or edit `AGENTS.md`, a file in `docs/`, an Agent Note, a project skill, `README.md`, or a code comment that explains a decision. It says where each fact lives, what may enter a document, and how documents are checked.

## One home per fact

Each fact has one home. Other places link to it.

| Home | Holds | Leaves to other homes |
|---|---|---|
| Root [`AGENTS.md`](../AGENTS.md) | Standing orders that every session needs, and the routing table to the other homes | Procedures, rationale, product and design detail |
| [`architecture.md`](architecture.md) | Core principles, and how the site builds, serves, and runs scripts, with pointers to the owning files | Values and lists that the code holds |
| [`product.md`](product.md) | What readers see and rely on, and the test that guards each promise | How it is built |
| [`design.md`](design.md) | Visual intent and deliberate differences from Kami | Token values, which live in `src/styles/global.css` |
| [`testing.md`](testing.md) | Test layers, previews, and the evidence each kind of change needs | Test inventories, which the test titles are |
| [Agent Notes](../.agents/notes/AGENTS.md) | Decisions: the problem, what was chosen, what was rejected, and the consequences | Current behavior that code and tests show |
| Project skills in `.agents/skills/` | Procedures that an agent runs: review, ship, dependency upgrades | Rationale (link the Agent Note) |
| `README.md` | The human homepage: what the site is, setup, and how to write a post | Agent rules and maintenance procedures |
| Code comment | The local reason for code that looks wrong or surprising | Reasons that span files (write an Agent Note) |
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
3. A test or check enforces the rule when a script can decide it. Then delete the trap or the prose rule, so the rule has one home.

## Fact-check

Run every command, example, and procedure that a document tells the reader to run, against the current checkout. Trace every path, default, and value to its source. Write only what you observed. Delete a claim that you could not reproduce. When a claim needs access you do not have, such as a remote D1 migration, keep it only if its source is authoritative, and record "not run" in the commit body.

## Writing rules

- Write the current state. History belongs to commits and Agent Notes.
- Write English prose in ASD-STE100 Simplified Technical English: short sentences, active voice, one idea per sentence.
- Give each paragraph one physical line.
- State the target behavior. Use a prohibition only for a hard limit, and pair it with the target.
- Paths in backticks are relative to the repository root. Links are relative to the document.
- Cite a removed file as `<commit>:<path>`, at a commit where the file exists, so the reference stays checkable.
- A change to documented behavior updates its home in the same commit.

## Slop checklist

Find and fix these in every document you touch:

- A cache: a value, list, or behavior that a source file or test already holds.
- A duplicate: the same rule in two homes. Search for a distinctive phrase, keep one home, and link the others.
- History in a current-state document: "now", "no longer", "was changed to".
- Status annotations that rot: "implemented", "future", "TODO" in prose.
- A no-op: an instruction that the agent follows by default.
- A paragraph that carries several rules. Split it, or move the detail to its home.

## Checks

`node --test tests/docs.test.mjs` checks first-party Markdown in less than a second, and `pnpm check` includes it. It checks relative links and heading anchors, repository paths, commit hashes, and `<commit>:<path>` citations in backticks, the root `AGENTS.md` word budget, and the Agent Note format. A change to Markdown outside `public/` and `src/` needs this check and `git diff --check`, not a site build.
