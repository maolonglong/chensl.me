# Site design contracts

Read when changing layout, styles, fonts, or browser interactions. Paths are relative to the repository root.

Kami is a visual reference, not this site's implementation specification. Its landing-page defaults for unadorned links, Latin-first font stacks, and self-scrolling tables do not override these contracts. Read only the relevant parts of [Kami's design reference](../.agents/skills/kami/references/design.md): Principles and sections 1–3 and 5.

- Header, main, and footer share the same `42rem` column; short pages keep the footer at the bottom. Reuse `src/styles/global.css` tokens.
- Keep headings at least as large as the article body. At equal sizes, distinguish headings through weight, color, and spacing: more space above than below. Preserve underlined article/footer links, archive visited-link styling, visible focus, and meaningful diff signs.
- Keep the single prerendered contents list: a hover rail beside the column and a native popover elsewhere, available without JavaScript when there are at least three H2/H3 headings. Keep SVG controls and 44px touch targets.
- Preserve theme cycling `auto` → `light` → `dark`, OS tracking in auto, forced `color-scheme`, persistence, storage-failure handling, accessible labels, and no-script fallback. For script changes, read [CSP and theme bootstrap](maintenance.md#csp-and-theme-bootstrap).
- Keep JinKai first for mixed Chinese/Latin text, W04 alone at weights 400–500, and synthesized bold disabled. Fonts remain self-hosted with `font-display: swap`, content-versioned URLs, no preloads, complete fallback coverage, and core-subset precedence. Declare code fonts for all pages; let the browser load them only when used. The cold-visit font budget is 640 KiB.
- Keep tables inside focusable `.table-scroll` wrappers, with column alignment preserved. Making the table itself the scroll box loses its accessibility role. Preserve code-fence captions without a `title` attribute on the code wrapper, which would add a tooltip.
