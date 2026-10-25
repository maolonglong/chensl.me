# Agent Note: Run the specs on Playwright's own Chromium

Status: implemented

## Problem

`playwright.config.mjs` chose a browser to suit the machine. It first gated on `AMP_ORB=1` to find agent-browser's Chrome for Testing. Then `07935e5` replaced the gate with discovery: `CHROME_PATH`, else the system Chrome through `channel: 'chrome'`, else the newest `chrome-*` under `~/.agent-browser/browsers`. Each variant tied the test config to another tool's install layout, and the agent-browser fallback never ran in the environment it was written for.

## Decision

Locally, the config sets no browser. Playwright runs the Chromium that `playwright install chromium` provides, at the version that the pinned `@playwright/test` expects. A machine that lacks the browser runs the same install command; the config does not adapt to the machine.

In CI, the config sets `channel: 'chrome'` when `CI` is set. GitHub Actions sets `CI` itself, and the runner image ships Google Chrome, so the workflow has no browser install step.

## Alternatives considered

**Gate on an environment name such as `AMP_ORB`.** This was the first code. Every new environment needed its own name in the config.

**Discover an installed Chrome (`07935e5`).** It removed the environment name but kept the coupling to the system Chrome path and to agent-browser's directory layout, and a machine without either failed with a custom error.

**Keep `CHROME_PATH` as an override.** `PLAYWRIGHT_BROWSERS_PATH` already redirects Playwright's browsers, so a project variable would add an interface that nothing needs.

**Install Chromium in CI.** It keeps CI and local runs on one browser, but it downloads about 150 MB on every run to get a browser that the runner already has. The owner chose the runner's Chrome.

## Consequences

CI runs on Chrome stable and local runs on Playwright's Chromium. A rendering difference between them can change geometry and timing checks in one place only. Fix the spec or the code. Reproduce a CI-only failure with a local Chrome and `CI=1`.

The runner's Chrome version follows the image, not the Playwright version. A Chrome that is too old or too new for the pinned Playwright shows up as a CI-only failure.

## Reopen when

A regression ships that only one of the two browsers shows, or the runner image drops Google Chrome.
