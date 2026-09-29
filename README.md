# chensl.me

Source for [chensl.me](https://chensl.me), a personal site and technical blog built with Astro and deployed to Cloudflare Workers. Pages are prerendered static assets; the official Cloudflare adapter runs the upvote Actions. There is no client UI framework.

## Setup

Use Node.js 26 and the pnpm version pinned in `package.json` (Astro requires Node.js 22.12 or later):

```sh
pnpm install --frozen-lockfile
pnpm cf:types
pnpm exec wrangler d1 migrations apply VOTES --local
```

Python 3 is used by the site checks for XML validation; these checks use only the Python standard library.

## Development

```sh
pnpm dev    # local preview, including drafts
pnpm build  # production build
pnpm check  # formatting, lint, type check, build, regression tests, output validation
```

Tests use disposable Astro fixture builds. TypeScript stays on 6.x because the current `astro check` does not support TypeScript 7.

In Amp orbs, `amp orb services ensure` starts the managed dev preview and prints its portal URL.

`pnpm cf:types` regenerates binding types from Wrangler configuration. Runtime types are imported selectively in `src/env.d.ts` to avoid collisions between Workers' HTMLRewriter `Element` and the browser DOM. Pre-rendering uses Node and build-time image optimization, preserving the existing filesystem-based CSS assets and RSS pipeline. Sessions are disabled; no KV or Cloudflare Images resource is required.

Use `pnpm format` to format maintained code with Prettier and its Astro plugin, and `pnpm lint` for Oxlint. Formatting excludes article content, fonts, third-party code, and generated output. Components own scoped styles and compiled TypeScript interactions; global CSS owns design tokens, Markdown typography, and shared floating-control geometry. Only the pre-paint theme bootstrap stays inline. Oxlint checks scripts, not Astro template semantics; `astro check` and browser coverage remain required.

`public/` contains unprocessed public assets; `dist/` is disposable output. Do not put source files in `dist/`. Run `node scripts/check-browser.mjs <preview-url>` against the preview for browser regression coverage.

Run `node scripts/check-appearance.mjs <preview-url> <screenshots-directory>` for theme, storage-failure, and no-script checks plus 2× screenshots of pages, breakpoints, and contents states. Inspect the screenshots separately; capture alone is not visual verification. Both browser scripts require `agent-browser`.

Run `node scripts/check-upvotes.mjs http://localhost:8787` against a production build served by `pnpm exec wrangler dev --port 8787`. It uses real Actions and disposable local D1 data; setup and coverage are in [Upvotes and D1](docs/maintenance.md#upvotes-and-d1). Static output is in `dist/client`; the generated Worker configuration is in `dist/server` and Wrangler follows `.wrangler/deploy/config.json`.

After running `pnpm check`, validate Cloudflare configuration with a deployment dry run. Wrangler consumes the existing `dist/`; it does not rebuild or run tests:

```sh
pnpm exec wrangler deploy --dry-run
```

Manual deployment to production:

```sh
pnpm deploy
```

### CSP and theme bootstrap

Astro emits a hash-based script CSP in each page and Cloudflare's `_headers` adds the remaining restrictions; both policies apply. Verify against a production build served by Wrangler, not `astro dev`. Ordering rules and script hashing are in [CSP and theme bootstrap](docs/maintenance.md#csp-and-theme-bootstrap).

## CI and deployment

- GitHub Actions runs on pushes and pull requests. [The CI workflow](.github/workflows/ci.yml) installs Node.js dependencies, runs `pnpm check`, then `wrangler deploy --dry-run`. It does not publish the site.
- Cloudflare's Git integration automatically builds and deploys the production site when `main` is pushed. This integration is configured in the Cloudflare dashboard, outside the GitHub workflow. The dashboard is the source of truth for deployment settings and build/deployment records.

Following [Astro's Cloudflare deployment guide](https://docs.astro.build/en/guides/deploy/cloudflare/), configure Workers Builds with build command `pnpm build` and deploy command `pnpm exec wrangler deploy`. The repository does not change dashboard settings. The Cloudflare adapter builds the Actions Worker alongside the static pages. For a local Workers preview, run `pnpm build` followed by `pnpm exec wrangler dev`.

`wrangler.jsonc` binds production and Workers Previews to separate D1 databases. Apply new migrations before deploying code that needs them, using the commands in [Shipping and deployment](docs/maintenance.md#shipping-and-deployment); they modify remote data and need a token with D1 edit permission.

Upvotes are anonymous and cookie-based, with per-address rate limits; this is not a one-person-one-vote system. Vote semantics, limits and verification are in [Upvotes and D1](docs/maintenance.md#upvotes-and-d1).

## Content and maintenance

Articles live under `src/content/blog`, with YAML front matter (`title`, `pubDate`, and optional `description`, `updatedDate`, `draft` and `comments`; unknown fields are rejected). Keep local images alongside Markdown and use relative paths with descriptive alt text: Astro infers dimensions and optimizes them with Sharp. Put unprocessed downloads in `public/downloads/` and link to `/downloads/...`. Remote image sources must be allowed by both the Astro `security.csp` directives and `public/_headers`; prefer local images and ordinary repository links.

`src/content.config.ts` uses Astro's built-in glob loader for the blog collection. Production excludes drafts and future posts; the dev server includes them. Dates display in `Asia/Shanghai`. Keep existing article IDs so `/blog/<name>/` URLs remain stable. Home and archive are independent `.astro` pages under `src/pages/`, not content collections. RSS metadata is defined directly in its endpoint.

`src/lib/markdown.mjs` customizes the official Unified Markdown processor for this site's alerts, tables, and code captions. Footnote presentation uses native processor options and CSS; heading and footnote anchors follow Astro defaults. Fence captions use `title="db/user.go"` without braces. The blog's single RSS feed at `/index.xml` renders collection content through Astro's experimental Container API so optimized images work in feed readers, without a second Markdown parser. `src/lib/assets.ts` generates content-versioned Giscus theme CSS.

Publication and RSS rules are in [Content and RSS](docs/maintenance.md#content-and-rss).

Astro's Fonts API serves local fonts with content-hashed URLs. `src/lib/fonts.mjs` generates common and article JinKai subsets from source at build time and dev-server startup; publishing new text needs no manual font command. During development, restart the server to refresh the optimized subsets; complete fallback ranges cover new characters meanwhile. The shared layout declares code fonts without preloading; the browser downloads them only when used, on any page. Font licenses and fallback regeneration instructions are in `public/fonts/tsanger-jinkai02/NOTICE.md`.

Agent instructions start at [AGENTS.md](AGENTS.md), with shared design contracts and maintenance workflows under `docs/`.
