# vp_toolkit.js API (version 0.0.2)

Install in the page (see SKILL.md section 2); everything lives on `window.__vp`.
Units: artboard points unless stated. `I` = image object from `vp.image()` /
`vp.panelImage()`; `M` = a mask (Uint8ClampedArray, one alpha byte per pixel);
`R` = region `[x0, y0, x1, y1]`; `box` = `[x0, x1, y0, y1]`.

## Engine and document

| Call | Returns |
|---|---|
| `vp.engine()` | design engine (cached; throws if the Studio is not loaded or the page is not on a Vistaprint domain) |
| `vp.doc()` | cimDoc JSON |
| `vp.panel(i)` | panel `i` (0 = front, 1 = back) |
| `vp.exec(cimDoc => {...})` | runs a mutation through the editor's command API (undoable, autosaved) |
| `vp.summary()` | sides, sizes, images, shapes, text areas |
| `vp.scale(panel)` | `{SX, SY}` mm per artboard point |
| `vp.ART` | artboard size `{w, h}` in pt (default 259.92 x 151.92); change it for other products |

## Paths

| Call | Notes |
|---|---|
| `vp.norm(d)` | any SVG path -> absolute M/L/C/Z (handles implicit lineto, H, V, S, Q, T, relative) |
| `vp.normLegacy(d)` | the old buggy reader, only to recognise shapes injected before the fix |
| `vp.bbox(d)` | exact bounds `{x, y, w, h}` of a normalised path |
| `vp.points(d)` | every coordinate pair |
| `vp.xform(d, sx, sy, dx, dy)` | transformed path in cimDoc format ("M,x,y...") |
| `vp.shape(d, z, {fill} or {stroke, w}, panel)` | new curve shape object |
| `vp.geometry(d, panel)` | `{svgPathData, viewBox, position}` to replace an existing shape's geometry |
| `vp.hexToRgb('#141831')` | `'rgb(20, 24, 49)'` |

## Files and images

| Call | Notes |
|---|---|
| `vp.fileInput()` | creates the hidden input "fx svg loader" |
| `await vp.files()` | `{name: text}` of the uploaded files |
| `vp.parseSvg(text)` | `[{attrs, d, p2d, b, line, i}]` (normalised) |
| `await vp.image(url)` / `await vp.panelImage(i, n)` | `{img, W, H, D, k}` (+ `id` for panel images) |
| `vp.colorMask(I, hex, tol)` | alpha of pixels within RGB distance `tol` of `hex` |
| `vp.opaqueMask(I, fgHex, bgHex)` | foreground coverage on an opaque image |
| `vp.renderMask(d, I)` | mask of a path (e.g. an existing trace) |
| `vp.inkBox(M, I, box)` | ink bounds in pt, or null |
| `vp.rows(M, I, box)` | horizontal ink bands `[[y0, y1], ...]` |

## Fitting and tracing

| Call | Returns |
|---|---|
| `vp.sse(items, M, I, R)` | score (items: `{p2d, sx, sy, dx, dy, stroke?}`) |
| `vp.diff(items, M, I, R)` | `{pct, vectorOnly, imageOnly}` at the 50 % threshold |
| `vp.fitLine(glyphs, M, I, box, opt)` | `{sx, sy, tx, ty, ls, pos[], R, diff, d}`; `opt`: `ls: [min, max]`, `freeScale`, `anisotropic`, `scale`, `alignRight`, `span` |
| `vp.fitPiece(d, M, I, R, seed, strokeW)` | `{s, dx, dy, diff, d}`; `seed`: `{s, x, y}` (target top-left) or `{s, dx, dy}`; `strokeW` in pt for outline-only pieces |
| `vp.trace(M, I, R, tolPx)` | loops in pt |
| `vp.loopsToD(loops)`, `vp.loopArea(loop)` | path string; signed area (outer > 0, holes < 0) |

## Checks, repair, saving, previews

| Call | Returns |
|---|---|
| `vp.check()` | `{evenOddMismatch[], strayMoves[], ok}` for every curve of both sides |
| `vp.LIMITS` | maximum % pixel difference per kind: `svg` 1, `piece` 3, `bold` 4, `light` 11, `trace` 1, `line` null (no benchmark: the user decides) |
| `vp.gate(evidence)` | `{ok, failures[]}`; `evidence` = `[{name, kind, diff}]`, `diff` = a `vp.diff()` result; also fails when `vp.check()` fails |
| `vp.removeImage(panel, imageId, evidence, {userApproved})` | the only way to remove an image: runs `vp.gate`, throws "STOP, image kept" on any failure; `userApproved` = the user's own words from the chat, only after they said so; returns the log entry |
| `vp.log` | removals and refusals of this page load, with time, evidence and approval (copy it to the session log) |
| `vp.fixStrayLines()` | count of outline-only lines repaired ("M a b M" -> "M a b L") |
| `vp.candidates(sources)` / `vp.match(cands, d)` | matching of a path to clean sources (`{c, sc, dx, dy, res, d}`) |
| `vp.repair(sources, apply)` | report lines; rebuilds matching shapes from clean glyphs when `apply` |
| `vp.saveState()` / `await vp.saved(tries)` | "Saved", "Save"... |
| `vp.overlay(canvas or [canvases])` / `vp.overlayOff()` | full-page preview to screenshot |
| `vp.zoomImage(I, R, scale)` | canvas of an enlarged image area |
| `vp.renderShapes(panel, R, scale, rule, filter)` | canvas of the shapes as Vistaprint fills them (even-odd) |
