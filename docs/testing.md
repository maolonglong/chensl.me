# Testing

Read this before you add or change a test, or when you choose the checks for a change. It names the test layers, the evidence each kind of change needs, and how to run a preview. The test titles are the list of guarded behaviors; read them in the files.

## Principles

- Test behavior that a user or a reader of the output can see. A test that pins an internal detail breaks on every refactor and proves nothing.
- For a bug, write the regression test first and watch it go red. Then fix the code.
- Derive the expected value from the contract, not from the code under test. A test that recomputes its expectation with the code's own formula passes for the wrong reason.
- When a test fails, fix the code. Change a test only when the test is wrong, and say why in the commit body.
- Report what ran. "Passed" in a commit body names the command and the result. Real devices, Safari, and screen readers stay unverified unless someone ran them.

## Layers

| Layer | Files | What it proves | Run |
|---|---|---|---|
| Build regressions | `tests/*.test.mjs` | Most of them build a disposable Astro fixture project and check the output: content rules, Markdown, fonts, CSP order, RSS | `pnpm check`, or `node --test tests/<name>.test.mjs` |
| Output checks | `scripts/check-site.mjs`, `tests/check-site.test.mjs` | The real build has valid links, images, CSP sources, `_headers` rules, and no content store in the Worker | `pnpm check` |
| Document checks | `tests/docs.test.mjs`, `tests/docs-rejects.test.mjs` | First-party Markdown and skills follow the rules of the [documentation standard](AGENTS.md#checks) that a script can decide | `node --test tests/docs.test.mjs` |
| Browser specs | `e2e/*.spec.mjs` | Layout, interactions, themes, CSP in a real browser, and the upvote Actions against local D1 | `pnpm test:e2e` |
| Exploration | agent-browser | A question no spec answers yet | By hand; turn a finding worth keeping into a spec |

Some build regressions run `python3` on purpose: it reads the output with a parser that the site does not use ([decision](../.agents/notes/rejected/2026-10-04-replace-python-test-reader.md)).

## Evidence for each change

Run the narrowest check that fails for the regression, plus the checks below for the surfaces the change reaches:

| Change | Run |
|---|---|
| Site output, build, content rules | `pnpm check` |
| Layout, styles, fonts, browser interactions, CSP, upvotes | `pnpm check` and `pnpm test:e2e`, then inspect the screenshots |
| Dependencies or `wrangler.jsonc` | `pnpm check`, then `pnpm exec wrangler deploy --dry-run` on the fresh build |
| Markdown outside `public/` and `src/` | `node --test tests/docs*.test.mjs` and `git diff --check` |
| Tooling only | The checks that the tool affects |

`pnpm format` applies Prettier; `pnpm check` fails on unformatted files.

## Screenshots

`capture()` in `e2e/site.mjs` writes screenshots to `test-results/screenshots`. A screenshot is evidence only after someone looks at it. Inspect each affected state: light and dark, narrow and wide, open and closed. When a spec does not reach an affected state, add a targeted check. Viewport emulation is not a real device.

## Browser specs

`pnpm test:e2e` builds the site, then Playwright starts its own Wrangler preview with local D1 and runs `e2e/`; `playwright.config.mjs` holds the port, the browser discovery, and the report folders. Run one suite at a time: two runs, or a build during a run, share `dist/` and the port and fail with misleading errors.

- `e2e/site.mjs` holds the shared fixtures. `test.use({ hasTouch: true })` selects a touch screen, and `open()` fails when the browser's hover capability differs from what the test asked for. Viewport width alone does not reproduce hover or touch states.
- The upvote specs write to D1, so the config accepts only a loopback `SITE_URL`. Each test sends its own client address, so the rate limits do not depend on suite speed. Each run adds votes to the `dockertest` article; the specs compare counts with a baseline read at the start of each test.
- To reuse a preview that you started, set `SITE_URL` and apply the local migrations first: `pnpm exec wrangler d1 migrations apply VOTES --local`.

## Previews

- **Development.** `pnpm dev` serves drafts and reloads on edits. Under a process supervisor, set `ASTRO_DEV_BACKGROUND=0` so the supervisor owns the process. `/_astro/status` returns `{"ok":true}` when the server is ready.
- **Production.** Run `pnpm build`, then `pnpm exec wrangler dev --port 8787`. It serves the existing build and does not rebuild. Use it, not `astro dev`, for CSP and upvote checks.
- Local Wrangler adds UTF-8 to every `text/*` response. A charset that only the preview shows is not proof for production ([decision](../.agents/notes/rejected/2026-10-04-drop-headers-checks.md)).
