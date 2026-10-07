# Agent Note: Allow scripts only through Astro CSP hashes

Status: implemented

## Problem

The site allowed inline script execution, so an injected inline script or event handler would run. The pre-paint theme bootstrap had to stay inline, because it must run before the first paint.

## Decision

Scripts run only when Astro hashes them. A component `<script>` is bundled and hashed. The theme bootstrap, `src/scripts/theme-bootstrap.js`, is injected through `injectScript('head-inline')` in `astro.config.mjs`, so Astro emits the CSP before any executable script and hashes the exact emitted bytes.

Two policies apply independently, and a browser enforces both:

- The meta CSP from `astro.config.mjs` holds the script hashes, which only the build knows.
- The HTTP header in `public/_headers` holds `frame-ancestors`, which a meta policy cannot enforce, and the other response protections.

A third-party source must be allowed in both. Inline styles stay allowed for Shiki, table alignment, and the no-script fallback.

`tests/document.test.mjs` checks policy order and hashes in a real build, `scripts/check-site.mjs` rejects a permissive script policy, and `e2e/page-shell.spec.mjs` injects scripts and event handlers in a browser.

## Alternatives considered

**Permissive inline script execution.** This was the previous state. It allowed any injected inline script to run.

## Consequences

Every interaction is a compiled component script. An `is:inline` script or an event-handler attribute does not run. A new third-party script, frame, or connection needs a source in both policies and in the site checker.
