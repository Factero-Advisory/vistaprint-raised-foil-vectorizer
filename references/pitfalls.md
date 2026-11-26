# Pitfalls (symptom -> cause -> fix)

| # | Symptom | Cause | Fix |
|---|---|---|---|
| 1 | Letters with a missing wedge (A, P, 4, V, R...), slanted strokes "thinner" than the font | fontTools' SVGPathPen writes implicit lineto after M ("M x y x2 y2"); a reader that fixes the command once per letter takes the pairs for M commands and drops the first segment | Scripts write explicit M/L/C/Z; read paths with `vp.norm` (recomputes the command at every pair). Repair old shapes with `vp.repair` and `vp.fixStrayLines` |
| 2 | Holes inside letters only once on the card | Overlapping contours (variable fonts, Illustrator outlines) + Vistaprint's even-odd fill | `clean()` / `clean_overlaps.py`; `vp.check()` must show no even-odd mismatch |
| 3 | JavaScript call fails with "Internal error" or never returns | A path parser loops forever on an unhandled command (H, V, S, Q, A) | Normalise with `vp.norm` before any custom parsing; convert arcs in Python (`explicit()`) |
| 4 | `vp.bbox` throws "path not normalised" | Raw SVG path passed | `vp.bbox(vp.norm(d))` |
| 5 | Upload tool refuses a file | Only session-readable folders are allowed (`~/.claude` and Downloads are not) | Copy to the working directory or scratchpad first |
| 6 | Files "disappear" from the hidden input | Each upload replaces the list | Upload every needed file in one call; re-upload after navigation |
| 7 | `window.__vp` undefined | Page navigated or reloaded | Reinstall the toolkit; recreate the hidden input |
| 8 | Screenshots time out for minutes after injecting | Renderer busy with heavy shapes while JavaScript still answers | Verify by computation (`vp.diff`, `vp.check`) and by `vp.saveState()`; retry screenshots later |
| 9 | Colour reads back as #BABABF instead of #B8B8BE | CMYK approximation injected | Inject `rgb(r, g, b)` (`vp.hexToRgb`) |
| 10 | Foil checkbox clicks land on the wrong thumbnails | The warning banner disappears after the first tick and the grid moves up | Re-read `input[type=checkbox][aria-label="Apply finish"]` states; click by fresh coordinates |
| 11 | Text "does not match" its font by 9-19 % with words starting at the right x | The image was rendered by Vistaprint from an uploaded SVG with live text: substitute font | Use the SVG geometry and the real font; do not fit against such a PNG |
| 12 | Fitted text slightly longer than the image | The PNG was exported tighter than the SVG (about -3/1000 em) | Per-glyph fit against the image the user sees |
| 13 | A 72 ppi image as reference | Uploaded artwork too small | Prefer vector sources; accept ±1 px (0.35 mm) only where nothing better exists |
| 14 | Tool output shows "[BLOCKED: ...]" | Output filter masks token-like strings | Return numbers or nested objects |
| 15 | Truncated JSON output | Output size limit | Return summaries; move big data through files (upload) instead |
| 16 | "Leave site?" on navigation | Unsaved changes | Wait for "Saved"; never force |
| 17 | Design in the cart still shows the old artwork at checkout | Cart keeps a snapshot | The user clicks Update cart; never click it for them |
| 18 | Optimiser drifts to a wrong scale (e.g. 13.8 pt for 14 pt text) | Poor seed or a neighbour in the fit region | Seed the size from a flat cap height (N, E, H), anchor on the first glyph, keep regions tight |
| 19 | Bands or pieces overlap in a different order than in the SVG | Designer reordered them | Check which colour shows in the overlap zone of the image; set zIndex accordingly |
| 20 | Weight test says "lighter than 900" | Overlaps counted twice, or the implicit-lineto bug | Clean both sides; re-check outlines before concluding |
