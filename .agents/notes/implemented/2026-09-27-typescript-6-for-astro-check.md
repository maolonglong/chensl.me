# Agent Note: Keep TypeScript on 6.x for astro check

Status: implemented

## Problem

`pnpm check` runs `astro check`, which type-checks `.astro` files. `@astrojs/check` declares the peer range `typescript: ^5.0.0 || ^6.0.0`; it does not support TypeScript 7.

## Decision

`package.json` keeps `typescript` on a 6.x range.

<!-- agent-note-format: alternatives-not-recorded -->

## Consequences

The project does not get TypeScript 7 features or speed until `@astrojs/check` supports it.

## Reopen when

The `typescript` peer range of `@astrojs/check` includes 7: `npm view @astrojs/check peerDependencies`. Confirm with `pnpm check` after the upgrade.
