# Worked examples

All snippets run with the browser's JavaScript tool after the toolkit is installed
(`const vp = window.__vp;`). Coordinates are artboard points unless stated.

## 1. Inventory and reading

```js
vp.summary();                       // sides, sizes, images, shapes
vp.check();                         // baseline: even-odd mismatches, stray M
const I = await vp.panelImage(1);   // back image: {img, W, H, D, k}
vp.overlay(vp.zoomImage(I, [0, 0, 259.92, 151.92], 4));   // screenshot it, then:
vp.overlayOff();
```
Read every word from the enlarged view; never guess text. Note accents, punctuation and
digits (phone numbers are often edited later).

Colour masks (alpha of pixels near a colour):

```js
const navy   = vp.colorMask(I, '#141831', 70);
const orange = vp.colorMask(I, '#CC8425', 70);
vp.rows(navy, I, [5, 250, 0, 151.92]);   // horizontal ink bands: where the text lines are
vp.inkBox(navy, I, [5, 100, 110, 128]);  // ink bounds of one block
```
Opaque images (background baked in): `vp.opaqueMask(I, '#B8B8BE', '#141831')`.

## 2. Text in a known font

Local:
```json
[ {"text": "Associé principal", "style": "roman", "wght": 300, "size": 7},
  {"text": "NOTRE VISION,",     "style": "roman", "wght": 900, "size": 14},
  {"text": "VOS DÉCISIONS.",    "style": "italic", "wght": 900, "size": 14} ]
```
```bash
python scripts/compose_spec.py spec.json lines.svg
```
Page (after uploading lines.svg):
```js
const files = await vp.files();
const G = vp.parseSvg(files['lines.svg']);
const L0 = vp.fitLine(G.filter(g => g.line === 0), navy, I, [10, 100, 102.5, 112]);      // light text
const L1 = vp.fitLine(G.filter(g => g.line === 1), navy, I, [138, 252, 113, 127.3], { ls: [-0.6, 0.1] }); // bold
// right-aligned text: { alignRight: true }; unknown size: { freeScale: true }
[L0.diff, L1.diff, L0.ls / 7, L0.ty];    // quality, tracking in em, baseline
```
`L.d` is the fitted path, ready for `vp.shape`.

## 3. Artwork that exists as SVG

```bash
python scripts/svg_pieces.py export.svg pieces.svg --rows --compose-text
```
Each piece keeps its source geometry; the designer may have scaled or moved it since, so
fit each one (uniform scale + translation):

```js
const P = vp.parseSvg(files['pieces.svg']);
const band = P.find(p => p.attrs['data-piece'].includes('ca8225'));
const f = vp.fitPiece(band.d, orange, I, [95, 121, 142, 140], { s: 1, x: 104.8, y: 127.7 });
f.s; f.diff;            // e.g. 0.999 and ~2 %
```
For a word made of separate letters (a name), fit each letter's x with a common scale
and baseline: compose the letters as a "line" (data-line + data-i) or use `fitLine` with
`freeScale: true` on per-letter pieces given `i` = order.

Outline-only lines: fit on the light-colour mask with a stroke width:
```js
const light = vp.colorMask(I, '#DDDDE3', 40);
const ln = vp.fitPiece(line.d, light, I, [0, 0, 259.92, 151.92], { s: 0.97 }, 0.25);
```
Lines often keep their exact shape but are rescaled as a group: also try fitting their
straight edges by least squares (see `fitting-and-quality.md`).

## 4. Inject, verify, replace

```js
const back = vp.panel(1);
const NAVY = vp.hexToRgb('#141831'), MAG = 'rgb(255, 0, 255)';
const plan = [ { d: L0.d, z: 14, fill: NAVY }, { d: f.d, z: 11, fill: vp.hexToRgb('#CC8425') } ];
const shapes = plan.map(p => vp.shape(p.d, p.z, { fill: MAG }, back));   // magenta first
vp.exec(doc => doc.document.panels[1].shapes.push(...shapes));
// zoom on screen: no original colour may show around the magenta
vp.exec(doc => { for (const s of doc.document.panels[1].shapes) { const p = plan[shapes.findIndex(x => x.id === s.id)]; if (p) { s.color = p.fill; s.stroke.color = p.fill; } } });
vp.check();                                                            // ok: true
vp.removeImage(1, I.id, [ { name: 'light text', kind: 'light', diff: L0.diff },
                          { name: 'orange band', kind: 'piece', diff: f.diff } ]);
// throws "STOP, image kept" if a difference is above vp.LIMITS or vp.check() fails:
// show the message to the user and wait for their answer
await vp.saved();                                                      // "Saved"
```
Then reload the page, reinstall the toolkit, `vp.summary()`, `vp.check()`.

Opaque front image with a baked-in background: add a background rectangle before removing
the image:
```js
vp.exec(doc => doc.document.panels[0].shapes.push({ type: 'rectangle', id: crypto.randomUUID(), zIndex: -1001, rotationAngle: '0',
  color: NAVY, stroke: { color: NAVY, thickness: '0mm' }, position: { x: '0mm', y: '0mm', width: doc.document.panels[0].width, height: doc.document.panels[0].height } }));
```

## 5. Change a text line already made of shapes (e.g. a phone number)

Compose the new text with the same style and size, then align it on the old line (same
baseline and tracking; right edge for right-aligned blocks):
```js
const old = /* fit result or shape of the old line */;
const T = vp.parseSvg(files['phone.svg']);
const right0 = Math.max(...T.map(g => g.b.x + g.b.w + g.i * L.ls));
const tx = oldRightEdge - right0;
const d = T.map(g => vp.xform(g.d, 1, 1, tx + g.i * L.ls, L.ty)).join('');
vp.exec(doc => Object.assign(doc.document.panels[1].shapes.find(s => s.id === shapeId), vp.geometry(d, vp.panel(1))));
```
Keep the card's existing typographic conventions (e.g. "(555) 010-0199" rather than
"555-010-0199" if the other cards use parentheses), and tell the user.

## 6. Raised foil

Finishes panel -> "Silver foil" (or Gold) -> tick each shape thumbnail. Re-read the
checkbox states after each click (the grid moves). Confirm in the document:
```js
vp.panel(0).shapes.filter(s => s.overprints).length;   // number of foiled shapes
```

### 6b. Raised foil postcard from layered SVGs, via a foil template

Raised foil postcard 6 x 9 in; the user gave two Illustrator layers at trim size
(432 x 648 pt): a green checkerboard (background) and gold ornaments + wordmark (foil).
The user first opened, by hand, a Vistaprint raised foil template (URL with
`template=...`); a blank postcard has no per-element foil ticks.

```bash
python scripts/svg_pieces.py background.svg bg_pieces.svg --rows   # 10 rows by colour
python scripts/svg_pieces.py gold.svg gold_pieces.svg              # 33 pieces
```
```js
const ids = vp.inject([
  ...vp.placeSvg(files['bg_pieces.svg'],   { trim: { w: 432, h: 648 }, fullBleed: true, z: 1001 }),
  ...vp.placeSvg(files['gold_pieces.svg'], { trim: { w: 432, h: 648 }, z: 1011 }),
]);
const goldIds = vp.panel(0).shapes.filter(s => s.color === 'rgb(204, 133, 37)').map(s => s.id);
vp.check();                          // ok: true
vp.foilSpot();                       // { used: ['spot(RaisedFoilGold)'], ... } from the template
vp.openFinishes();
await vp.tickFoil(goldIds);          // { asked: 33, foiled: 33, missing: [], unexpected: [] }
vp.removeTemplate(ids);              // template images, text boxes, rectangles, references, both sides
await vp.saveNow();                  // "Saved" (Save button clicked if needed)
// reload, reinstall, then:
vp.templateItems(ids);               // every list empty
await vp.pixelCheck([files['background.svg'], files['gold.svg']], { trim: { w: 432, h: 648 } });
```
Result here: 0.11 % of pixels differ by more than 10 levels, 22 pixels above 64, all on
anti-aliased edges (`ok: true`).

## 7. Recolour to exact hex

```js
const ids = vp.panel(0).shapes.filter(s => s.color === 'cmyk(3, 3, 0, 25)').map(s => s.id);
vp.exec(doc => { for (const s of doc.document.panels[0].shapes) if (ids.includes(s.id)) { s.color = 'rgb(184, 184, 190)'; s.stroke.color = s.color; } });
```

## 8. Repair shapes made with an older, buggy pipeline

Regenerate the sources (`compose_spec.py --raw` for the original, default for clean), then:
```js
const report = vp.repair([{ name: 'card', orig: files['lines-raw.svg'], net: files['lines.svg'] }], false); // dry run
vp.repair([...], true);   // apply: same positions, clean glyphs
vp.fixStrayLines();       // outline-only lines with a lost first segment
vp.check();
```
`vp.repair` matches every point (residual must stay < 0.02 pt) and tries the legacy and
clean parsings, so it recognises shapes injected before the implicit-lineto fix.

## 9. Last resort: tracing

```js
const loops = vp.trace(navy, I, [138, 112.6, 252.5, 142.2]);    // tolerance 0.15 px
const outer = loops.filter(l => vp.loopArea(l) > 0).length;      // count letters + holes as a check
const d = vp.loopsToD(loops);
```
Or locally: `python scripts/trace_png.py card.png out.svg --color #141831 --rows 128`.
