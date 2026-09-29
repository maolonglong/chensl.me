# AGENTS.md

## Project boundaries

- Keep agent instructions in `AGENTS.md`. README is the human entry point; `docs/` holds public documentation, including shared design contracts and maintenance workflows. Link to source or shared technical references for facts rather than duplicating them as agent rules.
- Keep pages prerendered with Astro components, scoped CSS, and native browser scripts. The existing Cloudflare adapter runs upvote Actions backed by D1; add client frameworks or further server-rendered behavior only for concrete requirements.
- Prefer Astro's native capabilities and official integrations. For Astro API or configuration changes, consult Astro Docs MCP when available, otherwise the official docs; verify compatibility with the installed version. Latest documentation is not a version guarantee.
- Edit source, not `dist/`, `.astro/`, `.wrangler/`, or `node_modules/`. `public/` contains source assets.
- Preserve the author's words, emojis, dates, and credits. Keep article URLs stable; the blog's only RSS feed is `/index.xml`. Use Astro's default heading and footnote anchors.
- Pushing `main` triggers production deployment through Cloudflare's external Git integration. Before shipping or changing deployment configuration, read [Shipping and deployment](docs/maintenance.md#shipping-and-deployment).
- Local builds, previews, local D1 migrations, `wrangler deploy --dry-run`, and E2E checks against disposable local data need no approval. Remote D1 migrations, Cloudflare resource or dashboard changes, manual deployment, and pushing `main` need explicit authorization.
- Manage installed skills with `npx skills`, committing skill changes and `skills-lock.json` together rather than editing either by hand.

## Verification

- For site output or build changes, run `pnpm check`; it includes formatting, lint, type checking, the production build, and regression/output checks. Use `pnpm format` to apply the repository's formatting rules; article prose and third-party assets are excluded.
- For dependencies or Cloudflare configuration, also run `pnpm exec wrangler deploy --dry-run` against the freshly built output.
- For layout, styles, fonts, or browser interactions, run `pnpm test:e2e`. Follow [Preview and browser verification](docs/maintenance.md#preview-and-browser-verification) for the preview it uses.
- Inspect the screenshots in `test-results/screenshots`, including affected light/dark, narrow/wide, and open/closed states; successful capture alone is not visual verification. Add targeted checks for affected states the specs do not exercise. Browser viewport emulation is not real-device testing.
- For tooling-only changes, run affected checks. Documentation outside site content needs command/link verification, not a site build.

## Design constraints

- Preserve the warm neutral/ink-blue palette, JinKai typography, introductory home, year-grouped archive, and single-column articles. Reuse `src/styles/global.css` tokens.
- Before changing layout, styles, fonts, or browser interactions, read [Site design contracts](docs/design.md) for the site's accessibility, typography, interaction requirements, and scoped Kami reference.

## Read when needed

- Before changing CSP or the pre-paint theme script, read [CSP and theme bootstrap](docs/maintenance.md#csp-and-theme-bootstrap) for policy ownership, script ordering, and production-preview verification.
- Before dependency upgrades, read [Dependency upgrades](docs/maintenance.md#dependency-upgrades) for release-note collection and version synchronization.
- Before changing fonts or regenerating subsets, read [font licensing and regeneration](public/fonts/tsanger-jinkai02/NOTICE.md). Fonts are not covered by the repository's code license.
- Before changing content conventions, publication behavior, or RSS, read [Content and RSS](docs/maintenance.md#content-and-rss).
- Before changing upvote Actions, cookies, or D1 behavior, read [Upvotes and D1](docs/maintenance.md#upvotes-and-d1) for vote semantics, disposable-local-data E2E checks, and remote migration boundaries.
- Before changing browser verification, read [Preview and browser verification](docs/maintenance.md#preview-and-browser-verification), `playwright.config.mjs`, and `e2e/site.mjs`.

## Commits

- Use Conventional Commits: `<type>(scope): <imperative summary>` (scope optional, at most 72 characters, no trailing period). Include a body explaining why, actual verification, and material limitations.
