# Design

**Warm paper, ink-blue links, and Tsanger JinKai typography: a personal book for the screen.**

## Direction

[Kami](https://github.com/tw93/Kami) is the visual foundation, not merely a documentation reference. The owner chose its paper-like direction over the former Bear/Catppuccin theme. Keep Hugo, URLs, content, SEO, RSS, and static deployment; do not preserve the previous palette or system-ui typography.

The home page is a personal title page, the blog index a quiet year-grouped contents list, and articles a single reading column. This is not a product landing page: no pricing, feature cards, invented testimonials, or marketing copy.

## Invariants

1. Use warm parchment in light mode and warm charcoal in dark mode; no pure white/black canvas or cool-gray surfaces.
2. Ink blue is the only chromatic accent. Dark-mode links use a lighter blue for contrast, not the daytime blue on black.
3. Body and headings use the same Chinese serif family, TsangerJinKai02. Body weight is 400; headings and strong emphasis are 500, not synthetic bold.
4. Hierarchy comes from type, space, alignment, and wording. No decorative side bars, gradients, shadows, card grids, or hero artwork.
5. Preserve readable code in JetBrains Mono. Syntax uses ink blue for keywords/functions and neutral text for other tokens. Diff blocks carry meaning through the `+`/`-` signs already present in the source, not through colour, fills, or strikethrough.
6. The reading measure is `42rem`; the masthead may span `52rem`. No sticky navigation or article sidebars.
7. Theme modes remain `auto` → `light` → `dark`. Auto has no `data-theme` and follows the OS. Set `color-scheme` for forced modes; all palette pairs use CSS `light-dark()`.
8. Body links remain visibly identifiable, with underlines in articles and footer. Keep `aria-current`, labels, keyboard focus, and the skip link.
9. Load fonts from this site's own origin, use `font-display: swap`, and keep readable fallbacks. Do not add a runtime font CDN or framework.
10. Use screen reading metrics rather than copying print point sizes or page-density targets. Never shrink code to fit a narrow viewport; let its container scroll.

## Tokens

The source of truth is `assets/css/style.css`. New rules use semantic variables, not independent hex values.

| Role | Light | Dark | Variable |
|---|---|---|---|
| Canvas | `#f5f4ed` | `#141413` | `--background-color` |
| Headings | `#141413` | `#faf9f5` | `--heading-color` |
| Body | `#3d3d3a` | `#d4d3cd` | `--text-color` |
| Metadata | `#6b6a64` | `#b0aea5` | `--muted-color` |
| Links | `#1b365d` | `#94b4d4` | `--link-color` |
| Link hover | `#2d5a8a` | `#bfd2e5` | `--link-hover-color` |
| Visited archive entry | `#4a5d78` | `#7e93a8` | `--visited-color` |
| Code surface | `#f0eee6` | `#252523` | `--code-background-color` |
| Code text | `#3d3d3a` | `#d4d3cd` | `--code-color` |
| Quotes | `#504e49` | `#b0aea5` | `--blockquote-color` |
| Rules / marks | `#e8e6dc` | `#3d3d3a` | `--border-color`, `--mark-background-color` |
| Selection | `#dce3eb` | `#354354` | `--selection-color` |

Syntax colors live in `assets/css/syntax.css`, using the same warm palette. Text must reach 4.5:1 against code, highlighted-line, and diff backgrounds in both themes. Comments use darker warm gray in light mode so they remain readable on highlighted lines.

## Typography and fonts

| Role | Size | Weight | Line height |
|---|---|---|---|
| Site title | `1.5rem` | 500 | 1.3 |
| Home title | `1.75rem`–`2.5rem` | 500 | 1.3 |
| Article title | `1.75rem`–`2.25rem` | 500 | 1.3 |
| H2 / H3 | `1.5rem` / `1.15rem` | 500 | 1.3 |
| Body | `1.0625rem` | 400 | 1.85 |
| Article body | `1.125rem`, `1.0625rem` at ≤600px | 400 | 1.85 |
| Code blocks | `0.9375rem` | 400 | 1.65 |
| Metadata / nav / footer | `0.875rem` | 400 | inherited |

Headings use balanced wrapping; paragraphs and lists use `text-wrap: pretty`. Do not force justification, broad CJK tracking, or single-line titles on narrow screens.

`assets/css/serif.css` declares self-hosted TsangerJinKai02 W04 (400) and W05 (500) in two layers:

- **Core subset**, `core-400.woff2` and `core-500.woff2`, roughly 255 KiB each. It holds every character the built site renders, so a cold visit downloads one file per weight and every later page reuses them from cache.
- **Fallback blocks**, 255 WOFF2 subsets per weight under `subsets/`, preserving all 29,092 original codepoints in 128-codepoint Unicode ranges.

The blocks are declared first and the core last. Overlapping `unicode-range` declarations resolve in reverse source order, so the core wins wherever it applies and a block loads only for a character introduced since the last regeneration. Coverage therefore never depends on current articles, while the common path stays one request per weight. Splitting by codepoint alone would cost several megabytes per page, because codepoint order is unrelated to which characters an article actually uses.

The shared stylesheet is fingerprinted and linked rather than repeated inline, so all pages share one cached copy. The owner confirmed personal non-commercial use. These fonts are not covered by the repository's code license; see [font usage, provenance, and regeneration](../static/fonts/tsanger-jinkai02/NOTICE.md). Commercial reuse requires authorization from the font vendor.

JinKai carries its own Latin glyphs, so Latin text, digits, and punctuation render in JinKai's rounded Latin rather than a Latin serif. This follows Kami's Chinese stack and keeps mixed CN/EN lines in one family. Putting `Charter, Georgia` ahead of JinKai would give Latin a true serif at the cost of two families per line and platform-dependent results; that is a deliberate open choice, not an oversight. Remaining fallbacks are Noto Serif SC, Source Han Serif SC, Songti SC, STSong, Charter, Georgia, and generic serif. They are not downloaded.

Code keeps self-hosted JetBrains Mono 2.304, with system mono and CJK serif fallback and ligatures disabled. Its four original faces and OFL license remain under `static/fonts/jetbrains-mono-2.304/`. Code font declarations are included only on pages containing code, including inline-only code.

All font URLs use Hugo `relURL`, including subpath deployments. No preloads: show fallback text while fonts arrive. `just check` models the cold-visit transfer for representative pages and fails above 640 KiB; do not add more weights casually, and regenerate the core when that budget starts climbing.

## Pages and components

- **Masthead:** site name left, plain navigation and a monochrome theme symbol right. It is wider than the article on desktop and keeps modest side padding on narrow screens. Both header and navigation wrap when needed, including at 200% text size; never clip or hide controls to fit.
- **Home:** center the existing greeting and introductory sentence; keep the personal dialogue and social section left aligned. Preserve the author's words and emojis. Horizontal rules in the source become whitespace, not ornaments.
- **Archive:** year heading, title left, `MM-DD` right. Whole-row links have 8px block padding and natural title wrapping; dates never wrap. Visited entries recede to `--visited-color`, a quieter ink rather than a second hue, so a long list stays scannable. No excerpts, cards, tags, or reading-time labels. Empty state remains `还没有文章`.
- **Articles:** title, date, optional collapsed native TOC, then content. TOC appears only with at least three H2/H3 headings; depth comes from `hugo.toml`, not front matter.
- **Tables:** neutral bottom rules, 10px vertical cell padding, no colored headers or vertical grid. Respect Markdown alignment. Tables scroll at ≤480px; inspect wide tables on both sides of that breakpoint.
- **Quotes:** indentation, warm secondary text, and breathing room; no side border or forced italic.
- **Alerts:** GitHub-style `[!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, and `[!CAUTION]` blockquotes render as labeled, quiet filled callouts. Keep all five within the warm neutral palette; labels, not additional accent colors, convey the type.
- **Media:** preserve descriptive alt text, intrinsic dimensions, lazy loading, and absolute RSS image URLs. Images stay within the reading column. No third-party image cards.
- **Footer:** quiet Hugo/Kami credit. No decorative rule or additional navigation.
- **404:** retain the existing message and return-home link, with the shared typography and theme.

The toggle uses inline SVG half-circle (auto), sun (light), and moon (dark) icons on a shared `24 × 24` viewBox, rendered at `20 × 20` with a 1.5-unit stroke. A fixed 24px grid-centered button and 44px hit area keep placement independent of font metrics. CSS selects the icon using `data-theme-mode`; the SVG is hidden from assistive technology and the button's accessible label announces current and next modes. Do not replace these icons with font glyphs or add an icon library. The toggle stays hidden until initialized and disappears without JavaScript. Storage failures must not prevent switching on the current page. Theme-color metadata matches the canvas. Hover rules remain under `(hover: hover)` and reduced motion disables the small active transition.

## Ownership

| Surface | File |
|---|---|
| Tokens, type, components | `assets/css/style.css` |
| Body font declarations | `assets/css/serif.css`, `data/serif.json` |
| Font generation | `scripts/subset-fonts.py` |
| Code font declarations / syntax | `assets/css/fonts.css`, `assets/css/syntax.css` |
| Shell, home class, font loading | `layouts/baseof.html` |
| Theme bootstrap and toggle | `layouts/_partials/theme.html` |
| Article chrome / archive rows | `layouts/page.html`, `layouts/_partials/post-list.html` |
| Markdown images / RSS images | `layouts/_markup/render-image.html`, `render-image.rss.xml` |

## Verification

Run `just check` after output changes. It includes the production build, site validation, palette contrast checks, font URL checks under a subpath, and the cold-visit font transfer budget. Do not edit generated output.

With the preview running, run `node scripts/check-browser.mjs <preview-url>` (requires `agent-browser`). It confirms in a real browser what `just check` models statically, and checks header bounds at 320, 390, 768, and 1280px with 100% and 200% root text sizes.

Regenerate the fonts when new articles push the transfer budget up. Run `just build` first so the core subset sees the current corpus, then follow [NOTICE.md](../static/fonts/tsanger-jinkai02/NOTICE.md). Output is byte-stable, so unchanged ranges produce no diff.

Inspect browser screenshots in light and dark at 1280px and 390px on home, archive, a long article with code and TOC, and 404. Also inspect 320px, 768px, and both sides of the 480px and 600px breakpoints for affected tables and navigation. Capture at 2× and await `document.fonts.ready`; confirm actual rendered CJK font use, not just the CSS family declaration.

Check TOC open/closed, code horizontal scrolling, long titles, tables, quotes, focus-visible, theme cycling and persistence, forced theme opposite the OS, and OS changes in auto mode. Ensure no page-level horizontal overflow. Screenshots from viewport resizing are Chromium responsive checks, not real phone testing.

## Out of scope

Framework migrations, client search, comments, taxonomies, print/PDF skins, new routes, and product-page components. They require a separate request.
