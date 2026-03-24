# Build Script Simplification Design

Date: 2026-03-24
Topic: Simplify Cloudflare build bootstrap to only install Hugo

## Context

This repository is a Hugo personal site deployed through Cloudflare Workers static asset hosting via Wrangler. Cloudflare currently runs `build.sh` through `wrangler.jsonc`:

```json
"build": {
  "command": "chmod a+x build.sh && ./build.sh"
}
```

The current `build.sh` installs four toolchains before building the site:

- Dart Sass
- Go
- Hugo
- Node.js

After installation, the script configures Git and runs:

```bash
hugo build --gc --minify
```

Local project commands and repository structure suggest that the site content build is Hugo-only, but they do not prove that the current Cloudflare bootstrap path has no implicit dependency on the removed tools:

- `just build` runs `hugo --minify --gc`
- `package.json` only declares `wrangler` as a dev dependency
- The user wants to keep `build.sh` but reduce it to Hugo-only installation and build execution

## Goals

- Keep Cloudflare deployment behavior compatible with the current `wrangler.jsonc` build entrypoint
- Reduce `build.sh` to the minimum logic needed for site generation
- Continue pinning a specific Hugo version for deterministic Cloudflare builds
- Change the build-script timezone export from `Europe/Oslo` to `Asia/Shanghai`
- Avoid changing unrelated project build, routing, or deployment configuration

## Non-Goals

- Removing `build.sh` entirely
- Changing `wrangler.jsonc` build wiring
- Introducing a new package manager or build dependency
- Refactoring local developer workflows in `justfile`

## Options Considered

### Option 1: Keep `build.sh`, install only Hugo (recommended)

Update `build.sh` so it:

- sets required shell safety flags
- exports `TZ=Asia/Shanghai`
- downloads and extracts the pinned Hugo Linux archive
- prepends the Hugo binary directory to `PATH`
- verifies `hugo version`
- runs `hugo build --gc --minify`

Pros:

- Smallest safe change
- Preserves current Cloudflare integration point
- Removes unnecessary dependency bootstrapping and script complexity
- Retains explicit Hugo version pinning

Cons:

- Still maintains a custom bootstrap script

### Option 2: Keep `build.sh`, but parameterize the Hugo version

Move the Hugo version into an environment variable or separate config input while still downloading Hugo in the script.

Pros:

- More flexible for future upgrades

Cons:

- Adds configuration complexity without solving a current problem
- Increases the number of places involved in the build path

### Option 3: Remove `build.sh` and call Hugo directly from Wrangler

Change `wrangler.jsonc` so the build command is just `hugo --minify --gc`.

Pros:

- Lowest long-term maintenance if the environment already provides Hugo

Cons:

- Depends on Cloudflare build environment assumptions not confirmed by current repository evidence
- Changes the current build integration more than requested

## Chosen Design

Use Option 1.

`build.sh` will become a Hugo-only bootstrap script. The file will retain its current role as the Cloudflare build entrypoint, but its responsibilities will be reduced to:

1. Define the pinned Hugo version
2. Export `TZ=Asia/Shanghai`
3. Download the matching Hugo Linux archive from GitHub releases
4. Extract Hugo into a local directory under `${HOME}/.local`
5. Add that directory to `PATH`
6. Print the installed Hugo version
7. Build the site with `hugo build --gc --minify`

This design is based on a bounded assumption: the existing Cloudflare build path does not actually require Git, Node.js, Go, or Dart Sass for this repository's current Hugo build. That assumption is plausible from the repository state, but it is not fully proven without a Linux/Cloudflare execution of the simplified script.

The following logic will be removed because it is not required for the requested build path:

- Dart Sass installation
- Go installation
- Node.js installation
- Version checks for removed tools
- Git configuration and shallow-clone expansion

## Expected File Changes

- `build.sh`: simplify to Hugo-only installation and build steps
- `build.sh`: update the file header comment so it reflects a Hugo-only bootstrap script and, if Node.js is mentioned, make it clear that Node dependencies are handled outside this script

No changes are planned for:

- `wrangler.jsonc`
- `justfile`
- `package.json`

## Risks And Mitigations

- The current repository state only proves that normal local site generation is Hugo-based; it does not fully prove that the Cloudflare bootstrap environment never relies on Git, Node.js, Go, or Dart Sass.
  - Mitigation: treat removal of those tools as a controlled simplification. Keep the script change narrow, keep the Hugo build command unchanged, and restore only a specifically demonstrated dependency if a remote Linux/Cloudflare build later shows one is still required.

- If Hugo extended features implicitly rely on external tools in this environment, the build could fail after removing them.
  - Mitigation: keep the build command unchanged, verify the generated site locally with `just build`, and treat any remaining Cloudflare-only failure as evidence of an environment-specific dependency rather than proof that the simplification idea was wrong.

- If repeated builds run in a reused environment, extracting into a fixed directory could fail if the directory already exists.
  - Mitigation: create `${HOME}/.local` explicitly, recreate or clean the Hugo target directory before unpacking, and avoid assuming a pristine home directory.

## Verification

- Per user instruction, do not run local verification as part of this change
- Treat the implementation as an unverified simplification until a later explicit local or Cloudflare build request is made
- Do not claim Cloudflare deployment success without an actual Linux/Cloudflare build or an explicit deploy-related request from the user

## Implementation Notes

- Keep the script in Bash with `set -euo pipefail`
- Keep or update the top-of-file comment so it matches the simplified Hugo-only behavior
- Keep quoting strict for downloaded archive names and extracted paths
- Prefer a small, readable script over additional abstractions
