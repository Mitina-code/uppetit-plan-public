/* Схема сверху: стены, окна и двери, оборудование. Перетаскивание, выбор, размеры заказных, добавление проёмов и стен.
   Координаты плана — метры: x вправо, y вниз (к улице). */
(function (root) {
  'use strict';
  const S = 60; // пикселей SVG на метр
  const NS = 'http://www.w3.org/2000/svg';
  const CAT_FILL = { hall: '#E8DCC6', seat: '#EFE6D2', prod: '#D9DEE2', misc: '#E3E3E3' };

  function create(host, cb) {
    host.innerHTML = '';
    const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('class', 'plansvg'); svg.setAttribute('role', 'application'); svg.setAttribute('aria-label', 'Схема: перетаскивайте предметы');
    host.appendChild(svg);
    const L = {}; ['under', 'walls', 'open', 'items', 'ui'].forEach(k => { L[k] = document.createElementNS(NS, 'g'); svg.appendChild(L[k]); });
    let P = null, sel = null, vb = null, mode = 'select', pending = null, underlay = null;
    const X = v => v * S;

    function fitView() { const b = P.bounds || { w: 10, h: 10 }; const fy = P.facadeY != null ? P.facadeY : b.h; vb = { x: -1.5 * S, y: -0.8 * S, w: (b.w + 3) * S, h: (Math.max(b.h, fy) + 3.4) * S }; apply(); }
    function apply() { svg.setAttribute('viewBox', [vb.x, vb.y, vb.w, vb.h].map(v => v.toFixed(1)).join(' ')); }

    function setProject(p, keepView) { P = p; if (!keepView || !vb) fitView(); render(); }
    function setUnderlay(u) { underlay = u; drawUnder(); }
    function drawUnder() {
      L.under.innerHTML = ''; if (!underlay || !underlay.src || !underlay.show) return;
      const m = underlay.m; // pt→план: [a b c d e f] (в метрах)
      const im = document.createElementNS(NS, 'image'); im.setAttribute('href', underlay.src); im.setAttribute('width', underlay.w); im.setAttribute('height', underlay.h); im.setAttribute('opacity', underlay.opacity || 0.35);
      im.setAttribute('transform', `matrix(${m[0] * S} ${m[1] * S} ${m[2] * S} ${m[3] * S} ${m[4] * S} ${m[5] * S})`); L.under.appendChild(im);
    }

    function render() { if (!P) return; drawUnder(); drawWalls(); drawOpenings(); drawItems(); }
    function drawWalls() {
      const rings = root.UScene.allRings(P);
      const d = rings.map(r => 'M' + r.map(p => X(p[0]).toFixed(1) + ' ' + X(p[1]).toFixed(1)).join('L') + 'Z').join('');
      let h = '';
      if (P.facadeY != null) { const b = P.bounds; h += `<rect x="${X(-30)}" y="${X(P.facadeY)}" width="${X(b.w + 60)}" height="${X(2.6)}" fill="#C9C3BA"/><text x="${X(b.w / 2)}" y="${X(P.facadeY + 1.6)}" text-anchor="middle" font-size="22" fill="#1A2836">улица — тротуар</text>`; }
      h += `<path d="${d}" fill="#E9DDB6" stroke="#8C7B50" stroke-width="1.5" fill-rule="evenodd"/>`;
      (P.extraWalls || []).forEach((w, i) => { h += `<line x1="${X(w.a[0])}" y1="${X(w.a[1])}" x2="${X(w.b[0])}" y2="${X(w.b[1])}" stroke="transparent" stroke-width="16" data-wall="${i}" style="cursor:pointer"/>`; });
      L.walls.innerHTML = h;
    }
    function drawOpenings() {
      let h = '';
      (P.openings || []).forEach((o, i) => {
        const a = [o.c[0] - o.u[0] * o.L / 2, o.c[1] - o.u[1] * o.L / 2], b = [o.c[0] + o.u[0] * o.L / 2, o.c[1] + o.u[1] * o.L / 2];
        const q = [[a[0] + o.n[0] * o.t0, a[1] + o.n[1] * o.t0], [b[0] + o.n[0] * o.t0, b[1] + o.n[1] * o.t0], [b[0] + o.n[0] * o.t1, b[1] + o.n[1] * o.t1], [a[0] + o.n[0] * o.t1, a[1] + o.n[1] * o.t1]];
        const col = o.kind === 'window' ? '#3C8DC6' : o.kind === 'door' ? '#C0392B' : '#8C7B50';
        const fill = o.kind === 'window' ? '#BFE3F5' : o.kind === 'door' ? '#FFFFFF' : '#F4F1EA';
        h += `<path d="M${q.map(p => X(p[0]).toFixed(1) + ' ' + X(p[1]).toFixed(1)).join('L')}Z" fill="${fill}" stroke="${col}" stroke-width="${sel === 'o' + i ? 4 : 1.5}" ${o.kind === 'pass' ? 'stroke-dasharray="6 4"' : ''} data-open="${i}" style="cursor:pointer"/>`;
        if (o.kind === 'window') { const m0 = (o.t0 + o.t1) / 2; h += `<line x1="${X(a[0] + o.n[0] * m0)}" y1="${X(a[1] + o.n[1] * m0)}" x2="${X(b[0] + o.n[0] * m0)}" y2="${X(b[1] + o.n[1] * m0)}" stroke="${col}" stroke-width="2" pointer-events="none"/>`; }
        if (o.kind === 'door') { // полотно и дуга — внутрь помещения
          const s = o.swing || 1, side = (o.facade ? -1 : 1) * s, hinge = a, tip = [a[0] + o.n[0] * side * o.L + o.n[0] * (side > 0 ? o.t1 : o.t0), a[1] + o.n[1] * side * o.L + o.n[1] * (side > 0 ? o.t1 : o.t0)];
          const h0 = [hinge[0] + o.n[0] * (side > 0 ? o.t1 : o.t0), hinge[1] + o.n[1] * (side > 0 ? o.t1 : o.t0)], b0 = [b[0] + o.n[0] * (side > 0 ? o.t1 : o.t0), b[1] + o.n[1] * (side > 0 ? o.t1 : o.t0)];
          h += `<path d="M${X(h0[0])} ${X(h0[1])}L${X(tip[0])} ${X(tip[1])}A${X(o.L)} ${X(o.L)} 0 0 ${side > 0 ? 0 : 1} ${X(b0[0])} ${X(b0[1])}" fill="none" stroke="${col}" stroke-width="1.2" pointer-events="none"/>`;
          if (o.entrance) h += `<text x="${X(o.c[0] + o.n[0] * (side > 0 ? -0.6 : 0.6) * 1)}" y="${X(o.c[1] + o.n[1] * (side > 0 ? -0.6 : 0.6))}" font-size="18" font-weight="700" text-anchor="middle" fill="#C0392B" pointer-events="none">вход</text>`;
        }
      });
      L.open.innerHTML = h;
    }
    function itemSVG(it) {
      const C = root.UCat, t = C.BY[it.t] || C.BY.generic, d = C.dims(it), w = X(d.W), h = X(d.D);
      let o = '';
      if (t.model === 'table') o += `<circle r="${X(0.35)}" fill="#F7F6F3" stroke="#1A2836" stroke-width="1.2"/><circle r="${X(0.05)}" fill="#1E2124"/>`;
      else if (t.model === 'chair' || t.model === 'stool') { const col = C.CHAIR_COLORS[it.color] || it.color || (t.model === 'stool' ? C.CHAIR_COLORS.orange : C.CHAIR_COLORS.grey); o += `<rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="5" fill="${col}" stroke="#1A2836" stroke-width="1"/>` + (t.model === 'chair' ? `<rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="5" fill="#8A6A44"/>` : ''); }
      else if (t.model === 'person') o += `<ellipse rx="${w / 2}" ry="${h / 2}" fill="#2B2F33"/><line x1="0" y1="0" x2="0" y2="${h / 2 + 7}" stroke="#fff" stroke-width="2"/>`;
      else if (t.model === 'trash') o += `<circle r="${w / 2}" fill="#3B4045"/>`;
      else {
        const zc = t.zone ? root.UTex.ZONE[it.zone || 'yellow'] : '#1A2836';
        const fill = t.zone ? '#E3F1F8' : (it.t === 'generic' ? '#F6C9C3' : CAT_FILL[t.cat] || '#E3E3E3');
        o += `<rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" fill="${fill}" stroke="#1A2836" stroke-width="1.2" ${t.elev ? 'stroke-dasharray="5 3"' : ''}/>`;
        o += `<line x1="${-w / 2 + 2}" y1="${h / 2 - 2.5}" x2="${w / 2 - 2}" y2="${h / 2 - 2.5}" stroke="${zc}" stroke-width="5"/>`;
      }
      o += `<g transform="rotate(${-(it.r || 0)})"><circle r="11" fill="#E2B32A" stroke="#1A2836" stroke-width="1.2"/><text dy="4" text-anchor="middle" font-size="12" font-weight="700" fill="#1A2836">${t.n}</text></g>`;
      if (sel === it.id) {
        o += `<rect x="${-w / 2 - 6}" y="${-h / 2 - 6}" width="${w + 12}" height="${h + 12}" fill="none" stroke="#2457A6" stroke-width="2.5" stroke-dasharray="6 4"/>`;
        if (t.custom && t.custom.w) o += `<rect class="hdl" data-h="w" x="${w / 2 - 2}" y="-9" width="14" height="18" rx="3" fill="#2457A6" style="cursor:ew-resize"/>`;
      }
      return o;
    }
    function tf(it) { return `translate(${X(it.x).toFixed(1)},${X(it.y).toFixed(1)}) rotate(${it.r || 0})`; }
    function drawItems() {
      L.items.innerHTML = '';
      // крупные снизу, мелкие сверху — чтобы стулья не прятались под столами
      const list = (P.items || []).slice().sort((a, b) => { const da = root.UCat.dims(a), db = root.UCat.dims(b); return db.W * db.D - da.W * da.D; });
      list.forEach(it => { const g = document.createElementNS(NS, 'g'); g.setAttribute('class', 'it'); g.setAttribute('data-id', it.id); g.setAttribute('transform', tf(it)); g.innerHTML = itemSVG(it); g.style.cursor = 'grab'; L.items.appendChild(g); });
    }
    // поворот r: 0 — лицом к улице (+y), по часовой на схеме; в 3D это rotation.y = -r

    function pt(e) { const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; const q = p.matrixTransform(svg.getScreenCTM().inverse()); return [q.x / S, q.y / S]; }
    const snap = v => Math.round(v * 20) / 20;
    let drag = null;
    svg.addEventListener('pointerdown', e => {
      const p = pt(e);
      if (mode !== 'select') { clickMode(p); e.preventDefault(); return; }
      const hdl = e.target.closest('.hdl'), g = e.target.closest('.it'), op = e.target.closest('[data-open]'), wl = e.target.closest('[data-wall]');
      if (hdl && sel != null) { const it = byId(sel); drag = { kind: 'resize', it, before: JSON.stringify(it) }; svg.setPointerCapture(e.pointerId); e.preventDefault(); return; }
      if (g) { const id = +g.getAttribute('data-id'), it = byId(id); select(id); drag = { kind: 'move', it, dx: it.x - p[0], dy: it.y - p[1], moved: false, before: JSON.stringify(it) }; svg.setPointerCapture(e.pointerId); e.preventDefault(); return; }
      if (op) { select('o' + op.getAttribute('data-open')); e.preventDefault(); return; }
      if (wl) { select('w' + wl.getAttribute('data-wall')); e.preventDefault(); return; }
      select(null); drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, vb: Object.assign({}, vb) }; svg.setPointerCapture(e.pointerId);
    });
    svg.addEventListener('pointermove', e => {
      if (!drag) { if (mode !== 'select' && pending) drawPending(pt(e)); return; }
      if (drag.kind === 'pan') { const k = vb.w / svg.clientWidth; vb.x = drag.vb.x - (e.clientX - drag.sx) * k; vb.y = drag.vb.y - (e.clientY - drag.sy) * k; apply(); return; }
      const p = pt(e), it = drag.it;
      if (drag.kind === 'move') { const nx = e.altKey ? p[0] + drag.dx : snap(p[0] + drag.dx), ny = e.altKey ? p[1] + drag.dy : snap(p[1] + drag.dy); if (nx === it.x && ny === it.y) return; it.x = +nx.toFixed(3); it.y = +ny.toFixed(3); drag.moved = true; const g = L.items.querySelector(`[data-id="${it.id}"]`); if (g) g.setAttribute('transform', tf(it)); cb.onMove && cb.onMove(it); }
      if (drag.kind === 'resize') { const a = (it.r || 0) * Math.PI / 180; const lx = (p[0] - it.x) * Math.cos(a) + (p[1] - it.y) * Math.sin(a); const t = root.UCat.BY[it.t]; const W = Math.max(t.custom.w[0], Math.min(t.custom.w[1], snap(Math.abs(lx) * 2))); if (W !== it.w) { it.w = W; drag.moved = true; drawItems(); cb.onResize && cb.onResize(it); } }
    });
    function end() { if (!drag) return; if ((drag.kind === 'move' || drag.kind === 'resize') && drag.moved) cb.onCommit && cb.onCommit(drag.it, drag.before, drag.kind); drag = null; }
    svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
    svg.addEventListener('wheel', e => { e.preventDefault(); const k = e.deltaY > 0 ? 1.12 : 1 / 1.12; const p = pt(e); const nx = p[0] * S, ny = p[1] * S; vb.x = nx - (nx - vb.x) * k; vb.y = ny - (ny - vb.y) * k; vb.w *= k; vb.h *= k; apply(); }, { passive: false });

    function byId(id) { return (P.items || []).find(i => i.id === id); }
    function select(id) { sel = id; drawItems(); drawOpenings(); cb.onSelect && cb.onSelect(id); }

    /* --- добавление проёмов и стен --- */
    function setMode(m) { mode = m; pending = null; L.ui.innerHTML = ''; svg.style.cursor = m === 'select' ? '' : 'crosshair'; cb.onMode && cb.onMode(m); }
    function nearestWall(p) {
      const rings = root.UScene.allRings(P); let best = null;
      rings.forEach(r => { for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy; if (L2 < 0.01) continue; let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2; t = Math.max(0, Math.min(1, t)); const q = [a[0] + t * dx, a[1] + t * dy], d = Math.hypot(p[0] - q[0], p[1] - q[1]); if (!best || d < best.d) best = { d, q, u: [dx / Math.sqrt(L2), dy / Math.sqrt(L2)] }; } });
      if (!best || best.d > 0.8) return null;
      // толщина: идём поперёк, пока внутри стены
      const inW = q => rings.some(r => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j]; if ((a[1] > q[1]) !== (b[1] > q[1]) && q[0] < (b[0] - a[0]) * (q[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; });
      let u = best.u; if (u[0] < 0 || (Math.abs(u[0]) < 1e-6 && u[1] < 0)) u = [-u[0], -u[1]];
      const n = [-u[1], u[0]]; let dir = inW([best.q[0] + n[0] * 0.03, best.q[1] + n[1] * 0.03]) ? 1 : -1; let th = 0;
      for (let s = 0.02; s < 1.6; s += 0.02) { if (inW([best.q[0] + n[0] * dir * s, best.q[1] + n[1] * dir * s])) th = s; else break; }
      if (th < 0.04) th = 0.12;
      return { c: best.q, u, n, t0: dir > 0 ? 0 : -th, t1: dir > 0 ? th : 0 };
    }
    function clickMode(p) {
      if (mode === 'addWall') {
        if (!pending) { pending = { a: [snap(p[0]), snap(p[1])] }; return; }
        const w = { a: pending.a, b: [snap(p[0]), snap(p[1])], t: 0.12 }; pending = null; L.ui.innerHTML = ''; setMode('select'); cb.onAddWall && cb.onAddWall(w); return;
      }
      const wq = nearestWall(p); if (!wq) { cb.onHint && cb.onHint('Нажмите ближе к стене'); return; }
      const kind = mode === 'addWindow' ? 'window' : 'door';
      const fy = P.facadeY, facade = fy != null && Math.abs(wq.u[1]) < 0.2 && Math.abs(wq.c[1] - fy) < 1.3;
      const o = { id: 'u' + Date.now().toString(36), kind, c: wq.c.map(v => +v.toFixed(3)), u: wq.u, n: wq.n, L: kind === 'window' ? 1.4 : 0.9, t0: wq.t0, t1: wq.t1, facade, sill: 0.55, top: kind === 'window' ? 2.15 : 2.1 };
      // проём ставим по центру толщины стены
      const mid = (o.t0 + o.t1) / 2; o.c = [o.c[0] + o.n[0] * mid, o.c[1] + o.n[1] * mid]; o.t0 -= mid; o.t1 -= mid;
      setMode('select'); cb.onAddOpening && cb.onAddOpening(o);
    }
    function drawPending(p) { if (!pending) return; L.ui.innerHTML = `<line x1="${X(pending.a[0])}" y1="${X(pending.a[1])}" x2="${X(snap(p[0]))}" y2="${X(snap(p[1]))}" stroke="#2457A6" stroke-width="7" stroke-linecap="round" opacity=".7"/>`; }

    function zoom(k) { const cx = vb.x + vb.w / 2, cy = vb.y + vb.h / 2; vb.w *= k; vb.h *= k; vb.x = cx - vb.w / 2; vb.y = cy - vb.h / 2; apply(); }
    function focusHall(h) { if (!h || P.facadeY == null) return; const d = Math.min(h.depth, 12); vb = { x: (h.x0 - 1.6) * S, y: (P.facadeY - d - 1.4) * S, w: (h.x1 - h.x0 + 3.2) * S, h: (d + 4.4) * S }; const ar = (svg.clientWidth || 600) / (svg.clientHeight || 600); if (vb.w / vb.h < ar) { const nw = vb.h * ar; vb.x -= (nw - vb.w) / 2; vb.w = nw; } else { const nh = vb.w / ar; vb.y -= (nh - vb.h) / 2; vb.h = nh; } apply(); }

    return { setProject, render, select, getSel: () => sel, setMode, getMode: () => mode, setUnderlay, zoom, fitView, focusHall };
  }
  root.UPlan = { create };
})(window);
