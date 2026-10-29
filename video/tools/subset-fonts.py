"""Rebuild video/assets/fonts/ with only the glyphs the video uses.

Run it after changing any text in video/src/:

    npm pack lxgw-wenkai-webfont && tar xzf lxgw-wenkai-webfont-*.tgz
    pip install fonttools brotli
    python3 video/tools/subset-fonts.py package/

The npm package ships each face as ~100 unicode-range chunks; this picks the chunks
that cover the video's characters, merges them and subsets the result.
"""

import re
import sys
from pathlib import Path

from fontTools import subset
from fontTools.merge import Merger
from fontTools.ttLib import TTFont

VIDEO = Path(__file__).resolve().parent.parent
OUT = VIDEO / "assets" / "fonts"
FACES = {
    "LXGWWenKai-Regular": "lxgwwenkai-regular.css",
    "LXGWWenKai-Bold": "lxgwwenkai-bold.css",
    "LXGWWenKaiMono-Regular": "lxgwwenkaimono-regular.css",
}


def video_chars():
    text = "".join(p.read_text("utf-8") for p in sorted((VIDEO / "src").glob("*.js")))
    chars = {c for c in text if ord(c) > 0x7E} | {chr(c) for c in range(0x20, 0x7F)}
    return {ord(c) for c in chars if c.isprintable()}


def chunks(css):
    """Yield (woff2 path, set of code points) for each @font-face block."""
    for block in re.findall(r"@font-face\s*{(.*?)}", css.read_text("utf-8"), re.S):
        url = re.search(r"url\('\./(.*?)'\)", block).group(1)
        points = set()
        for lo, hi in re.findall(r"U\+([0-9a-f]+)(?:-([0-9a-f]+))?", block, re.I):
            points.update(range(int(lo, 16), int(hi or lo, 16) + 1))
        yield css.parent / url, points


def build(pkg, name, css, wanted):
    files, covered = [], set()
    for path, points in chunks(pkg / css):
        if points & wanted:
            files.append(path)
            covered |= points & wanted
    tmp = []
    for i, path in enumerate(files):
        font = TTFont(path)
        font.flavor = None
        out = OUT / f".tmp-{i}.ttf"
        font.save(out)
        tmp.append(str(out))
    merged = Merger().merge(tmp) if len(tmp) > 1 else TTFont(tmp[0])
    for f in tmp:
        Path(f).unlink()
    options = subset.Options()
    options.flavor = "woff2"
    options.layout_features = ["*"]
    sub = subset.Subsetter(options)
    sub.populate(unicodes=wanted & covered)
    sub.subset(merged)
    target = OUT / f"{name}.woff2"
    merged.flavor = "woff2"
    merged.save(target)
    return target, wanted - covered


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    pkg = Path(sys.argv[1])
    wanted = video_chars()
    OUT.mkdir(parents=True, exist_ok=True)
    for name, css in FACES.items():
        target, missing = build(pkg, name, css, wanted)
        note = f", missing: {''.join(sorted(map(chr, missing)))}" if missing else ""
        print(f"{target.relative_to(VIDEO)}: {target.stat().st_size // 1024} KB{note}")


if __name__ == "__main__":
    main()
