# AGENTS.md

## Priority
- User instructions override this document.
- If repo-local Cursor or Copilot rule files appear later, follow them before this file.
- Repository analysis found no `.cursorrules`, no `.cursor/rules/`, and no `.github/copilot-instructions.md`.

## Project Shape
- This repo is a Hugo personal site deployed through Cloudflare Workers static asset hosting via Wrangler.
- Source of truth lives in `content/`, `layouts/`, `assets/`, `static/`, `hugo.toml`, `wrangler.jsonc`, and `build.sh`.
- Treat `public/`, `resources/_gen/`, `.wrangler/`, and `node_modules/` as generated or tool-managed output.
- For rendering fixes, change source templates, content, config, or CSS; do not patch generated HTML in `public/`.

## Repository Map
- `content/`: pages and blog posts.
- `content/blog/*.md`: single-file posts.
- `content/blog/<slug>/index.md`: page bundles with colocated assets.
- `layouts/`: Hugo templates.
- `layouts/_partials/`: shared partials such as `seo.html`, `favicons.html`, and `post-list.html`.
- `assets/css/`: source CSS inlined by Hugo resources.
- `static/`: global static assets such as icons and the default OG image.
- `archetypes/default.md`: safest starting point for new content.
- `justfile`: primary local task entry point.
- `build.sh`: Cloudflare Linux build bootstrap, not the default local workflow.

## Core Commands
- Install tooling: `pnpm install`
- List available tasks: `just --list`
- Local preview: `just server`
- Raw preview: `hugo server -D`
- Production-style build: `just build`
- Raw build: `hugo --minify --gc`
- Clean generated site: `just clean`
- Cloudflare preview: `pnpm exec wrangler dev`
- Cloudflare deploy: `pnpm exec wrangler deploy` only when the user explicitly asks

## Verification Reality
- Normal verification in this repo is `just build` plus manual browser checks.
- The repo does not currently define lint or automated test runners.
- There is no single-test command; if asked for one, say so directly instead of inventing a test workflow.
- Do not claim lint/test success unless such tooling is added later and you actually ran it.

## Verification Playbook
- Default check after non-trivial changes: `just build`.
- Content changes: run `just server` and inspect the affected page or post.
- Layout changes: inspect the changed template type and nearby shared surfaces.
- `layouts/baseof.html`: verify home, one blog post, one section page, and the 404 page.
- `layouts/_partials/post-list.html`: verify both the home page and the blog section listing.
- CSS changes: verify desktop and narrow-width rendering manually.
- Config changes: sanity-check metadata, routing, RSS, and output behavior.

## Editing Boundaries
- Keep routine work focused on `content/`, `layouts/`, `assets/`, `static/`, `hugo.toml`, `wrangler.jsonc`, and `build.sh`.
- Keep changes narrow and local to the request.
- Do not rename slugs, move content, or normalize front matter formats without a concrete reason.
- Do not deploy unless the user explicitly requests it.
- Use Wrangler only for Cloudflare-specific tasks; prefer Hugo commands for normal site work.

## Existing Patterns Worth Preserving
- `layouts/baseof.html` inlines `assets/css/style.css` and `assets/css/syntax.css` via Hugo resources.
- `layouts/_partials/seo.html` computes defaults first, then overrides with page params.
- `layouts/page.html` renders date and tag metadata for normal posts.
- `layouts/section.html` includes a DuckDuckGo site search form and a tag list.
- `layouts/_partials/favicons.html` uses `relURL` for static asset links.
- Preserve current SEO, RSS, and accessibility behavior unless the task explicitly changes one of them.

## Template Style
- Use 2-space indentation in Hugo `.html` templates.
- Follow the existing structure used in `layouts/baseof.html`, `layouts/home.html`, `layouts/page.html`, `layouts/section.html`, `layouts/taxonomy.html`, and `layouts/term.html`.
- Prefer partials for repeated markup.
- Pass multiple values to partials with `dict` rather than relying on ambient context.
- Keep partial APIs small and single-purpose.
- Prefer semantic HTML and preserve accessibility affordances such as skip links, labels, focus states, and `time` elements.

## Hugo Template Conventions
- Prefer Hugo helpers such as `with`, `default`, `cond`, `where`, `range`, `merge`, and `dict` over copy/paste logic.
- Guard optional values before reading them.
- Prefer `.RelPermalink` or `relURL` for internal links.
- Use `.Permalink` or `absURL` only for canonical URLs or social metadata that require absolute URLs.
- Use whitespace trimming only when it clearly improves output.
- Avoid clever pipelines when a couple of assignments are easier to read.

## CSS Style
- Use 4-space indentation in `assets/css/*.css`.
- Extend the existing plain CSS approach; do not add a CSS framework for small work.
- Prefer adjusting existing custom properties in `:root` for site-wide theme changes.
- Keep selectors simple and low-specificity.
- Prefer reusable class selectors over long element chains.
- Preserve responsive images, readable contrast, `:focus-visible`, and current light/dark behavior unless the task targets them directly.

## Content And Front Matter
- Preserve the front matter style already used by the file you edit.
- This repo uses both YAML (`---`) and TOML (`+++`) front matter; keep the existing format of each file.
- For new content, start from `archetypes/default.md` unless you are intentionally matching a nearby bundle-style post.
- Use `index.md` for posts that own local assets.
- Keep values typed: booleans as booleans, arrays as arrays, timestamps as timestamps.
- Common fields are `title`, `date`, `draft`, `tags`, `description`.
- Keep `description` concise because it feeds SEO metadata.
- Use fenced code blocks with an explicit language when possible.
- Do not reflow unrelated prose just for formatting.

## Naming Conventions
- Use lowercase, hyphenated slugs for new content files and folders.
- Keep tag spellings consistent; lowercase is preferred.
- Use descriptive partial names based on responsibility.
- Keep CSS class names short, literal, and purpose-driven.

## Dependencies, Imports, And Reuse
- There is no application-layer JS/TS import structure to preserve today.
- Reuse existing partials and helper patterns before creating new abstractions.
- Solve small needs with Hugo templates, HTML, and CSS before adding npm dependencies.
- If scripting is necessary, prefer a small plain-JS solution.
- Document any new runtime or build dependency you introduce.

## Types, Config, And Error Handling
- Prefer native types in front matter and config over stringly typed values.
- Keep arrays and booleans as actual arrays and booleans in YAML, TOML, and JSONC.
- When editing `hugo.toml` or `wrangler.jsonc`, match the existing structure and formatting style.
- In templates, prefer omission plus sensible defaults over broken markup.
- Do not assume optional front matter exists.
- In shell scripts, preserve `set -euo pipefail`, quoted variables, and small helper functions.
- Fail loudly on real build issues instead of hiding them.
- Avoid changing Cloudflare routing, auth, or build behavior unless the task requires it.

## Agent Defaults
- Need a preview? Use `just server`.
- Need a build check? Use `just build`.
- Need a single-test command? State that automated tests are not configured here.
- Need to create a new post? Start from `archetypes/default.md` and keep the slug lowercase-hyphenated.
- Need Cloudflare validation? Use Wrangler only when the task is specifically about deployment or asset serving behavior.
