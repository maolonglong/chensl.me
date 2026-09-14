# Tsanger JinKai 02

Copyright belongs to Beijing Tsanger Type Technology Co., Ltd. These fonts are **not** covered by this repository's code license or Kami's MIT license.

The site owner has confirmed personal non-commercial use. The vendor states that its fonts may be downloaded and used free of charge for personal non-commercial purposes. Commercial use requires a separate license; do not assume this site's use grants permission for other uses or redistribution.

- Vendor and licensing: https://tsanger.cn
- Vendor product terms: https://tsanger.cn/product/32
- Source files: https://github.com/tw93/Kami/tree/main/assets/fonts
- Source names: `TsangerJinKai02-W04.ttf`, `TsangerJinKai02-W05.ttf`
- Obtained: 2026-09-12

The original TTF files are archived under `vendor/fonts/tsanger-jinkai02/`. This repository is private; remove those files before making the repository public because the vendor's personal-use terms do not grant public redistribution rights. The archived files match the upstream Git blobs and have these SHA-256 digests:

- `TsangerJinKai02-W04.ttf`: `47a9b416c27ad5436794c880ce3f666a3135a862ed1e2c91aa7db48914a6a487`
- `TsangerJinKai02-W05.ttf`: `9744dc96801ec8c91a3390bed24c993d4722fb406e1d879177d343d40e985a6e`

The original fonts were converted to WOFF2 with FontTools and split two ways. `core-400.woff2` and `core-500.woff2` hold the characters this site currently renders, so a cold visit fetches one file per weight. `subsets/` keeps all 29,092 original codepoints per weight across 255 128-codepoint blocks, independent of site content, and loads only for characters newer articles introduce before the next regeneration. Names and font copyright metadata are preserved. W04 maps to CSS weight 400 and W05 to 500, following Kami's typography.

To regenerate, run `just build` so the core subset sees the current site, then run `uv run scripts/subset-fonts.py vendor/fonts/tsanger-jinkai02` from the repository root. The script verifies each subset's character mapping and complete coverage against the originals, and writes the core's `unicode-range` to `data/serif.json`. Source timestamps are preserved, so unchanged ranges regenerate byte-for-byte and stay out of the diff. The committed `subsets/` files predate that fix and still carry a build timestamp in their `head` table; their glyph data already matches, so the next full regeneration rewrites all 510 once and every run after that is clean. FontTools is not a normal site-build dependency.
