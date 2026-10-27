# Agent Note: Reduced motion keeps fades and drops movement

Status: implemented
Date: 2026-10-27
Class: feature

## Problem

`prefers-reduced-motion: reduce` used to set `transition-duration: 0s` on every element, so every transition snapped instantly. That removed fades that carry meaning: the back-to-top button's appearance, the contents popover, the image-zoom backdrop, and hover and pressed fills all changed state abruptly, which reads as a glitch rather than as respect for the preference. Reduced motion asks for less movement, not less comprehension.

## Decision

The `reduce` block in `src/styles/global.css` no longer zeroes durations. It pins `transition-property` to opacity, colors, `visibility`, and the discrete `display` and `overlay` properties with `!important`, so fades still run at their authored durations while transforms and other movement snap (`e2e/back-to-top.spec.mjs`). Keyframe animations keep the old contract: they run only under `prefers-reduced-motion: no-preference`. The image-zoom dialog crossfades by opacity under `reduce`, and the theme toggle's view-transition crossfade is opacity, so it stays under `reduce` too.

## Alternatives considered

**Keep zeroing every transition.** Safest against vestibular triggers, but it discards fades that explain where a control or surface went, and it made the popover, zoom backdrop, and hover states feel broken.

**Per-component reduced-motion overrides.** Scattering `no-preference`-guarded fades across components leaves each new transition author to remember the carve-out; a single property allow-list in the global rule makes the safe default automatic.

## Consequences

A transition on a property outside the list—`transform`, `width`, `scroll-behavior`—snaps instantly under `reduce`, which is the intended contract for new motion work. Browsers without `overlay` or `allow-discrete` support ignore those entries and keep the rest of the list.
