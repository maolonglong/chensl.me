---
name: upgrade-deps
description: Upgrade chensl.me dependencies. Use for a Dependabot pull request, a version bump, a security advisory or pnpm audit finding, a Node.js version change, or a pnpm override.
---

# Upgrade dependencies

## Steps

1. **Scope.** List each package and its current and target versions from `package.json`, `pnpm-lock.yaml`, and the pull request or advisory. Done when every package in scope has both versions.
2. **Release notes.** For each package released on GitHub, collect the stable releases after the current tag through the target tag, newest first:

   ```sh
   gh release list -R OWNER/REPO --exclude-drafts --exclude-pre-releases -L 1000 --json tagName --jq '.[].tagName' \
     | awk -v from=CURRENT_TAG -v to=TARGET_TAG '$0 == to { keep = 1 } $0 == from { exit } keep' \
     | while read -r tag; do gh release view "$tag" -R OWNER/REPO; done > PATH
   ```

   The output must start at TARGET_TAG, and CURRENT_TAG must be in the tag list; a wrong tag gives an empty file or runs past the range. Drop `--exclude-pre-releases` only when a prerelease is in scope. Done when every breaking change and deprecation in the range is matched to the code that uses it, or marked as not used here.
3. **Constraints.** Check what pins the versions:
   - A package pinned to an exact version in `package.json` moves with `pnpm-lock.yaml` in the same commit.
   - Astro: confirm that the official Markdown processor and integrations support the target, and that `@astrojs/check` supports the TypeScript version ([decision](../../notes/implemented/2026-09-27-typescript-6-for-astro-check.md)).
   - Node.js: the CI `node-version` in `.github/workflows/ci.yml` and the requirement in `README.md` change together.

   Done when each constraint is satisfied or the upgrade stops with the reason.
4. **Change.** Update `package.json` and run `pnpm install`, so the lockfile follows. For an advisory in a transitive package, first try a lockfile refresh inside the allowed range. When no allowed version has the fix, add an override in `pnpm-workspace.yaml` keyed by the vulnerable range, such as `'pkg@<1.2.3': 1.2.3`, with a comment that names the advisory. A selector keyed by a parent version stops matching when the parent moves. A `minimumReleaseAgeExclude` entry skips pnpm's release-age delay; add one only with a stated reason. Done when `pnpm install --frozen-lockfile` passes.
5. **Verify.** Run `pnpm check`, then `pnpm exec wrangler deploy --dry-run` on the fresh build. Run `pnpm audit` for an advisory. Run `pnpm test:e2e` when the upgrade reaches the browser: Astro and its integrations, Playwright, fonts, Markdown, or Wrangler. Done when each command passed, and the commit body names each one.
