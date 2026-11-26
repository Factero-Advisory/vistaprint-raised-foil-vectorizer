# Fonts and typography

## 1. Bundled fonts

`assets/fonts/Epilogue-VF.ttf` (roman) and `Epilogue-Italic-VF.ttf` (italic), variable
weight 100-900, version 2.112, from the Google Fonts repository, SIL Open Font License 1.1
(`assets/fonts/OFL.txt`). Epilogue is the "EpilogueRoman" family that Illustrator lists
(e.g. "EpilogueRoman-Light" = weight 300).

Any other font: pass its file with `"font": "path"` in the spec or `--font` to
`identify_weight.py`. Downloading a font is a download: ask the user first.

## 2. Composition

`compose_spec.py` instantiates the variable font at the requested weight with fontTools,
shapes the text with HarfBuzz (kerning and standard ligatures on, e.g. "fi"), places each
glyph at its pen position (baseline y = 0, start x = 0), cleans overlaps and writes one
explicit path per glyph with its HarfBuzz index `data-i`. Tracking and size are fitted in
the page, so a line can be composed at a nominal size (7 pt for small text, 14 pt for
display text) and scaled if needed.

Matching an Illustrator layout: the `<tspan x="...">` values of an SVG export reproduce
HarfBuzz advances to the thousandth of a point (verified on "Independe|n|t |c|y|be|r|
security"), so Illustrator and HarfBuzz agree on Epilogue metrics.

## 3. Identifying a weight

`identify_weight.py` compares the area of each outlined letter with the font glyph scaled
to the same height, for weights 100-900. Both sides must be overlap-free first, otherwise
variable-font overlaps inflate the glyph area (ratios of 1.03-1.10 instead of 0.999).

Reference: 15 letters of a name, Epilogue Black 900: ratio 0.999 on all 15, error 0.0000;
850 gives 0.94-0.96.

Measuring weight on an image instead (no outlines available): count pixel runs across
vertical stems and horizontal bars at the same height on a known letter, and calibrate on
a letter of known weight in the same image:

| Measure (Epilogue, 14 pt) | 850 | 900 |
|---|---|---|
| N width | 9.17 pt | 9.37 pt |
| N stem | 2.59 pt | 2.75 pt |
| T bar / E arms | 2.00 pt | 2.10 pt |

Bars that match 900 with thinner stems suggest horizontal scaling, but always rule out the
implicit-lineto bug first: in the October 2026 case, the "thin stems" were an artefact of
outlines that had lost their first segment.

## 4. True italic or slanted roman

`identify_weight.py --style italic --iou` compares each letter with the italic glyph and
with the roman glyph slanted at the best angle (6-18 degrees). Epilogue Italic 900 scored
IoU 0.997-0.998 against 0.984-0.994 for a slanted roman: a drawn italic. A synthetic
oblique would score the other way round.

## 5. Typographic parameters seen on business cards

| Element | Size | Weight | Tracking | Leading |
|---|---|---|---|---|
| Contact lines, titles | 7 pt | 300 | -13 to -16/1000 em | 7.5 pt |
| Name, slogan | 14 pt | 900 (+ italic 900) | about -0.44 pt per glyph | 14 pt |

Light text exported to PNG can come out about 3/1000 em tighter than in the SVG export:
when the user's image is the reference, fit per glyph against the image.

## 6. Overlaps

Variable fonts keep overlapping contours (a P is a stem plus a bowl; a 4 is a diagonal
plus a bar). TrueType renderers fill with nonzero and hide this; Vistaprint fills with
even-odd and shows a hole. Every glyph is cleaned with skia-pathops (`clean()`); if two
letters touch because of tight tracking, unite the whole line (`union()` /
`clean_overlaps.py --groups`) and re-check with `vp.check()`.
