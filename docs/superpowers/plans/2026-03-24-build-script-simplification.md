# Build Script Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce `build.sh` so the Cloudflare build bootstrap only installs Hugo and runs the existing Hugo build command.

**Architecture:** Keep the current `wrangler.jsonc` entrypoint unchanged and narrow `build.sh` to one responsibility: set `TZ=Asia/Shanghai`, download a pinned Hugo Linux binary into `${HOME}/.local`, expose it on `PATH`, and invoke `hugo build --gc --minify`. Remove unrelated bootstrap logic for Git, Node.js, Go, and Dart Sass so the script matches the actual requested deployment path.

**Tech Stack:** Bash, Hugo, Wrangler/Cloudflare Workers static assets

---

## File Structure

- Modify: `build.sh`
  - Keep as the Cloudflare build bootstrap entrypoint
  - Update the file header comment to match the simplified Hugo-only bootstrap behavior
  - Remove installation logic for Dart Sass, Go, and Node.js
  - Remove Git configuration and shallow clone handling
  - Keep shell safety, `TZ=Asia/Shanghai`, Hugo download, PATH setup, Hugo version output, and site build command
- Reference only: `wrangler.jsonc`
  - Confirms `build.sh` remains the build entrypoint; no edit planned
- Reference only: `docs/superpowers/specs/2026-03-24-build-script-simplification-design.md`
  - Governing spec for scope, assumptions, and verification limits

### Task 1: Simplify `build.sh` to Hugo-only bootstrap

**Files:**
- Modify: `build.sh`
- Reference: `wrangler.jsonc`
- Reference: `docs/superpowers/specs/2026-03-24-build-script-simplification-design.md`

- [ ] **Step 1: Re-read the current script and preserve the required build contract**

Confirm that `build.sh` still needs to:

- run as Bash with `set -euo pipefail`
- export `TZ=Asia/Shanghai`
- install a pinned Hugo Linux binary
- make that binary available on `PATH`
- execute `hugo build --gc --minify`

Also confirm that `wrangler.jsonc` still points to:

```json
"build": {
  "command": "chmod a+x build.sh && ./build.sh"
}
```

- [ ] **Step 2: Remove non-Hugo version constants and installation blocks**

Delete these variables and their associated install sections from `build.sh`:

```bash
DART_SASS_VERSION=1.98.0
GO_VERSION=1.26.1
NODE_VERSION=24.14.0
```

Delete the matching blocks for:

```bash
# Install Dart Sass
# Install Go
# Install Node.js
```

Delete the matching `PATH` exports for removed tools.

If the file header comment still describes broader tool bootstrapping, update it so it accurately describes a Hugo-only bootstrap script. Keep the note about Cloudflare-managed Node dependency installation only if it remains true and is clearly presented as outside the scope of this script.

- [ ] **Step 3: Remove Git-specific bootstrap logic**

Delete this section from `build.sh`:

```bash
# Configure Git
echo "Configuring Git..."
git config core.quotepath false
if [ "$(git rev-parse --is-shallow-repository)" = "true" ]; then
  git fetch --unshallow
fi
```

The simplified script should not depend on Git configuration or repository history expansion.

- [ ] **Step 4: Make the Hugo install path idempotent**

Before extracting Hugo, ensure the destination directories are safe for repeated runs.

Implement this behavior in `build.sh`:

```bash
mkdir -p "${HOME}/.local"
rm -rf "${HOME}/.local/hugo"
mkdir -p "${HOME}/.local/hugo"
```

Then keep extraction into that directory:

```bash
tar -C "${HOME}/.local/hugo" -xf "hugo_${HUGO_VERSION}_linux-amd64.tar.gz"
export PATH="${HOME}/.local/hugo:${PATH}"
```

- [ ] **Step 5: Reduce version verification to Hugo only**

Replace the current multi-tool verification section with a Hugo-only check:

```bash
echo "Verifying Hugo installation..."
echo Hugo: "$(hugo version)"
```

Do not keep checks for removed tools.

- [ ] **Step 6: Keep the build command unchanged**

Retain this build step exactly:

```bash
echo "Building the site..."
hugo build --gc --minify
```

Do not change flags, command ordering, or switch to another entrypoint.

- [ ] **Step 7: Verify by inspection only, per user instruction**

Do not run local verification commands. Instead, inspect `build.sh` and confirm the remaining functional build flow includes:

- one version variable for Hugo
- `TZ=Asia/Shanghai`
- Hugo download/extract/remove archive flow
- Hugo-only version output
- Hugo build command

Also confirm it no longer contains these removed dependency patterns:

- `sass`
- `GO_VERSION`
- `go version`
- `NODE_VERSION`
- `node-v${NODE_VERSION}`
- `node --version`
- `git config`
- `git fetch --unshallow`

## Handoff Notes

When implementation is complete, report that:

- `build.sh` was simplified
- `wrangler.jsonc` was intentionally left unchanged
- no local verification was run because the user explicitly asked to skip it
- Cloudflare execution remains unverified until explicitly requested
