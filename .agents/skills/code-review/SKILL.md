---
name: code-review
description: Review a diff, PR or commit in the chensl.me repo (Astro blog on Cloudflare Workers) against the regressions its fix history keeps producing — CSP, upvote Actions/D1, Markdown pipeline, content/RSS, a11y and touch UI, checks and shipping.
---

# Review chensl.me

A rubric of traps, not a second copy of the contracts: `AGENTS.md`, `docs/design.md` and `docs/maintenance.md` own those. Each trap below cites the commit that hit it; `git show <hash>` gives the full story. Pair with `check` for general correctness.

## Steps

1. **Read the whole diff**: source, tests, and the commit body. Done when every changed file maps to a surface below, or is named "no surface".
2. **Read the contract** of each touched surface (linked in its heading). Skip untouched surfaces.
3. **Hunt.** Rule on every trap of every touched surface: _hit_, _clear_ or _n/a_. A hit is a finding only with `file:line` and a failure scenario (input → wrong output).
4. **Audit the proof**, always:
   - A fix must go _red_ without its source hunk. Where the test is cheap (`node --test tests/x.test.mjs`), revert the hunk and run it; otherwise the commit body must record that it failed before.
   - Verification must match `AGENTS.md` § Verification for the surface. Visual or interaction changes need screenshots in `test-results/screenshots` that someone looked at, across the affected light/dark, narrow/wide, open/closed states.
   - Every "passes" or "verified" claim in the commit body matches what was run. Real device, Safari and screen readers stay _unverified_ unless run.
5. **Report** findings by user impact, then the _unverified_ list.

## Surfaces

| Diff touches                                                                                                       | Surface        |
| ------------------------------------------------------------------------------------------------------------------ | -------------- |
| `astro.config.mjs` `security`, `public/_headers`, `theme-bootstrap.js`, `Theme.astro`, any `<script>` or handler   | CSP            |
| `src/actions/`, `src/middleware.ts`, `Upvote.astro`, `migrations/`, `wrangler.jsonc` bindings                      | Upvotes        |
| `src/lib/markdown.mjs`, `astro.config.mjs` `markdown`, `index.xml.ts`, `content.config.ts`, `posts.ts`, `src/content/` | Content        |
| `src/components/`, `src/styles/`, `BaseLayout.astro`, fonts                                                        | UI             |
| `scripts/`, `tests/`, `e2e/`, `.github/`, `package.json`, `pnpm-*`, `wrangler.jsonc`, `skills-lock.json`           | Checks & ship  |

### CSP — [maintenance.md](../../../docs/maintenance.md#csp-and-theme-bootstrap)

- Two policies enforce independently: the meta CSP in `astro.config.mjs` and `public/_headers`. A source added to one is still blocked by the other (`0202fd0`: giscus `style-src` needed both). `frame-ancestors` lives only in the header. The source also goes into `scripts/check-site.mjs` and its test.
- Scripts run only through Astro hashes: a component `<script>` (bundled) or `injectScript('head-inline')`. `is:inline` scripts, event-handler attributes, or `unsafe-inline` in `script-src` are hits (`242093e`). `unsafe-inline` in `style-src` is deliberate (Shiki, table alignment, no-script).
- A CSP console error from Cloudflare's injected JavaScript Detections script is dashboard config; loosening the policy for it is a hit (`0202fd0`).
- `immutable` caching (`/_astro/fonts/*`, `/css/*`) holds only while the URL carries a content hash (`src/lib/assets.ts`). An immutable path with a stable URL serves stale forever.

### Upvotes — [maintenance.md](../../../docs/maintenance.md#upvotes-and-d1)

- `requirePost` uses `redirect: 'manual'` and demands exactly 200. `/blog/index/` redirects to the archive, so following redirects made a non-article votable (`d16b247`, introduced by `68682ec`). Any new prerendered page under `/blog/<x>/` that is not an article passes that check: hit.
- Worker code (`src/actions/`, `src/middleware.ts`) never imports `astro:content` or `src/lib/posts.ts`; that bundles the content store into the Worker (`68682ec`; `check-site` fails).
- Article IDs match `[a-z0-9_-]+` (the Action input). Others get 400 on vote. Renaming an article moves its URL and orphans its D1 votes, which are keyed by `post_id`.
- Each Action calls `requireQuota` with its own limiter; sharing a budget or omitting one is a hit (`287be50`). A new limiter is a new account resource on deploy.
- A write followed by a read is one `env.VOTES.batch`; two round trips let the count miss the caller's vote.
- Middleware keeps the same-origin check and `Cache-Control: private, no-store` on every Action response, errors included. The `__Host-blog-voter` cookie needs `Secure`, `Path=/` and no `Domain`; adding `domain` makes browsers drop it.
- Feedback is optimistic: a click disables, colors and increments the button before the Action resolves, and native `disabled` is deliberate (`bfa3a4d`). Awaiting the response, rolling back, or showing an error is a hit. Success is announced through the polite live region.
- New migrations need remote application before the code deploys, with authorization. Pushing `main` deploys without waiting for CI, and a version preview URL shares production bindings, so a vote test there writes to production D1.

### Content — [maintenance.md](../../../docs/maintenance.md#content-and-rss)

- The tree you edit is not the HTML the browser gets. Shiki emits lowercase `tabindex`, so `delete node.properties.tabIndex` silently did nothing (`82d1217`). Check every plugin `delete` and regex against emitted HTML from a real build.
- Plugins leave a clean tree: an emptied text node after stripping `[!TIP]` (`dfa3891`).
- One Markdown pipeline. RSS renders the same collection through `AstroContainer`; a second parser is a hit. Parse the HTML before rewriting `href`/`src` (entities), and every feed URL ends absolute (`988b08d`). `/index.xml` is the only feed.
- The schema stays `z.strictObject`. `z.object` or `.passthrough()` turns `darft: true` into a published post (`87cbdac`).
- `publishedPosts()` is the only draft/future filter for pages, RSS and sitemap; a direct `getCollection('blog')` leaks drafts. `import.meta.env.DEV` shows drafts by design.
- Dates display through `displayDate` (`Asia/Shanghai`). CI runs UTC and the author's machine runs CST, so local-time getters or `toLocale*` without `timeZone` differ between them.
- Article IDs are URLs. A rename or move under `src/content/blog/` is a hit unless asked. Article prose keeps the author's words, emojis, dates and credits.

### UI — [design.md](../../../docs/design.md)

- Every control measures ≥44px including padding; the spec said 44 while contents entries were 37 (`b91f0fc`).
- Hover and touch are separate branches: pointer-only affordances sit behind `@media (hover: hover)`, and specs select capability with `test.use({ hasTouch })`; `open()` asserts it. Viewport width alone reproduces neither.
- Dismissal state survives until every input has left. Escape-dismissed contents stayed dismissed only until the pointer left, then focus reopened it (`379176f`). Walk hover, focus, resize and scroll.
- Scroll boxes (`.highlight`, `.table-scroll`) are focusable `role=region` wrappers with a label and an unclipped focus ring; the `<table>` itself never becomes `display:block` (`b32e2dd`, `82d1217`). No `title` attribute on the code wrapper.
- The scroll box carries the code fill, since iOS rubber-band exposes whatever sits behind it (`da19164`). At 320px the copy button leaves the first line readable (`f48a91b`); copy feedback is the icon plus a status announcement, with no visible failure text or layout shift (`bfa3a4d`).
- Decorative glyphs are `aria-hidden`, never headings (`2d9e213`). Contents, theme and upvote work without JavaScript.
- Colors come from `global.css` tokens; a new chromatic value is registered in `docs/design.md` first, and ink-blue means link only. Fonts: JinKai W04 alone, synthesized bold off, 640 KiB cold-visit budget (`tests/fonts.test.mjs`).

### Checks & ship — [maintenance.md](../../../docs/maintenance.md#shipping-and-deployment)

- Regexes over HTML or paths: `replace('*', …)` escapes one match, so use `replaceAll`; tag matchers ignore case and allow attributes on end tags (`8bb9190`, `25cc570`).
- Expected values derive from the contract, not from the code under test. A weakened assertion that turns a check green is a hit.
- Dependency bumps: exact-pinned packages (`astro`, `@astrojs/*`, `@playwright/test`, `oxlint`, `fontverter`, `harfbuzzjs`, `subset-font`) move together with `pnpm-lock.yaml`; follow [Dependency upgrades](../../../docs/maintenance.md#dependency-upgrades). A new `minimumReleaseAgeExclude` entry bypasses the release-age quarantine and needs a stated reason.
