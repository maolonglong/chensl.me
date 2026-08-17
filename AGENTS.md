# AGENTS.md

## Project

- Hugo personal site deployed as Cloudflare Workers static assets through Wrangler.
- Never patch generated output in `public/`, `resources/_gen/`, `.wrangler/`, or `node_modules/`.

## Commands

- Install Node tooling: `corepack pnpm install --frozen-lockfile`
- Preview: `just server`
- Production build: `just build`
- Cloudflare preview: `corepack pnpm exec wrangler dev`
- Cloudflare dry run: `corepack pnpm exec wrangler deploy --dry-run`
- Deploy only when explicitly requested: `corepack pnpm exec wrangler deploy`
- Before evaluating or performing an upgrade from a GitHub-released dependency, use `node scripts/fetch-release-notes.mjs --repo OWNER/REPO --from TAG --to latest --output PATH` to collect the intervening stable release notes. Add `--include-prereleases` only when prerelease compatibility is in scope.

## Build & Verification

- Local builds use the Hugo executable already available on `PATH`.
- Cloudflare invokes `build.sh`; CI downloads the pinned Hugo release into a temporary directory and verifies its SHA-256 checksum before building.
- When upgrading Hugo, update `mise.toml`, `mise.lock`, and the version plus every platform checksum in `build.sh` together, then verify both `./build.sh` and `CI=true ./build.sh`.
- When upgrading Node.js, update `mise.toml`, `mise.lock`, and the CI `node-version` together.
- Preserve `set -euo pipefail`, quoted paths, temporary-directory cleanup, and checksum verification in shell changes.
- Run `just check` when layouts, content rendering, internal links, RSS, or build behavior changes; it includes the production build. For other non-trivial changes, run `just build`.
- For `build.sh` changes, also run `bash -n build.sh`, `shellcheck build.sh`, `./build.sh`, and `CI=true ./build.sh`.
- For Cloudflare configuration or dependency changes, run `corepack pnpm exec wrangler deploy --dry-run` without deploying.
- For layout or CSS changes, inspect desktop and narrow-width output in a browser. Changes to shared layouts must cover home, blog section, one post, and the 404 page (both light and dark).

## Hugo Conventions

- Use 2-space indentation in templates and 4-space indentation in CSS.
- Use `.RelPermalink` or `relURL` for internal links. Reserve absolute URLs for canonical, RSS, and social metadata.
- Preserve semantic HTML, labels, focus states, responsive images, light/dark behavior, SEO, and RSS behavior.
- Preserve each content file's YAML or TOML front matter style. Do not rename slugs, move content, or reflow unrelated prose without a concrete reason.

## Theme Invariants

Before changing layouts or CSS, read [`docs/design.md`](docs/design.md). The rules below are hard stops.

- Bear-inspired shell: single column (~`42rem`), system fonts, minimal chrome, no client framework.
- Palette is Catppuccin **Latte** (light) / **Mocha** (dark) via CSS variables on `:root`. Prefer tokens over one-off hex. Links = Blue, marks = Yellow wash, code surfaces = Surface/Mantle — see `docs/design.md`.
- Theme modes: `auto` | `light` | `dark`. Auto leaves `data-theme` unset; keep `color-scheme` synced so `light-dark()` syntax CSS follows the active theme.
- Chrome CSS in `assets/css/style.css`; Chroma in `assets/css/syntax.css`. Do not inline large style blocks into layouts.
- Post TOC: collapsed `<details>`, only when ≥ 3 `h2`/`h3`. Post lists group by publish year (`MM-DD` dates).

## Commits

- Use Conventional Commits: `<type>(<scope>): <summary>` — imperative, <= 72 chars, no trailing period.
- **Always write a commit body** explaining the *why* (bullets welcome), not just the *what*.
