# Copyright 2026 9467-8711 Québec inc. (Service conseils Factero)
# SPDX-License-Identifier: Apache-2.0
"""Identify the weight (and true italic vs slanted roman) of outlined letters.

Usage:
    python identify_weight.py reference.svg --letters "JANEDOE" [--indices 0-6]
                              [--style roman|italic] [--iou] [--font path.ttf]

- reference.svg: SVG whose <path> elements are letters in order (Illustrator outlines,
  or svg_pieces.py output without --rows). --indices selects a range of paths
  (0-6 = the first seven; default: as many as letters, starting at 0).
- Compares each letter with the font (bundled Epilogue roman/italic, or --font) at
  weights 100-900 in steps of 50, using the area ratio after scaling to the letter's
  height (independent of position and point size). The right weight gives a ratio of
  about 1.000 on every letter.
- Both sides are cleaned first (union): a variable-font glyph counts its overlaps twice
  and would skew the ratios.
- --iou: for the best weight, overlap (IoU) of each letter with the font and, for
  italic, with the roman slanted at the best angle. A clearly lower score for the
  slanted roman (e.g. 0.984 vs 0.997) means a drawn italic.

Reference result: a 15-letter name outlined in an Illustrator export matched Epilogue
Black 900 with a ratio of 0.999 on all 15 letters; "YOUR" in Epilogue Italic 900 scored
IoU 0.997-0.998 against 0.984-0.994 for a slanted roman.
"""
import math
import os
import re
import sys
import xml.etree.ElementTree as ET

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fontTools.pens.areaPen import AreaPen  # noqa: E402
from fontTools.pens.basePen import BasePen  # noqa: E402
from fontTools.pens.boundsPen import BoundsPen  # noqa: E402
from fontTools.svgLib.path import parse_path  # noqa: E402
from vector_common import NS, ExplicitPen, clean, font  # noqa: E402


class Flat(BasePen):
    def __init__(self, gs=None):
        super().__init__(gs)
        self.polys, self.cur = [], []

    def _moveTo(self, p):
        self.cur = [p]

    def _lineTo(self, p):
        self.cur.append(p)

    def _curveToOne(self, a, b, c):
        p0 = self.cur[-1]
        for i in range(1, 17):
            t = i / 16
            u = 1 - t
            self.cur.append((u ** 3 * p0[0] + 3 * u * u * t * a[0] + 3 * u * t * t * b[0] + t ** 3 * c[0],
                             u ** 3 * p0[1] + 3 * u * u * t * a[1] + 3 * u * t * t * b[1] + t ** 3 * c[1]))

    def _qCurveToOne(self, a, b):
        p0 = self.cur[-1]
        for i in range(1, 13):
            t = i / 12
            u = 1 - t
            self.cur.append((u * u * p0[0] + 2 * u * t * a[0] + t * t * b[0], u * u * p0[1] + 2 * u * t * a[1] + t * t * b[1]))

    def _closePath(self):
        self.polys.append(self.cur)
        self.cur = []

    _endPath = _closePath


def raster(polys, box, R=360):
    from PIL import Image, ImageDraw
    x0, y0, x1, y1 = box
    sc = R / max(x1 - x0, y1 - y0)
    im = Image.new("L", (R + 8, R + 8), 0)
    for p in polys:  # even-odd via XOR
        m = Image.new("L", im.size, 0)
        ImageDraw.Draw(m).polygon([((x - x0) * sc + 4, (y - y0) * sc + 4) for x, y in p], fill=255)
        im = Image.frombytes("L", im.size, bytes(a ^ b for a, b in zip(im.tobytes(), m.tobytes())))
    return im


def iou(a, b):
    A, B = a.tobytes(), b.tobytes()
    inter = sum(1 for x, y in zip(A, B) if x > 127 and y > 127)
    uni = sum(1 for x, y in zip(A, B) if x > 127 or y > 127)
    return inter / uni if uni else 0


def box_of(polys):
    xs = [x for p in polys for x, _ in p]
    ys = [y for p in polys for _, y in p]
    return min(xs), min(ys), max(xs), max(ys)


def glyph(style, wght, ch):
    """CLEANED glyph outline (y up, font units)."""
    static, gs, _ = font(style, wght)
    name = static.getBestCmap()[ord(ch)]
    pen = ExplicitPen(gs)
    gs[name].draw(pen)
    return clean(pen.d())


def opt(name, default=None):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default


def main():
    letters = opt("--letters")
    if not letters or len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    src = sys.argv[1]
    style = opt("--font") or ("italic" if (opt("--style", "roman")).startswith("ital") else "roman")
    paths = [p.get("d") for p in ET.parse(src).getroot().iter("{" + NS + "}path")]
    if opt("--indices"):
        a, b = map(int, opt("--indices").split("-"))
        paths = paths[a:b + 1]
    paths = paths[:len(letters)]
    ref = []
    for ch, d in zip(letters, paths):
        d = clean(d)
        ap, bp = AreaPen(None), BoundsPen(None)
        parse_path(d, ap)
        parse_path(d, bp)
        x0, y0, x1, y1 = bp.bounds
        ref.append((ch, abs(ap.value), x1 - x0, y1 - y0, d))
    results = []
    for w in range(100, 901, 50):
        err, ratios = 0, []
        for ch, area, width, height, _ in ref:
            gd = glyph(style, w, ch)
            ap, bp = AreaPen(None), BoundsPen(None)
            parse_path(gd, ap)
            parse_path(gd, bp)
            gx0, gy0, gx1, gy1 = bp.bounds
            s = height / (gy1 - gy0)
            r = abs(ap.value) * s * s / area
            ratios.append(r)
            err += (r - 1) ** 2 + (((gx1 - gx0) * s) / width - 1) ** 2
        results.append((err, w, ratios))
        print(f"weight {w:3d}  error {err:8.4f}  area ratios {' '.join(f'{r:.3f}' for r in ratios)}")
    _, best, _ = min(results)
    print(f"\n=> best {style} weight: {best}")
    if "--iou" in sys.argv:
        for ch, _, _, _, d in ref:
            fl = Flat()
            parse_path(d, fl)
            A = fl.polys
            ba = box_of(A)
            pl = Flat()
            parse_path(glyph(style, best, ch), pl)
            B = [[(x, -y) for x, y in p] for p in pl.polys]
            bb = box_of(B)
            s = (ba[3] - ba[1]) / (bb[3] - bb[1])
            fit = [[((x - bb[0]) * s + ba[0], (y - bb[1]) * s + ba[1]) for x, y in p] for p in B]
            bx = (min(ba[0], box_of(fit)[0]), ba[1], max(ba[2], box_of(fit)[2]), ba[3])
            line = f"{ch}: IoU font {iou(raster(A, bx), raster(fit, bx)):.4f}"
            if style == "italic":
                plR = Flat()
                parse_path(glyph("roman", best, ch), plR)
                U = [[(x, -y) for x, y in p] for p in plR.polys]
                best_slant = (0, 0)
                for deg10 in range(60, 181, 5):
                    t = math.tan(math.radians(deg10 / 10))
                    sh = [[(x - y * t, y) for x, y in p] for p in U]
                    bs = box_of(sh)
                    s2 = (ba[3] - ba[1]) / (bs[3] - bs[1])
                    f2 = [[((x - bs[0]) * s2 + ba[0], (y - bs[1]) * s2 + ba[1]) for x, y in p] for p in sh]
                    b2 = (min(ba[0], box_of(f2)[0]), ba[1], max(ba[2], box_of(f2)[2]), ba[3])
                    v = iou(raster(A, b2), raster(f2, b2))
                    if v > best_slant[0]:
                        best_slant = (v, deg10 / 10)
                line += f" | slanted roman: {best_slant[0]:.4f} at {best_slant[1]:.1f} deg"
            print(line)


if __name__ == "__main__":
    main()
