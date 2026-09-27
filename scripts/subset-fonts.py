# /// script
# requires-python = ">=3.11"
# dependencies = ["fonttools==4.65.0", "brotli==1.2.0"]
# ///
"""Regenerate the complete JinKai W04 fallback ranges when the source font changes.

Content-specific subsets are generated automatically by src/lib/fonts.mjs.
This maintenance command is not part of the normal Node-only site build.
"""

import io
import sys
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

FACE, WEIGHT = "W04", 400
root = Path(__file__).resolve().parents[1]
source = Path(sys.argv[1])
fonts = root / "src/assets/fonts/tsanger-jinkai02"
blocks_dir = fonts / "subsets"
blocks_dir.mkdir(parents=True, exist_ok=True)


def subset_font(original: bytes, selected: set[int], destination: Path) -> None:
    # Keep the source timestamps so regenerating unchanged ranges produces byte-identical files.
    font = TTFont(io.BytesIO(original), recalcTimestamp=False)
    options = subset.Options()
    options.layout_features = ["*"]
    options.name_IDs = ["*"]
    options.name_legacy = True
    options.name_languages = ["*"]
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(unicodes=selected)
    subsetter.subset(font)
    font.flavor = "woff2"
    font.save(destination)
    actual = set(TTFont(destination).getBestCmap())
    assert actual == selected, f"Coverage mismatch: {destination}"


generated: set[Path] = set()

original = TTFont(source / f"TsangerJinKai02-{FACE}.ttf", recalcTimestamp=False)
codepoints = set(original.getBestCmap())
original.flavor = None
buffer = io.BytesIO()
original.save(buffer)
raw = buffer.getvalue()

covered: set[int] = set()
blocks = sorted({codepoint // 128 for codepoint in codepoints})
for block in blocks:
    start, end = block * 128, block * 128 + 127
    selected = codepoints.intersection(range(start, end + 1))
    path = blocks_dir / f"{WEIGHT}-{start:x}-{end:x}.woff2"
    subset_font(raw, selected, path)
    generated.add(path)
    assert not covered.intersection(selected), f"Overlapping coverage: {path}"
    covered.update(selected)
assert covered == codepoints, f"Incomplete coverage: {FACE}"
print(
    f"{FACE}: {len(blocks)} fallback subsets, all {len(covered)} codepoints preserved",
    flush=True,
)

for stale in set(blocks_dir.glob("*.woff2")) - generated:
    stale.unlink()
