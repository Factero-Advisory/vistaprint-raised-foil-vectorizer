# Vistaprint Studio internals

Observed in October-November 2026 on vistaprint.ca and vistaprint.com (Studio, business
cards). These are undocumented internals: re-check them when something stops working.

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
  width, height                 "91.72mm", "53.62mm" (card with bleed)
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
- Vistaprint advises foil on elements of about 12-13 pt and larger; hairlines may not foil
  well.
- Do it through the UI (Finishes -> tick the thumbnails). The thumbnail grid shifts once
  the warning banner disappears after the first tick: re-read the checkbox states
  (`input[type=checkbox]` with `aria-label="Apply finish"`) instead of trusting positions.

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
