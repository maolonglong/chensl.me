# Architecture

Read this before you change how the site builds, serves, or runs scripts. It is a map: each section names the files that own the details. Decisions and their reasons are in [Agent Notes](../.agents/notes/AGENTS.md).

## Principles

- Pages are prerendered Astro components with scoped CSS and native browser scripts. The Worker runs one feature: the upvote Actions. Add a client framework or more server-rendered behavior only for a concrete requirement.
- Keep pages light. Use a native HTML or CSS feature, such as a popover, before a script; keep each script small and owned by its component. Pages need not work without JavaScript.
- Use Astro's native features and official integrations first. For an Astro API or configuration change, read the Astro docs (the Astro Docs MCP when available) and confirm that the installed version supports it.
- One Markdown pipeline renders every view of an article: the page, the RSS item, and the Markdown export metadata come from the same collection entry.
- Scripts run only through Astro CSP hashes ([decision](../.agents/notes/implemented/2026-09-28-hash-based-script-csp.md)).
- Build output is generated. Edit the source: `src/`, `public/`, the config files, and `vendor/`.

## Map

```text
  src/content/blog/*.md ──► content collection ──► Markdown pipeline ──► pages, RSS, exports
  (articles, images)        src/content.config.ts   src/lib/markdown.mjs   src/pages/
                            src/lib/posts.ts                                     │
  vendor/fonts/ + src/ ──► src/lib/fonts.mjs ──► JinKai subsets ─────────────────┤
                                                                                 ▼
                                                          dist/client (static) + dist/server (Worker)
                                                                                 │
                         Cloudflare Workers ◄────────────────────────────────────┘
                         ├─ static assets, with public/_headers
                         └─ Worker: src/middleware.ts + src/actions/ ──► D1 (VOTES), rate limiters
                                                     └── ASSETS binding: is this a built article page?
  browser: theme bootstrap (inline, hashed) + compiled component scripts + giscus iframe
```

## Build

`astro.config.mjs` wires the build. `output: 'static'` prerenders every page; the Cloudflare adapter prerenders in Node and optimizes images at build time.

- **Content.** `src/content.config.ts` holds the front matter schema. `publishedPosts()` in `src/lib/posts.ts` is the only filter for drafts and future posts; pages, RSS, exports, and the archive call it. It also stops the build when an entry failed to render.
- **Markdown.** `src/lib/markdown.mjs` adds alerts, scroll wrappers for code, tables, and display math, code captions, and the Shiki code themes. Temml renders TeX to MathML at build time.
- **Routes.** `src/pages/` holds the home, the archive, article pages, the Markdown exports (`/blog/<id>/index.md`), `/index.xml`, `/llms.txt`, and the giscus theme stylesheets (`src/pages/css/`, built from `src/styles/giscus*.css` by `src/lib/assets.ts`). `src/lib/markdown-images.ts` publishes the original article images next to the exports.
- **RSS.** `src/pages/index.xml.ts` renders each entry through the Astro container, so feed items use the same HTML and optimized images as pages, then makes every URL absolute.
- **Fonts.** `src/lib/fonts.mjs` builds JinKai subsets from the source text before Astro resolves fonts ([decision](../.agents/notes/implemented/2026-10-06-subset-fonts-from-source-text.md)). Font licensing is in [NOTICE.md](../public/fonts/tsanger-jinkai02/NOTICE.md).

## Runtime

`wrangler.jsonc` defines the Worker, its bindings, and the static assets in `dist/client`.

- **Static assets.** Workers Static Assets serves the prerendered files. `public/_headers` sets the response headers: the HTTP CSP, cache rules, and the text charsets that production does not add.
- **Actions.** `src/actions/index.ts` defines `getVotes` and `upvote`. `src/middleware.ts` rejects cross-origin Action requests and makes Action responses private. The Actions use D1 (`VOTES`), two rate limiters, and the `ASSETS` binding to confirm that an ID is a published article ([decision](../.agents/notes/implemented/2026-09-29-validate-articles-through-built-pages.md)). Schema changes are files in `migrations/`.
- **Bindings.** Production and Workers Previews use separate D1 databases.

## Browser

- `src/scripts/theme-bootstrap.js` runs inline in `<head>` before the first paint. `astro.config.mjs` reads it at startup, so restart the dev server after you edit it.
- Each component in `src/components/` owns its compiled script and scoped styles. `src/styles/global.css` holds the design tokens and the Markdown typography.
- Comments are a giscus iframe that `src/components/Comments.astro` loads.

## CSP

Two policies apply independently ([decision](../.agents/notes/implemented/2026-09-28-hash-based-script-csp.md)):

- The meta policy from `astro.config.mjs` carries the script hashes.
- The HTTP policy in `public/_headers` carries `frame-ancestors` and the other response protections.

Allow a third-party source in both policies and in `scripts/check-site.mjs`.

## Delivery

GitHub Actions (`.github/workflows/ci.yml`) runs the checks on pushes and pull requests and publishes nothing. Cloudflare Workers Builds builds and deploys production when `main` changes; the Cloudflare dashboard owns that configuration and the deployment records. Cloudflare does not wait for GitHub CI. The [`ship`](../.agents/skills/ship/SKILL.md) skill holds the release procedure.
