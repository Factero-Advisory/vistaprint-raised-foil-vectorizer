# Copyright 2026 9467-8711 Québec inc. (Service conseils Factero)
# SPDX-License-Identifier: Apache-2.0
"""Trace an image (PNG) into vector outlines, by colour.

Usage:
    python trace_png.py image.png out.svg [--color #141831] [--tolerance 60]
                        [--width-pt 259.92] [--height-pt 151.92] [--zone x0,y0,x1,y1]
                        [--tol-px 0.15] [--rows y1,y2,...]

- Mask: pixels within --tolerance (RGB distance) of --color, weighted by alpha;
  without --color, alpha only (transparent images).
- Sub-pixel isocontours (marching squares, linear interpolation at the 50 % level),
  then Douglas-Peucker simplification at --tol-px pixels (0.15 px = 0.018 pt at 600 ppi).
  Measured accuracy on a synthetic circle: 0.13 px mean, 0.24 px max.
- Output coordinates are in artboard points (--width-pt x --height-pt spans the whole
  image; default = a business card with bleed, 3.61 x 2.11 in).
- --zone limits tracing (in pt). --rows y1,y2 splits the result into several shapes by
  the vertical centre of each contour (e.g. 128 to separate two text lines).
- Output: one <path> per row (outer contours and holes in opposite directions),
  explicit M/L/Z commands; outer/hole counts are printed as a check.

Use only for artwork that exists neither as SVG nor in an identifiable font: a trace
is a pixel-faithful polygon, not a font curve. Before concluding that text "does not
match" its font, rule out the implicit-lineto bug (references/pitfalls.md).
"""
import math
import sys

import numpy as np
from PIL import Image


def opt(name, default=None, conv=str):
    if name in sys.argv:
        return conv(sys.argv[sys.argv.index(name) + 1])
    return default


def mask(img, color, tol):
    a = np.asarray(img.convert("RGBA"), dtype=np.float32)
    alpha = a[..., 3]
    if color is None:
        return alpha
    c = np.array([int(color[i:i + 2], 16) for i in (1, 3, 5)], dtype=np.float32)
    dist = np.sqrt(((a[..., :3] - c) ** 2).sum(-1))
    return np.where(dist <= tol, alpha, 0.0)


def marching(M, iso=127.5):
    h, w = M.shape
    P = np.zeros((h + 2, w + 2), dtype=np.float32)
    P[1:-1, 1:-1] = M
    B = P > iso
    a, b, c, d = B[:-1, :-1], B[:-1, 1:], B[1:, 1:], B[1:, :-1]
    idx = (a * 8 + b * 4 + c * 2 + d * 1).astype(np.int8)
    ys, xs = np.nonzero((idx != 0) & (idx != 15))
    seg = []

    def it(x1, y1, v1, x2, y2, v2):
        t = (iso - v1) / (v2 - v1)
        return (x1 + (x2 - x1) * t, y1 + (y2 - y1) * t)

    for y, x in zip(ys.tolist(), xs.tolist()):
        va, vb, vc, vd = P[y, x], P[y, x + 1], P[y + 1, x + 1], P[y + 1, x]
        k = int(idx[y, x])
        Tt = lambda: it(x, y, va, x + 1, y, vb)  # noqa: E731
        Rr = lambda: it(x + 1, y, vb, x + 1, y + 1, vc)  # noqa: E731
        Bb = lambda: it(x, y + 1, vd, x + 1, y + 1, vc)  # noqa: E731
        Ll = lambda: it(x, y, va, x, y + 1, vd)  # noqa: E731
        table = {1: [(Ll, Bb)], 2: [(Bb, Rr)], 3: [(Ll, Rr)], 4: [(Rr, Tt)], 5: [(Ll, Tt), (Rr, Bb)],
                 6: [(Bb, Tt)], 7: [(Ll, Tt)], 8: [(Tt, Ll)], 9: [(Tt, Bb)], 10: [(Tt, Rr), (Bb, Ll)],
                 11: [(Tt, Rr)], 12: [(Rr, Ll)], 13: [(Rr, Bb)], 14: [(Bb, Ll)]}
        for p, q in table[k]:
            seg.append((p(), q()))
    key = lambda p: (round(p[0], 4), round(p[1], 4))  # noqa: E731
    start = {key(s[0]): i for i, s in enumerate(seg)}
    seen = bytearray(len(seg))
    loops = []
    for i in range(len(seg)):
        if seen[i]:
            continue
        loop, j = [], i
        while j is not None and not seen[j]:
            seen[j] = 1
            loop.append(seg[j][0])
            j = start.get(key(seg[j][1]))
        if len(loop) > 8:
            loops.append([(x - 1.0, y - 1.0) for x, y in loop])  # remove the 1-px padding
    return loops


def dp(pts, tol):
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        (ax, ay), (bx, by) = pts[a], pts[b]
        dx, dy = bx - ax, by - ay
        L = math.hypot(dx, dy) or 1e-9
        md, mi = 0, -1
        for i in range(a + 1, b):
            d = abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / L
            if d > md:
                md, mi = d, i
        if md > tol:
            keep[mi] = True
            stack += [(a, mi), (mi, b)]
    return [p for p, k in zip(pts, keep) if k]


def simplify(loop, tol):
    far = max(range(len(loop)), key=lambda i: (loop[i][0] - loop[0][0]) ** 2 + (loop[i][1] - loop[0][1]) ** 2)
    a = dp(loop[: far + 1], tol)
    c = dp(loop[far:] + [loop[0]], tol)
    return a + c[1:-1]


def area(b):
    return sum(b[i][0] * b[(i + 1) % len(b)][1] - b[(i + 1) % len(b)][0] * b[i][1] for i in range(len(b))) / 2


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) < 2:
        print(__doc__)
        sys.exit(2)
    src, out = args[0], args[1]
    img = Image.open(src)
    W, H = img.size
    wpt, hpt = opt("--width-pt", 259.92, float), opt("--height-pt", 151.92, float)
    kx, ky = W / wpt, H / hpt
    M = mask(img, opt("--color"), opt("--tolerance", 60.0, float))
    ox = oy = 0
    zone = opt("--zone")
    if zone:
        x0, y0, x1, y1 = map(float, zone.split(","))
        ox, oy = int(x0 * kx), int(y0 * ky)
        M = M[oy:int(math.ceil(y1 * ky)), ox:int(math.ceil(x1 * kx))]
    loops = [simplify(b, opt("--tol-px", 0.15, float)) for b in marching(M)]
    pts = [[((ox + x + 0.5) / kx, (oy + y + 0.5) / ky) for x, y in b] for b in loops]
    cuts = sorted(map(float, opt("--rows").split(","))) if opt("--rows") else []
    rows = [[] for _ in range(len(cuts) + 1)]
    for b in pts:
        ys = [y for _, y in b]
        cy = (min(ys) + max(ys)) / 2
        rows[sum(cy >= c for c in cuts)].append(b)
    svg = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {wpt} {hpt}">']
    for i, r in enumerate(rows):
        if not r:
            continue
        d = "".join("M" + "L".join(f"{x:.4f} {y:.4f}" for x, y in b) + "Z" for b in r)
        outer = sum(1 for b in r if area(b) > 0)
        print(f"row {i + 1}: {len(r)} contours ({outer} outer, {len(r) - outer} holes), {sum(len(b) for b in r)} points")
        svg.append(f'<path data-piece="trace-r{i + 1}" fill="#000" d="{d}"/>')
    svg.append("</svg>")
    with open(out, "w", encoding="utf-8") as fh:
        fh.write("\n".join(svg))
    print("wrote", out)


if __name__ == "__main__":
    main()
