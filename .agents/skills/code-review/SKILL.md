---
name: code-review
description: Review a chensl.me diff, pull request, or commit against the regressions its fix history keeps producing. Use when you review a change, or before you commit one, that touches CSP, upvote Actions or D1, the Markdown pipeline, content or RSS, accessibility or touch UI, checks and shipping, or documents.
---

# Review chensl.me

A rubric of traps: lessons from incidents that review must catch again. Each trap cites the commit that hit it; `git show <hash>` gives the full story. The rules themselves live in the documents that each surface links. A trap that a test or check enforces leaves this list ([promotion](../../../docs/AGENTS.md#promotion)). Pair with `check` for general correctness.

## Steps

1. **Read the whole diff**: source, tests, documents, and the commit body. Done when every changed file maps to a surface below, or is named "no surface".
2. **Read the home** of each touched surface (linked in its heading). Skip untouched surfaces. Done when you have read the home of every touched surface.
3. **Hunt.** Rule on every trap of every touched surface: _hit_, _clear_, or _n/a_. A hit is a finding only with `file:line` and a failure scenario (input → wrong output).
4. **Audit the proof**, always:
   - A fix must go _red_ without its source hunk. Where the test is cheap (`node --test tests/x.test.mjs`), revert the hunk and run it; otherwise the commit body must record that it failed before.
   - The evidence matches [Evidence for each change](../../../docs/testing.md#evidence-for-each-change), and the test follows the [testing principles](../../../docs/testing.md#principles). Visual or interaction changes need screenshots in `test-results/screenshots` that someone looked at, across the affected light/dark, narrow/wide, and open/closed states.
   - Every "passes" or "verified" claim in the commit body matches what was run. Real devices, Safari, and screen readers stay _unverified_ unless run.
5. **Report** findings by user impact, then the _unverified_ list.

## Surfaces

| Diff touches | Surface |
| --- | --- |
| `astro.config.mjs` `security`, `public/_headers`, `src/scripts/theme-bootstrap.js`, `src/components/Theme.astro`, any `<script>` or handler | CSP |
| `src/actions/`, `src/middleware.ts`, `src/components/Upvote.astro`, `migrations/`, `wrangler.jsonc` bindings | Upvotes |
| `src/lib/markdown.mjs`, `astro.config.mjs` `markdown`, `src/pages/index.xml.ts`, `src/content.config.ts`, `src/lib/posts.ts`, `src/content/` | Content |
| `src/components/`, `src/styles/`, `src/layouts/BaseLayout.astro`, fonts | UI |
| `scripts/`, `tests/`, `e2e/`, `.github/`, `package.json`, `pnpm-*`, `wrangler.jsonc`, `skills-lock.json` | Checks & ship |
| `*.md` outside `src/content/` and `archived/`, `.agents/notes/`, project skills | Documents |

### CSP — [architecture](../../../docs/architecture.md#csp)

- Two policies enforce independently: the meta CSP in `astro.config.mjs` and `public/_headers`. When both define a directive, a source added to one is still blocked by the other (`0202fd0`: giscus `style-src` needed both). Script sources go only in the meta CSP, because `public/_headers` has no `script-src`. The source also goes into `scripts/check-site.mjs` and its test.
- Scripts run only through Astro hashes: a component `<script>` (bundled) or `injectScript('head-inline')`. `is:inline` scripts, event-handler attributes, or `unsafe-inline` in `script-src` are hits (`242093e`). `unsafe-inline` in `style-src` is deliberate (Shiki, table alignment, no-script).
- A CSP console error from Cloudflare's injected JavaScript Detections script is dashboard configuration; loosening the policy for it is a hit (`0202fd0`).
- `immutable` caching (`/_astro/*` from the Cloudflare adapter, `/css/*` from `public/_headers`) holds only while the URL carries a content hash (`src/lib/assets.ts`). An immutable path with a stable URL serves stale content forever.

### Upvotes — [product](../../../docs/product.md#upvotes)

- `requirePost` uses `redirect: 'manual'` and demands exactly 200 (`d16b247`). Any new prerendered page under `/blog/<x>/` that is not an article passes that check: hit.
- Each Action calls `requireQuota` with its own limiter; sharing a budget or omitting one is a hit (`287be50`). A new limiter is a new account resource on deploy.
- A write followed by a read is one `env.VOTES.batch`; two round trips let the count miss the caller's vote (`287be50`).

### Content — [product](../../../docs/product.md), [architecture](../../../docs/architecture.md#build)

- The tree you edit is not the HTML the browser gets. Shiki emits lowercase `tabindex`, so `delete node.properties.tabIndex` silently did nothing (`82d1217`). Check every plugin `delete` and regex against emitted HTML from a real build.
- Plugins leave a clean tree, with no emptied text node after a stripped marker (`dfa3891`).
- One Markdown pipeline. A second parser for RSS or exports is a hit. Parse HTML before you rewrite `href`/`src` (entities), and every feed URL ends absolute (`988b08d`).
- `publishedPosts()` is the only draft and future filter; a direct `getCollection('blog')` leaks drafts. `import.meta.env.DEV` shows drafts by design.
- Dates display through `displayDate` (`Asia/Shanghai`). CI runs UTC and the author's machine runs CST, so local-time getters or `toLocale*` without `timeZone` differ between them.

### UI — [design](../../../docs/design.md)

- Every control measures at least 44 px including padding; the spec said 44 while contents entries were 37 (`b91f0fc`).
- Hover and touch are separate branches: pointer-only affordances sit behind `@media (hover: hover)`, and specs select the capability with `test.use({ hasTouch })`.
- Dismissal state survives until every input has left. Escape-dismissed contents stayed dismissed only until the pointer left, then focus reopened it (`379176f`). Walk hover, focus, resize, and scroll.
- Scroll boxes are focusable `role=region` wrappers with a label and an unclipped focus ring; the `<table>` itself never becomes `display:block` (`b32e2dd`, `82d1217`).
- The scroll box carries the code fill, since an iOS overscroll exposes whatever sits behind it (`da19164`). At 320 px the copy button leaves the first line readable (`f48a91b`).
- Decorative glyphs are `aria-hidden`, never headings (`2d9e213`).
- Underline contexts set `text-decoration-line`, not the `text-decoration` shorthand: the shorthand resets thickness, and the CSS minifier dropped a thickness that followed `text-decoration: none` in the same rule (`61b7873`). Compare computed styles against a baseline build; a screenshot does not show it.
- A new chromatic value without an entry in [design § Color](../../../docs/design.md#color) is a hit; ink-blue means link only.

### Checks & ship — [testing](../../../docs/testing.md), `ship`, `upgrade-deps`

- Regexes over HTML or paths: `replace('*', …)` escapes one match, so use `replaceAll`; tag matchers ignore case and allow attributes on end tags (`8bb9190`, `25cc570`).
- A weakened assertion that turns a check green is a hit.
- A dependency change follows the `upgrade-deps` skill; a push to `main` follows the `ship` skill.

### Documents — [documentation standard](../../../docs/AGENTS.md)

- A document that copies a value, list, or behavior that code owns is a cache and a hit. Design values drifted from the CSS (`191bc16`), the README field list went stale twice (`8c5c00b`, `4e845ad`), and review traps described replaced behavior (`47fc88b`).
- A command, path, or default in a document or skill that the commit did not run or trace is a hit. The README documented `pnpm deploy`, which runs pnpm's built-in command, not the script (`4e845ad`).
- A behavior change that leaves its document home unchanged is a hit (`d9690fa` added `creation` without the README).
- A decision about something removed or rejected, with no Agent Note, is a hit when a later agent could reverse it.
