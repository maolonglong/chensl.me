# AGENTS.md

## Project

- Hugo personal site deployed as Cloudflare Workers static assets through Wrangler.
- Pushing to `main` triggers production deployment through Cloudflare's Git integration, configured outside this repository. GitHub Actions only validates changes; its status does not establish deployment status. See [CI and deployment](README.md#ci-and-deployment).
- Never patch generated output in `public/`, `resources/_gen/`, `.wrangler/`, or `node_modules/`.
- Manage external skills under `.agents/skills/` with `npx skills`. Do not hand-edit installed files or `skills-lock.json`; commit skill changes and the lockfile together.

## Commands

- Install Node tooling: `pnpm install --frozen-lockfile`
- Preview: `just server`
- Production build: `just build`
- Cloudflare preview: `pnpm exec wrangler dev`
- Cloudflare dry run: `pnpm exec wrangler deploy --dry-run`
- Manual deploy only when explicitly requested: `pnpm exec wrangler deploy`

## Task-specific guidance

- Before changing layouts or CSS, read [the design guide](docs/design.md) for theme invariants, file ownership, and browser verification. Preserve the Kami typography, warm paper/charcoal palette, and framework-free site.
- Before evaluating or performing dependency upgrades, read [the upgrade guide](README.md#dependency-upgrades) for release-note collection and version synchronization.
- Before changing `build.sh`, read [the build-script guide](README.md#build-script) for safety constraints and verification.

## Verification

- Run `just check` for changes to site output (including content, layouts, CSS, links, and RSS) or build behavior. It includes the production build; do not run `just build` separately.
- For Cloudflare configuration or dependency changes, run `pnpm exec wrangler deploy --dry-run` without deploying.
- For layout or CSS changes, inspect rendered output using the design guide's browser coverage.
- For tooling-only changes, run the affected checks. Documentation-only changes outside site content need no site build; check referenced commands and links instead.

## Hugo Conventions

- Use 2-space indentation in templates and 4-space indentation in CSS.
- Use `.RelPermalink` or `relURL` for internal links. Reserve absolute URLs for canonical, RSS, and social metadata.
- Preserve semantic HTML, labels, focus states, responsive images, light/dark behavior, SEO, and RSS behavior.
- Preserve each content file's YAML or TOML front matter style. Do not rename slugs, move content, or reflow unrelated prose without a concrete reason.

## Commits

- Use Conventional Commits: `<type>(<scope>): <summary>` (imperative, <= 72 chars, no trailing period).
- **Always write a commit body** explaining the *why* (bullets welcome), not just the *what*.
