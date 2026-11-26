# Vistaprint Studio internals

Observed in October-November 2026 on vistaprint.ca and vistaprint.com (Studio, business
cards; raised foil postcards 6 x 9 in, November 2026). These are undocumented internals: re-check them when something stops working.

## 1. Reaching the design engine

The Studio is a React application built on Cimpress' design engine. The engine is not on
`window`; it lives in a React context. Walk the fiber tree from the element that carries a
`__reactContainer$...` key and stop at the first `memoizedProps.value` that has
`designEngine.cimDocStore` (`vp.engine()` does exactly this).

| Member | Use |
|---|---|
| `designEngine.cimDocStore.asJson` | the current design document (cimDoc) as plain JSON |
| `designEngine.executeCommand(fn, args)` | the editor's own write path: `fn(cimDoc)` receives a mutable draft; changes join the undo history and the autosave |
| `designEngine.historyStore` | undo/redo (not needed in practice) |

`vp.exec(fn)` wraps `executeCommand`. Read with `vp.doc()`. The engine reference is lost
on every page navigation: reinstall the toolkit.

## 2. The cimDoc

```
doc.document.panels[]           Front, Back (one per printed side)
  width, height                 "91.72mm", "53.62mm" (card with bleed); "158mm", "234mm"
                                for a 6 x 9 in postcard (bleed about 2.8 mm per side)
  decorationTechnology          "offsetOrDigital"
  images[]                      {id, zIndex, position, originalSourceUrl, printUrl, previewUrl, cropFractions}
  shapes[]                      rectangles, curves (see below)
  textAreas[]                   live text (not used by this skill)
doc.metadata                    studio metadata (leave untouched)
```

`originalSourceUrl` serves the uploaded file with CORS, so `vp.image()` can read its pixels
into a canvas. A PNG that covers the whole panel (`position` 0, 0, full width and height,
`cropFractions` all 0) maps its artboard onto the panel.

## 3. Shapes

```js
{
  id: crypto.randomUUID(), type: "curve", zIndex: 12, rotationAngle: "0",
  svgPathData: "M,13.3,17.4L,...C,...Z",        // absolute commands, comma separated
  svgPathDataUnit: "mm",
  viewBox:  { x: "13.3mm", y: "11.2mm", width: "89.1mm", height: "7.6mm" },  // path units
  position: { x: "4.69mm", y: "3.95mm", width: "31.4mm", height: "2.68mm" }, // on the card
  closeBehavior: 0,
  color: "rgb(20, 24, 49)",
  stroke: { color: "rgb(20, 24, 49)", thickness: "0pt" }
}
```

- The viewBox (in whatever units the path uses, labelled "mm") is mapped onto `position`.
  The toolkit keeps paths in artboard points and sets `viewBox` = path bounds and
  `position` = bounds x (panel width / artboard width), likewise for y.
- The Studio's own shapes (square, circle, arrows, star...) are curves too.
- Background colour = a `rectangle` at `zIndex: -1001` covering the panel.
- Outline-only shape: omit `color`, set `stroke.thickness` (e.g. "0.2432pt"); after a save
  the server stores `color: "cmyka(0,0,0,0,0)"` and the thickness in mm.
- Shapes are filled with the **even-odd** rule. Overlapping contours become holes.
- Fill order follows `zIndex` (higher on top).

## 4. Colours

| Entered as | Stored as |
|---|---|
| hex in the colour picker (`#B8B8BE`) | `rgb(184, 184, 190)` |
| Studio swatch / template | often `cmyk(84, 74, 53, 60)` |

The picker displays CMYK through a naive conversion, so a CMYK value you compute will not
read back as the hex the user typed. Inject `rgb(r, g, b)` (`vp.hexToRgb`).

## 5. Raised foil

- Product pages state that raised foil is not offered on fully uploaded designs; in the
  Studio the Finishes panel lists only **shapes and text** as foil candidates.
- Ticking a shape writes `overprints: ["spot(RaisedFoilSilver)"]` (Gold:
  `spot(RaisedFoilGold)`) and removes `color` from that shape.
- Foil applies to the front only on business cards; the panel shows the price impact
  ("at no extra cost" observed for silver on a Raised Foil product).
- Vistaprint's raised foil product page asks for text of 13 pt or larger; hairlines may not
  foil well.
- Do it through the UI (Finishes -> tick the thumbnails) when the product offers it. The
  thumbnail grid shifts once the warning banner disappears after the first tick: re-read
  the checkbox states (`input[type=checkbox]` with `aria-label="Apply finish"`) instead of
  trusting positions.

### Raised foil postcards: start from a foil template (November 2026)

On "Raised Foil Postcards" (`mpvId=embossedFoilPostcards`, 6 x 9 in, Paper Finish "Gold
Foil") a blank design only offers "Text only / Image only / Text and images" plus a
free-text Instructions box: no per-element ticks, and "Save selection" only writes
`metadata.reviewInstructions` (no `overprints`). Do not use that path.

The working method:

1. **The user manually opens a Vistaprint template that already has raised foil.** Claude
   never picks it. The URL then carries `template=...`. With such a template the Finishes
   panel is the business-card one: "Apply gold foil to elements on the front", sections
   Text / Images / Shapes, one `input[type=checkbox][aria-label="Apply finish"]` per image
   and shape, plus text checkboxes. Template text foil is stored inside the text content
   (`content[].overprints: ["spot(RaisedFoilGold)"]`); read the spot name there.
2. Insert the vectors through the API: `vp.placeSvg(text, {trim, fullBleed, z})` then
   `vp.inject(shapes)`, z-index above the template (from 1001), background first, foil
   pieces after.
3. Tick the foil shapes in the Finishes panel. The "Apply finish" thumbnails follow the
   images first, then the shapes in `panel.shapes` order, so shape `i` is checkbox
   `images.length + i`; confirm on one tick by reading which shape got `overprints`.
   The panel closes and reloads by itself after some ticks: before each click wait until
   all checkboxes are present again, `scrollIntoView` the checkbox, click, wait about
   1.5 s, and drive the loop from the document (skip shapes that already have
   `overprints`), never from checkbox positions. `vp.tickFoil(ids)` does all of this.
4. Delete everything that belonged to the template, on both sides: images (background,
   lines), text areas, background rectangles, shapes that are not yours,
   `itemReferences`. Foil on your shapes survives the removal. `vp.removeTemplate(ids)`.
5. Save explicitly: `vp.saved()` can answer "Saved" before the autosave starts, and a
   removal was lost that way. Wait for "Save", click the toolbar Save button ("Saved to My
   Projects" toast), then reload (the URL becomes `?workId=...`), reinstall, and check:
   no template element left (`vp.templateItems(ids)`), foil count, `vp.check()`.
   `vp.saveNow()` does the save part.
6. Pixel check against the source SVGs: draw the SVGs and the shapes on two canvases at
   4 px/pt over the trim area and count differing pixels. Shape `viewBox` values are path
   units (points), not mm, even though they carry "mm": scale = position (pt) / viewBox.
   Reference result: 0.11 % of pixels differ by more than 10 levels, all on anti-aliased
   edges. `vp.pixelCheck(svgTexts, {trim})`.

Writing `overprints` directly with `vp.exec` on a blank postcard also renders as foil in
the Studio, but it bypasses the panel; use it only if the user asks, after the template
method fails.

## 6. Saving

- Autosave runs after changes; the toolbar button's accessible name is "Saved" when done
  ("Save" while pending). `vp.saveState()` / `await vp.saved()`.
- A navigation with pending changes raises a "Leave site?" dialog: do not force it.
- Editing a design that is already in the cart shows a notice; the cart keeps the old
  version until the user clicks Update cart.

## 7. Browser automation notes

- The upload tool only accepts files from folders the session may read (working
  directory, scratchpad); `~/.claude` and Downloads are refused. Copy first.
- `new Function(code)()` is allowed by the Studio's content security policy; long code can
  therefore be uploaded as a file and run, instead of pasted.
- Tool output filters may mask strings that look like tokens (e.g. "1.0.0" or "x-y"
  pairs): return numbers or objects instead of formatted strings.
- After a heavy injection, screenshots can time out for minutes while JavaScript still
  answers; verify by computation.
- Projects list: `https://www.vistaprint.<tld>/my-account/design/projects`; each card shows
  its Identification # (the `workId` of `studio/?workId=...`).
