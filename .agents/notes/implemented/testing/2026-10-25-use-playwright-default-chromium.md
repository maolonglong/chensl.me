# Agent Note: Run the specs on Playwright's own Chromium

Status: implemented

## Problem

`playwright.config.mjs` chose a browser to suit the machine. It first gated on `AMP_ORB=1` to find agent-browser's Chrome for Testing. Then `07935e5` replaced the gate with discovery: `CHROME_PATH`, else the system Chrome through `channel: 'chrome'`, else the newest `chrome-*` under `~/.agent-browser/browsers`. Each variant tied the test config to another tool's install layout, and the agent-browser fallback never ran in the environment it was written for.

## Decision

The config sets no browser. Playwright runs the Chromium that `playwright install chromium` provides, at the version that the pinned `@playwright/test` expects. CI installs it with `pnpm exec playwright install --with-deps chromium`. An environment that lacks the browser runs the same install command; the config does not adapt to the environment.

## Alternatives considered

**Gate on an environment name such as `AMP_ORB`.** This was the first code. Every new environment needed its own name in the config.

**Discover an installed Chrome (`07935e5`).** It removed the environment name but kept the coupling to the system Chrome path and to agent-browser's directory layout, and a machine without either failed with a custom error.

**Keep `CHROME_PATH` as an override.** `PLAYWRIGHT_BROWSERS_PATH` already redirects Playwright's browsers, so a project variable would add an interface that nothing needs.

## Consequences

The specs no longer run on Chrome stable. A rendering difference between Chromium and Chrome can change geometry and timing checks; fix the spec or the code, and do not return to a system browser. CI downloads the browser on every run.

## Reopen when

A regression ships that only Chrome stable shows, or the CI download time becomes a cost worth a cache.
