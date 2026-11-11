# chensl.me

Personal site, built with Hugo from scratch (no theme), served as static assets by a Cloudflare Worker. Visual design follows Bear Blog's default theme.

## Approval

A push to `main` deploys production through Cloudflare Workers Builds. Ask before every push to `main` and every Cloudflare change.

## Hard rules

- No JavaScript in generated pages. `mise run check` fails on any `<script`.
- No tags or categories: `disableKinds = ['taxonomy', 'term']`. Do not add taxonomies.
- No italic styling: CJK fonts have no italic glyphs.

## Commands

Hugo is pinned in `mise.toml`. Always run Hugo through mise.

- `mise run dev`: local preview with drafts.
- `mise run build`: production build into `public/`.
- `mise run check`: build `tests/fixtures/content` into `tmp/check/public` and assert on the output. Report: `tmp/check/report.txt`. Run it after every template, CSS, or config change.

## Layout

- `layouts/baseof.html`: shared page shell. `home.html`: home page. `section.html`: `/blog/` and `/news/` lists (each with an `<h1>`). `blog/page.html`: posts (with date). `page.html`: standalone pages such as `/now/` (no date, not in RSS).
- `layouts/_partials/head.html`: meta, canonical, icons, manifest, light/dark `theme-color`, default `og:image` (`/android-chrome-512x512.png`), and RSS discovery. News pages use `Params.summary` (or `newsDescription` on the section) for description; news alternate titles use `newsTitle`.
- `layouts/home.rss.xml`: the only article feed (`/index.xml`). It contains blog posts only, with full content. Hugo makes RSS URLs absolute automatically. `layouts/robots.txt` advertises `/sitemap.xml`.
- `layouts/_partials/resolve-destination.html`: resolves Markdown link and image destinations for the render hooks. An unresolved internal destination logs a warning, and `--panicOnWarning` turns it into a build failure.
- `layouts/_markup/render-image.html`: local processable images get `width`/`height`, responsive `srcset`/`sizes` (WebP widths), and the first image gets `loading=eager` plus `fetchpriority=high`.
- `assets/css/main.css`: the only stylesheet. It is inlined into `<style>` by `css.Build`. Colors use `light-dark()` under `color-scheme: light dark`. Syntax highlighting uses Chroma classes (`markup.highlight.noClasses = false`) with colors from CSS variables. There is no Chroma stylesheet.
- `static/_headers`: security headers (HSTS is apex-only: zone has DNS-only HTTP subdomains such as `la` / `la9`); image/icon/manifest responses get a long `Cache-Control`. HTML stays on the Workers default revalidate.

## AI News

A bot commits `data/news/<YYYY-MM-DD>.json` to `main`; each commit deploys. `content/news/_content.gotmpl` validates every issue and builds `/news/<date>/`; an invalid issue fails the build, and the previous deployment stays live. Issue text is plain text. `/news/index.xml` is the news feed; `/index.xml` holds articles only. Retract an issue by deleting its file.

## Deployment

`build.sh` is the Workers Builds build command: it downloads the Hugo version from `mise.toml`. `wrangler.jsonc` serves `public/` as static assets and keeps an empty `previews` block so branch Preview deploys (`npx wrangler preview`) work; `static/_headers` sets the security headers.

## Writing content

- Post: `content/blog/<slug>/index.md`, with images in the same directory. The directory name is the URL slug.
- Standalone page: `content/<name>.md`. Add it to `[[menus.main]]` in `hugo.toml` to show it in the nav.
- Home recent-post list: `{{< recent-posts 5 >}}`.
- Link to other posts with URL-relative paths (`../other-post/`) or site paths (`/blog/other-post/`).
- An image on its own line with a title becomes `<figure>` with `<figcaption>`: `![alt](photo.jpg "caption")`.
- Emphasis next to CJK punctuation needs escaped spaces: `一段\ **“强调”**\ 文字`.
