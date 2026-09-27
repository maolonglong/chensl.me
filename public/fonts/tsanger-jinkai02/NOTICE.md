# Tsanger JinKai 02

Copyright belongs to Beijing Tsanger Type Technology Co., Ltd. These fonts are **not** covered by this repository's code license or Kami's MIT license.

The site owner has confirmed personal non-commercial use. The vendor states that its fonts may be downloaded and used free of charge for personal non-commercial purposes. Commercial use requires a separate license; do not assume this site's use grants permission for other uses or redistribution.

- Vendor and licensing: https://tsanger.cn
- Vendor product terms: https://tsanger.cn/product/32
- Source files: https://github.com/tw93/Kami/tree/main/assets/fonts
- Source names: `TsangerJinKai02-W04.ttf`, `TsangerJinKai02-W05.ttf`
- Obtained: 2026-09-12

The original TTF files from Kami are archived in this public repository under `vendor/fonts/tsanger-jinkai02/` to regenerate the fonts used by this personal, non-commercial site. Their inclusion does not change the vendor's licensing terms. The archived files match the upstream Git blobs and have these SHA-256 digests:

- `TsangerJinKai02-W04.ttf`: `47a9b416c27ad5436794c880ce3f666a3135a862ed1e2c91aa7db48914a6a487`
- `TsangerJinKai02-W05.ttf`: `9744dc96801ec8c91a3390bed24c993d4722fb406e1d879177d343d40e985a6e`

Only W04 is served on the web, following Kami's rule that W05 is for PDF output. `src/lib/fonts.mjs` declares it for weights 400-500 through Astro's local Fonts API, so headings and bold text reuse the regular glyphs instead of fetching a second weight or synthesizing bold. All faces use `font-display: swap`, without preloads.

At build time and dev-server startup, `subset-font` (HarfBuzz/WASM) generates WOFF2 subsets under `.astro/site-fonts/` from source text, including decoded HTML entities. The common subset covers page templates and shared UI; the article subset covers remaining blog characters. They have disjoint Unicode ranges and are declared after the full fallback ranges so they take precedence. The home page needs only the common subset. The build retains source name IDs, including copyright metadata; regression checks verify character coverage and deterministic output. Astro fingerprints the resulting files under `/_astro/fonts/`.

`src/assets/fonts/tsanger-jinkai02/subsets/` keeps all 29,092 original codepoints across 255 128-codepoint blocks, independent of site content. These unchanged FontTools-generated fallbacks cover characters outside the optimized subsets, including newly edited text before restarting the dev server. Normal builds need only Node.js.

Only when updating the source font, regenerate the complete fallback ranges with `uv run scripts/subset-fonts.py vendor/fonts/tsanger-jinkai02` from the repository root. The script verifies each subset's character mapping and complete coverage. Source timestamps, names, and copyright metadata are preserved. The committed fallback files predate timestamp preservation, so the next full regeneration rewrites all 255 once; subsequent unchanged runs are byte-identical. No preceding site build or manual content-subset regeneration is needed.
