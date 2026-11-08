# Agent Note: Follow the system theme

Status: implemented

## Problem

A three-state theme cycle (auto, light, dark) needed a pre-paint inline bootstrap in `<head>`, localStorage, a view-transition crossfade, and a giscus theme-sync event. Its half-moon "auto" icon does not tell a reader which state it is in. The site aims to be a modern bearblog that adds nothing a reader does not need, the OS already exposes an appearance setting, and the owner advocates automatic themes (his article at `/blog/terminal-auto-theme/`).

## Decision

The page follows `prefers-color-scheme` only; there is no toggle. `e2e/appearance.spec.mjs` emulates both schemes and checks that the page follows.

## Alternatives considered

**Keep the three-state toggle.** A per-site override on a reading page that already follows the OS adds a control that most readers never touch.

**A light/dark two-state toggle.** It loses the auto mode and still needs localStorage and the pre-paint bootstrap.

## Consequences

- No head-inline script remains; every script is a bundled component script ([CSP](../architecture/2026-09-28-hash-based-script-csp.md)).
- A reader who wants the other theme uses OS or browser settings.
- The giscus theme resolves from `prefers-color-scheme` and syncs on the media query's `change` event.
- The iOS `touchstart` listener the toggle's script carried moved to `src/layouts/BaseLayout.astro`; without it `:active` press feedback does not fire on iOS.
- The header keeps one tool, the search icon ([lean header navigation](2026-10-17-lean-header-navigation.md)).

## Reopen when

The owner wants a per-site theme override.
