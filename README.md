# chensl.me

Source for [chensl.me](https://chensl.me), a personal site and technical blog built with Astro and deployed to Cloudflare Workers. Pages are prerendered static assets; the official Cloudflare adapter runs the upvote Actions. There is no client UI framework.

## Setup

Use Node.js 26 and the pnpm version pinned in `package.json` (Astro requires Node.js 22.12 or later). Python 3 is also required: the tests use its standard library as an independent HTML and XML reader.

```sh
pnpm install --frozen-lockfile
pnpm cf:types   # regenerate binding types from wrangler.jsonc
pnpm exec wrangler d1 migrations apply VOTES --local
```

## Development

```sh
pnpm dev        # local preview, including drafts
pnpm build      # production build: static assets in dist/client, Worker in dist/server
pnpm format     # Prettier for maintained code (see .prettierignore)
pnpm check      # formatting, lint, type check, build, regression tests, output validation
pnpm test:e2e   # build, then Playwright specs against a local Wrangler preview
pnpm exec wrangler deploy --dry-run   # validate Cloudflare configuration after a build
```

Regression tests build disposable Astro fixtures. TypeScript stays on 6.x because the current `astro check` does not support TypeScript 7.

Components own their scoped styles and compiled scripts; `src/styles/global.css` holds design tokens and Markdown typography. Prerendering runs in Node with build-time image optimization; the Giscus theme CSS route reads its stylesheets with `node:fs`. Sessions are disabled; no KV or Cloudflare Images resource is required.

## Deployment

GitHub Actions ([CI workflow](.github/workflows/ci.yml)) runs `pnpm check`, the Wrangler dry run and the Playwright specs on pushes and pull requests; it does not publish the site. Cloudflare's Git integration builds and deploys production when `main` is pushed, configured in the Cloudflare dashboard following [Astro's Cloudflare guide](https://docs.astro.build/en/guides/deploy/cloudflare/): build command `pnpm build`, deploy command `pnpm exec wrangler deploy`. `pnpm run deploy` deploys manually; plain `pnpm deploy` is a built-in pnpm command and does not run this script.

`wrangler.jsonc` binds production and Workers Previews to separate D1 databases. Apply new migrations remotely before deploying code that needs them; see [Shipping and deployment](docs/maintenance.md#shipping-and-deployment).

Upvotes are anonymous and cookie-based, with per-address rate limits; this is not a one-person-one-vote system. See [Upvotes and D1](docs/maintenance.md#upvotes-and-d1).

## Writing

Articles live under `src/content/blog`, with YAML front matter: `title`, `pubDate`, and optional `description`, `updatedDate`, `draft`, `comments` and `creation`; unknown fields are rejected. `creation` declares how the article was written; see [Content and RSS](docs/maintenance.md#content-and-rss). Drafts and future posts appear only in `pnpm dev`. The file or directory name is the URL (`/blog/<name>/`), so keep existing names stable.

Keep local images alongside the Markdown and use relative paths with descriptive alt text; Astro optimizes them. Put unprocessed downloads in `public/downloads/` and link to `/downloads/...`. Prefer local images: a remote image source must be allowed in both the Astro CSP and `public/_headers`.

Markdown supports GitHub-style alerts (`> [!TIP]`), tables, footnotes, TeX math (`$…$` inline, `$$…$$` display), and code captions written as `title="db/user.go"` on the fence. The RSS feed at `/index.xml` renders the same content.

Published articles have a raw Markdown version at `/blog/<name>/index.md`, including their local images. `/llms.txt` indexes these exports for readers and agents.

JinKai font subsets are generated from source text at build time and dev-server startup, so new text needs no font command; restart the dev server to refresh them. Font licensing is in [NOTICE.md](public/fonts/tsanger-jinkai02/NOTICE.md).

## Further reading

- [AGENTS.md](AGENTS.md): instructions for coding agents.
- [Site design contracts](docs/design.md): layout, typography, accessibility and interaction rules.
- [Maintenance workflows](docs/maintenance.md): browser verification, CSP, content and RSS, upvotes, dependency upgrades, shipping.
