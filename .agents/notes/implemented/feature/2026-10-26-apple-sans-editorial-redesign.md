# Agent Note: Redesign the site around optical-white cool neutrals and system sans-serif

Status: implemented
Date: 2026-10-26
Class: feature

## Context

The earlier editorial redesign used a warm paper palette (`#faf9f5` / `#f0eee6`), an ink-blue accent (`#1b365d`), and a two-font reading stack that paired Source Serif 4 for Latin with Tsanger JinKai W04 for Chinese. In practice, warm paper backgrounds and calligraphy-derived serif web fonts have become an overused cliché across personal blogs, and JinKai required a 38 MB vendor archive, build-time source-text subsetting, and 119 unicode-range slices for runtime D1 text on `/news/`. Because JinKai W04 had only one weight, headings and emphasis had to rely on color or synthetic contrast rather than real typographic weight.

## Decision

Retire the warm paper palette, Tsanger JinKai, Source Serif 4, and the bundled document-typesetting skill completely, and rebuild the visual language around an Apple Machine Learning Research and Human Interface Guidelines aesthetic while preserving the editorial layout structure:

- **Optical-white and cool-neutral palette.** The page canvas is pure optical white (`#ffffff`) in light mode and obsidian carbon (`#0a0a0c`) in dark mode, paired with cool secondary surfaces (`#f5f5f7` / `#161618`), charcoal headings (`#1d1d1f` / `#f5f5f7`), cool neutral body text (`#2c2c2e` / `#d2d2d7`), and optical blue (`#0066cc` / `#2997ff`) reserved strictly for interactive links and controls. Code blocks (`src/lib/markdown.mjs`) and the giscus themes (`src/styles/giscus*.css`) use the same cool palette.
- **System sans-serif reading and chrome type.** `--font-sans` (`SF Pro Text`, `SF Pro SC`, `PingFang SC`, and platform fallbacks) sets both reading text and UI chrome; `--font-mono` (`JetBrains Mono`) sets code. Headings, `.section-label`, `strong`, and table headers use native weight `600`, while compact index and navigation titles (`.entry-title`, `.post-nav-title`) use weight `400` in `--heading-color` at `--size-list` (`0.9375rem`) with `letter-spacing: 0` so CJK strokes remain crisp and un-cramped.
- **Zero reading web fonts on the page.** `src/lib/fonts.mjs` registers only `JetBrains Mono` (`preload={false}`), so a cold visit to a page without `<code>` makes zero font requests (`e2e/page-shell.spec.mjs`). Build-time share cards (`src/lib/og-card.mjs`) subset a static `NotoSansSC-SemiBold.woff2` (`src/assets/fonts/noto-sans-sc/NotoSansSC-SemiBold.woff2`) for each card.
- **Single reading axis and compact index rows.** Header, reading column (`.measure`), and footer share one measure (`--measure`: `42rem`), the home page and archive list articles as compact title-and-date rows separated by whitespace under a single section or year hairline rule rather than multi-line description blocks or per-row borders, the archive groups articles under hanging year columns (`e2e/page-shell.spec.mjs`), and one size ladder (`--size-caption` to `--size-h1`) and spacing scale (`--space-1` to `--space-9`) govern every component (`tests/design.test.mjs`).

## Consequences

The repository drops 38 MB of JinKai TTFs, the Noto Sans SC slice table, `bf0f92c:src/lib/latin-range.mjs`, and the build-time font-slicing pipeline; a single 4.1 MB `NotoSansSC-SemiBold.woff2` in `src/assets/fonts/noto-sans-sc/` serves build-time share cards. Pages render immediately in the platform's native sans-serif with zero layout shift and zero CJK font transfer, including runtime D1 text on `/news/`. This note supersedes the earlier JinKai subsetting, slicing, W04-only, and warm-paper editorial redesign notes.

## Alternatives Considered

**Keep a serif web font (such as Source Serif 4 + Noto Serif SC) on top of the cool-white palette.** It preserves a print-journal contrast between reading text and UI chrome, but CJK serif web fonts still require multi-megabyte slice tables for `/news/` and carry the literary-paper aesthetic the redesign set out to leave behind.

**Download Inter and a CJK sans web font in the browser.** It makes glyph shapes identical across macOS, Windows, and Linux, but Apple platforms already ship `SF Pro` and `PingFang SC`, and downloading CJK sans slices adds network cost without improving native rendering on the primary target platforms.
