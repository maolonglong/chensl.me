# Architecture

Read this before you change how the site builds, serves, or runs scripts. It gives the mental map of the repository: the bird's-eye data flow, the entry points, the physical code map with its architectural invariants and boundaries, and the cross-cutting concerns. Decisions and their reasons live in [Agent Notes](../.agents/notes/AGENTS.md).

## Bird's-eye view

The site splits state into build-time static inputs and request-time edge databases:

- **Build-time ground state.** Markdown articles in `src/content/blog/`, the repository snapshot `src/data/github-repos.json`, and the JinKai font source in `vendor/fonts/` are the only build inputs. The build makes no network requests. Astro prerenders these inputs into static HTML, RSS, Markdown exports, PNG share cards, a Pagefind keyword index, and font subsets in `dist/client`, plus a Cloudflare Worker bundle in `dist/server`.
- **Runtime ground state.** Two Cloudflare D1 databases hold mutable state: `VOTES` for article upvotes and `NEWS` for bot-written daily AI News issues (`/news/`) and their FTS5 search index. Workers Static Assets serves every prerendered file directly; the Worker runs only on the paths listed in `assets.run_worker_first` (`/_actions/*`, `/api/*`, `/news/*`).

```text
  src/content/blog/*.md ──► content collection ──► Markdown pipeline ──► pages, RSS, exports
  src/data/github-repos.json  src/content.config.ts  src/lib/markdown.mjs  src/pages/
  vendor/fonts/ ──────────► src/lib/fonts.mjs ──► subsets + slices ────────┤
                                                                           ▼
                                                    dist/client (static) + dist/server (Worker)
                                                                           │
                   Cloudflare Workers ◄────────────────────────────────────┘
                   ├─ Static Assets + public/_headers (all prerendered routes and 404s)
                   ├─ Worker: src/worker.ts ─► /api/search (D1 NEWS FTS5) & /api/github/repos
                   ├─ Worker: src/middleware.ts + src/actions/ ─► D1 (VOTES), rate limiters, ASSETS
                   └─ Worker: src/live.config.ts + src/pages/api/news* ─► D1 (NEWS), Workers Cache
```

## Entry points

- `astro.config.mjs` wires the build: font generation, Markdown plugins, CSP hashes, the Cloudflare adapter, and the Pagefind post-build index.
- `src/worker.ts` is the Worker entry point. It intercepts `/api/search` and `/api/github/repos`, passes `/_actions/*`, `/api/news*`, and `/news/*` to the Astro handler, and attaches security headers to every Worker response.
- `src/layouts/BaseLayout.astro` is the HTML shell for every page. It derives navigation state, the share card, JSON-LD, and feed links from a single `pageKind()` switch.
- `scripts/check-site.mjs` is the build-output verifier: it inspects `dist/client` and `dist/server` after `astro build` to enforce invariants that unit tests cannot see.

## Code map

Pay attention to the **Architecture Invariant** and **Boundary** notes in each module; they state what is deliberately absent from the code.

### `src/content/blog/`, `src/content.config.ts`, `src/lib/posts.ts`, `src/lib/post-date.ts`

Articles and their local images live in `src/content/blog/`. `src/content.config.ts` defines the strict front matter schema. `src/lib/posts.ts` and `src/lib/post-date.ts` are the **Boundary** between raw collection files and the rest of the codebase.

- **Architecture Invariant:** `publishedPosts()` in `src/lib/posts.ts` and `isPublishedPost()` in `src/lib/post-date.ts` are the only readers of `src/content/blog/`. No page, feed, or build script reads collection entries without them, so drafts and future-dated posts never leak into pages, RSS, exports, or font subsets.
- **Architecture Invariant:** `displayDate()` in `src/lib/post-date.ts` formats every date in `Asia/Shanghai`, so builds in UTC and CST emit identical output.

### `src/lib/markdown.mjs`, `src/lib/reading-time.mjs`, `src/lib/markdown-images.ts`

`src/lib/markdown.mjs` holds the unified remark and rehype pipeline: GitHub alerts, repository cards from `src/data/github-repos.json`, focusable scroll wrappers for code, tables, and display math, code captions, Shiki themes, and build-time Temml MathML.

- **Architecture Invariant:** One Markdown pipeline renders every view of an article. The article page (`src/pages/blog/[...id].astro`), the RSS feed (`src/pages/index.xml.ts`, via the Astro container), and the Markdown export (`/blog/<id>/index.md`, with original images published by `src/lib/markdown-images.ts`) all read the same collection entry.

### `src/lib/og.mjs`, `src/lib/og-card.mjs`, `src/pages/og/[...card].png.ts`

`src/pages/og/[...card].png.ts` prerenders a PNG share card for each article and four fixed section cards using `@takumi-rs/core` in `src/lib/og-card.mjs` ([decision](../.agents/notes/implemented/feature/2026-10-17-build-time-share-cards.md)). `src/lib/og.mjs` is the **Boundary** imported by `src/layouts/BaseLayout.astro`.

- **Architecture Invariant:** `src/lib/og.mjs` contains only pure URL and metadata helpers (`fixedCards`, `articleCard()`, `cardPath()`). It never imports `src/lib/og-card.mjs`, `@takumi-rs/core`, `subset-font`, or Node APIs, so `src/layouts/BaseLayout.astro` can run inside the Worker for `/news/` without bundling the renderer (`scripts/check-site.mjs` fails the build if the renderer enters `dist/server`).
- **Architecture Invariant:** `src/lib/og-card.mjs` creates a fresh `Renderer` per card so subset font faces do not accumulate across renders.

### `src/actions/index.ts`, `src/middleware.ts`

`src/actions/index.ts` defines the `getVotes` and `upvote` Actions backed by D1 (`VOTES`) and two rate limiters ([decision](../.agents/notes/implemented/feature/2026-09-28-anonymous-cookie-upvotes.md)). `src/middleware.ts` guards Action requests. Schema migrations live in `migrations/`.

- **Architecture Invariant:** The Actions never import `astro:content`. `requirePost` validates an article ID with a `HEAD` request to `/blog/<id>/` through the `ASSETS` binding (`redirect: 'manual'`, status 200) ([decision](../.agents/notes/implemented/architecture/2026-09-29-validate-articles-through-built-pages.md)).
- **Architecture Invariant:** A vote write and its read-back execute in a single `env.VOTES.batch` call so the returned count always includes the caller's vote.
- **Architecture Invariant:** An early 4xx return on a POST request drains the bounded request body first so local `wrangler dev` does not drop the next request on a reused connection.

### `src/live.config.ts`, `src/lib/news.ts`, `src/lib/news-cache.ts`, `src/pages/news/`, `src/pages/api/news*`

Bot-written AI News issues live in the `NEWS` D1 database (`migrations/news/`) ([decision](../.agents/notes/implemented/feature/2026-10-16-bot-written-news-on-d1.md)). `src/pages/api/news.ts` and `src/pages/api/news/retract.ts` verify `NEWS_TOKEN`, write to `issue_versions` and `issues`, and purge Workers Cache tags via `src/lib/news-cache.ts`. `/news/` pages and `/news/index.xml` read through `src/live.config.ts`.

- **Architecture Invariant:** `src/lib/news.ts` is the **Boundary** for all news storage and validation. Issues are plain structured data, never HTML or Markdown; pages escape all text and link only `http` and `https` URLs. Every read query has a hard `LIMIT` on the `date` primary key.
- **Architecture Invariant:** `src/live.config.ts` imports `cloudflare:workers` lazily at request time so `astro sync` can load the config in Node. Because `astro:content` bundles the article content store into the Worker, `scripts/check-site.mjs` caps the bundled store at 1,200,000 bytes.

### `src/lib/search-endpoint.ts`, `src/lib/search.ts`, `src/lib/search-fuse.ts`, `src/pages/search.astro`

`/search/` merges browser-side Pagefind article hits with `/api/search` AI News hits using reciprocal rank fusion in `src/lib/search-fuse.ts` ([decision](../.agents/notes/implemented/simplification/2026-10-24-keyword-only-search.md)).

- **Architecture Invariant:** Application code never writes to the search index. Pagefind indexes static articles at build time, and SQLite triggers in `migrations/news/0004_item_search.sql` keep the item-level FTS5 table (`issue_items_fts`) synchronized inside every D1 write transaction.
- **Architecture Invariant:** Article search degrades gracefully: when `/api/search` fails, `/search/` still renders the Pagefind article results.

### `src/lib/github-endpoint.ts`, `src/components/GitHubCards.astro`, `scripts/github-repos.mjs`

`scripts/github-repos.mjs` writes `src/data/github-repos.json`. `src/components/GitHubCards.astro` refreshes card numbers from `/api/github/repos/<owner>/<repo>/`, handled by `src/lib/github-endpoint.ts` ([decision](../.agents/notes/implemented/feature/2026-10-18-github-repository-cards.md)).

- **Architecture Invariant:** The endpoint is a closed set, not an open proxy: it serves only keys present in `src/data/github-repos.json` and returns 404 for any other repository before touching the network.

### `src/components/`, `src/scripts/theme-bootstrap.js`, `src/styles/`

Each component in `src/components/` owns its scoped styles and compiled browser script. `src/styles/global.css` holds design tokens and `.prose` rules; `src/styles/floating-controls.css` holds shared floating-button transitions. `src/scripts/theme-bootstrap.js` runs inline in `<head>` before first paint (`astro.config.mjs` reads it at startup, so restart `pnpm dev` after editing it).

- **Architecture Invariant:** Pages require no JavaScript to read. When scripts do not run, the contents list opens via `<details>`, script-only buttons stay hidden, and build-time stale notices remain visible (`e2e/appearance.spec.mjs`, `e2e/page-shell.spec.mjs`).

## Cross-cutting concerns

### CSP

Two CSP policies apply independently ([decision](../.agents/notes/implemented/architecture/2026-09-28-hash-based-script-csp.md)):

- The policy from `astro.config.mjs` carries the script hashes and external script sources: a `<meta>` tag on prerendered pages and an HTTP header on `/news/` pages. Only `/search/` adds `'wasm-unsafe-eval'` for Pagefind.
- The HTTP policy in `public/_headers` carries `frame-ancestors` and static asset directives, with no `script-src`. Worker responses get non-CSP security headers from `src/lib/security-headers.mjs` (kept in sync with `public/_headers` by `tests/security-headers.test.mjs`) and `X-Frame-Options: DENY`. Both add `X-Robots-Tag: noindex` on `workers.dev` hosts.

Add any new third-party source to every policy that defines its directive, and to `scripts/check-site.mjs`.

### Fonts

`src/lib/fonts.mjs` builds two disjoint JinKai W04 subsets from source text before Astro resolves fonts ([decision](../.agents/notes/implemented/simplification/2026-10-06-subset-fonts-from-source-text.md)), plus cached `unicode-range` slices from `vendor/fonts/google-fonts-noto-sans-sc-slices.json` for runtime D1 text on `/news/` ([decision](../.agents/notes/implemented/feature/2026-10-16-jinkai-unicode-range-slices.md)).

### Delivery

Production and Workers Previews use separate D1 databases. `wrangler.jsonc` `previews` does not inherit top-level bindings, so every new binding goes in both sections. GitHub Actions (`.github/workflows/ci.yml`) runs verification only; Cloudflare Workers Builds deploys production from `main` without waiting for GitHub CI ([`csm-ship`](../.agents/skills/csm-ship/SKILL.md)).
