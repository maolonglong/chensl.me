# /// script
# requires-python = ">=3.11"
# dependencies = ["fonttools==4.65.0", "brotli==1.2.0"]
# ///
"""Build the JinKai W04 web font: a core subset for this site plus complete fallback ranges.

The core subset holds every character the built site renders, so a cold visit downloads one
file per weight instead of dozens of blocks. The 128-codepoint blocks stay as a complete
fallback for characters newer articles introduce before the next regeneration; `serif.css`
declares them first so the narrower core wins wherever it applies. W05 stays out of the web
build: `serif.css` declares W04 for weights 400-500.
"""

import html
import io
import json
import re
import sys
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

FACE, WEIGHT = "W04", 400
root = Path(__file__).resolve().parents[1]
source = Path(sys.argv[1])
fonts = root / "static/fonts/tsanger-jinkai02"
blocks_dir = fonts / "subsets"
blocks_dir.mkdir(parents=True, exist_ok=True)


def site_codepoints() -> set[int]:
    """Characters the built site renders, taken from Hugo's output rather than the sources."""
    public = root / "public"
    pages = sorted(public.rglob("*.html")) + sorted(public.rglob("*.xml"))
    if not pages:
        sys.exit("No built site found. Run `just build` before regenerating fonts.")
    codepoints: set[int] = set()
    for page in pages:
        markup = re.sub(r"<(script|style)\b.*?</\1>", "", page.read_text("utf8"), flags=re.S)
        codepoints |= {ord(character) for character in html.unescape(re.sub(r"<[^>]+>", " ", markup))}
    return codepoints


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


def css_ranges(codepoints: set[int]) -> str:
    """Collapse codepoints into the shortest equivalent CSS `unicode-range` value."""
    ranges: list[str] = []
    ordered = sorted(codepoints)
    start = previous = ordered[0]
    for codepoint in ordered[1:] + [-1]:
        if codepoint == previous + 1:
            previous = codepoint
            continue
        ranges.append(f"U+{start:x}" if start == previous else f"U+{start:x}-{previous:x}")
        start = previous = codepoint
    return ", ".join(ranges)


corpus = site_codepoints()
generated: set[Path] = set()

original = TTFont(source / f"TsangerJinKai02-{FACE}.ttf", recalcTimestamp=False)
codepoints = set(original.getBestCmap())
original.flavor = None
buffer = io.BytesIO()
original.save(buffer)
raw = buffer.getvalue()

core = corpus & codepoints
assert core, "Empty core subset"
core_path = fonts / f"core-{WEIGHT}.woff2"
subset_font(raw, core, core_path)
generated.add(core_path)

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
    f"{FACE}: core {len(core)} glyphs / {core_path.stat().st_size / 1024:.0f} KiB, "
    f"{len(blocks)} fallback subsets, all {len(covered)} codepoints preserved",
    flush=True,
)

manifest = root / "data/serif.json"
manifest.parent.mkdir(exist_ok=True)
manifest.write_text(
    json.dumps(
        {"coreGlyphs": len(core), "coreRanges": css_ranges(core)},
        indent=2,
        ensure_ascii=True,
    )
    + "\n",
    "utf8",
)

for stale in (set(blocks_dir.glob("*.woff2")) | set(fonts.glob("core-*.woff2"))) - generated:
    stale.unlink()
