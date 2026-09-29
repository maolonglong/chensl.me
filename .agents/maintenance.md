# Maintenance workflows

Read only the section matching the task. Paths and commands are relative to the repository root.

## Preview and browser verification

In Amp orbs, run `amp orb services ensure` for the managed dev preview and its portal URL. `.amp/services.yaml` disables Astro's automatic backgrounding so Amp owns the foreground process. The dev-only `/_astro/status` endpoint reports readiness.

For production behavior, run `pnpm build`, then serve the output with `pnpm exec wrangler dev --port 8787`. In an orb, run long-lived servers through `amp orb service start`. Wrangler follows `.wrangler/deploy/config.json`; it does not rebuild the output.

Use the Wrangler preview, not `astro dev`, for CSP and upvote checks. Before modifying browser verification, read `scripts/check-browser.mjs` and `scripts/check-appearance.mjs`: they set and assert hover capability and keep a CDP connection open for no-script checks. Viewport width or device emulation alone does not reproduce those states.

## CSP and theme bootstrap

Preserve the ordering in `astro.config.mjs`: Astro hashes and emits the trusted `head-inline` theme bootstrap after the CSP declaration and before the body. Restart the dev server after editing `src/scripts/theme-bootstrap.js`, which the config reads at startup. Keep other component interactions in compiled scripts.

Both Astro's meta CSP and Cloudflare's `public/_headers` policy apply independently. Allow any required third-party frame or connection source in both. Keep `frame-ancestors` in the HTTP policy because a meta policy cannot enforce it. Inline styles remain allowed for Shiki and the no-script fallback.

Verify with the production-preview browser check, which deliberately attempts and asserts rejection of untrusted inline scripts and event handlers.

## Content and RSS

Preserve article IDs and the author's text when editing collection or publication behavior. `src/content.config.ts` owns draft and future-post filtering; production excludes both, while development includes them. Display dates in `Asia/Shanghai`.

Pages and RSS must share Astro-rendered collection content and optimized local images. Preserve alt text, dimensions, lazy loading, and absolute RSS resource URLs. Keep the single feed at `/index.xml` and avoid a second Markdown parser. Use Astro's default heading and footnote anchors.

## Upvotes and D1

Read `src/actions/index.ts`, `wrangler.jsonc`, and the relevant migrations before changing vote behavior. Preserve anonymous cookie-based identity, idempotent duplicate submissions, private non-cacheable Action responses, and the absence of an undo operation. Clearing cookies or switching browsers loses the visitor's vote identity; this is not a one-person-one-vote system.

Run `node scripts/check-upvotes.mjs http://localhost:8787` against the freshly built Wrangler preview with disposable local D1 data. Apply local migrations first with `pnpm exec wrangler d1 migrations apply VOTES --local`. The E2E script adds three votes to `dockertest` per successful run and checks concurrency, visitor isolation, cookie persistence, and browser error recovery. It rejects non-loopback URLs. Retain its output with `tee` when a verification report is needed.

Cloudflare resource creation, remote migrations, and manual deployment require authorization. Local migrations and deployment dry runs do not perform them. Version preview URLs share production bindings; use Workers Previews for isolated remote test writes, with authorization.

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
