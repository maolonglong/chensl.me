# Maintenance workflows

Read only the section matching the task. Paths and commands are relative to the repository root.

## Preview and browser verification

Run `pnpm dev` for a local development preview. When using a process supervisor, set `ASTRO_DEV_BACKGROUND=0` so it owns the foreground process. The dev-only `/_astro/status` endpoint reports readiness.

For production behavior, run `pnpm build`, then serve the output with `pnpm exec wrangler dev --port 8787`. Wrangler follows `.wrangler/deploy/config.json`; it does not rebuild the output.

Use the Wrangler preview, not `astro dev`, for CSP and upvote checks. `pnpm test:e2e` builds the site and runs the Playwright specs in `e2e/` against its own preview on port 8790 with local D1, driving the installed Google Chrome. The HTML report is in `playwright-report/`, and a failing test keeps its trace in `test-results/`. Set `SITE_URL` to reuse a preview you started; only loopback URLs are accepted because the upvote checks write votes. `pnpm test:e2e` owns port 8790, `dist/`, `test-results/` and `playwright-report/`; two runs at once, or a build during a run, fail with misleading errors, so run one at a time.

Before modifying browser verification, read `playwright.config.mjs` and `e2e/site.mjs`: `test.use({ hasTouch: true })` selects a touch screen, and `open()` asserts the hover capability the test asked for. `capture()` writes 2× screenshots to `test-results/screenshots` for review. Viewport width alone does not reproduce these states.

## CSP and theme bootstrap

Preserve the ordering in `astro.config.mjs`: Astro hashes and emits the trusted `head-inline` theme bootstrap after the CSP declaration and before the body. Restart the dev server after editing `src/scripts/theme-bootstrap.js`, which the config reads at startup. Keep other component interactions in compiled scripts.

Both Astro's meta CSP and Cloudflare's `public/_headers` policy apply independently. Allow any required third-party frame or connection source in both. Keep `frame-ancestors` in the HTTP policy because a meta policy cannot enforce it. Inline styles remain allowed for Shiki and the no-script fallback.

Verify with `e2e/page-shell.spec.mjs`, which runs against the production preview and asserts that untrusted inline scripts and event handlers are rejected.

## Content and RSS

Preserve article IDs and the author's text when editing collection or publication behavior. `src/content.config.ts` defines the front matter schema; `src/lib/posts.ts` owns draft and future-post filtering for pages, RSS and the sitemap. Production excludes both, while development includes them. Scheduled posts appear only after a rebuild. Display dates in `Asia/Shanghai`.

Article headers show a notice when `updatedDate ?? pubDate` is more than two calendar years old, using the same rule from `src/lib/stale.ts` at build time and on each browser visit so articles can become stale without a rebuild when JavaScript runs; without JavaScript, only build-time staleness shows.

Pages and RSS must share Astro-rendered collection content and optimized local images. Preserve alt text, dimensions, lazy loading, and absolute RSS resource URLs. Keep the single feed at `/index.xml` and avoid a second Markdown parser. Use Astro's default heading and footnote anchors.

Published articles also provide `/blog/<id>/index.md`, discovered through the article's alternate link and `/llms.txt`. The export preserves the original Markdown body; relative collection images are published at their original paths so readers can resolve them without changing the text. These originals add static assets alongside the optimized images used by pages and RSS. Exports follow the same publication rules and rebuild schedule as article pages.

Export charsets come from `public/_headers` and are enforced by the build checks: local Wrangler previews automatically add UTF-8 to `text/*`, masking the missing production charset, so verify production response headers with `curl -sI` after deployment.

## Upvotes and D1

Read `src/actions/index.ts`, `wrangler.jsonc`, and the relevant migrations before changing vote behavior.

### Contracts to preserve

- Anonymous cookie-based identity: `getVotes` only reads `__Host-blog-voter` and never sets it. Without a valid cookie it returns the count with `voted: false`. `upvote` reuses a valid UUID or creates one, setting the cookie only after the first vote is saved; its attributes and lifetime live in `src/actions/index.ts`. Existing cookies are not renewed by reads or votes.
- Clearing or blocking cookies, switching browsers, or concurrent first submissions without a cookie can create separate identities, so this is not a one-person-one-vote system. Rate limits still apply to submissions without a cookie. A delayed read cannot overwrite the cookie from a first vote.
- Idempotent duplicate submissions, private non-cacheable Action responses, and no undo operation.
- The reader-facing button follows Bear Blog: load the count silently, then increment, color and disable immediately on click without waiting for the submission. Failed submissions do not roll back or show errors; reloading reads the persisted state again. The optimistic display is not confirmation that D1 saved a vote.
- D1 stores article and visitor IDs, not IP addresses, and accepts any well-formed UUID, so a client can forge identities within the rate limits.
- Actions accept only slug-shaped article IDs and confirm the article by requesting its built page through the `ASSETS` binding. Drafts and future posts are not prerendered, so they are rejected, and the content store stays out of the Worker bundle; `pnpm check` fails if a content-store chunk reaches `dist/server`.
- `VOTE_LIMITER` (submissions) and `READ_LIMITER` (reads) key on the client address, with budgets in `wrangler.jsonc`. Cloudflare limiters are per location and approximate, and networks sharing an address share the budget. They are basic abuse mitigation, not a global quota or bot challenge.

### Verification

1. Run `pnpm test:e2e`, or `pnpm exec playwright test e2e/upvotes.spec.mjs` after a build. Playwright starts its own preview, applying local migrations to disposable D1 data first. With `SITE_URL`, apply them yourself: `pnpm exec wrangler d1 migrations apply VOTES --local`.
2. `e2e/upvotes.spec.mjs` accepts only loopback URLs, and every test sends its own synthetic `CF-Connecting-IP`, so runs need no waiting between them. Each run adds a few votes to `dockertest`, and the specs assert counts relative to a baseline read at the start of each test.

The check is done when the spec passes: it asserts slug validation, concurrent duplicate submissions, visitor isolation, cookie-free reads, first votes without initialization, cookie persistence across delayed reads, keyboard voting and announcements, optimistic feedback across failed submissions, reload reconciliation, and both rate limits.

### Authorization

Cloudflare resource creation, remote migrations, and manual deployment require authorization; local migrations and deployment dry runs perform none of them. Version preview URLs share production bindings; use Workers Previews for isolated remote test writes, with authorization.

## Dependency upgrades

Before evaluating or performing an upgrade from a GitHub-released dependency, collect stable release notes between the current and target versions:

```sh
node scripts/fetch-release-notes.mjs --repo OWNER/REPO --from CURRENT_TAG --to TARGET_TAG --output PATH
```

Use `--to latest` only when targeting the latest stable release, and `--include-prereleases` only when prerelease compatibility is in scope.

- Astro: review release notes and official Markdown processor/integration compatibility. Update `package.json` and `pnpm-lock.yaml` together, keeping the type checker compatible with the selected TypeScript version.
- Node.js: synchronize the CI `node-version` with the documented development requirement.
- Run `pnpm check`, then `pnpm exec wrangler deploy --dry-run` against its freshly built output.

## Shipping and deployment

Inspect `.github/workflows/ci.yml` for validation and Cloudflare Workers Builds for deployment. The Cloudflare dashboard is the source of truth for the external Git integration, its settings, and build/deployment records. Do not assume Cloudflare waits for GitHub CI.

Before deploying code that needs a new schema, obtain authorization and apply the appropriate remote migrations. Resolve database bindings from `wrangler.jsonc`; production and Workers Previews use separate databases. The command is `pnpm exec wrangler d1 migrations apply VOTES --remote --config wrangler.jsonc`, with `--preview` added for the preview database. The token needs D1 edit permission.

Report pushed, CI passed, and deployment confirmed separately. Match the deployment record to the pushed commit; if records are unavailable, report deployment as unverified. A successful CI run does not prove deployment succeeded, and the absence of a GitHub deployment job does not mean no deployment was triggered. Do not run an extra manual deployment merely because GitHub Actions only validates.
