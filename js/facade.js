/* Фото фасада: обводка окон и двери по углам → подбор ракурса камеры → зал из 3D в окнах снимка, вывеска, закраска старой вывески.
   Ракурс находим по гомографии: углы проёмов на фото ↔ их реальные размеры по плану (ширина, низ и верх). */
(function (root) {
  'use strict';
  const T = root.THREE;

  /* ---------- математика ---------- */
  function solve(A, b) { // Гаусс с выбором главного элемента
    const n = b.length, M = A.map((r, i) => r.concat([b[i]]));
    for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r; [M[c], M[p]] = [M[p], M[c]]; if (Math.abs(M[c][c]) < 1e-12) return null; for (let r = 0; r < n; r++) { if (r === c) continue; const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; } }
    return M.map((r, i) => r[n] / r[i]);
  }
  // гомография по ≥4 парам точек (с нормализацией) — наименьшие квадраты, h33 = 1
  function homography(src, dst) {
    const norm = P => { const cx = P.reduce((a, p) => a + p[0], 0) / P.length, cy = P.reduce((a, p) => a + p[1], 0) / P.length; const d = P.reduce((a, p) => a + Math.hypot(p[0] - cx, p[1] - cy), 0) / P.length || 1; const s = Math.SQRT2 / d; return { m: [[s, 0, -s * cx], [0, s, -s * cy], [0, 0, 1]], P: P.map(p => [(p[0] - cx) * s, (p[1] - cy) * s]) }; };
    const a = norm(src), b = norm(dst), N = 8, AtA = Array.from({ length: N }, () => new Array(N).fill(0)), Atb = new Array(N).fill(0);
    a.P.forEach((p, i) => { const [x, y] = p, [u, v] = b.P[i]; [[x, y, 1, 0, 0, 0, -u * x, -u * y, u], [0, 0, 0, x, y, 1, -v * x, -v * y, v]].forEach(r => { for (let j = 0; j < N; j++) { Atb[j] += r[j] * r[8]; for (let k = 0; k < N; k++) AtA[j][k] += r[j] * r[k]; } }); });
    const h = solve(AtA, Atb); if (!h) return null;
    const Hn = [[h[0], h[1], h[2]], [h[3], h[4], h[5]], [h[6], h[7], 1]];
    const inv = m => { const [a1, b1, c1] = m[0], [d1, e1, f1] = m[1], [g1, h1, i1] = m[2]; const A1 = e1 * i1 - f1 * h1, B1 = -(d1 * i1 - f1 * g1), C1 = d1 * h1 - e1 * g1; const det = a1 * A1 + b1 * B1 + c1 * C1; return [[A1 / det, -(b1 * i1 - c1 * h1) / det, (b1 * f1 - c1 * e1) / det], [B1 / det, (a1 * i1 - c1 * g1) / det, -(a1 * f1 - c1 * d1) / det], [C1 / det, -(a1 * h1 - b1 * g1) / det, (a1 * e1 - b1 * d1) / det]]; };
    const mul = (x, y) => x.map(r => [0, 1, 2].map(j => r[0] * y[0][j] + r[1] * y[1][j] + r[2] * y[2][j]));
    return mul(mul(inv(b.m), Hn), a.m);
  }
  // поза камеры из гомографии плоскости фасада (X вдоль фасада, Y вверх)
  function pose(Hm, W, Hh) {
    const cx = W / 2, cy = Hh / 2, col = j => [Hm[0][j], Hm[1][j], Hm[2][j]];
    const h1 = col(0), h2 = col(1), h3 = col(2);
    const p = h => [h[0] - cx * h[2], h[1] - cy * h[2]];
    const p1 = p(h1), p2 = p(h2), est = [];
    const f2a = -(p1[0] * p2[0] + p1[1] * p2[1]) / (h1[2] * h2[2]); if (isFinite(f2a) && f2a > 0) est.push(Math.sqrt(f2a));
    const f2b = (p2[0] ** 2 + p2[1] ** 2 - p1[0] ** 2 - p1[1] ** 2) / (h1[2] ** 2 - h2[2] ** 2); if (isFinite(f2b) && f2b > 0) est.push(Math.sqrt(f2b));
    let f = est.length ? est.reduce((a, b) => a + b, 0) / est.length : W * 1.1;
    f = Math.max(W * 0.45, Math.min(W * 5, f));
    const Ki = h => [(h[0] - cx * h[2]) / f, (h[1] - cy * h[2]) / f, h[2]];
    let r1 = Ki(h1), r2 = Ki(h2), t = Ki(h3);
    const n1 = Math.hypot(...r1), n2 = Math.hypot(...r2); let lam = 2 / (n1 + n2);
    if (t[2] * lam < 0) lam = -lam;
    r1 = r1.map(v => v * lam); r2 = r2.map(v => v * lam); t = t.map(v => v * lam);
    const nr = v => { const l = Math.hypot(...v); return v.map(x => x / l); }, dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    r1 = nr(r1); r2 = nr(r2.map((v, i) => v - dot(r1, r2) * r1[i])); const r3 = cross(r1, r2);
    const R = [[r1[0], r2[0], r3[0]], [r1[1], r2[1], r3[1]], [r1[2], r2[2], r3[2]]]; // столбцы — оси плоскости в камере
    const C = [0, 1, 2].map(j => -(R[0][j] * t[0] + R[1][j] * t[1] + R[2][j] * t[2])); // центр камеры: -Rᵀt
    return { f, R, t, C };
  }

  function create(host, api) {
    host.innerHTML = `
      <div class="ftools">
        <label class="btn primary">Загрузить фото фасада<input type="file" accept="image/*" hidden id="fFile"></label>
        <div class="seg" id="fMode"><button data-m="mark" aria-pressed="true">Разметка окон</button><button data-m="result" aria-pressed="false">Результат</button><button data-m="before" aria-pressed="false">Как сейчас</button></div>
        <button class="btn" id="fPatch">Закрасить старую вывеску</button><button class="btn" id="fPatchClr" hidden>Убрать закраску</button>
        <label class="chk"><input type="checkbox" id="fAds" checked> Реклама на окнах</label>
        <label class="chk">Вывеска <select id="fSign"><option value="letters">буквы на стене</option><option value="panel">тёмная панель</option><option value="none">без вывески</option></select></label>
        <label class="chk">Отражение в стекле <input type="range" id="fRefl" min="0" max="60" value="12"></label>
      </div>
      <div class="fbox"><canvas id="fCan"></canvas><div class="fempty" id="fEmpty"><b>Загрузите снимок фасада</b><span>Подойдёт фото с телефона или кадр с уличной панорамы. Потом перетащите углы рамок на углы окон и двери на снимке — так программа поймёт, откуда снято, и покажет зал в этих окнах.</span></div></div>
      <p class="small muted" id="fInfo"></p>`;
    const can = host.querySelector('#fCan'), g = can.getContext('2d'), info = host.querySelector('#fInfo');
    let img = null, mode = 'mark', drag = null, patchStart = null, patchMode = false, lastPose = null;
    let overP = null, overS = null; // для наложения другого варианта (сравнение, PDF)
    const P = () => overP || api.getProject();
    const F = () => { const p = P(); p.facade = p.facade || { quads: {}, patches: [], refl: 0.12 }; return p.facade; };
    const targets = () => (P().openings || []).filter(o => o.facade && (o.kind === 'window' || o.kind === 'door')).sort((a, b) => a.c[0] - b.c[0]);
    const label = o => { const ts = targets(); const w = ts.filter(x => x.kind === 'window'); return o.kind === 'window' ? 'Окно ' + (w.indexOf(o) + 1) : (o.entrance ? 'Вход' : 'Дверь'); };
    const COLS = ['#2E86C1', '#27AE60', '#E67E22', '#8E44AD', '#C0392B', '#16A085'];

    function ensureQuads() {
      const f = F(), ts = targets(); if (!img) return;
      ts.forEach((o, i) => { if (f.quads[o.id]) return; const n = ts.length, w = 0.6 / n, x0 = 0.2 + i * w + w * 0.1, x1 = x0 + w * 0.8, y0 = o.kind === 'door' ? 0.42 : 0.45, y1 = o.kind === 'door' ? 0.85 : 0.72; f.quads[o.id] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]; });
    }
    async function setImage(src) { if (!src) { img = null; draw(); return; } img = await root.UStore.loadImg(src); const k = Math.min(1, 1600 / img.width); can.width = Math.round(img.width * k); can.height = Math.round(img.height * k); ensureQuads(); draw(); }
    const toPx = q => [q[0] * can.width, q[1] * can.height];

    function computePose() {
      const f = F(), src = [], dst = [];
      targets().forEach(o => { const q = f.quads[o.id]; if (!q) return; const x0 = o.c[0] - o.L / 2, x1 = o.c[0] + o.L / 2, y1 = o.top || (o.kind === 'door' ? 2.1 : 2.15), y0 = o.kind === 'window' ? (o.sill || 0.55) : 0; [[x0, y1], [x1, y1], [x1, y0], [x0, y0]].forEach((p, i) => { src.push(p); dst.push(toPx(q[i])); }); });
      if (src.length < 4) return null;
      const Hm = homography(src, dst); if (!Hm) return null;
      const ps = pose(Hm, can.width, can.height); if (!ps || !isFinite(ps.C[0])) return null;
      ps.err = src.reduce((a, s, i) => { const w = Hm[2][0] * s[0] + Hm[2][1] * s[1] + Hm[2][2]; const u = (Hm[0][0] * s[0] + Hm[0][1] * s[1] + Hm[0][2]) / w, v = (Hm[1][0] * s[0] + Hm[1][1] * s[1] + Hm[1][2]) / w; return a + Math.hypot(u - dst[i][0], v - dst[i][1]); }, 0) / src.length;
      return ps;
    }
    function cameraFrom(ps) {
      const p = P(), fy = p.facadeY;
      const cam = new T.PerspectiveCamera(2 * Math.atan(can.height / 2 / ps.f) * 180 / Math.PI, can.width / can.height, 0.05, 900);
      cam.position.set(ps.C[0], ps.C[1], fy + ps.C[2]);
      const R = ps.R; // строки R — оси камеры (CV) в мировых осях плоскости
      const xr = new T.Vector3(R[0][0], R[0][1], R[0][2]), yd = new T.Vector3(R[1][0], R[1][1], R[1][2]), zf = new T.Vector3(R[2][0], R[2][1], R[2][2]);
      const m = new T.Matrix4().makeBasis(xr, yd.clone().negate(), zf.clone().negate());
      cam.quaternion.setFromRotationMatrix(m); cam.updateMatrixWorld(true); cam.updateProjectionMatrix();
      return cam;
    }

    function patchFill() {
      const f = F(); (f.patches || []).forEach(r => {
        const x0 = r[0] * can.width, y0 = r[1] * can.height, x1 = r[2] * can.width, y1 = r[3] * can.height, w = x1 - x0, h = y1 - y0; if (w < 3 || h < 3) return;
        // цвет стены — среднее по полоскам над и под закраской
        const sample = (yy) => { const yy0 = Math.max(0, Math.min(can.height - 4, yy)); const d = g.getImageData(Math.max(0, x0), yy0, Math.max(1, Math.min(w, can.width - x0)), 4).data; let r0 = 0, g0 = 0, b0 = 0, n = 0; for (let i = 0; i < d.length; i += 4) { r0 += d[i]; g0 += d[i + 1]; b0 += d[i + 2]; n++; } return [r0 / n, g0 / n, b0 / n]; };
        const a = sample(y0 - 8), b = sample(y1 + 4);
        const gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, `rgb(${a.map(v => v | 0)})`); gr.addColorStop(1, `rgb(${b.map(v => v | 0)})`);
        g.save(); g.filter = 'blur(2px)'; g.fillStyle = gr; g.fillRect(x0, y0, w, h); g.restore();
        for (let i = 0; i < w * h / 12; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${Math.random() * 0.05})`; g.fillRect(x0 + Math.random() * w, y0 + Math.random() * h, 2, 2); }
      });
    }

    function draw() {
      host.querySelector('#fEmpty').hidden = !!img; can.hidden = !img;
      if (!img) { info.textContent = ''; return; }
      g.clearRect(0, 0, can.width, can.height); g.drawImage(img, 0, 0, can.width, can.height);
      const f = F(), ts = targets();
      if (mode === 'before') { info.textContent = 'Снимок как есть.'; return; }
      if (mode === 'result') {
        patchFill();
        const ps = computePose(); lastPose = ps;
        if (!ps || ps.C[2] < 0.5) { info.textContent = 'Не получилось подобрать ракурс. Проверьте, что углы рамок стоят на углах окон в правильном порядке (верх-лево, верх-право, низ-право, низ-лево).'; return; }
        const cam = cameraFrom(ps), sc = overS || api.scene();
        const shot = sc.renderView(cam, can.width, can.height);
        const refl = (f.refl != null ? f.refl : 0.12);
        ts.forEach(o => { const q = f.quads[o.id]; if (!q) return; const pts = q.map(toPx); g.save(); g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath(); g.clip(); g.drawImage(shot, 0, 0); g.globalAlpha = refl; g.drawImage(img, 0, 0, can.width, can.height); g.restore(); });
        if (P().sign !== 'none') { const s2 = sc.renderView(cam, can.width, can.height, true); g.drawImage(s2, 0, 0); }
        info.textContent = `Ракурс подобран: камера на ${ps.C[2].toFixed(1)} м от фасада, на высоте ${ps.C[1].toFixed(1)} м; точность разметки ≈ ${ps.err.toFixed(1)} пикс. Зал в окнах — из 3D-модели с той же точки.`;
        return;
      }
      // разметка
      if (f.patches && f.patches.length) { g.save(); g.fillStyle = 'rgba(255,255,255,.35)'; g.strokeStyle = '#C0392B'; g.setLineDash([6, 4]); f.patches.forEach(r => { g.fillRect(r[0] * can.width, r[1] * can.height, (r[2] - r[0]) * can.width, (r[3] - r[1]) * can.height); g.strokeRect(r[0] * can.width, r[1] * can.height, (r[2] - r[0]) * can.width, (r[3] - r[1]) * can.height); }); g.restore(); }
      ts.forEach((o, i) => {
        const q = f.quads[o.id]; if (!q) return; const pts = q.map(toPx), col = COLS[i % COLS.length];
        g.save(); g.lineWidth = 3; g.strokeStyle = col; g.fillStyle = col + '22'; g.beginPath(); pts.forEach((p, k) => k ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath(); g.fill(); g.stroke();
        pts.forEach((p, k) => { g.fillStyle = '#fff'; g.beginPath(); g.arc(p[0], p[1], 9, 0, 7); g.fill(); g.lineWidth = 3; g.stroke(); g.fillStyle = col; g.font = '700 11px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(['↖', '↗', '↘', '↙'][k], p[0], p[1]); });
        const tx = (pts[0][0] + pts[1][0]) / 2, ty = Math.min(pts[0][1], pts[1][1]) - 14; g.font = '700 15px "Golos Text", Arial'; const tw = g.measureText(label(o)).width + 14; g.fillStyle = col; g.fillRect(tx - tw / 2, ty - 11, tw, 22); g.fillStyle = '#fff'; g.fillText(label(o), tx, ty + 1); g.restore();
      });
      const ps = computePose(); lastPose = ps;
      info.textContent = ts.length ? `Перетащите кружки на углы проёмов на снимке: ${ts.map(label).join(', ')}. Чем точнее углы, тем точнее ракурс.` + (ps && ps.C[2] > 0.5 ? ` Сейчас: камера ≈ ${ps.C[2].toFixed(1)} м от фасада.` : '') : 'На плане нет окон фасада — отметьте их на вкладке «План».';
    }

    function evPt(e) { const r = can.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; }
    can.addEventListener('pointerdown', e => {
      if (!img || mode !== 'mark') return; const p = evPt(e), f = F();
      if (patchMode) { patchStart = p; can.setPointerCapture(e.pointerId); return; }
      let best = null; Object.keys(f.quads).forEach(id => f.quads[id].forEach((q, k) => { const d = Math.hypot((q[0] - p[0]) * can.width, (q[1] - p[1]) * can.height); if (d < 22 && (!best || d < best.d)) best = { d, id, k }; }));
      if (best) { drag = best; can.setPointerCapture(e.pointerId); e.preventDefault(); return; }
      // тянуть рамку целиком
      Object.keys(f.quads).forEach(id => { const q = f.quads[id]; let c = false; for (let i = 0, j = 3; i < 4; j = i++) { const a = q[i], b = q[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } if (c && !drag) drag = { id, all: true, p0: p, q0: q.map(v => v.slice()) }; });
      if (drag) can.setPointerCapture(e.pointerId);
    });
    can.addEventListener('pointermove', e => {
      if (patchStart) { draw(); const p = evPt(e); g.save(); g.strokeStyle = '#C0392B'; g.setLineDash([6, 4]); g.lineWidth = 2; g.strokeRect(patchStart[0] * can.width, patchStart[1] * can.height, (p[0] - patchStart[0]) * can.width, (p[1] - patchStart[1]) * can.height); g.restore(); return; }
      if (!drag) return; const p = evPt(e), f = F();
      if (drag.all) f.quads[drag.id] = drag.q0.map(v => [v[0] + p[0] - drag.p0[0], v[1] + p[1] - drag.p0[1]]); else f.quads[drag.id][drag.k] = [Math.max(0, Math.min(1, p[0])), Math.max(0, Math.min(1, p[1]))];
      draw();
    });
    function up(e) { if (patchStart) { const p = evPt(e), f = F(); const r = [Math.min(patchStart[0], p[0]), Math.min(patchStart[1], p[1]), Math.max(patchStart[0], p[0]), Math.max(patchStart[1], p[1])]; if ((r[2] - r[0]) * can.width > 6) (f.patches = f.patches || []).push(r); patchStart = null; patchMode = false; host.querySelector('#fPatch').classList.remove('on'); host.querySelector('#fPatchClr').hidden = !(f.patches || []).length; draw(); api.save(); return; } if (drag) { drag = null; api.save(); } }
    can.addEventListener('pointerup', up); can.addEventListener('pointercancel', up);

    host.querySelector('#fFile').addEventListener('change', async e => { const file = e.target.files[0]; if (!file) return; const d = await root.UStore.shrink(await root.UStore.fileToDataURL(file), 1600); await root.UStore.set('facadePhoto', d); F().quads = {}; F().patches = []; await setImage(d); api.save(); e.target.value = ''; });
    host.querySelectorAll('#fMode button').forEach(b => b.addEventListener('click', () => setMode(b.dataset.m)));
    function setMode(m) { mode = m; host.querySelectorAll('#fMode button').forEach(b => b.setAttribute('aria-pressed', b.dataset.m === m)); draw(); }
    host.querySelector('#fPatch').addEventListener('click', e => { patchMode = !patchMode; e.target.classList.toggle('on', patchMode); if (patchMode) { setMode('mark'); info.textContent = 'Обведите рамкой старую вывеску на снимке — она закрасится цветом стены.'; } });
    host.querySelector('#fPatchClr').addEventListener('click', () => { F().patches = []; host.querySelector('#fPatchClr').hidden = true; draw(); api.save(); });
    host.querySelector('#fAds').addEventListener('change', e => { api.setAds(e.target.checked); if (mode === 'result') draw(); });
    host.querySelector('#fSign').addEventListener('change', e => { api.setSign(e.target.value); if (mode === 'result') draw(); });
    host.querySelector('#fRefl').addEventListener('input', e => { F().refl = e.target.value / 100; if (mode === 'result') draw(); });

    function sync() { const p = P(); host.querySelector('#fAds').checked = p.ads !== false; host.querySelector('#fSign').value = p.sign || 'letters'; host.querySelector('#fRefl').value = Math.round((F().refl != null ? F().refl : 0.12) * 100); host.querySelector('#fPatchClr').hidden = !(F().patches || []).length; ensureQuads(); draw(); }
    // готовый кадр «фото + зал» для любого проекта и любой 3D-сцены (без смены того, что на экране)
    function montageFor(proj, sc) {
      if (!img) return null; const m0 = mode; overP = proj; overS = sc; mode = 'result';
      let out = null; try { draw(); const ok = lastPose && lastPose.C[2] >= 0.5; if (ok) { out = document.createElement('canvas'); out.width = can.width; out.height = can.height; out.getContext('2d').drawImage(can, 0, 0); } } finally { overP = null; overS = null; mode = m0; draw(); }
      return out;
    }
    function ready() { const p = api.getProject(); return !!img && p.facade && Object.keys(p.facade.quads || {}).length > 0; }
    return { setImage, draw, sync, setMode, hasImage: () => !!img, montageFor, ready };
  }
  root.UFacade = { create, homography, pose };
})(window);
