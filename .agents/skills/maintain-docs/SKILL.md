---
name: maintain-docs
description: Write, review, or audit chensl.me documentation. Use when you add or change AGENTS.md, a file in docs/, README.md, an Agent Note, a project skill, or a code comment that records a decision, and when you audit documents for stale, copied, or misplaced facts.
---

# Maintain chensl.me documents

The [documentation standard](../../../docs/AGENTS.md) holds the rules: the homes, the admission rule, the writing rules, the budgets, and the checks. The [Agent Note rules](../../notes/AGENTS.md) hold the note lifecycle. This skill is the procedure that applies them; it does not repeat them.

## Steps

1. **Read.** Read root `AGENTS.md`, the standard, the target document, and the source and tests that own each fact it names. Done when you can name the owner of every fact you will write or keep.
2. **Place.** Choose one home for each fact from the standard's table. When code, configuration, or a test carries the fact, link the source instead. Done when every new sentence has one home, and a search for its distinctive phrase finds no second copy.
3. **Write.** Apply the writing rules, and the [prose coverage](#prose-coverage) for the kind of text. Done when the text passes the admission rule sentence by sentence, and each shortened passage keeps all of its propositions.
4. **Fact-check.** Follow [Fact-check](#fact-check). Done when every command, path, default, and value is observed or traced, or deleted.
5. **Agent Notes.** For a new note, run the [supersession check](#supersession-check). For a note that a change touches, keep its paths, names, and mechanisms current. Done when no two active notes own the same decision without links both ways.
6. **Audit.** Run the slop checklist over every document that you touched, not only the lines you changed. Done when each item is fixed or is a deliberate keep that you can name.
7. **Validate.** Run `node --test tests/docs*.test.mjs` and `git diff --check`. When the change also reaches site output, run the checks in [Evidence for each change](../../../docs/testing.md#evidence-for-each-change). Read the complete diff once for correctness, then once for brevity. Done when the checks pass and both reads find nothing to fix.
8. **Report.** List the documents changed, the deliberate keeps, the claims that you could not verify, and each check that ran with its result. Done when each item in the list names a file or a command.

## Fact-check

A document states how the repository behaves today. The only evidence for a claim about an operation is that you ran it.

1. Run every command, example, and procedure that the document tells the reader to run, against the current checkout, exactly as the document shows it. Write only what you observed, including the failure modes.
2. Trace every path, default, and value to the file that owns it. A value from memory, from a similar project, or from old prose is not evidence.
3. Correct old text against the code, not against other documents. A statement that agrees with an older document can still be wrong.
4. Delete a claim that you could not reproduce. When a claim needs access that you do not have, such as a remote D1 migration, keep it only if its source is authoritative, and write "not run" in the commit body.

## Prose coverage

Add text where code cannot show a required fact, and remove text that code already shows.

- **Code comment:** an invariant, an order that matters, a security limit, or a surprising failure. Delete narration of what the next lines do.
- **Test comment:** why a fixture, an assertion, or an indirect observation is necessary. Delete walkthroughs of the test.
- **Skill:** steps that each end in a checkable completion criterion; each guardrail before the action that it guards; links to the sources of truth.
- **Agent Note:** the unique rationale, the alternatives and why they lost, the consequences, the tests that pin the decision, and the known gaps.
- **Commit body:** the trigger, the change and its reason, the verification that ran, and the limits.
- **README:** what a human needs to set up the project and write a post, and a short deployment overview that links its home.

## Supersession check

1. Search the active notes for the same decision, mechanism, or rejected option: `grep -ril <topic> .agents/notes/`. Search for the names of the files and settings that the decision touches, not only its title.
2. Read each match. Classify it as fully superseded, partly superseded, an obsolete rejection, or unrelated, by the [Agent Note rules](../../notes/AGENTS.md#retention).
3. Apply the result in the same commit as the new note: delete or update the old note, add the links both ways, and repair inbound links.

Done when each match has a class and its result is in the commit.

## Audit the notes

When you review the notes as a set, classify each one by the [retention rules](../../notes/AGENTS.md#retention). Word count and age are not criteria. Inspect every note in scope, and report the borderline cases.

These cases set the bar:

- **Keep** [TypeScript 6 for astro check](../../notes/implemented/2026-09-27-typescript-6-for-astro-check.md): it is short, but its reopen condition stops a TypeScript 7 upgrade that would break `pnpm check`.
- **Keep** [delete the archived W05 font](../../notes/rejected/2026-10-04-delete-archived-w05-font.md): removing an unused 19 MB file stays tempting, and the note says why it loses.
- **Delete** a note that only records a new color for a hover state, or a renamed helper: nothing in it can guide a later change.
