# AGENTS.md

## Project boundaries

- Keep this personal site statically rendered with Astro components, scoped CSS, and native browser scripts. Add a client framework or server adapter only when a concrete requirement needs it.
- Prefer Astro's native capabilities and official integrations, checking documentation for the installed version before choosing an approach. Limit custom code to concrete site requirements those capabilities do not cover.
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

- Preserve the Kami-inspired warm neutral/ink-blue palette, JinKai typography, introductory home, year-grouped archive, and single-column articles. Header, main, and footer share the same `42rem` column; short pages keep the footer at the bottom. Reuse the design tokens in `src/styles/global.css`.
- Keep headings at least as large as the article body. At equal sizes, distinguish headings through weight, color, and spacing: more space above than below. Preserve underlined article/footer links, archive visited-link styling, visible focus, and meaningful diff signs.
- Keep the single prerendered contents list: a hover rail beside the column and a native popover elsewhere, available without JavaScript when there are at least three H2/H3 headings. Keep SVG controls and 44px touch targets.
- Preserve theme cycling `auto` → `light` → `dark`, OS tracking in auto, forced `color-scheme`, persistence, storage-failure handling, accessible labels, and no-script fallback. The pre-paint bootstrap stays inline; component interactions use compiled scripts.
- Keep JinKai first for mixed Chinese/Latin text, W04 alone at weights 400–500, and synthesized bold disabled. Fonts remain self-hosted with `font-display: swap`, content-versioned URLs, no preloads, complete fallback coverage, and core-subset precedence. Declare code fonts for all pages; let the browser load them only when used. The cold-visit font budget is 640 KiB.
- Pages and RSS share Astro-rendered collection content and optimized local images. Preserve alt text, dimensions, lazy loading, and absolute RSS resource URLs; avoid a separate feed Markdown parser.
- Keep tables inside focusable `.table-scroll` wrappers, with column alignment preserved. Making the table itself the scroll box loses its accessibility role. Preserve code-fence captions without a `title` attribute on the code wrapper, which would add a tooltip.

## Read when needed

- Before changing CSP or the pre-paint theme script, read [CSP and theme bootstrap](README.md#csp-and-theme-bootstrap) for policy ownership, script ordering, and production-preview verification.
- Before dependency upgrades, read [Dependency upgrades](README.md#dependency-upgrades) for release-note collection and version synchronization.
- Before changing fonts or regenerating subsets, read [font licensing and regeneration](public/fonts/tsanger-jinkai02/NOTICE.md). Fonts are not covered by the repository's code license.
- Before changing content conventions or publication behavior, read [Content and maintenance](README.md#content-and-maintenance). Production excludes drafts and future posts; displayed dates use `Asia/Shanghai`.
- Before changing browser verification, read both browser scripts. They explicitly set and assert hover capability and keep a CDP connection open for no-script checks; viewport width or device emulation alone does not reproduce these states.

## Commits

- Use Conventional Commits: `<type>(scope): <imperative summary>` (scope optional, at most 72 characters, no trailing period). Include a body explaining why, actual verification, and material limitations.
