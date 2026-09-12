# /// script
# requires-python = ">=3.11"
# dependencies = ["fonttools==4.65.0", "brotli==1.2.0"]
# ///
"""Split original JinKai W04/W05 fonts into complete, content-independent ranges."""

import io
import sys
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

source = Path(sys.argv[1])
output = Path(__file__).resolve().parents[1] / "static/fonts/tsanger-jinkai02/subsets"
output.mkdir(parents=True, exist_ok=True)
generated = set()

for face, weight in [("W04", 400), ("W05", 500)]:
    original = TTFont(source / f"TsangerJinKai02-{face}.woff2")
    codepoints = set(original.getBestCmap())
    original.flavor = None
    buffer = io.BytesIO()
    original.save(buffer)
    covered = set()
    blocks = sorted({cp // 128 for cp in codepoints})
    for block in blocks:
        start, end = block * 128, block * 128 + 127
        selected = codepoints.intersection(range(start, end + 1))
        font = TTFont(io.BytesIO(buffer.getvalue()))
        options = subset.Options()
        options.layout_features = ["*"]
        options.name_IDs = ["*"]
        options.name_legacy = True
        options.name_languages = ["*"]
        subsetter = subset.Subsetter(options=options)
        subsetter.populate(unicodes=selected)
        subsetter.subset(font)
        font.flavor = "woff2"
        path = output / f"{weight}-{start:x}-{end:x}.woff2"
        font.save(path)
        generated.add(path)
        actual = set(TTFont(path).getBestCmap())
        assert actual == selected, f"Coverage mismatch: {path}"
        assert not covered.intersection(actual), f"Overlapping coverage: {path}"
        covered.update(actual)
    assert covered == codepoints, f"Incomplete coverage: {face}"
    print(f"{face}: {len(blocks)} subsets, all {len(covered)} codepoints preserved", flush=True)

for stale in set(output.glob("*.woff2")) - generated:
    stale.unlink()
