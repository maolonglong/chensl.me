# chensl.me

Personal site, built with Hugo from scratch (no theme) and served as static assets by a Cloudflare Worker. Visual design follows Bear Blog's default theme.

## Approval

A push to `main` deploys production via Cloudflare Workers Builds. Ask before pushing to `main` or changing Cloudflare settings (`wrangler.jsonc`, `static/_headers`).

## Hard rules

- Static HTML and inline CSS only, with zero client-side JavaScript (`scripts/check-output.sh` rejects `<script` in HTML, XML, and SVG output).
- Chronological archives only, without taxonomies (`disableKinds = ['taxonomy', 'term']` in `hugo.toml`).

## Commands

Hugo is pinned in `mise.toml`; always run Hugo via `mise`:

- `mise run dev`: local preview with drafts.
- `mise run build`: production build into `public/`.
- `mise run check`: build `tests/fixtures/content` into `tmp/check/public`, verify layout/security invariants, and write `tmp/check/report.txt`. Run after every template, CSS, script, or config change.

## Templates & CSS

- `layouts/baseof.html` wraps every page; standalone `content/<name>.md` pages have no date and stay out of RSS.
- Two feeds exist, both bounded by `[services.rss] limit`: `layouts/home.rss.xml` (`/index.xml`, full-text blog posts only) and `layouts/news/section.rss.xml` (`/news/index.xml`, AI News issues). Hugo rewrites RSS URLs to absolute URLs.
- `layouts/_partials/resolve-destination.html` validates Markdown link and image targets; `--panicOnWarning` turns unresolved internal links into build failures.
- `assets/css/main.css` is the sole stylesheet, inlined into `<style>` by `css.Build`. It sets `font-synthesis-style: none` on `html` so genuine Latin italic fonts (`<em>`/`<i>`) work while CJK glyphs stay upright, and styles Chroma classes directly (`noClasses = false`).

## AI News

A bot commits `data/news/<YYYY-MM-DD>.json` to `main`, triggering deploy. `content/news/_content.gotmpl` validates every issue (plain text summary/items, `http`/`https` URLs with hostnames) and fails the build on invalid input so the previous deploy stays live. Retract an issue by deleting its JSON file.

## Deployment

`build.sh` downloads the Hugo binary pinned in `mise.toml` for Workers Builds, then runs `scripts/check.sh`, `hugo build --panicOnWarning`, and `scripts/check-output.sh public`.

- `wrangler.jsonc`: `workers_dev` is `false` so only `chensl.me` serves production; keep `preview_urls: true` and the empty `"previews": {}` block so branch previews (`npx wrangler preview`) work.
- `static/_headers`: keep HSTS apex-only (never add `includeSubDomains` — the zone has DNS-only HTTP subdomains such as `la` and `la9`). Cloudflare `_headers` binds headers only to the single preceding URL pattern and accepts at most one `*` splat per pattern, so give each cached extension its own block (`Cache-Control: public, max-age=604800`, never `immutable` on unfingerprinted paths).

## Writing content

- Text-only post: `content/blog/<slug>.md`; post with local images: page bundle `content/blog/<slug>/index.md` alongside its images (prefers `.webp`).
- Link between posts with URL-relative paths (`../other-post/`) or site-root paths (`/blog/other-post/`).
- Standalone images on their own line render as `<figure>`, with optional `"caption"` text rendered in `<figcaption>`.
- Emphasis next to CJK punctuation needs escaped spaces (`一段\ **“强调”**\ 文字`).
