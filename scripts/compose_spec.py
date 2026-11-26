# Copyright 2026 9467-8711 Québec inc. (Service conseils Factero)
# SPDX-License-Identifier: Apache-2.0
"""Compose text lines into vector outlines, one <path> per glyph.

Usage:
    python compose_spec.py spec.json out.svg [--raw]

spec.json: a list of lines, for example
    [
      {"text": "Managing Partner", "style": "roman",  "wght": 300, "size": 7},
      {"text": "YOUR DECISION.",   "style": "italic", "wght": 900, "size": 14},
      {"text": "Other font",       "font": "C:/path/font.ttf", "wght": 400, "size": 9}
    ]
  style: "roman" or "italic" (Epilogue bundled in assets/fonts); "font" forces a file.
  tracking_em (optional): fixed tracking in em added after each glyph.

Each line has its baseline at y = 0 and starts at x = 0; size, position, tracking and
per-glyph nudges are fitted later in the page (vp_toolkit.js).
Attributes: data-line (line number), data-i (HarfBuzz index, spaces included),
data-glyph (glyph name). Each glyph is CLEANED by default (union, no overlaps), which
Vistaprint needs because it fills with the even-odd rule. --raw keeps raw contours.
All paths are written with explicit M/L/C/Z commands.
"""
import json
import os
import sys
import xml.etree.ElementTree as ET

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from vector_common import NS, compose_line  # noqa: E402


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    raw = "--raw" in sys.argv
    if len(args) != 2:
        print(__doc__)
        sys.exit(2)
    spec_path, out = args
    with open(spec_path, encoding="utf-8") as fh:
        lines = json.load(fh)
    ET.register_namespace("", NS)
    root = ET.Element(f"{{{NS}}}svg", viewBox="0 0 259.92 151.92")
    for li, sp in enumerate(lines):
        style = sp.get("font") or sp.get("style", "roman")
        glyphs = compose_line(sp["text"], style, sp.get("wght", 300), sp.get("size", 7),
                              sp.get("tracking_em", 0.0), net=not raw)
        for g in glyphs:
            if g["d"]:
                ET.SubElement(root, f"{{{NS}}}path", {
                    "data-line": str(li), "data-i": str(g["i"]), "data-glyph": g["name"], "d": g["d"]})
        end = glyphs[-1]["x"] + glyphs[-1]["advance"] if glyphs else 0
        print(f"line {li} ({sp.get('style', 'roman')} {sp.get('wght', 300)}, {sp.get('size', 7)} pt)"
              f" advance={end:.3f} pt: {' '.join(g['name'] for g in glyphs)}")
    ET.ElementTree(root).write(out, encoding="utf-8", xml_declaration=True)
    print("wrote", out, "(raw contours)" if raw else "(clean glyphs)")


if __name__ == "__main__":
    main()
