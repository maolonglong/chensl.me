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

- Before evaluating or performing dependency upgrades, read [the upgrade guide](README.md#dependency-upgrades) for release-note collection and version synchronization.
- Before changing `build.sh`, read [the build-script guide](README.md#build-script) for safety constraints and verification.

## Site design implementation

- Keep the framework-free personal-site structure: introductory home, year-grouped archive, single-column articles, and shared 404. Preserve the author's words, emojis, dates, and credits.
- `assets/css/style.css` owns semantic tokens, typography, and components; `assets/css/syntax.css` owns syntax colors. Reuse these variables rather than adding a parallel palette. Header, main, and footer share the one `42rem` column so every page hangs from the same left edge, and the shell fills the viewport height so short pages keep the footer at the bottom. `scripts/check-browser.mjs` enforces both.
- `layouts/baseof.html` owns the shell and font loading; `layouts/page.html` and `layouts/_partials/post-list.html` own article chrome and archive rows. Preserve the collapsed native TOC threshold of three H2/H3 headings and its depth configuration in `hugo.toml`.
- `layouts/_partials/theme.html` owns theme bootstrap and switching. Preserve `auto` → `light` → `dark`, OS tracking in auto, forced `color-scheme`, persistence, storage-failure handling, accessible labels, and the no-JavaScript fallback. Keep the SVG icons and 44px target, not font glyphs or an icon library.
- Keep this site's alerts and syntax within the warm neutral/ink-blue palette. Diff signs carry addition/deletion meaning. Preserve underlined article/footer links, archive visited-link styling, and visible focus.
- `assets/css/serif.css` and `data/serif.json` own JinKai declarations; `assets/css/fonts.css` owns the code fonts. Keep JinKai first for mixed Chinese/Latin text, W04 alone on the web declared for 400–500 (no W05 file, no synthesized bold), self-hosted fonts, `font-display: swap`, fingerprinted CSS, content-versioned font URLs, and code fonts loaded only where needed. Do not add font CDNs or preloads.
- Preserve complete fallback font coverage and core-subset precedence. Follow [font licensing and regeneration](static/fonts/tsanger-jinkai02/NOTICE.md) when changing fonts or regenerating with `scripts/subset-fonts.py`. The fonts are not covered by the repository's code license. The cold-visit font budget is 640 KiB.
- Markdown media belongs to `layouts/_partials/markdown-image.html`, shared by the page and RSS image hooks. Preserve alt text, dimensions, lazy loading, and absolute RSS image URLs.
- Keep every heading level at or above the `1.125rem` article body size; a heading that matches body text is not a heading. Space carries the rest of the hierarchy: a wide margin above, a narrow one below.
- `layouts/_markup/render-table.html` owns tables. Keep the focusable `.table-scroll` wrapper and its column alignment. Do not make the `<table>` itself the scroll box; that costs the table its role in the accessibility tree.
- `layouts/_markup/render-codeblock.html` owns code blocks. A fence title must use Hugo's brace syntax, ```` ```go {title="db/user.go"} ````; a bare `title="..."` is dropped silently. Keep the caption and keep `title` off the `.highlight` wrapper so the block gains no tooltip.

## Verification

- Run `just check` for changes to site output (including content, layouts, CSS, links, and RSS) or build behavior. It includes the production build; do not run `just build` separately.
- For Cloudflare configuration or dependency changes, run `pnpm exec wrangler deploy --dry-run` without deploying.
- For layout or CSS changes, use the browser coverage below.
- For tooling-only changes, run the affected checks. Documentation-only changes outside site content need no site build; check referenced commands and links instead.

### Browser coverage

- With the preview running, run `node scripts/check-browser.mjs <preview-url>` (requires `agent-browser`, verified with 0.38.1; its commands and `--json` shape are version-specific). It checks actual font loading, then header bounds, column alignment, footer placement, and page overflow on home, archive, a long article, and 404 at 320, 390, 768, and 1280px with 100% and 200% text sizes.
- Inspect light/dark screenshots at 1280px and 390px on home, archive, a long article with code and TOC, and 404. For affected tables and navigation, also inspect 320px, 768px, and both sides of the 480px and 600px breakpoints.
- Capture at 2× after `document.fonts.ready`; confirm the actual CJK font, not only its CSS declaration. Check affected TOC open/closed states, long titles, tables, quotes, code scrolling, focus, theme cycling/persistence, forced theme opposite the OS, and OS changes in auto mode. Ensure no page-level overflow. Chromium resizing is not real phone testing.

## Hugo Conventions

- Use 2-space indentation in templates and 4-space indentation in CSS.
- Use `.RelPermalink` or `relURL` for internal links. Reserve absolute URLs for canonical, RSS, and social metadata.
- Preserve semantic HTML, labels, focus states, responsive images, light/dark behavior, SEO, and RSS behavior.
- Preserve each content file's YAML or TOML front matter style. Do not rename slugs, move content, or reflow unrelated prose without a concrete reason.

## Commits

- Use Conventional Commits: `<type>(<scope>): <summary>` (imperative, <= 72 chars, no trailing period).
- **Always write a commit body** explaining the *why* (bullets welcome), not just the *what*.
