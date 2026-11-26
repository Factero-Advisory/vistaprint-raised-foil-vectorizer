/* vp_toolkit.js - in-page toolkit for Vistaprint Studio (vistaprint-raised-foil-vectorizer).
 * Copyright 2026 9467-8711 Québec inc. (Service conseils Factero)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Installs window.__vp. Load it with the browser's JavaScript tool, either pasted as is or
 * read from the hidden file input: new Function(await file.text())().
 * Every function is synchronous except files(), image(), panelImage() and saved().
 * Units: paths are in artboard points (vp.ART, default 259.92 x 151.92 pt = a business card
 * with bleed); Vistaprint places each shape in mm through viewBox -> position.
 * See references/toolkit-api.md for the full reference and worked examples.
 */
(() => {
  const RX = /[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g;
  const isL = (t) => /^[a-zA-Z]$/.test(t);
  const vp = (window.__vp = window.__vp || {});
  vp.version = '0.0.2';
  vp.ART = vp.ART || { w: 259.92, h: 151.92 };
  const HOSTS = /(^|\.)vistaprint\.[a-z]{2,3}(\.[a-z]{2})?$/i; // vistaprint.ca, .com, .co.uk, .com.au...: the toolkit only drives Vistaprint pages

  // ------------------------------------------------------------------ editor engine
  vp.engine = function () {
    if (!HOSTS.test(location.hostname)) throw new Error(`vp_toolkit only drives Vistaprint pages, not "${location.hostname}".`);
    if (vp._de && vp._de.cimDocStore) return vp._de;
    const root = [...document.querySelectorAll('body *')].find((e) => Object.keys(e).some((k) => k.startsWith('__reactContainer')));
    if (!root) throw new Error('React root not found: is the Studio page loaded?');
    const ck = Object.keys(root).find((k) => k.startsWith('__reactContainer'));
    const stack = [root[ck].stateNode ? root[ck].stateNode.current : root[ck]];
    while (stack.length) {
      const f = stack.pop();
      if (!f) continue;
      const v = f.memoizedProps && f.memoizedProps.value;
      if (v && typeof v === 'object') {
        try { if (v.designEngine && v.designEngine.cimDocStore) return (vp._de = v.designEngine); } catch (e) { /* guarded getter */ }
      }
      if (f.child) stack.push(f.child);
      if (f.sibling) stack.push(f.sibling);
    }
    throw new Error('designEngine not found: wait for the Studio to finish loading and retry.');
  };
  vp.doc = () => { const s = vp.engine().cimDocStore; return s.asJson || s.document; };
  vp.exec = (fn) => vp.engine().executeCommand((cimDoc) => { fn(cimDoc); }, {});
  vp.panel = (i) => vp.doc().document.panels[i];
  vp.scale = (p) => ({ SX: parseFloat(p.width) / vp.ART.w, SY: parseFloat(p.height) / vp.ART.h });
  vp.summary = () => vp.doc().document.panels.map((p) => ({
    side: p.name, size: `${parseFloat(p.width).toFixed(2)} x ${parseFloat(p.height).toFixed(2)} mm`,
    images: p.images.map((i) => ({ id: i.id, z: i.zIndex, pos: i.position })),
    shapes: p.shapes.map((s) => `${s.type} z${s.zIndex} ${s.color || '-'}${s.overprints ? ' ' + s.overprints.join(',') : ''}${s.stroke && s.stroke.thickness && !/^0(\.0*)?(pt|mm)$/.test(s.stroke.thickness) ? ' stroke ' + s.stroke.thickness : ''}`),
    textAreas: p.textAreas.length,
  }));

  // ------------------------------------------------------------------ paths
  function mkNorm(fixed) {
    return function (d) {
      const tok = d.match(RX); let i = 0, cx = 0, cy = 0, sx = 0, sy = 0, cmd = null, qx = null, qy = null, lc = null; const out = [];
      const num = () => parseFloat(tok[i++]); const isNum = () => i < tok.length && !isL(tok[i]);
      while (i < tok.length) {
        if (isL(tok[i])) cmd = tok[i++];
        let rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase();
        if (C === 'Z') { out.push('Z'); cx = sx; cy = sy; qx = qy = null; lc = null; continue; }
        do {
          // After an M, further coordinate pairs are IMPLICIT L commands. The legacy reader
          // (fixed=false) took them for M commands and dropped the first segment.
          if (fixed) { rel = cmd === cmd.toLowerCase(); C = cmd.toUpperCase(); }
          if (C === 'M') { let x = num(), y = num(); if (rel) { x += cx; y += cy; } cx = sx = x; cy = sy = y; out.push('M', x, y); cmd = rel ? 'l' : 'L'; qx = qy = null; lc = null; }
          else if (C === 'L') { let x = num(), y = num(); if (rel) { x += cx; y += cy; } out.push('L', x, y); cx = x; cy = y; qx = qy = null; lc = null; }
          else if (C === 'H') { let x = num(); if (rel) x += cx; out.push('L', x, cy); cx = x; qx = qy = null; lc = null; }
          else if (C === 'V') { let y = num(); if (rel) y += cy; out.push('L', cx, y); cy = y; qx = qy = null; lc = null; }
          else if (C === 'C' || C === 'S') {
            let a;
            if (C === 'C') { a = [num(), num(), num(), num(), num(), num()]; if (rel) for (let j = 0; j < 6; j += 2) { a[j] += cx; a[j + 1] += cy; } }
            else { const b = [num(), num(), num(), num()]; if (rel) for (let j = 0; j < 4; j += 2) { b[j] += cx; b[j + 1] += cy; } const r = lc ? [2 * cx - lc[0], 2 * cy - lc[1]] : [cx, cy]; a = [r[0], r[1], ...b]; }
            out.push('C', ...a); lc = [a[2], a[3]]; cx = a[4]; cy = a[5]; qx = qy = null;
          } else if (C === 'Q' || C === 'T') {
            let q1x, q1y;
            if (C === 'Q') { q1x = num(); q1y = num(); if (rel) { q1x += cx; q1y += cy; } } else { q1x = qx === null ? cx : 2 * cx - qx; q1y = qy === null ? cy : 2 * cy - qy; }
            let x = num(), y = num(); if (rel) { x += cx; y += cy; }
            out.push('C', cx + (2 / 3) * (q1x - cx), cy + (2 / 3) * (q1y - cy), x + (2 / 3) * (q1x - x), y + (2 / 3) * (q1y - y), x, y); qx = q1x; qy = q1y; cx = x; cy = y; lc = null;
          } else throw new Error('Unsupported command: ' + cmd + ' (convert arcs in Python with explicit())');
        } while (isNum());
      }
      return out.map((v) => (typeof v === 'string' ? v : ' ' + +v.toFixed(5))).join('');
    };
  }
  vp.norm = mkNorm(true);
  vp.normLegacy = mkNorm(false); // ONLY to recognise shapes created with the old, buggy reader

  vp.bbox = function (d) { // d normalised (absolute M/L/C/Z); curve extrema included
    const tok = d.match(RX); let i = 0, cx = 0, cy = 0, cmd; let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    const add = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
    const bez = (p0, p1, p2, p3, t) => { const u = 1 - t; return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3; };
    while (i < tok.length) {
      if (isL(tok[i])) cmd = tok[i++];
      if (cmd === 'Z' || cmd === 'z') continue;
      if (cmd === 'M' || cmd === 'L') { cx = +tok[i++]; cy = +tok[i++]; add(cx, cy); }
      else if (cmd === 'C') {
        const a = [+tok[i++], +tok[i++], +tok[i++], +tok[i++], +tok[i++], +tok[i++]]; add(a[4], a[5]);
        for (const [p0, p1, p2, p3] of [[cx, a[0], a[2], a[4]], [cy, a[1], a[3], a[5]]]) {
          const A = -p0 + 3 * p1 - 3 * p2 + p3, B = 2 * (p0 - 2 * p1 + p2), Cc = p1 - p0; const ts = [];
          if (Math.abs(A) < 1e-12) { if (Math.abs(B) > 1e-12) ts.push(-Cc / B); } else { const disc = B * B - 4 * A * Cc; if (disc >= 0) ts.push((-B + Math.sqrt(disc)) / (2 * A), (-B - Math.sqrt(disc)) / (2 * A)); }
          for (const t of ts) if (t > 0 && t < 1) add(bez(cx, a[0], a[2], a[4], t), bez(cy, a[1], a[3], a[5], t));
        }
        cx = a[4]; cy = a[5];
      } else throw new Error('bbox: path not normalised (run it through vp.norm)');
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  };
  vp.points = (d) => { const out = []; let buf = []; for (const t of d.match(RX)) { if (isL(t)) continue; buf.push(+t); if (buf.length === 2) { out.push(buf); buf = []; } } return out; };
  vp.xform = function (d, sx, sy, dx, dy) { // -> cimDoc style "M,x,yL,x,y..."
    let out = '', isX = true;
    for (const t of d.match(RX)) { if (isL(t)) { out += t; isX = true; continue; } const v = parseFloat(t); out += ',' + +(isX ? sx * v + dx : sy * v + dy).toFixed(4); isX = !isX; }
    return out;
  };
  vp.hexToRgb = (hex) => { const n = parseInt(hex.replace('#', ''), 16); return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`; };
  vp.shape = function (d, z, opt, panel) { // opt = {fill: 'rgb(...)'} or {stroke: 'rgb(...)', w: pt}
    const b = vp.bbox(d.replace(/,/g, ' ')); const { SX, SY } = vp.scale(panel); const f = (v) => +v.toFixed(4);
    const s = { id: crypto.randomUUID(), type: 'curve', zIndex: z, rotationAngle: '0', svgPathData: d, svgPathDataUnit: 'mm',
      viewBox: { x: f(b.x) + 'mm', y: f(b.y) + 'mm', width: f(b.w) + 'mm', height: f(b.h) + 'mm' }, closeBehavior: 0,
      position: { x: f(b.x * SX) + 'mm', y: f(b.y * SY) + 'mm', width: f(b.w * SX) + 'mm', height: f(b.h * SY) + 'mm' } };
    if (opt.fill) { s.color = opt.fill; s.stroke = { color: opt.fill, thickness: '0pt' }; }
    else { s.stroke = { color: opt.stroke, thickness: (+opt.w).toFixed(4) + 'pt' }; } // no color = outline only
    return s;
  };
  vp.geometry = function (d, panel) { // new geometry for an existing shape (same id, z, colour)
    const b = vp.bbox(d.replace(/,/g, ' ')); const { SX, SY } = vp.scale(panel); const f = (v) => +v.toFixed(4);
    return { svgPathData: d, viewBox: { x: f(b.x) + 'mm', y: f(b.y) + 'mm', width: f(b.w) + 'mm', height: f(b.h) + 'mm' },
      position: { x: f(b.x * SX) + 'mm', y: f(b.y * SY) + 'mm', width: f(b.w * SX) + 'mm', height: f(b.h * SY) + 'mm' } };
  };

  // ------------------------------------------------------------------ local files
  vp.fileInput = function () { // hidden input; fill it with the file_upload tool (find "fx svg loader")
    let inp = document.getElementById('fxfile');
    if (!inp) { inp = document.createElement('input'); inp.type = 'file'; inp.id = 'fxfile'; inp.setAttribute('aria-label', 'fx svg loader');
      inp.style.cssText = 'position:fixed;left:0;bottom:0;width:1px;height:1px;opacity:0;'; document.body.appendChild(inp); }
    inp.multiple = true; return 'fx svg loader';
  };
  vp.files = async function () { const out = {}; for (const f of document.getElementById('fxfile').files) out[f.name] = await f.text(); return out; };
  vp.parseSvg = function (text, normFn) { // -> [{attrs, d (normalised), p2d, b, line, i}]
    const n = normFn || vp.norm;
    return [...new DOMParser().parseFromString(text, 'image/svg+xml').querySelectorAll('path')].map((el) => {
      const attrs = {}; for (const a of el.attributes) attrs[a.name] = a.value; const d = n(el.getAttribute('d'));
      return { attrs, d, p2d: new Path2D(d), b: vp.bbox(d), line: el.hasAttribute('data-line') ? +el.getAttribute('data-line') : null, i: el.hasAttribute('data-i') ? +el.getAttribute('data-i') : null };
    });
  };

  // ------------------------------------------------------------------ images and masks
  vp.image = async function (url) {
    const img = await new Promise((res, rej) => { const x = new Image(); x.crossOrigin = 'anonymous'; x.onload = () => res(x); x.onerror = rej; x.src = url; });
    const W = img.naturalWidth, H = img.naturalHeight; const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    return { img, W, H, D: g.getImageData(0, 0, W, H).data, k: W / vp.ART.w };
  };
  vp.panelImage = async (panelIndex, n = 0) => { const im = vp.panel(panelIndex).images[n]; const I = await vp.image(im.originalSourceUrl); I.id = im.id; return I; };
  vp.colorMask = function (I, hex, tol = 60) { // alpha of pixels near a colour; tol = RGB distance
    const n = parseInt(hex.replace('#', ''), 16), R = (n >> 16) & 255, G = (n >> 8) & 255, B = n & 255; const M = new Uint8ClampedArray(I.W * I.H);
    for (let p = 0; p < I.W * I.H; p++) { const i = p * 4; const a = I.D[i + 3]; if (a < 8) continue; const dr = I.D[i] - R, dg = I.D[i + 1] - G, db = I.D[i + 2] - B; if (dr * dr + dg * dg + db * db <= tol * tol) M[p] = a; }
    return M;
  };
  vp.opaqueMask = function (I, fgHex, bgHex) { // opaque image (background baked in): foreground coverage from luminance
    const L = (h) => { const n = parseInt(h.replace('#', ''), 16); return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255); };
    const lf = L(fgHex), lb = L(bgHex); const M = new Uint8ClampedArray(I.W * I.H);
    for (let p = 0; p < I.W * I.H; p++) { const i = p * 4; const l = 0.299 * I.D[i] + 0.587 * I.D[i + 1] + 0.114 * I.D[i + 2]; M[p] = Math.max(0, Math.min(255, Math.round((255 * (l - lb)) / (lf - lb)))); }
    return M;
  };
  vp.renderMask = function (d, I) { // mask of an existing shape (e.g. a trace to be replaced by font outlines)
    const c = document.createElement('canvas'); c.width = I.W; c.height = I.H; const g = c.getContext('2d'); g.setTransform(I.k, 0, 0, I.k, 0, 0); g.fill(new Path2D(d.replace(/,/g, ' ')));
    const D = g.getImageData(0, 0, I.W, I.H).data; const M = new Uint8ClampedArray(I.W * I.H); for (let p = 0; p < M.length; p++) M[p] = D[p * 4 + 3]; return M;
  };
  vp.inkBox = function (M, I, box) { // box = [x0, x1, y0, y1] in pt -> ink bounds in pt
    const k = I.k; let a = 1e9, b = 1e9, c = -1, d = -1;
    for (let y = Math.round(box[2] * k); y < Math.round(box[3] * k); y++) for (let x = Math.round(box[0] * k); x < Math.round(box[1] * k); x++) if (M[y * I.W + x] > 128) { if (x < a) a = x; if (y < b) b = y; if (x > c) c = x; if (y > d) d = y; }
    return c < 0 ? null : { x0: a / k, y0: b / k, x1: (c + 1) / k, y1: (d + 1) / k };
  };
  vp.rows = function (M, I, box) { // horizontal ink bands (pt) inside box
    const k = I.k, out = []; let s = -1;
    for (let y = Math.round(box[2] * k); y < Math.round(box[3] * k); y++) { let n = 0; for (let x = Math.round(box[0] * k); x < Math.round(box[1] * k); x++) if (M[y * I.W + x] > 128) n++;
      if (n > 0) { if (s < 0) s = y; } else if (s >= 0) { out.push([+(s / k).toFixed(2), +(y / k).toFixed(2)]); s = -1; } }
    if (s >= 0) out.push([+(s / k).toFixed(2), box[3]]); return out;
  };

  // ------------------------------------------------------------------ fitting
  const cv = document.createElement('canvas'); const cg = cv.getContext('2d', { willReadFrequently: true });
  function region(R, k) { const rx0 = Math.floor(R[0] * k), ry0 = Math.floor(R[1] * k); return [rx0, ry0, Math.ceil((R[2] - R[0]) * k), Math.ceil((R[3] - R[1]) * k)]; }
  function draw(g, items, k, rx0, ry0) { for (const it of items) { g.setTransform(k * it.sx, 0, 0, k * it.sy, k * it.dx - rx0, k * it.dy - ry0); if (it.stroke) { g.lineWidth = it.stroke; g.stroke(it.p2d); } else g.fill(it.p2d); } }
  vp.sse = function (items, M, I, R) { // items: {p2d, sx, sy, dx, dy[, stroke]}; R = [x0, y0, x1, y1] pt
    const [rx0, ry0, rw, rh] = region(R, I.k); cv.width = rw; cv.height = rh; cg.clearRect(0, 0, rw, rh); draw(cg, items, I.k, rx0, ry0);
    const B = cg.getImageData(0, 0, rw, rh).data; let e = 0;
    for (let y = 0; y < rh; y++) { const o = (ry0 + y) * I.W + rx0; for (let x = 0; x < rw; x++) { const t = M[o + x] - B[(y * rw + x) * 4 + 3]; e += t * t; } }
    return e;
  };
  vp.diff = function (items, M, I, R) { // % of ink pixels that differ (50 % threshold)
    const [rx0, ry0, rw, rh] = region(R, I.k); const c = document.createElement('canvas'); c.width = rw; c.height = rh; const g = c.getContext('2d'); draw(g, items, I.k, rx0, ry0);
    const B = g.getImageData(0, 0, rw, rh).data; let d = 0, ink = 0, me = 0, im = 0;
    for (let y = 0; y < rh; y++) { const o = (ry0 + y) * I.W + rx0; for (let x = 0; x < rw; x++) { const a = M[o + x] > 128, b = B[(y * rw + x) * 4 + 3] > 128; if (a || b) ink++; if (a !== b) { d++; if (b) me++; else im++; } } }
    return { pct: +((100 * d) / Math.max(ink, 1)).toFixed(2), vectorOnly: me, imageOnly: im };
  };
  // Fit a line of composed glyphs (compose_spec.py): position, baseline, tracking (ls, pt per
  // HarfBuzz index), scale if opt.freeScale, then per-glyph nudges.
  vp.fitLine = function (glyphs, M, I, box, opt = {}) {
    const gs = glyphs; const img = vp.inkBox(M, I, box); if (!img) throw new Error('no ink in the box');
    const R = [img.x0 - 1, img.y0 - 0.8, img.x1 + 1, img.y1 + 0.8];
    const mb = { x0: Math.min(...gs.map((g) => g.b.x)), x1: Math.max(...gs.map((g) => g.b.x + g.b.w)), y0: Math.min(...gs.map((g) => g.b.y)), y1: Math.max(...gs.map((g) => g.b.y + g.b.h)) };
    const s0 = opt.scale || (opt.freeScale ? (img.y1 - img.y0) / (mb.y1 - mb.y0) : 1);
    let p = { sx: s0, sy: s0, ls: 0, tx: img.x0 - s0 * mb.x0, ty: img.y0 - s0 * mb.y0 };
    if (opt.alignRight) p.tx = img.x1 - s0 * mb.x1;
    const items = (q) => gs.map((g) => ({ p2d: g.p2d, sx: q.sx, sy: q.sy, dx: q.tx + g.i * q.ls, dy: q.ty }));
    let be = vp.sse(items(p), M, I, R); const lr = opt.ls || [-0.2, 0.04];
    const nLast = Math.max(...gs.map((g) => g.i));
    for (let ls = lr[0]; ls <= lr[1] + 1e-9; ls += (lr[1] - lr[0]) / 14) for (let dd = -0.6; dd <= 0.6 + 1e-9; dd += 0.1) {
      const tx = opt.alignRight ? img.x1 - p.sx * mb.x1 - nLast * ls + dd : img.x0 - p.sx * mb.x0 + dd; const q = { ...p, ls, tx }; const e = vp.sse(items(q), M, I, R); if (e < be) { be = e; p = q; } }
    for (const [sS, tS, lS] of [[0.004, 0.04, 0.01], [0.0015, 0.015, 0.004], [0.0005, 0.005, 0.0015], [0.00015, 0.0015, 0.0005]]) {
      let imp = true, guard = 0;
      while (imp && guard++ < 60) { imp = false; const cands = [[0, 0, tS, 0, 0], [0, 0, -tS, 0, 0], [0, 0, 0, tS, 0], [0, 0, 0, -tS, 0], [0, 0, 0, 0, lS], [0, 0, 0, 0, -lS]];
        if (opt.freeScale) cands.push(opt.anisotropic ? [sS, 0, 0, 0, 0] : [sS, sS, 0, 0, 0], opt.anisotropic ? [-sS, 0, 0, 0, 0] : [-sS, -sS, 0, 0, 0]);
        if (opt.freeScale && opt.anisotropic) cands.push([0, sS, 0, 0, 0], [0, -sS, 0, 0, 0]);
        for (const [dsx, dsy, dtx, dty, dls] of cands) { const q = { sx: p.sx + dsx, sy: p.sy + dsy, tx: p.tx + dtx - (dsx * (mb.x0 + mb.x1)) / 2, ty: p.ty + dty - dsy * mb.y1, ls: p.ls + dls };
          const e = vp.sse(items(q), M, I, R); if (e < be) { be = e; p = q; imp = true; } } } }
    const pos = gs.map((g) => p.tx + g.i * p.ls); const span = opt.span || (s0 > 1.5 ? 0.2 : 0.12);
    for (let pass = 0; pass < 2; pass++) for (let j = 0; j < gs.length; j++) {
      const g = gs[j]; const gx = pos[j] + p.sx * g.b.x; const Rg = [gx - 0.8, R[1], gx + p.sx * g.b.w + 0.8, R[3]];
      const near = gs.map((h, m) => m).filter((m) => Math.abs(pos[m] + p.sx * gs[m].b.x - gx) < 14 * p.sx); let bx = pos[j], b2 = Infinity; const base = pos[j];
      for (let dd = -span; dd <= span + 1e-9; dd += span / 24) { pos[j] = base + dd; const e = vp.sse(near.map((m) => ({ p2d: gs[m].p2d, sx: p.sx, sy: p.sy, dx: pos[m], dy: p.ty })), M, I, Rg); if (e < b2) { b2 = e; bx = base + dd; } }
      pos[j] = bx; }
    const res = { ...p, pos, R, glyphs: gs };
    res.diff = vp.diff(gs.map((g, j) => ({ p2d: g.p2d, sx: p.sx, sy: p.sy, dx: pos[j], dy: p.ty })), M, I, R);
    res.d = gs.map((g, j) => vp.xform(g.d, p.sx, p.sy, pos[j], p.ty)).join('');
    return res;
  };
  // Fit a single piece (logo band, whole word, outline-only line): uniform scale + translation.
  vp.fitPiece = function (d, M, I, R, seed = {}, strokeW = 0) {
    const p2d = new Path2D(d); const b = vp.bbox(d); const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    let st = { s: seed.s || 1, dx: 0, dy: 0 };
    if (seed.x !== undefined) { st.dx = seed.x - st.s * b.x; st.dy = seed.y - st.s * b.y; } else { st.dx = seed.dx || 0; st.dy = seed.dy || 0; }
    const it = (q) => [{ p2d, sx: q.s, sy: q.s, dx: q.dx, dy: q.dy, stroke: strokeW ? strokeW / q.s : 0 }];
    let be = vp.sse(it(st), M, I, R);
    for (const [sS, tS] of [[0.004, 0.1], [0.002, 0.04], [0.0008, 0.015], [0.0003, 0.005], [0.0001, 0.002]]) {
      let imp = true, guard = 0;
      while (imp && guard++ < 60) { imp = false; for (const [ds, ddx, ddy] of [[sS, 0, 0], [-sS, 0, 0], [0, tS, 0], [0, -tS, 0], [0, 0, tS], [0, 0, -tS]]) {
        const q = { s: st.s + ds, dx: st.dx + ddx - ds * cx, dy: st.dy + ddy - ds * cy }; const e = vp.sse(it(q), M, I, R); if (e < be) { be = e; st = q; imp = true; } } } }
    return { ...st, diff: vp.diff(it(st), M, I, R), d: vp.xform(d, st.s, st.s, st.dx, st.dy) };
  };

  // ------------------------------------------------------------------ tracing (last resort)
  vp.trace = function (M, I, R, tol = 0.15) { // sub-pixel isocontours + Douglas-Peucker -> loops in pt
    const k = I.k, X0 = Math.floor(R[0] * k), Y0 = Math.floor(R[1] * k), w = Math.ceil(R[2] * k) - X0, h = Math.ceil(R[3] * k) - Y0;
    const v = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : M[(Y0 + y) * I.W + X0 + x]); const ISO = 127.5; const key = (p) => p[0].toFixed(4) + ',' + p[1].toFixed(4);
    const ip = (x1, y1, a, x2, y2, b) => { const t = (ISO - a) / (b - a); return [x1 + (x2 - x1) * t, y1 + (y2 - y1) * t]; }; const edges = [];
    for (let y = -1; y < h; y++) for (let x = -1; x < w; x++) {
      const a = v(x, y), b = v(x + 1, y), c = v(x + 1, y + 1), d = v(x, y + 1); const idx = (a > ISO ? 8 : 0) | (b > ISO ? 4 : 0) | (c > ISO ? 2 : 0) | (d > ISO ? 1 : 0); if (idx === 0 || idx === 15) continue;
      const T = () => ip(x, y, a, x + 1, y, b), Rt = () => ip(x + 1, y, b, x + 1, y + 1, c), B = () => ip(x, y + 1, d, x + 1, y + 1, c), L = () => ip(x, y, a, x, y + 1, d); const add = (p, q) => edges.push([p, q]);
      switch (idx) { case 1: add(L(), B()); break; case 2: add(B(), Rt()); break; case 3: add(L(), Rt()); break; case 4: add(Rt(), T()); break; case 5: add(L(), T()); add(Rt(), B()); break;
        case 6: add(B(), T()); break; case 7: add(L(), T()); break; case 8: add(T(), L()); break; case 9: add(T(), B()); break; case 10: add(T(), Rt()); add(B(), L()); break;
        case 11: add(T(), Rt()); break; case 12: add(Rt(), L()); break; case 13: add(Rt(), B()); break; case 14: add(B(), L()); break; } }
    const from = new Map(); edges.forEach((e, i) => from.set(key(e[0]), i)); const used = new Uint8Array(edges.length); const loops = [];
    for (let i = 0; i < edges.length; i++) { if (used[i]) continue; const loop = []; let j = i, guard = 0; while (j !== undefined && !used[j] && guard++ < 500000) { used[j] = 1; loop.push(edges[j][0]); j = from.get(key(edges[j][1])); } if (loop.length > 8) loops.push(loop); }
    const dp = (pts) => { if (pts.length < 3) return pts; const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1; const st = [[0, pts.length - 1]];
      while (st.length) { const [a, b] = st.pop(); let md = 0, mi = -1; const [ax, ay] = pts[a], [bx, by] = pts[b]; const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1e-9;
        for (let i = a + 1; i < b; i++) { const dd = Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / L; if (dd > md) { md = dd; mi = i; } } if (md > tol) { keep[mi] = 1; st.push([a, mi], [mi, b]); } }
      return pts.filter((_, i) => keep[i]); };
    const simp = loops.map((l) => { let far = 0, fd = 0; for (let i = 1; i < l.length; i++) { const dd = Math.hypot(l[i][0] - l[0][0], l[i][1] - l[0][1]); if (dd > fd) { fd = dd; far = i; } } const a = dp(l.slice(0, far + 1)), b = dp(l.slice(far).concat([l[0]])); return a.concat(b.slice(1, -1)); });
    return simp.map((l) => l.map(([x, y]) => [(X0 + x + 0.5) / k, (Y0 + y + 0.5) / k]));
  };
  vp.loopsToD = (loops) => loops.map((l) => 'M' + l.map((p) => p[0].toFixed(4) + ' ' + p[1].toFixed(4)).join('L') + 'Z').join('');
  vp.loopArea = (l) => { let s = 0; for (let i = 0; i < l.length; i++) { const p = l[i], q = l[(i + 1) % l.length]; s += p[0] * q[1] - q[0] * p[1]; } return s / 2; };

  // ------------------------------------------------------------------ checks and repair
  // Vistaprint fills with the even-odd rule: any shape whose area changes between nonzero and
  // even-odd has overlaps (= holes in print). An M followed by another M or by Z = a lost segment.
  vp.check = function () {
    const out = { evenOddMismatch: [], strayMoves: [] };
    vp.doc().document.panels.forEach((p) => p.shapes.forEach((s) => {
      if (s.type !== 'curve') return;
      const tk = s.svgPathData.match(RX); let stray = 0;
      for (let i = 0; i < tk.length; i++) if (tk[i] === 'M') { const j = tk.slice(i + 3).findIndex(isL); const nx = tk[i + 3 + j]; if (nx === 'M' || nx === 'Z') stray++; }
      if (stray) out.strayMoves.push(`${p.name} z${s.zIndex}: ${stray}`);
      if (s.overprints || !s.color || /cmyka/.test(s.color)) return; // foil: rendered by Vistaprint; outline-only: no fill
      const vb = { x: parseFloat(s.viewBox.x), y: parseFloat(s.viewBox.y), w: parseFloat(s.viewBox.width), h: parseFloat(s.viewBox.height) }; const S = 20;
      const c = document.createElement('canvas'); c.width = Math.ceil(vb.w * S) + 2; c.height = Math.ceil(vb.h * S) + 2; const g = c.getContext('2d'); const P = new Path2D(s.svgPathData.replace(/,/g, ' '));
      g.setTransform(S, 0, 0, S, -vb.x * S + 1, -vb.y * S + 1); g.fill(P, 'nonzero'); const A = g.getImageData(0, 0, c.width, c.height).data;
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, c.width, c.height); g.setTransform(S, 0, 0, S, -vb.x * S + 1, -vb.y * S + 1); g.fill(P, 'evenodd'); const B = g.getImageData(0, 0, c.width, c.height).data;
      let nz = 0, eo = 0; for (let i = 3; i < A.length; i += 4) { if (A[i] > 128) nz++; if (B[i] > 128) eo++; }
      if (nz !== eo) out.evenOddMismatch.push(`${p.name} z${s.zIndex}: ${((100 * (nz - eo)) / nz).toFixed(2)} %`);
    }));
    out.ok = !out.evenOddMismatch.length && !out.strayMoves.length; return out;
  };

  // ------------------------------------------------------------------ safety gate
  // An image is removed only through vp.removeImage. It refuses when a measured difference is
  // above the limit of its kind (SKILL.md section 5) or when vp.check() fails: the agent then
  // stops and asks the user. Every removal and refusal is kept in vp.log for the session log.
  vp.LIMITS = { svg: 1, piece: 3, bold: 4, light: 11, trace: 1, line: null }; // max % pixel difference; null = no benchmark, the user decides
  vp.log = vp.log || [];
  const pctOf = (x) => (typeof x === 'number' ? x : x && typeof x.pct === 'number' ? x.pct : NaN);
  vp.gate = function (evidence) { // evidence: [{name, kind, diff}] with diff = a vp.diff() result (or its pct)
    const failures = [];
    if (!Array.isArray(evidence) || !evidence.length) failures.push('no evidence: measure every replacement element with vp.diff() first');
    for (const e of Array.isArray(evidence) ? evidence : []) {
      const name = (e && e.name) || '?'; const kind = e && e.kind; const pct = pctOf(e && e.diff);
      if (!Object.prototype.hasOwnProperty.call(vp.LIMITS, kind)) failures.push(`${name}: unknown kind "${kind}" (use ${Object.keys(vp.LIMITS).join(', ')})`);
      else if (vp.LIMITS[kind] === null) failures.push(`${name}: no pixel benchmark for "${kind}", the user must confirm after the magenta overlay check`);
      else if (!Number.isFinite(pct)) failures.push(`${name}: no measured difference`);
      else if (pct > vp.LIMITS[kind]) failures.push(`${name}: ${pct} % > ${vp.LIMITS[kind]} % allowed for "${kind}"`);
    }
    const chk = vp.check();
    if (!chk.ok) failures.push(`vp.check() failed (${chk.evenOddMismatch.length} even-odd mismatch, ${chk.strayMoves.length} stray move)`);
    return { ok: !failures.length, failures };
  };
  vp.removeImage = function (panelIndex, imageId, evidence, opt = {}) {
    const p = vp.panel(panelIndex); if (!p) throw new Error(`no panel ${panelIndex}`);
    if (!p.images.some((i) => i.id === imageId)) throw new Error(`image ${imageId} not found on panel ${panelIndex}`);
    const g = vp.gate(evidence);
    const approval = typeof opt.userApproved === 'string' ? opt.userApproved.trim() : '';
    const now = new Date().toISOString();
    if (!g.ok && !approval) {
      vp.log.push({ at: now, event: 'removal refused', panel: panelIndex, image: imageId, failures: g.failures });
      throw new Error(`STOP, image kept. ${g.failures.join(' | ')}. Show this to the user and ask what to do. Retry with {userApproved: "<the user's own words>"} only if the user says so in the chat.`);
    }
    vp.exec((cimDoc) => { const imgs = cimDoc.document.panels[panelIndex].images; const k = imgs.findIndex((i) => i.id === imageId); if (k >= 0) imgs.splice(k, 1); });
    const entry = { at: now, event: 'image removed', panel: panelIndex, image: imageId,
      evidence: (Array.isArray(evidence) ? evidence : []).map((e) => ({ name: e && e.name, kind: e && e.kind, pct: pctOf(e && e.diff) })),
      failures: g.failures, userApproved: g.ok ? null : approval };
    vp.log.push(entry); return entry;
  };
  vp.fixStrayLines = function () { // outline-only lines whose first segment was lost: "M a b M c d" -> "M a b L c d"
    const ups = {};
    vp.doc().document.panels.forEach((p) => p.shapes.forEach((s) => { if (s.type !== 'curve' || s.overprints) return; if (s.color && !/cmyka/.test(s.color)) return;
      if (/^M,?[-\d.]+,?[-\d.]+M/.test(s.svgPathData)) ups[s.id] = s.svgPathData.replace(/^(M,?[-\d.]+,?[-\d.]+)M/, '$1L'); }));
    if (Object.keys(ups).length) vp.exec((cimDoc) => { for (const p of cimDoc.document.panels) for (const s of p.shapes) if (ups[s.id]) s.svgPathData = ups[s.id]; });
    return Object.keys(ups).length;
  };
  // Repair: rebuild existing shapes from clean glyphs at exactly the same positions.
  // sources: [{name, orig: svgText, net: svgText}] (compose_spec.py --raw / default, or svg_pieces.py).
  // Glyphs are grouped by data-line (or data-piece without its numeric suffix). Each shape is
  // matched on ALL its points (common scale and dy, dx per glyph), trying the legacy and clean states.
  vp.candidates = function (sources) {
    const cands = [];
    for (const src of sources) {
      const o = [...new DOMParser().parseFromString(src.orig, 'image/svg+xml').querySelectorAll('path')];
      const n = [...new DOMParser().parseFromString(src.net, 'image/svg+xml').querySelectorAll('path')];
      const groups = {}; o.forEach((el, i) => { const key = el.getAttribute('data-line') ?? (el.getAttribute('data-piece') || '').replace(/-\d+$/, ''); (groups[key] = groups[key] || []).push({ oRaw: el.getAttribute('d'), nRaw: n[i].getAttribute('d') }); });
      for (const [key, gs] of Object.entries(groups)) for (const state of ['legacyOrig', 'legacyNet', 'clean']) {
        const g2 = gs.map((g) => ({ P: vp.points(state === 'legacyOrig' ? vp.normLegacy(g.oRaw) : state === 'legacyNet' ? vp.normLegacy(g.nRaw) : vp.norm(g.nRaw)), net: vp.norm(g.nRaw) }));
        cands.push({ src: src.name, key, state, gs: g2, nP: g2.reduce((s, g) => s + g.P.length, 0) }); } }
    return cands;
  };
  vp.match = function (cands, svgPathData) { // same point count; common scale and dy; dx per glyph
    const SP = vp.points(svgPathData); let best = null;
    for (const c of cands) { if (c.nP !== SP.length) continue; let idx = 0; const pairs = []; c.gs.forEach((g, j) => g.P.forEach((q) => pairs.push({ j, src: q, dst: SP[idx++] })));
      const N = pairs.length; let sy = 0, sY = 0, syy = 0, syY = 0; for (const q of pairs) { sy += q.src[1]; sY += q.dst[1]; syy += q.src[1] ** 2; syY += q.src[1] * q.dst[1]; }
      const den = N * syy - sy * sy; if (Math.abs(den) < 1e-9) continue; const sc = (N * syY - sy * sY) / den, dy = (sY - sc * sy) / N; const dx = {}, cnt = {};
      for (const q of pairs) { dx[q.j] = (dx[q.j] || 0) + (q.dst[0] - sc * q.src[0]); cnt[q.j] = (cnt[q.j] || 0) + 1; } for (const j in dx) dx[j] /= cnt[j];
      let res = 0; for (const q of pairs) { res = Math.max(res, Math.abs(q.dst[0] - (sc * q.src[0] + dx[q.j])), Math.abs(q.dst[1] - (sc * q.src[1] + dy))); if (res > 0.02) break; }
      if (res < 0.02 && (!best || res < best.res)) best = { c, sc, dy, dx, res }; }
    if (best) best.d = best.c.gs.map((g, j) => vp.xform(g.net, best.sc, best.sc, best.dx[j], best.dy)).join('');
    return best;
  };
  vp.repair = function (sources, apply = false) {
    const cands = vp.candidates(sources); const report = [], updates = {};
    vp.doc().document.panels.forEach((p) => p.shapes.forEach((s) => {
      if (s.type !== 'curve' || !s.color || s.overprints || /cmyka/.test(s.color)) return;
      const best = vp.match(cands, s.svgPathData); if (!best) return;
      updates[s.id] = vp.geometry(best.d, p); report.push(`${p.name} z${s.zIndex} <- ${best.c.src}#${best.c.key} (${best.c.state}) s=${best.sc.toFixed(4)} residual=${best.res.toFixed(4)}`); }));
    if (apply && Object.keys(updates).length) vp.exec((cimDoc) => { for (const p of cimDoc.document.panels) for (const s of p.shapes) { const u = updates[s.id]; if (u) Object.assign(s, u); } });
    return report;
  };

  // ------------------------------------------------------------------ saving and previews
  vp.saveState = () => { const b = [...document.querySelectorAll('button')].find((x) => /^(Saved|Saving|Save)\b/i.test((x.getAttribute('aria-label') || x.textContent || '').trim())); return b ? (b.getAttribute('aria-label') || b.textContent).trim() : 'not found'; };
  vp.saved = async (tries = 10) => { let st = '?'; for (let i = 0; i < tries; i++) { await new Promise((r) => setTimeout(r, 2500)); st = vp.saveState(); if (st === 'Saved') break; } return st; };
  vp.overlay = function (canvases, bg = '#fff') { vp.overlayOff(); const ov = document.createElement('div'); ov.id = 'fxov';
    ov.style.cssText = `position:fixed;inset:0;background:${bg};z-index:2147483647;display:flex;flex-direction:column;gap:6px;align-items:center;justify-content:center;padding:4px;box-sizing:border-box`;
    for (const c of [].concat(canvases)) { c.style.cssText = 'max-width:100%;max-height:100%;'; ov.appendChild(c); } document.body.appendChild(ov); return 'preview shown (vp.overlayOff() removes it)'; };
  vp.overlayOff = () => { const o = document.getElementById('fxov'); if (o) o.remove(); return 'preview removed'; };
  vp.zoomImage = function (I, R, scale = 10, bg = '#fff') { // enlarge an image area (pt) to read its text
    const c = document.createElement('canvas'); c.width = Math.round((R[2] - R[0]) * scale); c.height = Math.round((R[3] - R[1]) * scale); const g = c.getContext('2d'); g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(I.img, R[0] * I.k, R[1] * I.k, (R[2] - R[0]) * I.k, (R[3] - R[1]) * I.k, 0, 0, c.width, c.height); return c; };
  vp.renderShapes = function (panelIndex, R, scale = 8, rule = 'evenodd', filter = () => true) { // render "as Vistaprint does" (even-odd)
    const p = vp.panel(panelIndex); const c = document.createElement('canvas'); c.width = Math.round((R[2] - R[0]) * scale); c.height = Math.round((R[3] - R[1]) * scale); const g = c.getContext('2d');
    for (const s of [...p.shapes].sort((a, b) => a.zIndex - b.zIndex)) { if (s.type !== 'curve' || !filter(s)) continue; g.setTransform(scale, 0, 0, scale, -R[0] * scale, -R[1] * scale);
      const P = new Path2D(s.svgPathData.replace(/,/g, ' ')); if (s.color && !/cmyka/.test(s.color)) { g.fillStyle = s.color; g.fill(P, rule); } else if (s.overprints) { g.fillStyle = '#aaa'; g.fill(P, rule); }
      else { g.strokeStyle = s.stroke.color; g.lineWidth = Math.max(parseFloat(s.stroke.thickness) / (s.stroke.thickness.endsWith('mm') ? 0.352778 : 1), 0.1); g.stroke(P); } }
    return c; };
  return `vp_toolkit ${vp.version} installed (window.__vp)`;
})();
