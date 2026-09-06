# Design

Design like a calm personal technical blog: Bear Blog bones, Catppuccin paint, system type, almost no chrome.

This file owns visual and interaction rules, rationale, and browser verification for layout and CSS changes. Root [`AGENTS.md`](../AGENTS.md) points here rather than duplicating the details.

## Lineage

| Source | What we took |
|--------|----------------|
| [Bear Blog](https://bearblog.dev) | Single-column reading, plain nav, content-first HTML, minimal JS |
| [Catppuccin](https://catppuccin.com/palette/) Latte + Mocha | Pastel light/dark pair, named roles (base/text/blue/…) |
| [Catppuccin style guide](https://github.com/catppuccin/catppuccin/blob/main/docs/style-guide.md) | Role → color mapping, opacity rules for selection/highlights |
| [Kami](https://github.com/tw93/Kami) design discipline | One-sentence aesthetic, numbered invariants, reject lists, token tables — not Kami’s parchment/serif look |

This is **not** a Kami document skin and **not** a Vercel report shell. Borrow structure from good design docs; keep the site’s own face.

## One sentence

**Narrow system-ui column on Catppuccin Latte/Mocha, blue links, almost no decoration, theme that follows the reader.**

## Priority order

When requirements compete, protect them in this order:

1. Readable body text and honest light/dark contrast (legibility first — Catppuccin’s own rule).
2. Existing Hugo templates, tokens, and static build (do not invent a parallel design system).
3. Bear-like restraint: one column, few controls, no product-UI chrome.
4. Catppuccin role consistency (blue = links, yellow family = marks/warnings, surfaces for code).
5. Small interaction polish (hover, focus, reduced motion) without new dependencies.

Ask before changing brand-level choices (palette family, measure, adding a framework). Otherwise omit unknowns and stay inside tokens.

## Invariants

Each has a real cost. Override only with an explicit product decision.

1. **Page canvas is Catppuccin base**, never pure `#fff` / `#000`. Light = Latte base `#eff1f5`; dark = Mocha base `#1e1e2e`.
2. **Body and headings use Text** (`#4c4f69` / `#cdd6f4`), not a second “brand black.”
3. **Links are Blue**; hover may shift to Sky; visited list titles may use Lavender. Latte uses darker derivatives of these roles to meet WCAG AA against Base. Do not invent a fourth link hue.
4. **Muted meta uses readable Subtext** (Latte `subtext1` / Mocha `subtext0`), not low-contrast Overlay.
5. **Borders and rules use Surface** (we use `surface2` for table rules and quote bars), not pure gray hex.
6. **Inline code sits on Surface0**; fenced blocks sit on **Mantle/Crust-like** Chroma backgrounds for contrast against base.
7. **Mark / highlight uses Yellow wash** (opacity), never Blue — Blue is reserved for links (Catppuccin: yellow → warnings/highlight intent).
8. **Selection uses Overlay at ~25% opacity** (Catppuccin selection guidance).
9. **Measure stays ~`42rem`**, single column, centered. No multi-column article chrome, no sticky app header.
10. **System fonts for body and chrome** (no webfont download for body). Code alone uses self-hosted JetBrains Mono with system/CJK fallbacks.
11. **Theme modes are `auto` | `light` | `dark`**. Auto = no `data-theme`; keep `color-scheme` aligned so `light-dark()` syntax colors track the active theme.
12. **No client framework, no utility CSS framework, no icon pack.** Native HTML elements; emoji is acceptable for the theme toggle only.
13. **Hierarchy comes from type, weight, and space** before borders, cards, or color fills.
14. **Touch devices must not sticky-hover**; hover styles only apply under `@media (hover: hover)`. Inline links in blog post bodies and footer prose stay underlined; structurally clear links elsewhere underline on hover only.

## Color tokens

Semantic CSS variables live in `assets/css/style.css`. Prefer variables over raw hex in new rules.

### Role map (Catppuccin names → site tokens)

| Role | Latte | Mocha | CSS variable(s) |
|------|-------|-------|-----------------|
| Background pane (Base) | `#eff1f5` | `#1e1e2e` | `--background-color` |
| Body / headline (Text) | `#4c4f69` | `#cdd6f4` | `--text-color`, `--heading-color` |
| Muted / meta (Subtext) | `#5c5f77` | `#a6adc8` | `--muted-color` |
| Quote text (Subtext1) | `#5c5f77` | `#bac2de` | `--blockquote-color` |
| Rules / quote bar (Surface2) | `#acb0be` | `#585b70` | `--blockquote-border-color` |
| Inline code bg (Surface0) | `#ccd0da` | `#313244` | `--code-background-color` |
| Inline code fg (Text) | `#4c4f69` | `#cdd6f4` | `--code-color` |
| Link (Blue) | `#1c60e8` | `#89b4fa` | `--link-color` |
| Link hover (Sky) | `#04759f` | `#89dceb` | `--link-hover-color` |
| Visited (Lavender) | `#5264c4` | `#b4befe` | `--visited-color` |
| Selection (Overlay2 @ ~25%) | `rgba(124,127,147,.25)` | `rgba(147,153,178,.25)` | `--selection-color` |
| Mark (Yellow @ opacity) | `rgba(223,142,29,.2)` | `rgba(249,226,175,.22)` | `--mark-background-color` |

Syntax highlighting derives from Hugo Chroma **catppuccin-latte / catppuccin-mocha** in `assets/css/syntax.css` with CSS `light-dark()`. Preserve hue roles, not inaccessible upstream values: Latte accents are darkened toward black in sRGB, while comments and line numbers use Subtext. All foregrounds must reach **4.5:1** against code, highlighted-line, and diff backgrounds in both themes. The regression test checks the palette; browser checks verify the rendered result. Do not overwrite these adjustments when refreshing Chroma styles.

**Flavors we do not ship:** Frappé, Macchiato. Do not mix flavors across one theme mode.

**Accent budget:** chromatic color is mostly links + syntax + occasional mark. Do not paint headings, cards, or section chrome in Mauve/Pink/Green “for personality.”

## Typography

```text
Sans:  system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI",
       "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei",
       "Noto Sans CJK SC", sans-serif

Mono:  ui-monospace, "SFMono-Regular", "SF Mono", Menlo, Monaco,
       Consolas, "Liberation Mono", monospace
```

| Role | Size | Weight | Notes |
|------|------|--------|-------|
| Site title (`header .site-title`) | `1.5rem` | 650 | Plain text link; stays heading color on hover |
| Article `h1` | `1.75rem` | 650 | Slight negative tracking |
| `h2` | `1.4rem` | 650 | Top margin for section breaks |
| `h3` | `1.15rem` | 650 | |
| Body | `1rem` | 400 | `line-height: 1.75` (reading web, looser than print) |
| Article body | `1.0625rem` | 400 | 17px at the default root size; same 1.75 line-height |
| Code blocks | `1rem` | 400 | Keep code size independent of article prose |
| Meta / footer / list dates | `0.875rem` | 400 | Muted color; dates mono in lists |
| Inline code | `0.875em` | inherit | Padded surface chip |

- Indent: **2 spaces** in Hugo templates, **4 spaces** in CSS.
- Prefer `text-wrap: balance` on headings and `pretty` on paragraphs/lists where supported.
- Do not introduce display serifs or downloaded variable fonts without an explicit request.

Code (`code`, `pre`, `kbd`, `samp`) prepends **JetBrains Mono 2.304** to the system mono and sans/CJK stacks; body, headings, navigation, and list dates remain system fonts. Keep existing sizes and disable ligatures. Four official WOFF2 faces preserve real regular/bold/italic/bold-italic without synthetic styles. They load only when used, with `font-display: swap`, no preload, and no third-party requests. Each face is about 90–96 KiB; a typical highlighted article uses three faces (~276 KiB), cached across pages.

Unmodified files and the SIL OFL 1.1 license live in `static/fonts/jetbrains-mono-2.304/`, from the official [v2.304 release](https://github.com/JetBrains/JetBrainsMono/releases/tag/v2.304) (`fonts/webfonts/` and `OFL.txt`). Keep the versioned URLs and license when updating. Hugo templates `assets/css/fonts.css` URLs with `relURL` so subpath deployments also work. Include font faces only on pages containing code (including inline-only code), preventing speculative font downloads on home, list, and 404 pages.

## Layout shell

```text
[ skip link ]
[ title ]
[ nav: 首页 博客 RSS  (theme) ]
[ main ]
[ footer: Hugo / Bear credit ]
```

- Max width `--width: 42rem`, body padding `20px`.
- Internal links: `.RelPermalink` / `relURL`. Absolute URLs only for canonical, RSS, and social meta.
- Skip link → `#main`. Preserve focus-visible rings using `--link-color`.
- Keep the page's `h1` in main content, not the repeated site name. Section titles are visually hidden but remain available to assistive technology; the active nav entry identifies the section visually.
- Underline the current navigation entry: `aria-current="page"` for an exact match, `location` for the containing blog section.
- The home page relies on the navigation's blog link; do not repeat it in the biography.
- Keep the home introduction playful: the emoji opener and a brief edited ChatGPT exchange with concrete personal details. Social links use short names under “在别处”.

## Components

### Theme toggle

- Cycle **auto → light → dark** (`localStorage` key `color-theme`; auto clears storage).
- Icons: auto `🖥️`, light `🌝`, dark `🌚` (emoji, not an icon font).
- Hidden until `data-theme-ready`; hidden entirely without JS.
- `meta theme-color`: Latte base / Mocha base, swapped via `media`.

### Post list

- Group by publish year (`GroupByDate "2006"`), title on the left and `MM-DD` on the right.
- Make each row one link with 8px block padding (at least 44px tall at default sizes), a 16px column gap, and natural title wrapping. Dates never wrap. Year headings use a 1.5em top margin.
- Keep this an archive: no excerpts, cards, separators, or reading-time labels.
- Visited titles → `--visited-color`.
- Empty: `还没有文章`.
- **Caveat:** a “2024 年终总结” dated January 2025 appears under **2025**.

### Post page

- Title `h1`, muted date (`params.dateFormat`, default `2006-01-02`).
- Enlarge article prose only; navigation, headings, metadata, code blocks, and TOC (`0.9rem`) keep their independent sizes.
- TOC: collapsed `<details class="toc">`, summary `目录`, only if ≥ 3 `h2`/`h3`. Depth from `hugo.toml` (`startLevel = 2`, `endLevel = 3`).
- Tighten `.toc + h2/h3` top margin so posts that open on a heading do not leave a hole.
- Do not control TOC via front matter; heading count is the only switch.

### Tables, quotes, media

- Tables: full width, bottom borders, first/last cell flush to measure; horizontal scroll under ~480px. Inline `text-align` from Markdown wins over default left align.
- Blockquote: 3px surface bar, token text color, **no forced italic** (Bear-quiet, not magazine pull-quote).
- Markdown images: descriptive alt text; page resources render with intrinsic dimensions, lazy loading, and absolute URLs in RSS.
- Use local page resources for images and ordinary links for GitHub repositories, not live third-party image cards. The build checks image URLs against `static/_headers`' CSP.
- Images: `max-width: 100%`, auto height.
- Footnotes: native Hugo markup; do not restyle into cards.

## Interaction & motion

- Default to stillness. No marquee, no scroll-jacking, no parallax.
- Inline links in blog post bodies and footer prose stay underlined; structurally clear links elsewhere underline on hover only.
- Hover affordances only with fine pointers (`hover: hover`).
- Theme toggle respects `prefers-reduced-motion`.
- Expand toggle hit target with a quiet `::before`, not visible padding chrome.

## Reject list

Do not ship these “modern blog” reflexes:

- Pure white/black canvas or non-Catppuccin random pastels
- Gradient text, glassmorphism, glow, blob backgrounds, hero illustrations
- Card grids for posts, colored icon tiles, badge piles
- Sticky glass nav, hamburger menus, reading-progress gimmicks
- Webfont marketing stacks (Inter + fancy display) replacing system UI
- A second accent family “to liven things up”
- Restoring tags/search UI without an explicit product decision
- Editing `public/` or other generated output by hand
- Large inline `<style>` in layouts instead of `assets/css/*`
- Dark-mode colors that only follow OS while `data-theme` is forced (break `color-scheme` + `light-dark()` pairing)

Restraint is **clear hierarchy and quiet surfaces**, not empty margins and thin gray everything.

## Sources of truth

| Surface | Path |
|---------|------|
| Tokens, type, components | `assets/css/style.css` |
| Chroma / fenced code | `assets/css/syntax.css` |
| Markdown images | `layouts/_markup/render-image.html`, `render-image.rss.xml` |
| Theme bootstrap + toggle | `layouts/_partials/theme.html` |
| Shell | `layouts/baseof.html` |
| Post chrome | `layouts/page.html` |
| Year list | `layouts/_partials/post-list.html` |
| TOC depth, mark extension, taxonomies off | `hugo.toml` |

## Verify visually

After layout or CSS changes, check **light and dark**, desktop and ~390px width, on:

1. Home  
2. Blog index (year groups)  
3. One long post (TOC + code)  
4. 404  

## Out of scope

- Frappé / Macchiato flavors  
- Tag taxonomies, client search, comment widgets  
- Design-system packages, CSS-in-JS, component libraries  
- Print/PDF skins (see Kami if you need documents — different product)
