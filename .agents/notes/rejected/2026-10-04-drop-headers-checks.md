# Agent Note: Drop the _headers checks from the site checker

Status: rejected — local Wrangler masks production header behavior, so only the build check catches these regressions

## Problem

`scripts/check-site.mjs` parses `dist/client/_headers` to check the CSP sources, the charset rules for text exports, the immutable Cache-Control values, and cross-origin access for the giscus themes. These checks read a static file that a browser test against the preview could seem to cover. A cleanup review on 2026-10-04 proposed to remove them.

## Proposal

Delete the `_headers` checks from `scripts/check-site.mjs` and their cases in `tests/check-site.test.mjs`, and rely on browser specs against the Wrangler preview.

<!-- agent-note-format: alternatives-not-recorded -->

## Rejection

The owner decided to keep them. Local Wrangler differs from production: it adds UTF-8 to every `text/*` response. `7e33307` claimed a charset that only the preview supplied, a browser spec passed against the preview, and production served mojibake until `b58de42` added the build check. Cloudflare also joins the values of every `_headers` rule that matches a path, which only a check that reads all rules can count.
