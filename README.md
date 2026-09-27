# chensl.me

Source for [chensl.me](https://chensl.me), a personal site and technical blog built with Astro and deployed as Cloudflare Workers static assets. Pages are prerendered; there is no server adapter or client UI framework.

## Setup

Use Node.js 26 and the pnpm version pinned in `package.json` (Astro requires Node.js 22.12 or later):

```sh
pnpm install --frozen-lockfile
```

Python 3 is used by the site checks for XML validation; these checks use only the Python standard library.

## Development

```sh
pnpm dev    # local preview, including drafts
pnpm build  # production build
pnpm check  # formatting, lint, type check, build, regression tests, output validation
```

Tests use disposable Astro fixture builds. TypeScript stays on 6.x because the current `astro check` does not support TypeScript 7.

Use `pnpm format` to format maintained code with Prettier and its Astro plugin, and `pnpm lint` for Oxlint. Formatting excludes article content, fonts, third-party code, and generated output. Components own scoped styles and compiled TypeScript interactions; global CSS owns design tokens, Markdown typography, and shared floating-control geometry. Only the pre-paint theme bootstrap stays inline. Oxlint checks scripts, not Astro template semantics; `astro check` and browser coverage remain required.

`public/` contains unprocessed public assets; `dist/` is disposable output. Do not put source files in `dist/`. Run `node scripts/check-browser.mjs <preview-url>` against the preview for browser regression coverage.

Run `node scripts/check-appearance.mjs <preview-url> .amp/in/artifacts/astro` for theme, storage-failure, and no-script checks plus 2× screenshots of pages, breakpoints, and contents states. Inspect the screenshots separately; capture alone is not visual verification. Both browser scripts require `agent-browser`.

After running `pnpm check`, validate Cloudflare configuration with a deployment dry run. Wrangler consumes the existing `dist/`; it does not rebuild or run tests:

```sh
pnpm exec wrangler deploy --dry-run
```

Manual deployment, only when explicitly requested:

```sh
pnpm deploy
```

## CI and deployment

- GitHub Actions runs on pushes and pull requests. [The CI workflow](.github/workflows/ci.yml) installs Node.js dependencies, runs `pnpm check`, then `wrangler deploy --dry-run`. It does not publish the site.
- Cloudflare's Git integration automatically builds and deploys the production site when `main` is pushed. This integration is configured in the Cloudflare dashboard, outside the GitHub workflow. The dashboard is the source of truth for deployment settings and build/deployment records.

Following [Astro's Cloudflare deployment guide](https://docs.astro.build/en/guides/deploy/cloudflare/), configure Workers Builds with build command `pnpm build` and deploy command `pnpm exec wrangler deploy`. Replace any old `build.sh` command in the dashboard before deploying this migration. The repository does not change dashboard settings. This prerendered site uses Workers Static Assets directly; `@astrojs/cloudflare` is only needed if adding on-demand rendering. For a local Workers preview, run `pnpm build` followed by `pnpm exec wrangler dev`.

Check validation and deployment separately. A successful GitHub CI run does not prove deployment succeeded, and the absence of a GitHub deployment job does not mean no deployment was triggered. Do not assume Cloudflare waits for GitHub CI to pass.

When reporting a shipped change, distinguish pushed, CI passed, and deployment confirmed. Confirm deployment against the pushed commit using Cloudflare's records; if those records are unavailable, report deployment as unverified rather than claiming the site did not update. Do not run an extra manual deployment merely because GitHub Actions only validates.

## Content and maintenance

Articles live under `src/content/blog`, with YAML front matter (`title`, `pubDate`, and optional `description` and `updatedDate`). Keep local images alongside Markdown and use relative paths with descriptive alt text: Astro infers dimensions and optimizes them with Sharp. Put unprocessed downloads in `public/downloads/` and link to `/downloads/...`. Remote image sources must be explicitly allowed by `public/_headers`; prefer local images and ordinary repository links.

`src/content.config.ts` uses Astro's built-in glob loader for the blog collection. Production excludes drafts and future posts; the dev server includes them. Dates display in `Asia/Shanghai`. Keep existing article IDs so `/blog/<name>/` URLs remain stable. Home and archive are independent `.astro` pages under `src/pages/`, not content collections. RSS metadata is defined directly in its endpoint.

`src/lib/markdown.mjs` customizes the official Unified Markdown processor for this site's alerts, tables, footnote presentation, and code captions. Heading and footnote anchors follow Astro defaults. Fence captions use `title="db/user.go"` without braces. The blog's single RSS feed at `/index.xml` renders collection content through Astro's experimental Container API so optimized images work in feed readers, without a second Markdown parser. `src/lib/assets.ts` generates content-versioned font and Giscus theme CSS; font licenses and regeneration instructions are in `public/fonts/tsanger-jinkai02/NOTICE.md`.

Agent instructions are documented in [AGENTS.md](AGENTS.md).

### Dependency upgrades

Before evaluating or performing an upgrade from a GitHub-released dependency, collect the stable release notes between the current and target versions:

```sh
node scripts/fetch-release-notes.mjs --repo OWNER/REPO --from CURRENT_TAG --to TARGET_TAG --output PATH
```

Use `--to latest` only when targeting the latest stable release. Add `--include-prereleases` only when prerelease compatibility is in scope.

- Astro: review its release notes and the official Markdown processor/integration compatibility, then update `package.json` and `pnpm-lock.yaml` together. Keep the type checker compatible with the selected TypeScript version.
- Node.js: update `node-version` in `.github/workflows/ci.yml`; Amp orbs provide Node.js for development.

Run the deployment dry run described above after dependency changes.
