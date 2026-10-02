/* Распознавание PDF-чертежа: стены, окна, двери, оборудование, столы и стулья.
   Работает и в браузере (window.PlanRec), и в Node (module.exports) — для проверки на настоящем PDF.
   Единицы на выходе — метры. Система координат «как на схеме»: x — слева направо вдоль фасада,
   y — вглубь… к улице: улица со стороны большого y (внизу схемы), фасад — линия y = facadeY. */
(function (root) {
  'use strict';

  /* ---------- 1. Вытаскиваем из страницы PDF линии, заливки и подписи ---------- */
  async function extract(page, pdfjsLib) {
    const vp = page.getViewport({ scale: 1 });
    const opList = await page.getOperatorList();
    const O = pdfjsLib.OPS;
    const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
    const hex = a => '#' + Array.from(a).slice(0, 3).map(v => (v | 0).toString(16).padStart(2, '0')).join('');
    const FILLS = [O.fill, O.eoFill, O.fillStroke, O.eoFillStroke, O.closeFillStroke, O.closeEOFillStroke];
    const PAINT = FILLS.concat([O.stroke, O.closeStroke]);
    let ctm = vp.transform.slice(), st = [], S = '#000000', F = '#000000', lw = 1, pend = null;
    const paths = [];
    for (let i = 0; i < opList.fnArray.length; i++) {
      const f = opList.fnArray[i], a = opList.argsArray[i];
      if (f === O.save) st.push([ctm, S, F, lw]);
      else if (f === O.restore) { const s = st.pop(); if (s) [ctm, S, F, lw] = s; }
      else if (f === O.transform) ctm = mul(ctm, a);
      else if (f === O.setLineWidth) lw = a[0];
      else if (f === O.setStrokeRGBColor) S = hex(a);
      else if (f === O.setFillRGBColor) F = hex(a);
      else if (f === O.setStrokeGray) S = hex([a[0] * 255, a[0] * 255, a[0] * 255]);
      else if (f === O.setFillGray) F = hex([a[0] * 255, a[0] * 255, a[0] * 255]);
      else if (f === O.constructPath) pend = { ops: a[0], args: a[1], m: ctm };
      else if (PAINT.indexOf(f) >= 0) {
        if (pend) {
          const m = pend.m, tp = (x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
          const polys = [], curved = [];
          let cur = null, cv = false, k = 0, last = [0, 0];
          const start = p => { cur = [p]; cv = false; polys.push(cur); curved.push(false); };
          const bez = (p0, p1, p2, p3) => { for (let s = 1; s <= 6; s++) { const t = s / 6, u = 1 - t; cur.push([u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]); } curved[curved.length - 1] = true; };
          for (const op of pend.ops) {
            const A = pend.args;
            if (op === O.moveTo) { last = [A[k], A[k + 1]]; start(tp(last[0], last[1])); k += 2; }
            else if (op === O.lineTo) { if (!cur) start(tp(last[0], last[1])); last = [A[k], A[k + 1]]; cur.push(tp(last[0], last[1])); k += 2; }
            else if (op === O.curveTo) { if (!cur) start(tp(last[0], last[1])); bez(tp(last[0], last[1]), tp(A[k], A[k + 1]), tp(A[k + 2], A[k + 3]), tp(A[k + 4], A[k + 5])); last = [A[k + 4], A[k + 5]]; k += 6; }
            else if (op === O.curveTo2) { if (!cur) start(tp(last[0], last[1])); bez(tp(last[0], last[1]), tp(last[0], last[1]), tp(A[k], A[k + 1]), tp(A[k + 2], A[k + 3])); last = [A[k + 2], A[k + 3]]; k += 4; }
            else if (op === O.curveTo3) { if (!cur) start(tp(last[0], last[1])); bez(tp(last[0], last[1]), tp(A[k], A[k + 1]), tp(A[k + 2], A[k + 3]), tp(A[k + 2], A[k + 3])); last = [A[k + 2], A[k + 3]]; k += 4; }
            else if (op === O.rectangle) { const [x, y, w, h] = A.slice(k, k + 4); start(tp(x, y)); cur.push(tp(x + w, y), tp(x + w, y + h), tp(x, y + h), tp(x, y)); last = [x, y]; k += 4; cur = null; }
            else if (op === O.closePath) { if (cur && cur.length) cur.push(cur[0].slice()); cur = null; }
          }
          const isFill = FILLS.indexOf(f) >= 0;
          paths.push({ S, F: isFill ? F : null, lw: lw * Math.hypot(m[0], m[1]), polys: polys.filter(p => p.length > 1), curved });
        }
        pend = null;
      } else if (f === O.endPath) pend = null;
    }
    const tc = await page.getTextContent();
    const texts = tc.items.filter(t => t.str && t.str.trim()).map(t => {
      const m = pdfjsLib.Util.transform(vp.transform, t.transform);
      return { s: t.str.trim(), x: m[4], y: m[5], a: Math.atan2(m[1], m[0]), w: t.width, h: Math.hypot(m[2], m[3]) };
    });
    return { W: vp.width, H: vp.height, paths, texts };
  }

  /* ---------- геометрия ---------- */
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  function area(r) { let s = 0; for (let i = 0, n = r.length; i < n; i++) { const p = r[i], q = r[(i + 1) % n]; s += p[0] * q[1] - q[0] * p[1]; } return s / 2; }
  function inRing(p, r) { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }
  function segDist(p, a, b) { const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy; let t = L ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); }
  function rayHit(p, d, rings, maxL) { // расстояние до ближайшей стены по лучу
    let best = Infinity;
    for (const r of rings) for (let i = 0; i < r.length; i++) {
      const a = r[i], b = r[(i + 1) % r.length], ex = b[0] - a[0], ey = b[1] - a[1];
      const den = d[0] * ey - d[1] * ex; if (Math.abs(den) < 1e-12) continue;
      const t = ((a[0] - p[0]) * ey - (a[1] - p[1]) * ex) / den, u = ((a[0] - p[0]) * d[1] - (a[1] - p[1]) * d[0]) / den;
      if (t > 1e-6 && u >= 0 && u <= 1 && t < best) best = t;
    }
    return best <= (maxL || Infinity) ? best : Infinity;
  }
  /* склейка заливки, нарезанной на треугольники/прямоугольники, в цельные контуры:
     общие рёбра соседних кусков взаимно уничтожаются, остаются только внешние */
  function unionRings(rings) {
    const E = 1e-3, key = p => Math.round(p[0] / E) + ',' + Math.round(p[1] / E);
    const verts = []; rings.forEach(r => r.forEach(p => verts.push(p)));
    let edges = [];
    rings.forEach(r => { const rr = area(r) < 0 ? r.slice().reverse() : r; for (let i = 0; i < rr.length; i++) edges.push([rr[i], rr[(i + 1) % rr.length]]); });
    // разбить рёбра в точках, где на них лежат чужие вершины (Т-образные стыки)
    const split = [];
    edges.forEach(([a, b]) => {
      const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy; if (L2 < 1e-10) return;
      const ts = [];
      verts.forEach(v => { const t = ((v[0] - a[0]) * dx + (v[1] - a[1]) * dy) / L2; if (t <= 1e-4 || t >= 1 - 1e-4) return; const px = a[0] + t * dx, py = a[1] + t * dy; if (Math.hypot(v[0] - px, v[1] - py) < 2e-3) ts.push(t); });
      ts.sort((x, y) => x - y); let prev = a;
      ts.forEach(t => { const p = [a[0] + t * dx, a[1] + t * dy]; if (dist(p, prev) > 1e-3) { split.push([prev, p]); prev = p; } });
      if (dist(prev, b) > 1e-3) split.push([prev, b]);
    });
    // взаимно уничтожить встречные рёбра
    const cnt = new Map();
    split.forEach(([a, b]) => { const k = key(a) + '>' + key(b), rk = key(b) + '>' + key(a); if (cnt.get(rk) > 0) cnt.set(rk, cnt.get(rk) - 1); else cnt.set(k, (cnt.get(k) || 0) + 1); });
    const byStart = new Map(), pt = new Map();
    split.forEach(([a, b]) => { pt.set(key(a), a); pt.set(key(b), b); });
    cnt.forEach((n, k) => { const [ka, kb] = k.split('>'); for (let i = 0; i < n; i++) { if (!byStart.has(ka)) byStart.set(ka, []); byStart.get(ka).push(kb); } });
    const loops = [];
    byStart.forEach((list, ka) => {
      while (list.length) {
        const loop = [pt.get(ka)]; let cur = list.pop(), guard = 0;
        while (cur !== ka && guard++ < 100000) { loop.push(pt.get(cur)); const nx = byStart.get(cur); if (!nx || !nx.length) break; cur = nx.pop(); }
        if (cur === ka && loop.length >= 3) loops.push(loop);
      }
    });
    // убрать точки на прямой
    return loops.map(l => l.filter((p, i) => { const a = l[(i - 1 + l.length) % l.length], b = l[(i + 1) % l.length]; return Math.abs((p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0])) > 1e-6; })).filter(l => l.length >= 3 && Math.abs(area(l)) > 0.002);
  }

  function hexHue(h) { const r = parseInt(h.substr(1, 2), 16) / 255, g = parseInt(h.substr(3, 2), 16) / 255, b = parseInt(h.substr(5, 2), 16) / 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let hu = 0; if (d) { if (mx === r) hu = ((g - b) / d) % 6; else if (mx === g) hu = (b - r) / d + 2; else hu = (r - g) / d + 4; } return { h: (hu * 60 + 360) % 360, s: mx ? d / mx : 0, v: mx }; }

  /* ---------- 2. масштаб по размерным линиям ---------- */
  function findScale(flat) {
    const segs = [];
    flat.paths.forEach(p => { if (p.F) return; p.polys.forEach((q, qi) => { if (p.curved[qi]) return; for (let i = 1; i < q.length; i++) segs.push([q[i - 1], q[i]]); }); });
    const pts = [];
    flat.texts.forEach(t => {
      if (!/^\d{2,5}$/.test(t.s)) return;
      const v = +t.s, u = [Math.cos(t.a), Math.sin(t.a)], n = [-u[1], u[0]], c = [t.x + u[0] * t.w / 2, t.y + u[1] * t.w / 2];
      let best = null;
      for (const s of segs) {
        const dx = s[1][0] - s[0][0], dy = s[1][1] - s[0][1], L = Math.hypot(dx, dy);
        if (L < t.w || Math.abs((dx * u[0] + dy * u[1]) / L) < 0.998) continue;
        const pa = (s[0][0] - c[0]) * u[0] + (s[0][1] - c[1]) * u[1], pb = (s[1][0] - c[0]) * u[0] + (s[1][1] - c[1]) * u[1];
        if (Math.min(pa, pb) > 0 || Math.max(pa, pb) < 0) continue;
        const perp = Math.abs((s[0][0] - c[0]) * n[0] + (s[0][1] - c[1]) * n[1]);
        if (perp > Math.max(4, t.h * 0.8)) continue;
        if (!best || perp < best.perp) best = { perp, L };
      }
      if (best) pts.push([v, best.L]);
    });
    if (pts.length < 3) return null;
    // L = v/k + e (размерная линия обычно чуть длиннее размера): подбираем k, отбрасывая выбросы
    let use = pts.slice(), k = 0, e = 0;
    for (let it = 0; it < 4; it++) {
      const n = use.length, sx = use.reduce((a, p) => a + p[0], 0), sy = use.reduce((a, p) => a + p[1], 0), sxx = use.reduce((a, p) => a + p[0] * p[0], 0), sxy = use.reduce((a, p) => a + p[0] * p[1], 0);
      const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx); e = (sy - slope * sx) / n; k = 1 / slope;
      const res = pts.map(p => Math.abs(p[1] - (p[0] / k + e)));
      const tol = Math.max(0.6, res.slice().sort((a, b) => a - b)[Math.floor(res.length * 0.6)] * 2);
      use = pts.filter((p, i) => res[i] <= tol);
      if (use.length < 3) break;
    }
    if (!(k > 0) || !isFinite(k)) return null;
    return { mmPerPt: k, support: use.length, total: pts.length };
  }

  /* ---------- 3. слои по цвету ---------- */
  function layerStats(flat) {
    const L = {};
    flat.paths.forEach(p => {
      const key = p.F ? 'fill:' + p.F : 'line:' + p.S;
      const o = L[key] || (L[key] = { key, color: p.F || p.S, fill: !!p.F, n: 0, len: 0, area: 0 });
      o.n++;
      p.polys.forEach(q => { for (let i = 1; i < q.length; i++) o.len += dist(q[i - 1], q[i]); if (p.F) o.area += Math.abs(area(q)); });
    });
    return Object.values(L);
  }
  function guessKinds(stats) {
    const kinds = {};
    const fills = stats.filter(s => s.fill && s.color !== '#ffffff' && s.color !== '#000000').sort((a, b) => b.area - a.area);
    const wallFill = fills[0];
    stats.forEach(s => {
      const hv = hexHue(s.color);
      let k = 'equip';
      if (wallFill && s.key === wallFill.key) k = 'wall';
      else if (s.fill) k = (hv.h > 80 && hv.h < 160 && hv.s < 0.35) ? 'table' : (s.color === '#000000' ? 'equip' : 'ignore');
      else if (wallFill && s.color === wallFill.color) k = 'ignore';
      else if (hv.s > 0.6 && hv.v > 0.6 && hv.h > 170 && hv.h < 250) k = 'window';
      else if (hv.s > 0.6 && hv.h > 15 && hv.h < 45) k = 'wallline';   // контуры стен и двери (оранжевые)
      else if (hv.s < 0.1 && hv.v > 0.8) k = 'ignore';                    // светло-серая штриховка
      kinds[s.key] = k;
    });
    return kinds;
  }

  /* ---------- 4. распознавание ---------- */
  const RULES = [ // подпись на чертеже → тип из базы (порядок = приоритет)
    [/куб|kc70|кс70/i, 'cube'], [/премьер/i, 'fridgePremier'], [/хо\s*[-−–]\s*18|^-18|−18|[-–]18\s*°/i, 'freezerCab'],
    [/хо\s*\+\s*4/i, 'fridgeSolid'], [/\+\s*4\s*°/i, 'fridgeGlass'], [/морож/i, 'ICE'], [/кофе/i, 'coffee'],
    [/касса/i, 'KASSA'], [/снеки/i, 'rack'], [/разогрев/i, 'heat'], [/вмэ/i, 'sink'],
    [/xef|unox|печь|пароконв/i, 'oven'], [/сп-?\s*\d/i, 'prodTable'], [/f\s*600/i, 'chestFreezer'],
    [/нск/i, 'kitchenRack'], [/шг-?\s*\d/i, 'locker'], [/^тв$|телевизор/i, 'tv']
  ];
  function ruleType(labels, w, d) {
    const found = [];
    for (const [re, t] of RULES) if (labels.some(s => re.test(s))) found.push(t);
    return found.map(t => t === 'ICE' ? (w * d < 1.0 ? 'iceChest' : 'iceIsland') : t === 'KASSA' ? (Math.max(w, d) >= 1.5 ? 'bar' : 'pos') : t);
  }

  function recognize(flat, opt) {
    opt = opt || {};
    const stats = layerStats(flat);
    const kinds = Object.assign(guessKinds(stats), opt.kinds || {});
    const sc = opt.mmPerPt ? { mmPerPt: opt.mmPerPt, support: 0, manual: true } : findScale(flat);
    if (!sc) return { error: 'scale', stats, kinds };
    const K = sc.mmPerPt / 1000; // метров в пункте
    const toM = p => [p[0] * K, p[1] * K];
    const kindOf = p => kinds[p.F ? 'fill:' + p.F : 'line:' + p.S];

    // стены: кольца заливки
    let rings = [];
    flat.paths.forEach(p => { if (kindOf(p) !== 'wall') return; p.polys.forEach(q => { const r = q.map(toM); if (dist(r[0], r[r.length - 1]) < 1e-3) r.pop(); if (r.length >= 3 && Math.abs(area(r)) > 0.004) rings.push(r); }); });
    // убрать дубли и склеить куски в цельные контуры
    rings = rings.filter((r, i) => !rings.some((o, j) => j < i && o.length === r.length && Math.abs(area(o) - area(r)) < 1e-4 && dist(o[0], r[0]) < 1e-3));
    rings = unionRings(rings);

    // окна: отрезки цвета «окно», собранные в группы
    const wsegs = [];
    flat.paths.forEach(p => { if (kindOf(p) !== 'window') return; p.polys.forEach(q => { for (let i = 1; i < q.length; i++) wsegs.push([toM(q[i - 1]), toM(q[i])]); }); });
    const groups = [];
    wsegs.forEach(s => {
      const near = groups.filter(g => g.some(t => Math.min(segDist(s[0], t[0], t[1]), segDist(s[1], t[0], t[1]), segDist(t[0], s[0], s[1]), segDist(t[1], s[0], s[1])) < 0.15));
      if (!near.length) groups.push([s]);
      else { const g = near[0]; g.push(s); near.slice(1).forEach(o => { o.forEach(x => g.push(x)); groups.splice(groups.indexOf(o), 1); }); }
    });
    const inWall = p => rings.some(r => inRing(p, r));
    const wallDist = p => { let b = Infinity; rings.forEach(r => { for (let i = 0; i < r.length; i++) b = Math.min(b, segDist(p, r[i], r[(i + 1) % r.length])); }); return b; };
    const windows = [];
    groups.forEach(g => {
      const P = []; g.forEach(s => P.push(s[0], s[1]));
      const cx = P.reduce((a, p) => a + p[0], 0) / P.length, cy = P.reduce((a, p) => a + p[1], 0) / P.length;
      let sxx = 0, syy = 0, sxy = 0; P.forEach(p => { sxx += (p[0] - cx) ** 2; syy += (p[1] - cy) ** 2; sxy += (p[0] - cx) * (p[1] - cy); });
      const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy), u = [Math.cos(ang), Math.sin(ang)], n = [-u[1], u[0]];
      let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
      P.forEach(p => { const a = (p[0] - cx) * u[0] + (p[1] - cy) * u[1], b = (p[0] - cx) * n[0] + (p[1] - cy) * n[1]; a0 = Math.min(a0, a); a1 = Math.max(a1, a); b0 = Math.min(b0, b); b1 = Math.max(b1, b); });
      const L = a1 - a0, Tk = b1 - b0;
      if (L < 0.4 || Tk > 1.0) return;
      const c = [cx + u[0] * (a0 + a1) / 2 + n[0] * (b0 + b1) / 2, cy + u[1] * (a0 + a1) / 2 + n[1] * (b0 + b1) / 2];
      // окно должно стоять в стене: концы упираются в стену
      const e1 = [c[0] - u[0] * (L / 2 + 0.06), c[1] - u[1] * (L / 2 + 0.06)], e2 = [c[0] + u[0] * (L / 2 + 0.06), c[1] + u[1] * (L / 2 + 0.06)];
      if (!(inWall(e1) || wallDist(e1) < 0.08) || !(inWall(e2) || wallDist(e2) < 0.08)) return;
      // где улица: луч в одну из сторон уходит «в никуда»
      const outA = rayHit(c, n, rings) === Infinity, outB = rayHit(c, [-n[0], -n[1]], rings) === Infinity;
      windows.push({ c, u, n: outA && !outB ? n : outB && !outA ? [-n[0], -n[1]] : null, L, T: Tk });
    });

    // направление улицы (фасад) — по наружным окнам
    const ext = windows.filter(w => w.n);
    let rot = 0;
    if (ext.length) {
      const nx = ext.reduce((a, w) => a + w.n[0], 0), ny = ext.reduce((a, w) => a + w.n[1], 0);
      const ang = Math.atan2(ny, nx); // хотим, чтобы наружу смотрело в +y
      rot = Math.round((Math.PI / 2 - ang) / (Math.PI / 2)) * 90;
    }
    rot = ((opt.rot != null ? opt.rot : rot) % 360 + 360) % 360;
    const cs = Math.round(Math.cos(rot * Math.PI / 180)), sn = Math.round(Math.sin(rot * Math.PI / 180));
    const R = p => [p[0] * cs - p[1] * sn, p[0] * sn + p[1] * cs];
    // рамка здания после поворота → сдвиг в 0
    let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity;
    rings.forEach(r => r.forEach(p => { const q = R(p); mnx = Math.min(mnx, q[0]); mny = Math.min(mny, q[1]); mxx = Math.max(mxx, q[0]); mxy = Math.max(mxy, q[1]); }));
    if (!isFinite(mnx)) return { error: 'walls', stats, kinds, scale: sc };
    const T = p => { const q = R(p); return [+(q[0] - mnx).toFixed(4), +(q[1] - mny).toFixed(4)]; };
    const TV = v => R(v);
    const rot2 = a => ((a + rot) % 360 + 360) % 360;
    const toPlan = p => T(toM(p));

    const W = { rings: rings.map(r => r.map(T)) };
    const wrings = W.rings;
    const inWall2 = p => wrings.some(r => inRing(p, r));
    const wallDist2 = p => { let b = Infinity; wrings.forEach(r => { for (let i = 0; i < r.length; i++) b = Math.min(b, segDist(p, r[i], r[(i + 1) % r.length])); }); return b; };
    function thickness(p, n) { // толщина стены поперёк проёма
      let a = 0, b = 0; for (let s = 0.02; s < 1.6; s += 0.02) { if (inWall2([p[0] + n[0] * s, p[1] + n[1] * s])) a = s; else if (a) break; }
      for (let s = 0.02; s < 1.6; s += 0.02) { if (inWall2([p[0] - n[0] * s, p[1] - n[1] * s])) b = s; else if (b) break; }
      return { a, b };
    }
    function opening(c, u, L) { // проём: середина, направление, толщина стены
      const n = [-u[1], u[0]];
      const probe = [c[0] + u[0] * (L / 2 + 0.08), c[1] + u[1] * (L / 2 + 0.08)];
      let t = thickness(probe, n);
      if (!(t.a + t.b > 0.05)) { const p2 = [c[0] - u[0] * (L / 2 + 0.08), c[1] - u[1] * (L / 2 + 0.08)]; t = thickness(p2, n); }
      if (!(t.a + t.b > 0.05)) t = { a: 0.15, b: 0.15 };
      return { n, t0: -t.b, t1: t.a };
    }
    const wins = windows.map((w, i) => {
      const c = T(w.c), u0 = TV(w.u), u = u0[0] < 0 || (u0[0] === 0 && u0[1] < 0) ? [-u0[0], -u0[1]] : u0;
      const op = opening(c, u, w.L);
      const nOut = w.n ? TV(w.n) : null;
      return { id: 'w' + (i + 1), c, u, L: +w.L.toFixed(3), n: op.n, t0: op.t0, t1: op.t1, out: nOut, facade: !!(nOut && nOut[1] > 0.7), sill: 0.55, top: 2.15 };
    });

    // двери: дуги радиусом 0.55–1.3 м
    const doors = [];
    flat.paths.forEach(p => {
      const k = kindOf(p); if (k === 'wall' || k === 'ignore' || k === 'table') return;
      p.polys.forEach((q, qi) => {
        if (!p.curved[qi] || q.length < 5) return;
        const A = toM(q[0]), B = toM(q[q.length - 1]), M = toM(q[q.length >> 1]);
        const ax = A[0], ay = A[1], bx = M[0], by = M[1], cx = B[0], cy = B[1];
        const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by)); if (Math.abs(d) < 1e-9) return;
        const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d;
        const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d;
        const r = Math.hypot(ax - ux, ay - uy);
        if (r < 0.5 || r > 1.35) return;
        const sweep = Math.abs(Math.atan2((A[0] - ux) * (B[1] - uy) - (A[1] - uy) * (B[0] - ux), (A[0] - ux) * (B[0] - ux) + (A[1] - uy) * (B[1] - uy)));
        if (sweep < 0.9 || sweep > 2.2) return; // ~ четверть круга
        const H = [ux, uy];
        // какой конец дуги лежит на линии стены (закрытое положение): рядом стена
        const ends = [A, B].map(e => ({ e, wd: (() => { const v = [e[0] - H[0], e[1] - H[1]], l = Math.hypot(v[0], v[1]); const pr = [e[0] + v[0] / l * 0.1, e[1] + v[1] / l * 0.1]; return Math.min(...rings.map(rr => { let b = Infinity; for (let i = 0; i < rr.length; i++) b = Math.min(b, segDist(pr, rr[i], rr[(i + 1) % rr.length])); return b; })); })() }));
        ends.sort((x, y) => x.wd - y.wd);
        const closed = ends[0].e;
        doors.push({ h: T(H), e: T(closed), w: +r.toFixed(3), sw: T(ends[1].e) });
      });
    });
    // убрать двойные дуги (двустворчатые/дубли)
    const doorsU = doors.filter((d, i) => !doors.some((o, j) => j < i && dist(o.h, d.h) < 0.1 && dist(o.e, d.e) < 0.1)).map((d, i) => {
      const u0 = [(d.e[0] - d.h[0]) / d.w, (d.e[1] - d.h[1]) / d.w], c = [(d.h[0] + d.e[0]) / 2, (d.h[1] + d.e[1]) / 2];
      const u = u0[0] < 0 || (Math.abs(u0[0]) < 1e-6 && u0[1] < 0) ? [-u0[0], -u0[1]] : u0;
      const op = opening(c, u, d.w);
      return { id: 'd' + (i + 1), c: c.map(v => +v.toFixed(3)), u, L: d.w, n: op.n, t0: op.t0, t1: op.t1, hinge: d.h, swing: d.sw };
    });

    // проёмы-разрывы: от короткого торца стены «смотрим» поперёк — если в 0,55–2,4 м напротив стена, а между пусто, это проём
    const allE = [];
    wrings.forEach(r => { for (let i = 0; i < r.length; i++) allE.push([r[i], r[(i + 1) % r.length]]); });
    const ends = [];
    allE.forEach(([a, b]) => { const L = dist(a, b); if (L < 0.06 || L > 1.0) return; const u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L]; let n = [-u[1], u[0]]; const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; if (inWall2([m[0] + n[0] * 0.03, m[1] + n[1] * 0.03])) n = [-n[0], -n[1]]; if (inWall2([m[0] + n[0] * 0.03, m[1] + n[1] * 0.03])) return; ends.push({ a, b, m, u, n, L }); });
    const gaps = [];
    ends.forEach(e => {
      // три луча: из середины и у краёв торца — проём должен быть открыт по всей толщине стены
      const hs = [0.5, 0.15, 0.85].map(t => rayHit([e.a[0] + (e.b[0] - e.a[0]) * t + e.n[0] * 1e-3, e.a[1] + (e.b[1] - e.a[1]) * t + e.n[1] * 1e-3], e.n, wrings, 3));
      const s = hs[0]; if (!(s >= 0.55 && s <= 1.65) || Math.abs(hs[1] - s) > 0.06 || Math.abs(hs[2] - s) > 0.06) return;
      const c = [e.m[0] + e.n[0] * s / 2, e.m[1] + e.n[1] * s / 2];
      if (inWall2(c)) return;
      gaps.push({ c, u: e.n, L: s, e });
    });
    // окно стоит в разрыве — это окно; остальное — двери и проходы
    const doorsG = [];
    gaps.sort((a, b) => a.L - b.L).forEach(g => {
      if (wins.some(w => dist(w.c, g.c) < Math.max(0.5, w.L / 2))) return;
      if (doorsG.some(d => dist(d.c, g.c) < 0.5)) return;
      if (doorsU.some(d => dist(d.c, g.c) < 0.5)) return;
      const u = g.u[0] < 0 || (Math.abs(g.u[0]) < 1e-6 && g.u[1] < 0) ? [-g.u[0], -g.u[1]] : g.u;
      const n = [-u[1], u[0]];
      const pr = p => (p[0] - g.c[0]) * n[0] + (p[1] - g.c[1]) * n[1], ts = [pr(g.e.a), pr(g.e.b)];
      doorsG.push({ id: 'g' + (doorsG.length + 1), c: g.c.map(v => +v.toFixed(3)), u, L: +g.L.toFixed(3), n, t0: Math.min(...ts), t1: Math.max(...ts) });
    });
    doorsU.push(...doorsG);
    // окно: толщина стены — по самому короткому торцу простенка у концов окна
    wins.forEach(w => {
      const pr = p => (p[0] - w.c[0]) * w.n[0] + (p[1] - w.c[1]) * w.n[1], al = p => (p[0] - w.c[0]) * w.u[0] + (p[1] - w.c[1]) * w.u[1];
      let best = null;
      allE.forEach(([a, b]) => { const L = dist(a, b); if (L < 0.06 || L > 1.6) return; const v = [(b[0] - a[0]) / L, (b[1] - a[1]) / L]; if (Math.abs(v[0] * w.n[0] + v[1] * w.n[1]) < 0.98) return; const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; if (Math.abs(Math.abs(al(m)) - w.L / 2) > 0.15 || Math.abs(pr(m)) > 1.2) return; if (!best || L < best.L) best = { L, a, b }; });
      if (best) { const ts = [pr(best.a), pr(best.b)]; w.t0 = Math.min(...ts); w.t1 = Math.max(...ts); }
    });
    // где проём выходит на улицу
    const escapes = (p, d) => rayHit(p, d, wrings) === Infinity;
    doorsU.forEach(d => { const a = escapes(d.c, d.n), b = escapes(d.c, [-d.n[0], -d.n[1]]); d.out = a && !b ? d.n : b && !a ? [-d.n[0], -d.n[1]] : null; d.facade = !!(d.out && d.out[1] > 0.7); });

    // внутренняя точка помещения: стены вокруг почти со всех сторон (окна и двери дают просветы)
    const DIRS = [0, 45, 90, 135, 180, 225, 270, 315].map(a => [Math.cos(a * Math.PI / 180), Math.sin(a * Math.PI / 180)]);
    const interior = p => !inWall2(p) && DIRS.filter(d => rayHit(p, d, wrings, 60) < Infinity).length >= 6;

    // столы: залитые круги (часто нарезаны на мелкие кусочки) — склеиваем по близости
    const blobs = [];
    flat.paths.forEach(p => {
      const k = kindOf(p); if (k !== 'table' && !(k === 'equip' || k === 'ignore')) return;
      p.polys.forEach((q, qi) => {
        if (k !== 'table' && !(p.curved[qi] && q.length > 12)) return;
        const r = q.map(toPlan); const xs = r.map(v => v[0]), ys = r.map(v => v[1]);
        const bb = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
        if (k !== 'table') { const w = bb[2] - bb[0], h = bb[3] - bb[1]; if (w < 0.5 || w > 1.1 || Math.abs(w - h) > 0.06) return; }
        const hit = blobs.filter(b => bb[0] <= b[2] + 0.03 && bb[2] >= b[0] - 0.03 && bb[1] <= b[3] + 0.03 && bb[3] >= b[1] - 0.03);
        if (!hit.length) blobs.push(bb.slice());
        else { const b = hit[0]; b[0] = Math.min(b[0], bb[0]); b[1] = Math.min(b[1], bb[1]); b[2] = Math.max(b[2], bb[2]); b[3] = Math.max(b[3], bb[3]); hit.slice(1).forEach(o => { b[0] = Math.min(b[0], o[0]); b[1] = Math.min(b[1], o[1]); b[2] = Math.max(b[2], o[2]); b[3] = Math.max(b[3], o[3]); blobs.splice(blobs.indexOf(o), 1); }); }
      });
    });
    const tables = [];
    blobs.forEach(b => { const w = b[2] - b[0], h = b[3] - b[1]; if (w < 0.45 || w > 1.15 || Math.abs(w - h) > 0.12) return; const c = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]; if (!tables.some(t => dist(t, c) < 0.3) && interior(c)) tables.push(c); });
    const nearTable = c => tables.some(t => { const d0 = dist(t, c); return d0 > 0.25 && d0 < 1.0; });

    // прямоугольники оборудования
    const rects = [];
    flat.paths.forEach(p => {
      const k = kindOf(p); if (k !== 'equip') return;
      p.polys.forEach((q, qi) => {
        if (p.curved[qi]) return;
        let r = q.map(toPlan); const closed = dist(r[0], r[r.length - 1]) < 0.02;
        if (closed) r = r.slice(0, -1);
        if (!closed && r.length !== 4) return;
        // убираем точки на прямой
        const s = []; r.forEach((pt, i) => { const a = r[(i - 1 + r.length) % r.length], b = r[(i + 1) % r.length]; const cr = (pt[0] - a[0]) * (b[1] - pt[1]) - (pt[1] - a[1]) * (b[0] - pt[0]); if (Math.abs(cr) > 1e-4) s.push(pt); });
        if (s.length !== 4) return;
        const e = [0, 1, 2, 3].map(i => [s[(i + 1) % 4][0] - s[i][0], s[(i + 1) % 4][1] - s[i][1]]);
        const ok = [0, 1, 2, 3].every(i => { const a = e[i], b = e[(i + 1) % 4]; return Math.abs(a[0] * b[0] + a[1] * b[1]) / (Math.hypot(...a) * Math.hypot(...b)) < 0.03; });
        if (!ok) return;
        const w = Math.hypot(...e[0]), d = Math.hypot(...e[1]);
        if (Math.min(w, d) < 0.22 || Math.max(w, d) > 6) return;
        const c = [(s[0][0] + s[2][0]) / 2, (s[0][1] + s[2][1]) / 2];
        if (Math.max(w, d) < 0.66 && nearTable(c)) return; // это стул у стола
        const ang = Math.atan2(e[0][1], e[0][0]) * 180 / Math.PI;
        rects.push({ c, w, d, ang, pts: s, A: w * d, col: p.S });
      });
    });
    // дубли и вложенные — оставляем внешний контур
    rects.sort((a, b) => b.A - a.A);
    const tops = [];
    rects.forEach(r => {
      if (!interior(r.c)) return;
      const host = tops.find(t => inRing(r.c, t.pts) && r.A <= t.A * 1.02);
      if (host) host.kids.push(r); else tops.push(Object.assign(r, { kids: [] }));
    });
    // подписи
    const T2 = flat.texts.map(t => ({ s: t.s, p: toPlan([t.x + Math.cos(t.a) * t.w / 2, t.y + Math.sin(t.a) * t.w / 2]) }));
    const items = [];
    const unmatched = [];
    const wallSideDist = (c, ang, half) => { const a = ang * Math.PI / 180; const v = [Math.cos(a), Math.sin(a)]; return wallDist2([c[0] + v[0] * half, c[1] + v[1] * half]); };
    tops.forEach(r => {
      const labels = T2.filter(t => inRing(t.p, r.pts) && !/^\d+$/.test(t.s)).map(t => t.s);
      const types = ruleType(labels, r.w, r.d);
      // ориентация: длинная сторона — ширина; «спина» — к ближайшей стене
      let W0 = r.w, D0 = r.d, ang = r.ang;
      if (D0 > W0) { const t = W0; W0 = D0; D0 = t; ang += 90; }
      // лицо смотрит в +локальный y; локальный y = ang+90
      const back1 = wallSideDist(r.c, ang + 90, D0 / 2 + 0.05), back2 = wallSideDist(r.c, ang - 90, D0 / 2 + 0.05);
      let face = back2 < back1 ? ang + 90 : ang - 90; // от стены
      if (Math.min(back1, back2) > 0.6) face = 90; // стоит отдельно — лицом к улице
      const rDeg = ((face - 90) % 360 + 360) % 360; // поворот предмета: 0 = лицом к улице (+y)
      const base = { x: +r.c[0].toFixed(3), y: +r.c[1].toFixed(3), r: Math.round(rDeg), w: +W0.toFixed(3), d: +D0.toFixed(3), label: labels.join(' · ') };
      if (!types.length) { unmatched.push(base); items.push(Object.assign({ t: 'generic' }, base)); return; }
      const stack = types.indexOf('oven') >= 0 && types.length > 1;
      types.filter(t => !(stack && t === 'oven')).slice(0, 1).forEach(t => items.push(Object.assign({ t }, base)));
      if (stack) items.push(Object.assign({ t: 'oven', on: true }, base));
    });

    // один и тот же предмет, нарисованный двумя контурами, — оставляем больший
    const bbox = i => { const h = (i.r % 180 === 90) ? [i.d / 2, i.w / 2] : [i.w / 2, i.d / 2]; return [i.x - h[0], i.y - h[1], i.x + h[0], i.y + h[1]]; };
    const overlap = (a, b) => { const A = bbox(a), B = bbox(b), w = Math.min(A[2], B[2]) - Math.max(A[0], B[0]), h = Math.min(A[3], B[3]) - Math.max(A[1], B[1]); return w > 0 && h > 0 ? (w * h) / Math.min(a.w * a.d, b.w * b.d) : 0; };
    for (let i = items.length - 1; i >= 0; i--) { const a = items[i]; if (items.some((b, j) => j !== i && b.t === a.t && (overlap(a, b) > 0.5 || (a.label && a.label === b.label && /[a-zа-я]{3}/i.test(a.label) && dist([a.x, a.y], [b.x, b.y]) < 0.7 && overlap(a, b) > 0)) && (b.w * b.d > a.w * a.d || (b.w * b.d === a.w * a.d && j < i)))) items.splice(i, 1); }
    // столы и стулья
    tables.forEach(c => items.push({ t: 'table', x: +c[0].toFixed(3), y: +c[1].toFixed(3), r: 0 }));
    const cblobs = [];
    flat.paths.forEach(p => {
      const k = kindOf(p); if (k !== 'equip') return;
      p.polys.forEach(q => {
        const r = q.map(toPlan); const xs = r.map(v => v[0]), ys = r.map(v => v[1]);
        const bb = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
        if (Math.max(bb[2] - bb[0], bb[3] - bb[1]) > 0.66) return;
        const c = [(bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2];
        if (!nearTable(c) || tables.some(t => dist(t, c) < 0.36)) return;
        const hit = cblobs.find(o => bb[0] <= o[2] + 0.02 && bb[2] >= o[0] - 0.02 && bb[1] <= o[3] + 0.02 && bb[3] >= o[1] - 0.02);
        if (hit) { hit[0] = Math.min(hit[0], bb[0]); hit[1] = Math.min(hit[1], bb[1]); hit[2] = Math.max(hit[2], bb[2]); hit[3] = Math.max(hit[3], bb[3]); } else cblobs.push(bb);
      });
    });
    const chairs = [];
    cblobs.forEach(b => { const w = b[2] - b[0], h = b[3] - b[1]; if (w < 0.3 || h < 0.3 || w > 0.7 || h > 0.7) return; const c = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]; if (chairs.some(o => dist(o.c, c) < 0.3)) return; const t = tables.slice().sort((a, b2) => dist(a, c) - dist(b2, c))[0]; chairs.push({ c, t }); });
    chairs.forEach(ch => { const a = Math.atan2(ch.t[1] - ch.c[1], ch.t[0] - ch.c[0]) * 180 / Math.PI; items.push({ t: 'chair', x: +ch.c[0].toFixed(3), y: +ch.c[1].toFixed(3), r: Math.round(((a - 90) % 360 + 360) % 360) }); });

    const facadeWins = wins.filter(w => w.facade);
    const facadeY = facadeWins.length ? Math.max(...facadeWins.map(w => w.c[1] + Math.max(w.t1 * w.n[1], w.t0 * w.n[1]))) : mxy - mny;
    return {
      scale: sc, rot, kinds, stats,
      bounds: { w: +(mxx - mnx).toFixed(3), h: +(mxy - mny).toFixed(3) },
      walls: W.rings, windows: wins, doors: doorsU, items, unmatched,
      facadeY: +facadeY.toFixed(3),
      ptToPlan: { k: K, rot, mnx, mny }
    };
  }

  /* снос и возведение стен: контуры → сетка 2,5 см → правки прямоугольниками → снова контуры.
     edits: [{ op: 'cut' | 'add', r: [x0, y0, x1, y1] }] */
  function editWalls(rings, edits, res) {
    res = res || 0.025;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    rings.forEach(r => r.forEach(p => { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }));
    (edits || []).forEach(e => { x0 = Math.min(x0, e.r[0]); y0 = Math.min(y0, e.r[1]); x1 = Math.max(x1, e.r[2]); y1 = Math.max(y1, e.r[3]); });
    const gx0 = Math.floor(x0 / res), gy0 = Math.floor(y0 / res), nx = Math.ceil(x1 / res) - gx0 + 1, ny = Math.ceil(y1 / res) - gy0 + 1;
    const grid = new Uint8Array(nx * ny);
    // заливка по чётности пересечений (контуры с дырами)
    for (let j = 0; j < ny; j++) {
      const y = (gy0 + j + 0.5) * res, xs = [];
      rings.forEach(r => { for (let i = 0, k = r.length - 1; i < r.length; k = i++) { const a = r[i], b = r[k]; if ((a[1] > y) !== (b[1] > y)) xs.push(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1])); } });
      xs.sort((a, b) => a - b);
      for (let q = 0; q + 1 < xs.length; q += 2) { const i0 = Math.max(0, Math.ceil(xs[q] / res - 0.5) - gx0), i1 = Math.min(nx - 1, Math.floor(xs[q + 1] / res - 0.5) - gx0); for (let i = i0; i <= i1; i++) grid[j * nx + i] = 1; }
    }
    (edits || []).forEach(e => { const v = e.op === 'add' ? 1 : 0; const i0 = Math.max(0, Math.round(e.r[0] / res) - gx0), i1 = Math.min(nx, Math.round(e.r[2] / res) - gx0), j0 = Math.max(0, Math.round(e.r[1] / res) - gy0), j1 = Math.min(ny, Math.round(e.r[3] / res) - gy0); for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) grid[j * nx + i] = v; });
    // строки → прямоугольники, одинаковые подряд по вертикали склеиваем
    const rects = [], open = new Map();
    for (let j = 0; j <= ny; j++) {
      const runs = [];
      if (j < ny) { let i = 0; while (i < nx) { if (grid[j * nx + i]) { const s = i; while (i < nx && grid[j * nx + i]) i++; runs.push(s + ':' + i); } else i++; } }
      const now = new Set(runs);
      open.forEach((jStart, key) => { if (!now.has(key)) { const [s, e] = key.split(':').map(Number); rects.push([(gx0 + s) * res, (gy0 + jStart) * res, (gx0 + e) * res, (gy0 + j) * res]); open.delete(key); } });
      runs.forEach(k => { if (!open.has(k)) open.set(k, j); });
    }
    const rr = rects.map(r => [[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]].map(p => [+p[0].toFixed(4), +p[1].toFixed(4)]));
    return unionRings(rr).map(l => l.map(p => [+p[0].toFixed(4), +p[1].toFixed(4)]));
  }

  // результат распознавания → проект (то, что редактирует и показывает приложение)
  function toProject(res, name) {
    let uid = 1;
    const openings = [];
    res.windows.forEach(w => openings.push({ id: w.id, kind: 'window', c: w.c, u: w.u, n: w.n, L: w.L, t0: +w.t0.toFixed(3), t1: +w.t1.toFixed(3), facade: !!w.facade, sill: 0.55, top: 2.15 }));
    res.doors.forEach(d => openings.push({ id: d.id, kind: d.L <= 1.15 ? 'door' : 'pass', c: d.c, u: d.u, n: d.n, L: d.L, t0: +d.t0.toFixed(3), t1: +d.t1.toFixed(3), facade: !!d.facade && Math.abs(d.u[1]) < 0.2 && Math.abs(res.facadeY - d.c[1]) < 1.5, top: 2.1 }));
    // вход: дверь ближе всего к фасаду
    const ds = openings.filter(o => o.kind === 'door' && res.facadeY - o.c[1] < 3.5).sort((a, b) => (res.facadeY - a.c[1]) - (res.facadeY - b.c[1]));
    if (ds[0]) ds[0].entrance = true;
    const items = res.items.map(i => { const o = { id: uid++, t: i.t, x: i.x, y: i.y, r: i.r }; if (i.t === 'generic') { o.w = i.w; o.d = i.d; o.label = i.label; } if (i.t === 'bar' || i.t === 'coffee' || i.t === 'wincounter') o.w = i.w; if (i.on) o.on = true; if (/^fridge(Glass|1)$/.test(i.t)) o.zone = ['green', 'yellow', 'orange', 'pink'][(uid - 2) % 4]; return o; });
    const r = res.ptToPlan;
    return {
      version: 2, name: name || 'Новый проект', H: 3.4, bounds: res.bounds, facadeY: res.facadeY,
      walls: res.walls, extraWalls: [], openings, items, uid,
      interior: 'manch-coffee', ads: true, sign: 'letters', facade: { quads: {}, patches: [], refl: 0.12 },
      source: { mmPerPt: res.scale.mmPerPt, rot: r.rot, k: r.k, mnx: r.mnx, mny: r.mny }
    };
  }

  const api = { extract, recognize, toProject, editWalls, unionRings, findScale, layerStats, inRing, area };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PlanRec = api;
})(typeof window !== 'undefined' ? window : this);
