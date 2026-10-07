# Agent Note: Find Chrome by what is installed

Status: implemented

## Problem

`playwright.config.mjs` used agent-browser's Chrome for Testing only when `AMP_ORB=1`. Any other environment without a system Chrome failed, and each new environment needed its own name in the config.

## Decision

`chromeLaunchOptions()` in `playwright.config.mjs` picks a browser by what is on the machine: `CHROME_PATH` when set, else the system Chrome through `channel: 'chrome'`, else the newest Chrome for Testing under `~/.agent-browser/browsers`. With none of them, the config stops and names the options.

## Alternatives considered

**Gate on an environment name such as `AMP_ORB`.** This was the previous code. The owner asked to remove it: every environment needed its own name in the config.

## Consequences

The agent-browser fallback was not verified in the Amp orb image itself; it keeps the Linux layout `chrome-*/chrome` that the old code used. If discovery fails in an environment, fix the discovery. Do not add an environment-name gate back.
