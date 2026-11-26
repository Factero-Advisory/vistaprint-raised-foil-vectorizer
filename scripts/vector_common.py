# Copyright 2026 9467-8711 Québec inc. (Service conseils Factero)
# SPDX-License-Identifier: Apache-2.0
"""Shared helpers: explicit SVG paths, overlap-free union, text composition.

Two traps are fixed here once and for all (see references/pitfalls.md):

1. Paths written by fontTools' SVGPathPen contain IMPLICIT line segments after an M
   ("M x y x2 y2 ..."). A naive reader takes the extra pairs for new M commands and
   loses the first segment of the contour: clipped letters (A, P, 4...). ExplicitPen
   always writes absolute M, L, C, Z commands.
2. Vistaprint fills shapes with the even-odd rule. Overlapping contours (variable
   fonts, Illustrator outlines) become holes there. clean() performs a boolean union
   with skia-pathops so that nonzero == even-odd.

Requirements: pip install fonttools uharfbuzz skia-pathops
"""
from __future__ import annotations

import os
import re

from fontTools.pens.basePen import BasePen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.transformPen import TransformPen
from fontTools.svgLib.path import parse_path

HERE = os.path.dirname(os.path.abspath(__file__))
FONTS = os.path.normpath(os.path.join(HERE, "..", "assets", "fonts"))
STYLES = {
    "roman": os.path.join(FONTS, "Epilogue-VF.ttf"),
    "italic": os.path.join(FONTS, "Epilogue-Italic-VF.ttf"),
}
NS = "http://www.w3.org/2000/svg"


def _f(v: float) -> str:
    s = f"{v:.5f}".rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s


class ExplicitPen(BasePen):
    """Writes an absolute SVG path with one command letter per segment (M L C Z)."""

    def __init__(self, glyphSet=None):
        super().__init__(glyphSet)
        self.parts: list[str] = []

    def _moveTo(self, p):
        self.parts.append(f"M{_f(p[0])} {_f(p[1])}")

    def _lineTo(self, p):
        self.parts.append(f"L{_f(p[0])} {_f(p[1])}")

    def _curveToOne(self, a, b, c):
        self.parts.append(f"C{_f(a[0])} {_f(a[1])} {_f(b[0])} {_f(b[1])} {_f(c[0])} {_f(c[1])}")

    def _qCurveToOne(self, a, b):
        # exact quadratic -> cubic conversion
        p0 = self._getCurrentPoint()
        c1 = (p0[0] + 2 / 3 * (a[0] - p0[0]), p0[1] + 2 / 3 * (a[1] - p0[1]))
        c2 = (b[0] + 2 / 3 * (a[0] - b[0]), b[1] + 2 / 3 * (a[1] - b[1]))
        self._curveToOne(c1, c2, b)

    def _closePath(self):
        self.parts.append("Z")

    def _endPath(self):
        pass

    def d(self) -> str:
        return "".join(self.parts)


def explicit(d: str) -> str:
    """Rewrite any SVG path (relative, H/V, S, Q, arcs, implicit lines) as absolute M/L/C/Z."""
    pen = ExplicitPen()
    parse_path(d, pen)
    return pen.d()


def transform(d: str, a=1.0, b=0.0, c=0.0, dd=1.0, e=0.0, f=0.0) -> str:
    """Apply the affine matrix (a b c d e f) and return an explicit path."""
    pen = ExplicitPen()
    parse_path(d, TransformPen(pen, (a, b, c, dd, e, f)))
    return pen.d()


def bbox(d: str):
    """Exact bounds (x0, y0, x1, y1), curve extrema included."""
    pen = BoundsPen(None)
    parse_path(d, pen)
    return pen.bounds


def clean(d: str) -> str:
    """Boolean union: removes overlaps and self-intersections (even-odd safe)."""
    import pathops

    path = pathops.Path()
    parse_path(d, path.getPen())
    path.simplify(fix_winding=True, keep_starting_points=False)
    pen = ExplicitPen()
    path.draw(pen)
    return pen.d()


def union(ds: list[str]) -> str:
    """Union of several paths into one (touching letters, stacked pieces)."""
    import pathops

    path = pathops.Path()
    pen = path.getPen()
    for d in ds:
        parse_path(d, pen)
    path.simplify(fix_winding=True, keep_starting_points=False)
    out = ExplicitPen()
    path.draw(out)
    return out.d()


def subpaths(d: str) -> list[str]:
    """Split an explicit path into subpaths (one per M)."""
    return [m for m in re.split(r"(?=M)", d) if m.strip()]


# ---------------------------------------------------------------- fonts
_cache: dict = {}


def font(style_or_path: str, wght: float):
    """(static TTFont, glyphSet, hb.Font) for bundled Epilogue roman/italic or any font file."""
    import uharfbuzz as hb
    from fontTools.ttLib import TTFont
    from fontTools.varLib import instancer

    path = STYLES.get(style_or_path, style_or_path)
    key = (path, float(wght))
    if key not in _cache:
        vf = TTFont(path)
        if "fvar" in vf:
            static = instancer.instantiateVariableFont(vf, {"wght": float(wght)}, updateFontNames=False)
        else:
            static = vf
        hbf = hb.Font(hb.Face(hb.Blob.from_file_path(path)))
        if "fvar" in vf:
            hbf.set_variations({"wght": float(wght)})
        _cache[key] = (static, static.getGlyphSet(), hbf)
    return _cache[key]


def compose_line(text: str, style: str = "roman", wght: float = 300, size: float = 7.0,
                 tracking_em: float = 0.0, liga: bool = True, net: bool = True):
    """Compose one line: baseline at y = 0, starting at x = 0, HarfBuzz kerning.

    Returns a list of glyphs {i, name, d, x, advance}; d is already placed at its pen
    position and i is the HarfBuzz index (spaces included), used to apply a tracking
    i * ls during fitting. tracking_em adds a fixed tracking. net=True cleans each glyph.
    """
    import uharfbuzz as hb

    static, gs, hbf = font(style, wght)
    upem = static["head"].unitsPerEm
    k = size / upem
    buf = hb.Buffer()
    buf.add_str(text)
    buf.guess_segment_properties()
    hb.shape(hbf, buf, {"kern": True, "liga": liga})
    x = 0.0
    out = []
    for i, (info, pos) in enumerate(zip(buf.glyph_infos, buf.glyph_positions)):
        name = static.getGlyphName(info.codepoint)
        pen = ExplicitPen(gs)
        gs[name].draw(TransformPen(pen, (k, 0, 0, -k, x + pos.x_offset * k, -pos.y_offset * k)))
        d = pen.d()
        if d and net:
            d = clean(d)
        out.append({"i": i, "name": name, "d": d, "x": x, "advance": pos.x_advance * k})
        x += pos.x_advance * k + tracking_em * size
    return out
