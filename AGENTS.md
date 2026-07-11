# AGENTS.md

## Project

- Hugo personal site deployed as Cloudflare Workers static assets through Wrangler.
- Edit source in `content/`, `layouts/`, `assets/`, `static/`, `hugo.toml`, `wrangler.jsonc`, and `build.sh`.
- Never patch generated output in `public/`, `resources/_gen/`, `.wrangler/`, or `node_modules/`.

## Commands

- Install Node tooling: `corepack pnpm install --frozen-lockfile`
- Preview: `just server`
- Production build: `just build`
- Cloudflare preview: `corepack pnpm exec wrangler dev`
- Cloudflare dry run: `corepack pnpm exec wrangler deploy --dry-run`
- Deploy only when explicitly requested: `corepack pnpm exec wrangler deploy`

## Build Contract

- Local builds use the Hugo executable already available on `PATH`.
- Cloudflare invokes `build.sh`; CI downloads the pinned Hugo release into a temporary directory and verifies its SHA-256 checksum before building.
- When upgrading Hugo, update the version and every platform checksum in `build.sh` together, then verify both `./build.sh` and `CI=true ./build.sh`.
- Preserve `set -euo pipefail`, quoted paths, temporary-directory cleanup, and checksum verification in shell changes.

## Verification

- Run `just build` after non-trivial changes.
- For `build.sh` changes, also run `bash -n build.sh`, `shellcheck build.sh`, `./build.sh`, and `CI=true ./build.sh`.
- For Cloudflare configuration or dependency changes, run `corepack pnpm exec wrangler deploy --dry-run` without deploying.
- For layout or CSS changes, inspect desktop and narrow-width output in a browser. Changes to shared layouts must cover home, blog section, one post, and the 404 page.
- No project-owned automated test suite is configured.

## Hugo Conventions

- Use 2-space indentation in templates and 4-space indentation in CSS.
- Use `.RelPermalink` or `relURL` for internal links. Reserve absolute URLs for canonical, RSS, and social metadata.
- Preserve semantic HTML, labels, focus states, responsive images, light/dark behavior, SEO, and RSS behavior.
- Preserve each content file's YAML or TOML front matter style. Do not rename slugs, move content, or reflow unrelated prose without a concrete reason.
