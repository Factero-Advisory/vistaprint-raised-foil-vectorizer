# Copyright 2026 9467-8711 Québec inc. (Service conseils Factero)
# SPDX-License-Identifier: Apache-2.0
"""Remove overlapping contours and make every path explicit.

Usage:
    python clean_overlaps.py in.svg out.svg [--groups]

By default each <path> is processed on its own (union of its own contours).
--groups also unites all same-colour <path> elements of a parent <g> (letters that
touch, stacked pieces). Attributes are kept; the result uses explicit M/L/C/Z commands
and renders identically with the nonzero and even-odd fill rules.
"""
import os
import sys
import xml.etree.ElementTree as ET

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from vector_common import NS, clean, union  # noqa: E402


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) != 2:
        print(__doc__)
        sys.exit(2)
    src, out = args
    ET.register_namespace("", NS)
    tree = ET.parse(src)
    n = 0
    for el in tree.getroot().iter(f"{{{NS}}}path"):
        el.set("d", clean(el.get("d")))
        n += 1
    if "--groups" in sys.argv:
        for g in tree.getroot().iter(f"{{{NS}}}g"):
            kids = [p for p in g if p.tag == f"{{{NS}}}path"]
            if len(kids) > 1 and len({p.get("fill") or p.get("class") for p in kids}) == 1:
                kids[0].set("d", union([p.get("d") for p in kids]))
                for p in kids[1:]:
                    g.remove(p)
    tree.write(out, encoding="utf-8", xml_declaration=True)
    print(f"{os.path.basename(src)}: {n} path(s) cleaned -> {out}")


if __name__ == "__main__":
    main()
