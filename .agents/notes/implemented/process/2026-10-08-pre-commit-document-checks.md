# Agent Note: Run the document checks before each commit

Status: implemented

## Problem

The document checks ran only in `pnpm check` and in GitHub CI. Cloudflare Workers Builds deploys `main` without waiting for CI, and most changes land on `main` directly. A broken link, a wrapped paragraph, or a missing path in a document reached `main`, and CI reported it only after the push.

## Decision

A prek pre-commit hook runs the checks on the staged tree. `prek.toml` defines three local hooks:

- `git diff --cached --check` rejects whitespace errors.
- `tests/docs.test.mjs` runs on every commit, because a rename anywhere can break a path that a document names.
- `tests/docs-rejects.test.mjs` runs only when a staged path matches `^tests/docs`, because it proves the checks themselves and takes several seconds.

`@j178/prek` is a pinned dev dependency. `pnpm exec prek install` enables the hook once per clone; `README.md` lists it in the setup.

## Alternatives considered

**Keep the checks in CI only.** This was the previous state. Cloudflare does not wait for CI, so CI finds a broken document after it is on `main`.

**Lefthook**, as deepseek-harness uses. The owner chose prek.

**Install the hook from a `prepare` or `postinstall` script.** Cloudflare Workers Builds runs the install, so a hook installer that fails there would fail the production build. The setup step is one command.

**Run the document checks only when Markdown is staged.** A rename of a source file breaks a path that an unchanged document names, so the check must see every commit.

**Run `pnpm check` in the hook.** It builds the site, which is too slow for each commit. CI runs it.

## Consequences

A commit that breaks a document rule fails locally, before it can reach `main`. Each commit waits about one second for the checks, more on a loaded machine. The hook exists only after `pnpm exec prek install`, and `git commit --no-verify` skips it, so CI stays the backstop. The installed hook names the prek binary in `node_modules` and falls back to `prek` on `PATH`; without either, every commit fails until you run `pnpm install`.
