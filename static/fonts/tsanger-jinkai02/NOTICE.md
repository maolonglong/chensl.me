# Tsanger JinKai 02

Copyright belongs to Beijing Tsanger Type Technology Co., Ltd. These fonts are **not** covered by this repository's code license or Kami's MIT license.

The site owner has confirmed personal non-commercial use. The vendor states that its fonts may be downloaded and used free of charge for personal non-commercial purposes. Commercial use requires a separate license; do not assume this site's use grants permission for other uses or redistribution.

- Vendor and licensing: https://tsanger.cn
- Vendor product terms: https://tsanger.cn/product/32
- Source files: https://github.com/tw93/Kami/tree/main/assets/fonts
- Source names: `TsangerJinKai02-W04.ttf`, `TsangerJinKai02-W05.ttf`
- Obtained: 2026-09-12

The original fonts were converted to WOFF2 and split into 128-codepoint Unicode blocks using FontTools. Each weight retains all 29,092 original codepoints across 255 subsets, independent of site content. Names and font copyright metadata are preserved. W04 maps to CSS weight 400 and W05 to 500, following Kami's typography.

To regenerate, download the two original TTF files above into a temporary directory, convert each with `uvx --from 'fonttools[woff]==4.65.0' fonttools ttLib.woff2 compress <font.ttf>`, then run `uv run scripts/subset-fonts.py <temporary-directory>` from the repository root. The script verifies each subset's character mapping and complete coverage against the originals. Only the resulting `subsets/` files are served; FontTools is not a normal site-build dependency.
