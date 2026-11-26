# Fitting methods and quality benchmarks

## 1. Principle

The image the user sees is the reference. Each element is rendered from its vector source
into an off-screen canvas at the image's resolution (k = image width / artboard width,
8.33 px/pt for a 2166 px export of a 259.92 pt artboard, i.e. 600 ppi) and compared with
the colour mask of that element. The score is the sum of squared alpha differences in a
region around the element (`vp.sse`). Parameters are searched by a coarse grid, then a
coordinate descent with shrinking steps.

## 2. Methods

| Method | Parameters | Used for |
|---|---|---|
| `vp.fitLine` | tracking `ls` (pt per HarfBuzz index), `tx`, baseline `ty`, optional scale, then each glyph's x within ±0.12 pt (±0.2 pt for large text) | composed text lines |
| `vp.fitPiece` | uniform scale `s` about the piece centre, `dx`, `dy` | logo bands, SVG pieces, whole words, stroked lines |
| Edge least squares | total least squares on the pixels of each straight edge, then solve scale + translation over all edges | thin outline artwork (frames, bands) |
| Height-based seed | size = image cap height / composed cap height | text of unknown size |
| `vp.trace` | marching squares at 50 % coverage + Douglas-Peucker | anything without a vector source |

Edge least-squares, as used on a pair of 0.25 pt band outlines: collect light pixels
within ±0.8 pt of each expected edge, fit a line by principal axis (weights = alpha), refit
with a narrower band; each edge gives one equation `n·(s·P + t) = n·Q`; solving the six
equations gave scale 0.97276 and translation (-0.196, +3.114) pt with residuals under
0.011 pt. The stroke width measured by integrating alpha across an edge (0.243 pt) then
revealed that strokes had been scaled with the group (0.25 x 0.97276).

## 3. Synthetic validation (toolkit 0.0.1)

| Test | Truth | Recovered |
|---|---|---|
| `fitLine`, a 10-letter capital word, Epilogue Black 14 pt | tracking -0.44 pt, x 13.6, baseline 126.2 | -0.44, 13.602, 126.2; max glyph error 0.0065 pt; 0.05 % pixels |
| `fitPiece`, letter N scaled 0.97 | s 0.97, dx 150.25, dy 20.4 | 0.9705, 150.246, 20.397 |
| `vp.trace`, same word | 10 outer contours + 3 holes | 10 + 3, 0.4 % pixels |
| `trace_png.py`, anti-aliased circle r = 60.2 px | radius | mean error 0.13 px, max 0.24 px |
| `vp.match`, legacy-parsed address line | dx 180.4, dy 17.37 | exact, residual 6e-5 pt |

## 4. Real-card benchmarks (pixel difference vs the user's image)

| Element | Result |
|---|---|
| FACTERO logo letters (SVG, refit 0.9952) | 0.36 % |
| Name, Epilogue Black from SVG pieces | 2.7-4.1 % |
| Logo bands (SVG pieces) | 1.8-2.8 % |
| Bold slogan, composed Black 14 pt | 2.7-3.3 % (against a trace) |
| Light text 7 pt, composed | 6.9-11 % |
| Illustrator's own outlines vs its own PNG (reference) | about 6 % on 7 pt text |
| Traced bold text | 0.5-0.8 % |

Interpretation:
- Light text sits at 7-11 % because a 0.5 pt stroke is 4 px wide at 600 ppi: half a pixel
  of anti-aliasing on each edge is already 25 % of the stroke. Look at the balance
  `vectorOnly` vs `imageOnly` and at the per-word edges instead.
- A large `imageOnly` concentrated in thin wedges along slanted strokes means a broken
  outline (implicit-lineto bug), not a wrong font.
- A weight test should show a clear minimum (e.g. 300 at 10.6 % vs 275 at 13.0 % and 325 at
  14.8 %); a residual surplus of vector ink on thin text is usually the PNG exporter's
  hinting/anti-aliasing thinning strokes. Keep the design weight.

## 5. What the measurements taught

- Designers rescale groups: lines 0.97276, a name 1.1762 with tighter tracking, bands
  0.995 each with a new overlap order. Never assume the export geometry is the final one.
- Leading and tracking are recoverable: two text rows at 17.37 and 24.87 pt baselines =
  7.5 pt leading; tracking -15/1000 em on every light line.
- An image exported at 72 ppi (257 px wide) is useless as a fitting reference beyond
  ±0.35 mm; prefer the SVG geometry and say so.
- PNGs produced by uploading an SVG with live text to Vistaprint are rendered with a
  substitute font: never fit live text against them.
