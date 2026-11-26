# Copyright 2026 9467-8711 Québec inc. (Service conseils Factero)
# SPDX-License-Identifier: Apache-2.0
"""Turn an Illustrator SVG export into pieces ready to inject into Vistaprint Studio.

Usage:
    python svg_pieces.py source.svg out.svg [--rows] [--compose-text] [--raw]

- One piece per graphic element (path, rect, polygon, polyline, circle, ellipse, line),
  <g> transforms applied, written with EXPLICIT M/L/C/Z commands.
- Filled pieces are cleaned (union, no overlaps) unless --raw.
- Stroke-only pieces (fill:none + stroke) are kept as outlines with stroke and
  stroke-width (they become "curve" shapes without fill).
- --rows: inside each <g>, groups same-colour pieces into rows (boxes that overlap
  vertically) and unites each row into a single shape; the SVG paint order is kept
  (what comes first stays underneath).
- Live text (<text>) is listed; with --compose-text it is converted to outlines with
  the bundled Epilogue (roman/italic, weight read from the CSS), honouring <tspan> x/y
  and class letter-spacing.

Output attributes: data-piece, data-order (paint order), data-z (suggested z-index),
fill or stroke + stroke-width. A summary table is printed.
"""
import math
import os
import re
import sys
import xml.etree.ElementTree as ET

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from vector_common import NS, bbox, clean, compose_line, transform, union  # noqa: E402

T = "{" + NS + "}"


def css_rules(root):
    style = "".join(e.text or "" for e in root.iter(T + "style"))
    rules = {}
    for sel, body in re.findall(r"([^{}]+)\{([^}]*)\}", style):
        props = dict((k.strip(), v.strip()) for k, v in (p.split(":", 1) for p in body.split(";") if ":" in p))
        for s in sel.split(","):
            rules.setdefault(s.strip().lstrip("."), {}).update(props)
    return rules


def props(el, rules):
    p = {}
    for c in (el.get("class") or "").split():
        p.update(rules.get(c, {}))
    for k in ("fill", "stroke", "stroke-width", "font-family", "font-size", "font-weight", "font-style",
              "letter-spacing", "font-variation-settings"):
        if el.get(k) is not None:
            p[k] = el.get(k)
    if el.get("style"):
        p.update(dict((k.strip(), v.strip()) for k, v in (x.split(":", 1) for x in el.get("style").split(";") if ":" in x)))
    return p


def matrix(tr):
    m = [1, 0, 0, 1, 0, 0]
    for name, args in re.findall(r"(\w+)\s*\(([^)]*)\)", tr or ""):
        v = [float(x) for x in re.split(r"[ ,]+", args.strip()) if x]
        if name == "translate":
            n = [1, 0, 0, 1, v[0], v[1] if len(v) > 1 else 0]
        elif name == "scale":
            n = [v[0], 0, 0, v[1] if len(v) > 1 else v[0], 0, 0]
        elif name == "matrix":
            n = v
        elif name == "rotate":
            a = math.radians(v[0])
            cx, cy = (v[1], v[2]) if len(v) > 2 else (0, 0)
            c, s = math.cos(a), math.sin(a)
            n = [c, s, -s, c, cx - c * cx + s * cy, cy - s * cx - c * cy]
        else:
            continue
        m = compose(m, n)
    return m


def compose(m1, m2):
    a, b, c, d, e, f = m1
    return [a * m2[0] + c * m2[1], b * m2[0] + d * m2[1], a * m2[2] + c * m2[3], b * m2[2] + d * m2[3],
            a * m2[4] + c * m2[5] + e, b * m2[4] + d * m2[5] + f]


def to_d(el):
    tag = el.tag.replace(T, "")
    g = lambda k, dft=0.0: float(el.get(k, dft))  # noqa: E731
    if tag == "path":
        return el.get("d")
    if tag == "rect":
        x, y, w, h = g("x"), g("y"), g("width"), g("height")
        return f"M{x} {y}H{x + w}V{y + h}H{x}Z"
    if tag in ("polygon", "polyline"):
        pts = re.split(r"[ ,]+", el.get("points").strip())
        d = "M" + " ".join(pts[:2]) + "".join(f"L{pts[i]} {pts[i + 1]}" for i in range(2, len(pts) - 1, 2))
        return d + ("Z" if tag == "polygon" else "")
    if tag in ("circle", "ellipse"):
        cx, cy = g("cx"), g("cy")
        rx = g("r") if tag == "circle" else g("rx")
        ry = g("r") if tag == "circle" else g("ry")
        return f"M{cx - rx} {cy}A{rx} {ry} 0 1 0 {cx + rx} {cy}A{rx} {ry} 0 1 0 {cx - rx} {cy}Z"
    if tag == "line":
        return f"M{g('x1')} {g('y1')}L{g('x2')} {g('y2')}"
    return None


def compose_text(el, rules, m):
    base = props(el, rules)
    size = float(re.sub(r"[a-z]+$", "", base.get("font-size", "7")))
    wght = float(base.get("font-weight", 400))
    fvs = re.search(r"'wght'\s*([\d.]+)", base.get("font-variation-settings", ""))
    if fvs:
        wght = float(fvs.group(1))
    style = "italic" if ("italic" in base.get("font-style", "") or "Italic" in base.get("font-family", "")) else "roman"
    ds, label = [], ""
    for sp in el.findall(T + "tspan") or [el]:
        text = sp.text or ""
        label += text
        ls = props(sp, rules).get("letter-spacing", base.get("letter-spacing", "0em"))
        ls_em = float(ls.replace("em", "")) if "em" in ls else float(re.sub(r"[a-z]+$", "", ls) or 0) / size
        x0, y0 = float(sp.get("x", 0)), float(sp.get("y", 0))
        for gl in compose_line(text, style, wght, size, tracking_em=ls_em, net=True):
            if gl["d"]:
                ds.append(transform(gl["d"], *compose(m, [1, 0, 0, 1, x0, y0])))
    return label, ds, {"style": style, "wght": wght, "size": size}


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) != 2:
        print(__doc__)
        sys.exit(2)
    src, out = args
    rows, compose_live, raw = "--rows" in sys.argv, "--compose-text" in sys.argv, "--raw" in sys.argv
    root = ET.parse(src).getroot()
    rules = css_rules(root)
    pieces, texts, order, groups_seen = [], [], [0], []

    def visit(el, m, group):
        tag = el.tag.replace(T, "")
        m2 = compose(m, matrix(el.get("transform")))
        if tag in ("g", "svg"):
            gid = group
            if tag == "g":
                gid = f"g{len(groups_seen)}"
                groups_seen.append(gid)
            for kid in el:
                visit(kid, m2, gid)
            return
        if tag == "text":
            texts.append((el, m2, group, order[0]))
            order[0] += 1
            return
        d = to_d(el)
        if not d:
            return
        p = props(el, rules)
        d = transform(d, *m2)
        fill, stroke = p.get("fill", "#000000"), p.get("stroke")
        entry = {"group": group, "order": order[0], "d": d}
        order[0] += 1
        if fill == "none" and stroke:
            scale = math.sqrt(abs(m2[0] * m2[3] - m2[1] * m2[2]))
            entry.update(stroke=stroke, sw=float(re.sub(r"[a-z]+$", "", p.get("stroke-width", "1"))) * scale)
        else:
            entry.update(fill=fill, d=d if raw else clean(d))
        pieces.append(entry)

    visit(root, [1, 0, 0, 1, 0, 0], "root")

    out_pieces = []
    filled = [p for p in pieces if "fill" in p]
    strokes = [p for p in pieces if "stroke" in p]
    if rows:
        by_key = {}
        for p in filled:
            by_key.setdefault((p["group"], p["fill"]), []).append(p)
        for (gid, fill), lst in by_key.items():
            lst = sorted(lst, key=lambda p: (bbox(p["d"])[1] + bbox(p["d"])[3]) / 2)
            row, bottom, row_list = [], None, []
            for p in lst:
                b = bbox(p["d"])
                if bottom is not None and b[1] >= bottom:
                    row_list.append(row)
                    row, bottom = [], None
                row.append(p)
                bottom = b[3] if bottom is None else max(bottom, b[3])
            row_list.append(row)
            for ri, r in enumerate(row_list):
                d = union([p["d"] for p in r]) if not raw else "".join(p["d"] for p in r)
                out_pieces.append({"name": f"{gid}-{fill.lstrip('#')}-r{ri + 1}", "order": min(p["order"] for p in r), "fill": fill, "d": d})
    else:
        for p in filled:
            out_pieces.append({"name": f"{p['group']}-{p['order']}", "order": p["order"], "fill": p["fill"], "d": p["d"]})
    for i, p in enumerate(strokes):
        out_pieces.append({"name": f"outline-{i + 1}", "order": -1000 + p["order"], "stroke": p["stroke"], "sw": p["sw"], "d": p["d"]})
    for el, m, gid, o in texts:
        base = props(el, rules)
        label = "".join(sp.text or "" for sp in (el.findall(T + "tspan") or [el]))
        if compose_live:
            label, ds, _info = compose_text(el, rules, m)
            if ds:
                out_pieces.append({"name": f"text-{label.strip()[:30]}", "order": o, "fill": base.get("fill", "#000000"),
                                   "d": "".join(ds) if raw else union(ds)})
        else:
            print(f"LIVE TEXT not composed (add --compose-text): \"{label}\" "
                  f"{base.get('font-family', '?')} {base.get('font-size', '?')} weight {base.get('font-weight', '?')}")

    ET.register_namespace("", NS)
    svg = ET.Element(T + "svg", viewBox=root.get("viewBox", "0 0 259.92 151.92"))
    z = 10
    for p in sorted(out_pieces, key=lambda p: p["order"]):
        a = {"data-piece": p["name"], "data-order": str(p["order"]), "d": p["d"]}
        if "stroke" in p:
            a.update({"data-z": str(1 + len([q for q in out_pieces if 'stroke' in q and q['order'] < p['order']])),
                      "fill": "none", "stroke": p["stroke"], "stroke-width": f"{p['sw']:.4f}"})
        else:
            a.update({"data-z": str(z), "fill": p["fill"]})
            z += 1
        ET.SubElement(svg, T + "path", a)
        b = bbox(p["d"])
        kind = f"outline {p['stroke']} {p['sw']:.3f} pt" if "stroke" in p else f"filled {p['fill']}"
        print(f"{a['data-z']:>3}  {p['name']:<36} {kind:<26} x {b[0]:7.2f}-{b[2]:7.2f}  y {b[1]:7.2f}-{b[3]:7.2f}")
    ET.ElementTree(svg).write(out, encoding="utf-8", xml_declaration=True)
    print("wrote", out)


if __name__ == "__main__":
    main()
