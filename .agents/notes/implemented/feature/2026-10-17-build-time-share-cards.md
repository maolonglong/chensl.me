# Agent Note: Share cards rendered at build time with Takumi

Status: implemented

## Problem

Every page shared one square image, `7803132:public/og-image.png`, with `twitter:card` set to `summary`. A shared article link showed a small generic icon and not the article title. The Worker runs on the Workers Free plan, whose CPU limit per request is too small for image rendering, and the site has no R2 bucket.

## Decision

The build renders the cards in Node. `src/pages/og/[...card].png.ts` is a prerendered route: it emits one PNG for each published article and four fixed cards, for the home page, the archive, AI News, and the news archive. `src/layouts/BaseLayout.astro` picks the card for each page through `cardFor()` in `src/lib/og.mjs` and sets `twitter:card` to `summary_large_image`. The 404 page has no card. No page uses the old square image, so it is removed.

- **No rendering in the Worker.** `/news/` renders on request, so each issue cannot have its own card without a runtime renderer. All news pages share the AI News card, and the monthly archive pages share the news archive card. Astro leaves prerendered routes out of the Worker bundle, and `scripts/check-site.mjs` fails a bundle that contains the renderer.
- **Renderer.** `src/lib/og-card.mjs` lays out a node tree and renders it with `@takumi-rs/core`, the native Node binding of Takumi. It supports `line-clamp` with an ellipsis, `text-wrap: balance`, and `word-break: keep-all`, so the title keeps the rules of the site's `h1`. A fresh `Renderer` renders each card, because a shared one keeps every face registered under the family name.
- **Font.** Each card embeds a subset of JinKai W04 with only its own characters and the ellipsis, made with `subset-font`. `tests/og.test.mjs` compares each subset render with a render that uses the full face.
- **Colors.** The renderer reads the light-theme tokens from `src/styles/global.css`, so a card adds no color of its own.

## Alternatives considered

**satori with `@resvg/resvg-js`.** It produced the same layout in a prototype, but it needs two packages and an SVG step, and it took about 70 ms per card after warm-up against about 8 ms for Takumi. Its PNG was about twice as large.

**Render in the Worker, with a cache or R2.** It would give each news issue its own card, but it needs a paid Workers plan for the CPU time, a renderer and a font in the Worker bundle, and storage for the images. The owner chose a fixed AI News card instead.

**`takumi-js`.** It is the documented high-level entry, but it also installs the WebAssembly build, which a Node build does not use.

**One shared card for all pages.** No build cost, but a shared article link does not show its title.

## Consequences

The build adds one PNG per article, 7 to 16 KB each, and renders a card in about 20 ms. The native binding has prebuilt packages for Linux, macOS, and Windows, so `pnpm install` needs no build step. A news issue shared on social sites shows the AI News card, not its own title.

## Reopen when

The Worker gets a plan with enough CPU time for runtime rendering, or AI News moves into the build.
