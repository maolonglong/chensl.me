# AGENTS.md

## Project boundaries

- Keep pages prerendered with Astro components, scoped CSS, and native browser scripts. The existing Cloudflare adapter runs upvote Actions backed by D1; add client frameworks or further server-rendered behavior only for concrete requirements.
- Prefer Astro's native capabilities and official integrations. For Astro API or configuration changes, consult Astro Docs MCP when available, otherwise the official docs; verify compatibility with the installed version. Latest documentation is not a version guarantee.
- Edit source, not `dist/`, `.astro/`, `.wrangler/`, or `node_modules/`. `public/` contains source assets.
- Preserve the author's words, emojis, dates, and credits. Keep article URLs stable; the blog's only RSS feed is `/index.xml`. Use Astro's default heading and footnote anchors.
- Pushing `main` triggers production deployment through Cloudflare's external Git integration. GitHub Actions validates changes but does not establish deployment success. Before shipping or changing deployment configuration, read [CI and deployment](README.md#ci-and-deployment). Manual deployment requires explicit authorization.
- Manage installed skills with `npx skills`, committing skill changes and `skills-lock.json` together rather than editing either by hand.

## Verification

- For site output or build changes, run `pnpm check`; it includes formatting, lint, type checking, the production build, and regression/output checks. Use `pnpm format` to apply the repository's formatting rules; article prose and third-party assets are excluded.
- For dependencies or Cloudflare configuration, also run `pnpm exec wrangler deploy --dry-run` against the freshly built output.
- For layout, styles, fonts, or browser interactions, run both `node scripts/check-browser.mjs <preview-url>` and `node scripts/check-appearance.mjs <preview-url> <screenshots-directory>`. Follow [Development](README.md#development) for preview setup.
- Inspect the appearance screenshots, including affected light/dark, narrow/wide, and open/closed states; successful capture alone is not visual verification. Add targeted checks for affected states the scripts do not exercise. Browser viewport emulation is not real-device testing.
- For tooling-only changes, run affected checks. Documentation outside site content needs command/link verification, not a site build.

## Design constraints

- Preserve the warm neutral/ink-blue palette, JinKai typography, introductory home, year-grouped archive, and single-column articles. Reuse `src/styles/global.css` tokens.
- Before changing layout, styles, fonts, or browser interactions, read [Site design contracts](README.md#site-design-contracts) for the site's accessibility, typography, and interaction requirements.
- For palette, typography, spacing, or surface treatment, consult [Kami's design reference](.agents/skills/kami/references/design.md), only Principles and the relevant sections 1–3 and 5. Site contracts take precedence; Kami's document-production workflow and template-specific rules do not apply.

## Read when needed

- Before changing CSP or the pre-paint theme script, read [CSP and theme bootstrap](README.md#csp-and-theme-bootstrap) for policy ownership, script ordering, and production-preview verification.
- Before dependency upgrades, read [Dependency upgrades](README.md#dependency-upgrades) for release-note collection and version synchronization.
- Before changing fonts or regenerating subsets, read [font licensing and regeneration](public/fonts/tsanger-jinkai02/NOTICE.md). Fonts are not covered by the repository's code license.
- Before changing content conventions or publication behavior, read [Content and maintenance](README.md#content-and-maintenance). Production excludes drafts and future posts; displayed dates use `Asia/Shanghai`.
- Before changing upvote Actions, cookies, or D1 behavior, read [Development](README.md#development) for the disposable-local-data E2E command and [CI and deployment](README.md#ci-and-deployment) for vote semantics and remote migration boundaries.
- Before changing browser verification, read both browser scripts. They explicitly set and assert hover capability and keep a CDP connection open for no-script checks; viewport width or device emulation alone does not reproduce these states.

## Commits

- Use Conventional Commits: `<type>(scope): <imperative summary>` (scope optional, at most 72 characters, no trailing period). Include a body explaining why, actual verification, and material limitations.
