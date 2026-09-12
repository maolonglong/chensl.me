# Tsanger JinKai 02

Copyright belongs to Beijing Tsanger Type Technology Co., Ltd. These fonts are **not** covered by this repository's code license or Kami's MIT license.

The site owner has confirmed personal non-commercial use. The vendor states that its fonts may be downloaded and used free of charge for personal non-commercial purposes. Commercial use requires a separate license; do not assume this site's use grants permission for other uses or redistribution.

- Vendor and licensing: https://tsanger.cn
- Vendor product terms: https://tsanger.cn/product/32
- Source files: https://github.com/tw93/Kami/tree/main/assets/fonts
- Source names: `TsangerJinKai02-W04.ttf`, `TsangerJinKai02-W05.ttf`
- Obtained: 2026-09-12

The original fonts were converted to WOFF2 with FontTools and split two ways. `core-400.woff2` and `core-500.woff2` hold the characters this site currently renders, so a cold visit fetches one file per weight. `subsets/` keeps all 29,092 original codepoints per weight across 255 128-codepoint blocks, independent of site content, and loads only for characters newer articles introduce before the next regeneration. Names and font copyright metadata are preserved. W04 maps to CSS weight 400 and W05 to 500, following Kami's typography.

To regenerate, run `just build` so the core subset sees the current site, download the two original TTF files above into a temporary directory, then run `uv run scripts/subset-fonts.py <temporary-directory>` from the repository root. The script verifies each subset's character mapping and complete coverage against the originals, and writes the core's `unicode-range` to `data/serif.json`. Source timestamps are preserved, so unchanged ranges regenerate byte-for-byte and stay out of the diff. The committed `subsets/` files predate that fix and still carry a build timestamp in their `head` table; their glyph data already matches, so the next full regeneration rewrites all 510 once and every run after that is clean. FontTools is not a normal site-build dependency.
