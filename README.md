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

Run `node scripts/check-appearance.mjs <preview-url> .amp/in/artifacts/astro` for theme, storage-failure, and no-script checks plus 2× screenshots of pages, breakpoints, and contents states. Inspect the screenshots separately; capture alone is not visual verification. Both browser scripts require `agent-browser`.

Run `node scripts/check-upvotes.mjs http://localhost:8787` against a production build served by `pnpm exec wrangler dev --port 8787`. It uses real Actions and local D1, adds three votes to the `dockertest` article per successful run, and prints assertions for concurrency, visitor isolation, cookie persistence, and browser error recovery. Use only disposable local data; the script rejects non-loopback URLs. Capture its output with `tee` when retaining a verification report. Static output is in `dist/client`; the generated Worker configuration is in `dist/server` and Wrangler follows `.wrangler/deploy/config.json`.

After running `pnpm check`, validate Cloudflare configuration with a deployment dry run. Wrangler consumes the existing `dist/`; it does not rebuild or run tests:

```sh
pnpm exec wrangler deploy --dry-run
```

Manual deployment to production:

```sh
pnpm deploy
```

### CSP and theme bootstrap

Astro generates a hash-based script CSP in each page. The `head-inline` integration in `astro.config.mjs` lets Astro hash and emit the trusted theme bootstrap after the CSP declaration and before the body. Restart the dev server after editing `src/scripts/theme-bootstrap.js`, which the config reads at startup.

Cloudflare's `_headers` retains the other security restrictions, including `frame-ancestors`, which cannot be enforced through a meta policy. Both policies apply independently; third-party frame and connection sources must be allowed by both. Inline styles remain allowed for Shiki and the no-script fallback.

Verify CSP with a production build served by Wrangler, not `astro dev`; the browser check deliberately attempts and asserts rejection of untrusted inline scripts and event handlers.

## CI and deployment

- GitHub Actions runs on pushes and pull requests. [The CI workflow](.github/workflows/ci.yml) installs Node.js dependencies, runs `pnpm check`, then `wrangler deploy --dry-run`. It does not publish the site.
- Cloudflare's Git integration automatically builds and deploys the production site when `main` is pushed. This integration is configured in the Cloudflare dashboard, outside the GitHub workflow. The dashboard is the source of truth for deployment settings and build/deployment records.

Following [Astro's Cloudflare deployment guide](https://docs.astro.build/en/guides/deploy/cloudflare/), configure Workers Builds with build command `pnpm build` and deploy command `pnpm exec wrangler deploy`. The repository does not change dashboard settings. The Cloudflare adapter builds the Actions Worker alongside the static pages. For a local Workers preview, run `pnpm build` followed by `pnpm exec wrangler dev`.

`wrangler.jsonc` binds production to `blog-votes` and Workers Previews to the separate `blog-votes-preview` D1 database. Apply new migrations before deploying code that needs them: `pnpm exec wrangler d1 migrations apply VOTES --remote --config wrangler.jsonc` for production, and the same command with `--preview` for the preview database. These commands modify remote data and require a token with D1 edit permission. Local migrations and deployment dry runs do not change remote resources. Version preview URLs share production bindings; use Workers Previews, not version URLs, for isolated test writes.

Upvotes use a first-party `Secure`, `HttpOnly`, `SameSite=Strict` cookie renewed for one year. D1 stores article and anonymous visitor IDs, not IP addresses. Clearing cookies or switching browsers loses the visitor's vote identity; this is not a one-person-one-vote system. Duplicate submissions are idempotent and votes cannot be undone. Action responses are private and non-cacheable. A per-IP limiter uses namespace `1001` and allows 30 submissions per minute per Cloudflare location, so shared networks may share a limit; it is basic abuse mitigation, not a globally strict quota or bot challenge.

Validation and deployment are independent. A successful GitHub CI run does not prove deployment succeeded; Cloudflare's build/deployment record for the pushed commit is the deployment evidence.

## Content and maintenance

Articles live under `src/content/blog`, with YAML front matter (`title`, `pubDate`, and optional `description` and `updatedDate`). Keep local images alongside Markdown and use relative paths with descriptive alt text: Astro infers dimensions and optimizes them with Sharp. Put unprocessed downloads in `public/downloads/` and link to `/downloads/...`. Remote image sources must be explicitly allowed by `public/_headers`; prefer local images and ordinary repository links.

`src/content.config.ts` uses Astro's built-in glob loader for the blog collection. Production excludes drafts and future posts; the dev server includes them. Dates display in `Asia/Shanghai`. Keep existing article IDs so `/blog/<name>/` URLs remain stable. Home and archive are independent `.astro` pages under `src/pages/`, not content collections. RSS metadata is defined directly in its endpoint.

`src/lib/markdown.mjs` customizes the official Unified Markdown processor for this site's alerts, tables, and code captions. Footnote presentation uses native processor options and CSS; heading and footnote anchors follow Astro defaults. Fence captions use `title="db/user.go"` without braces. The blog's single RSS feed at `/index.xml` renders collection content through Astro's experimental Container API so optimized images work in feed readers, without a second Markdown parser. `src/lib/assets.ts` generates content-versioned Giscus theme CSS.

Pages and RSS share Astro-rendered collection content and optimized local images. Preserve alt text, dimensions, lazy loading, and absolute RSS resource URLs.

Astro's Fonts API serves local fonts with content-hashed URLs. `src/lib/fonts.mjs` generates common and article JinKai subsets from source at build time and dev-server startup; publishing new text needs no manual font command. During development, restart the server to refresh the optimized subsets; complete fallback ranges cover new characters meanwhile. The shared layout declares code fonts without preloading; the browser downloads them only when used, on any page. Font licenses and fallback regeneration instructions are in `public/fonts/tsanger-jinkai02/NOTICE.md`.

Agent instructions start at [AGENTS.md](AGENTS.md), with task-specific guidance under `.agents/`.
