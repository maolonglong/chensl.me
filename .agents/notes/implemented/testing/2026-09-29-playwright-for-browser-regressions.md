# Agent Note: Playwright for browser regressions, agent-browser for exploration

Status: implemented

## Problem

The browser check script (`054cc36:scripts/check-browser.mjs`) drove agent-browser with one subprocess per step, about 158 ms each against 0.6 ms in process. It relaunched the browser to switch hover capability. It also stopped at the contents rail in current environments, so every later section went unverified.

## Decision

Browser regressions are Playwright specs under `e2e/`. `playwright.config.mjs` starts its own Wrangler preview with local D1 and refuses a non-loopback `SITE_URL`. `e2e/site.mjs` holds the shared fixtures: settling on fonts and two frames, asserting the hover capability that a test asks for, and a distinct client address per test for the rate limits. CI runs the specs after `pnpm check`.

agent-browser stays for exploration by hand. A finding worth keeping becomes a spec.

## Alternatives considered

**Keep the agent-browser scripts.** They were slow, needed a relaunch per capability, and stopped part way through, so they gave no evidence for the later sections.

## Consequences

Each test starts in a fresh context, so cold visits need no browser restart. A touch screen is `test.use({ hasTouch: true })`. The suite needs a Chrome binary; see [Chrome discovery](2026-10-04-discover-chrome-by-installation.md).
