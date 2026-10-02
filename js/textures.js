/* Текстуры «как на фото»: рисуются в canvas по мотивам реальных залов Uppetit.
   Если пользователь загрузил своё фото грани — берётся оно (см. Store, ключ photo:<тип>:<грань>). */
(function (root) {
  'use strict';
  const ZONE = { green: '#3BAA35', orange: '#F39200', yellow: '#F5C400', pink: '#F07EB0' };
  const ZONE_NAMES = { green: 'салаты', orange: 'супы', yellow: 'основное', pink: 'десерты' };

  /* ---------- общие приёмы рисования ---------- */
  let seed = 1;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const srand = s => { seed = (Math.abs(Math.floor(s)) % 2147483646) + 1; };
  function cv(w, h) { const c = document.createElement('canvas'); c.width = Math.max(4, Math.round(w)); c.height = Math.max(4, Math.round(h)); return c; }
  function noise(g, w, h, amt, dark, size) { size = size || 1; const n = Math.round(w * h / (size * size) * 0.35); for (let i = 0; i < n; i++) { const v = rnd(); g.fillStyle = (v < 0.5 ? (dark || 'rgba(0,0,0,') : 'rgba(255,255,255,') + (rnd() * amt).toFixed(3) + ')'; g.fillRect(rnd() * w, rnd() * h, size, size); } }
  function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function vgrad(g, x, y, w, h, stops) { const gr = g.createLinearGradient(x, y, x, y + h); stops.forEach(s => gr.addColorStop(s[0], s[1])); g.fillStyle = gr; g.fillRect(x, y, w, h); }
  function hgrad(g, x, y, w, h, stops) { const gr = g.createLinearGradient(x, y, x + w, y); stops.forEach(s => gr.addColorStop(s[0], s[1])); g.fillStyle = gr; g.fillRect(x, y, w, h); }
  function brushed(g, x, y, w, h, base, vertical) {
    g.fillStyle = base; g.fillRect(x, y, w, h);
    for (let i = 0; i < (vertical ? w : h) * 1.5; i++) { g.fillStyle = (rnd() < 0.5 ? 'rgba(255,255,255,' : 'rgba(0,0,0,') + (rnd() * 0.06).toFixed(3) + ')'; const p = rnd() * (vertical ? w : h); if (vertical) g.fillRect(x + p, y, 1, h); else g.fillRect(x, y + p, w, 1); }
    vgrad(g, x, y, w, h, [[0, 'rgba(255,255,255,.18)'], [0.5, 'rgba(255,255,255,0)'], [1, 'rgba(0,0,0,.12)']]);
  }
  function glassSheen(g, x, y, w, h, a) {
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
    const gr = g.createLinearGradient(x, y, x + w, y + h); gr.addColorStop(0, 'rgba(255,255,255,' + (a * 0.9) + ')'); gr.addColorStop(0.35, 'rgba(255,255,255,0)'); gr.addColorStop(0.55, 'rgba(255,255,255,' + (a * 0.5) + ')'); gr.addColorStop(0.62, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(255,255,255,' + (a * 0.3) + ')');
    g.fillStyle = gr; g.fillRect(x, y, w, h); g.restore();
  }
  function shade(c, k) { const n = parseInt(c.slice(1), 16); let r = n >> 16, gg = (n >> 8) & 255, b = n & 255; r = Math.max(0, Math.min(255, r * k)); gg = Math.max(0, Math.min(255, gg * k)); b = Math.max(0, Math.min(255, b * k)); return 'rgb(' + (r | 0) + ',' + (gg | 0) + ',' + (b | 0) + ')'; }
  function text(g, s, x, y, size, color, weight, align, font) { g.font = (weight || 700) + ' ' + size + 'px ' + (font || '"Golos Text", Arial, sans-serif'); g.fillStyle = color; g.textAlign = align || 'center'; g.textBaseline = 'middle'; g.fillText(s, x, y); }

  /* упаковка готовой еды: прозрачная крышка, еда, наклейка цвета зоны */
  const FOOD = { green: ['#7DB547', '#A9CF6B', '#E9E2C9', '#D24C3A'], orange: ['#E07A2E', '#C9562C', '#F0B04A', '#8C5A3A'], yellow: ['#E9C46A', '#C98A3A', '#F4E3B0', '#7A5130'], pink: ['#F3C6D3', '#FBEFE6', '#C9893F', '#E87FA2'] };
  function pack(g, x, y, w, h, zone, kind) {
    const fc = FOOD[zone] || FOOD.yellow;
    if (kind === 0) { // лоток с прозрачной крышкой — вид спереди
      g.fillStyle = 'rgba(40,40,40,.18)'; g.fillRect(x + 2, y + h - 3, w, 4);
      g.fillStyle = '#F7F7F4'; g.fillRect(x, y + h * 0.35, w, h * 0.65);
      g.fillStyle = fc[(rnd() * 3) | 0]; g.fillRect(x + 2, y + h * 0.42, w - 4, h * 0.36);
      for (let i = 0; i < 6; i++) { g.fillStyle = fc[(rnd() * 4) | 0]; g.beginPath(); g.arc(x + 4 + rnd() * (w - 8), y + h * 0.48 + rnd() * h * 0.25, 1.5 + rnd() * w * 0.08, 0, 7); g.fill(); }
      g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(x, y + h * 0.3, w, h * 0.12);
      g.fillStyle = '#fff'; g.fillRect(x + w * 0.12, y + h * 0.8, w * 0.76, h * 0.14);
      g.fillStyle = ZONE[zone] || '#999'; g.fillRect(x + w * 0.12, y + h * 0.8, w * 0.2, h * 0.14);
    } else if (kind === 1) { // крафт-коробка
      g.fillStyle = 'rgba(40,40,40,.18)'; g.fillRect(x + 2, y + h - 3, w, 4);
      vgrad(g, x, y, w, h, [[0, '#D3B183'], [1, '#B8925F']]);
      g.fillStyle = '#fff'; g.fillRect(x + w * 0.15, y + h * 0.25, w * 0.7, h * 0.4);
      g.fillStyle = ZONE[zone] || '#999'; g.fillRect(x + w * 0.15, y + h * 0.25, w * 0.7, h * 0.1);
      g.fillStyle = '#555'; g.fillRect(x + w * 0.22, y + h * 0.45, w * 0.5, 2); g.fillRect(x + w * 0.22, y + h * 0.53, w * 0.36, 2);
    } else { // стакан/банка с салатом
      g.fillStyle = 'rgba(40,40,40,.18)'; g.fillRect(x + 2, y + h - 3, w, 4);
      g.fillStyle = 'rgba(230,240,245,.9)'; g.fillRect(x, y + h * 0.1, w, h * 0.9);
      g.fillStyle = fc[0]; g.fillRect(x + 1, y + h * 0.55, w - 2, h * 0.44);
      g.fillStyle = fc[1]; g.fillRect(x + 1, y + h * 0.32, w - 2, h * 0.24);
      g.fillStyle = fc[2]; g.fillRect(x + 1, y + h * 0.2, w - 2, h * 0.12);
      g.fillStyle = '#2B2F33'; g.fillRect(x - 1, y + h * 0.04, w + 2, h * 0.08);
      g.fillStyle = 'rgba(255,255,255,.4)'; g.fillRect(x + w * 0.15, y + h * 0.15, w * 0.12, h * 0.8);
    }
  }
  function priceStrip(g, x, y, w, h) { g.fillStyle = '#ECEFF1'; g.fillRect(x, y, w, h); g.fillStyle = '#C9CED2'; g.fillRect(x, y + h - 2, w, 2); for (let px = x + 6; px < x + w - 30; px += 46 + rnd() * 20) { g.fillStyle = '#fff'; g.fillRect(px, y + 2, 34, h - 5); g.fillStyle = '#333'; g.fillRect(px + 4, y + h * 0.35, 18, 2); g.fillStyle = '#E2412C'; g.fillRect(px + 22, y + h * 0.3, 9, 4); } }

  /* ---------- грани оборудования ---------- */
  const P = {};
  P.metalLight = (g, w, h) => { brushed(g, 0, 0, w, h, '#D7DADD', true); g.strokeStyle = 'rgba(0,0,0,.12)'; g.lineWidth = 3; g.strokeRect(1.5, 1.5, w - 3, h - 3); };
  P.metalDark = (g, w, h) => { brushed(g, 0, 0, w, h, '#4A4F55', true); };
  P.black = (g, w, h) => { g.fillStyle = '#1E2124'; g.fillRect(0, 0, w, h); noise(g, w, h, 0.05); };
  P.white = (g, w, h) => { vgrad(g, 0, 0, w, h, [[0, '#FAFAF8'], [1, '#E7E8E6']]); noise(g, w, h, 0.03); };
  P.steel = (g, w, h) => { brushed(g, 0, 0, w, h, '#C3C8CC', false); };
  P.steelV = (g, w, h) => { brushed(g, 0, 0, w, h, '#C3C8CC', true); };

  P.fridgeGlassFront = (g, w, h, o) => {
    const zone = o.zone || 'yellow', doors = o.doors || 2;
    srand(w * 7 + h + (zone.length * 13));
    brushed(g, 0, 0, w, h, '#D2D5D8', true); // рама
    const hh = h * 0.1;                          // шапка
    vgrad(g, 0, 0, w, hh, [[0, '#3E4348'], [1, '#2D3135']]);
    text(g, 'СДЕЛАНО С АППЕТИТОМ', w / 2, hh * 0.52, Math.min(hh * 0.36, w / 16), '#F4F4F2', 600);
    g.fillStyle = ZONE[zone]; g.fillRect(0, hh - 5, w, 5);
    const top = hh + h * 0.012, bot = h * 0.93, side = w * 0.035, gap = w * 0.012;
    const dw = (w - side * 2 - gap * (doors - 1)) / doors;
    for (let d = 0; d < doors; d++) {
      const x0 = side + d * (dw + gap);
      vgrad(g, x0, top, dw, bot - top, [[0, '#F7FAFC'], [0.5, '#EEF3F6'], [1, '#E2E9EE']]); // свет внутри
      const shelves = 5, sh = (bot - top) / shelves;
      for (let s = 0; s < shelves; s++) {
        const sy = top + s * sh, ph = sh * 0.66;
        let px = x0 + 6;
        const kind = s % 3;
        while (px < x0 + dw - 16) { const pw = kind === 2 ? sh * 0.32 : sh * (0.42 + rnd() * 0.18); if (px + pw > x0 + dw - 6) break; pack(g, px, sy + sh - ph - sh * 0.1, pw, kind === 2 ? ph * 0.8 : ph * (0.7 + rnd() * 0.25), zone, kind); px += pw + 3 + rnd() * 4; }
        priceStrip(g, x0, sy + sh - sh * 0.1, dw, sh * 0.1);
      }
      g.strokeStyle = '#B9BEC2'; g.lineWidth = Math.max(4, w * 0.008); g.strokeRect(x0, top, dw, bot - top);
      glassSheen(g, x0, top, dw, bot - top, 0.5);
      // ручка
      const hx = doors === 1 ? x0 + dw - 14 : (d % 2 === 0 ? x0 + dw - 14 : x0 + 8);
      vgrad(g, hx, top + (bot - top) * 0.3, 6, (bot - top) * 0.35, [[0, '#E9ECEE'], [1, '#9AA1A7']]);
    }
    vgrad(g, 0, bot, w, h - bot, [[0, '#7D8389'], [1, '#5A5F64']]); // решётка внизу
    g.fillStyle = 'rgba(0,0,0,.35)'; for (let x = 10; x < w - 10; x += 10) g.fillRect(x, bot + (h - bot) * 0.3, 5, (h - bot) * 0.45);
  };
  P.fridgeSide = (g, w, h) => { brushed(g, 0, 0, w, h, '#D2D5D8', true); vgrad(g, 0, 0, w, h * 0.1, [[0, '#3E4348'], [1, '#2D3135']]); vgrad(g, 0, h * 0.93, w, h * 0.07, [[0, '#7D8389'], [1, '#5A5F64']]); };

  P.cubeFront = (g, w, h) => {
    srand(11);
    const base = h * 0.55;
    vgrad(g, 0, base, w, h - base, [[0, '#2A2D30'], [1, '#141618']]); // низ — чёрный 9005
    brushed(g, 0, base, w, h * 0.05, '#A7ADB2', false);                 // серебряный пояс 9006
    g.fillStyle = '#E8F1F5'; g.fillRect(0, 0, w, base);
    vgrad(g, 0, 0, w, base, [[0, '#F8FBFC'], [1, '#E6EEF2']]);
    brushed(g, 0, 0, w, h * 0.035, '#A7ADB2', false);
    const lv = [base * 0.48, base * 0.95];
    lv.forEach((ly, i) => {
      g.fillStyle = 'rgba(160,170,178,.6)'; g.fillRect(0, ly - 3, w, 4);
      for (let x = 10; x < w - 30; x += w / 5) {
        if (i === 0) { g.fillStyle = '#F6D4DF'; rr(g, x, ly - base * 0.2, w / 6.5, base * 0.2, 6); g.fill(); g.fillStyle = '#FBEFE6'; g.fillRect(x, ly - base * 0.12, w / 6.5, base * 0.03); g.fillStyle = '#C0392B'; g.beginPath(); g.arc(x + w / 13, ly - base * 0.22, 5, 0, 7); g.fill(); }
        else { g.fillStyle = '#C9893F'; g.beginPath(); g.ellipse(x + w / 13, ly - base * 0.08, w / 14, base * 0.08, 0, 0, 7); g.fill(); g.fillStyle = 'rgba(255,240,200,.5)'; g.beginPath(); g.ellipse(x + w / 15, ly - base * 0.12, w / 30, base * 0.025, 0, 0, 7); g.fill(); }
      }
    });
    glassSheen(g, 0, 0, w, base, 0.55);
    g.strokeStyle = '#8F969C'; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, base - 3);
  };
  P.glassTop = (g, w, h) => { vgrad(g, 0, 0, w, h, [[0, '#DDE8EE'], [1, '#C9D7DF']]); glassSheen(g, 0, 0, w, h, 0.6); brushed(g, 0, 0, w, 8, '#A7ADB2', false); brushed(g, 0, h - 8, w, 8, '#A7ADB2', false); };

  P.stripes = (g, w, h) => { const cols = ['#E8412C', '#F39200', '#3BAA35', '#F07EB0'], top = h * 0.08; brushed(g, 0, 0, w, top, '#C9CED2', false); const bh = (h - top - h * 0.06) / 4; cols.forEach((c, i) => { g.fillStyle = c; g.fillRect(0, top + i * bh, w, bh + 1); }); noise(g, w, h, 0.04); vgrad(g, 0, h * 0.94, w, h * 0.06, [[0, '#3B4045'], [1, '#202326']]); vgrad(g, 0, 0, w, h, [[0, 'rgba(255,255,255,.12)'], [0.5, 'rgba(255,255,255,0)'], [1, 'rgba(0,0,0,.08)']]); };
  P.iceTop = (g, w, h) => {
    srand(5); brushed(g, 0, 0, w, h, '#C9CED2', false);
    g.fillStyle = '#E9F2F6'; g.fillRect(w * 0.05, h * 0.08, w * 0.9, h * 0.84);
    const cols = ['#F7D7E3', '#FBE7A1', '#D9EFD3', '#F4C7A6', '#E8E2D8', '#C9A27A', '#F3B6C8'];
    const cw = w * 0.9 / 7, ch = h * 0.84 / 3;
    for (let i = 0; i < 7; i++) for (let j = 0; j < 3; j++) { const x = w * 0.05 + i * cw + cw / 2, y = h * 0.08 + j * ch + ch / 2; g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, Math.min(cw, ch) * 0.42, 0, 7); g.fill(); g.fillStyle = cols[(i + j * 2) % cols.length]; g.beginPath(); g.arc(x, y, Math.min(cw, ch) * 0.34, 0, 7); g.fill(); }
    glassSheen(g, w * 0.05, h * 0.08, w * 0.9, h * 0.84, 0.6);
  };

  P.counterFront = (g, w, h, o) => {
    srand(3); const plinth = h * 0.08;
    // светлый дуб, вертикальные ламели
    const lam = Math.max(10, w / 40);
    for (let x = 0; x < w; x += lam) { const c = ['#D9BC8E', '#D3B385', '#DEC395', '#CFAF80'][(rnd() * 4) | 0]; g.fillStyle = c; g.fillRect(x, 0, lam - 1.5, h - plinth); g.fillStyle = 'rgba(90,60,30,.18)'; g.fillRect(x + lam - 1.5, 0, 1.5, h - plinth); for (let k = 0; k < 6; k++) { g.fillStyle = 'rgba(120,80,40,' + (rnd() * 0.08) + ')'; g.fillRect(x + rnd() * lam, 0, 1, h - plinth); } }
    vgrad(g, 0, 0, w, h - plinth, [[0, 'rgba(0,0,0,.12)'], [0.12, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,.08)']]);
    g.fillStyle = '#1E2124'; g.fillRect(0, h - plinth, w, plinth);
    if (o && o.label) { g.fillStyle = '#1E2124'; g.fillRect(w * 0.08, h * 0.2, Math.min(w * 0.4, 420), h * 0.12); text(g, o.label, w * 0.08 + Math.min(w * 0.2, 210), h * 0.26, h * 0.06, '#F4F4F2', 600); }
  };
  P.counterTop = (g, w, h) => { g.fillStyle = '#F3F2EE'; g.fillRect(0, 0, w, h); noise(g, w, h, 0.04); g.strokeStyle = 'rgba(0,0,0,.1)'; g.lineWidth = 4; g.strokeRect(2, 2, w - 4, h - 4); };
  P.counterSide = (g, w, h) => { P.counterFront(g, w, h); };

  P.espresso = (g, w, h) => {
    brushed(g, 0, 0, w, h, '#C9CED2', false);
    g.fillStyle = '#20252A'; g.fillRect(0, 0, w, h * 0.14); // чашки сверху (кромка)
    for (let x = 8; x < w - 20; x += 26) { g.fillStyle = '#fff'; g.fillRect(x, h * 0.02, 18, h * 0.1); }
    g.fillStyle = '#2A2F34'; g.fillRect(w * 0.06, h * 0.2, w * 0.88, h * 0.22);
    [0.25, 0.5, 0.75].forEach(f => { g.fillStyle = '#0E1114'; g.fillRect(w * f - 18, h * 0.24, 36, h * 0.12); g.fillStyle = '#7FD3FF'; for (let k = 0; k < 4; k++) g.fillRect(w * f - 14 + k * 8, h * 0.27, 5, 4); });
    [0.25, 0.5, 0.75].forEach(f => { brushed(g, w * f - 22, h * 0.45, 44, h * 0.12, '#8F969C', false); g.fillStyle = '#111'; g.fillRect(w * f - 30, h * 0.52, 30, h * 0.06); });
    g.fillStyle = '#3B4045'; g.fillRect(w * 0.04, h * 0.8, w * 0.92, h * 0.06); for (let x = w * 0.05; x < w * 0.95; x += 7) { g.fillStyle = '#9AA1A7'; g.fillRect(x, h * 0.8, 3, h * 0.06); }
    text(g, 'UPPETIT', w * 0.5, h * 0.7, h * 0.06, '#3B4045', 700);
  };
  P.grinder = (g, w, h) => { g.fillStyle = '#1E2124'; g.fillRect(0, h * 0.4, w, h * 0.6); vgrad(g, w * 0.1, 0, w * 0.8, h * 0.4, [[0, 'rgba(220,235,240,.8)'], [1, 'rgba(200,215,220,.9)']]); g.fillStyle = '#5A3A22'; g.fillRect(w * 0.15, h * 0.18, w * 0.7, h * 0.2); for (let i = 0; i < 40; i++) { g.fillStyle = '#3D2615'; g.beginPath(); g.arc(w * 0.18 + rnd() * w * 0.64, h * 0.2 + rnd() * h * 0.16, 2, 0, 7); g.fill(); } g.fillStyle = '#7FD3FF'; g.fillRect(w * 0.35, h * 0.55, w * 0.3, h * 0.06); };
  P.screen = (g, w, h) => { g.fillStyle = '#121518'; g.fillRect(0, 0, w, h); const cols = ['#F39200', '#F07EB0', '#3BAA35', '#F5C400']; const m = Math.min(w, h) * 0.06; const tw = (w - m * 3) / 2, th = (h - m * 3) / 2; cols.forEach((c, i) => { g.fillStyle = c; rr(g, m + (i % 2) * (tw + m), m + ((i / 2) | 0) * (th + m), tw, th, 6); g.fill(); g.fillStyle = 'rgba(255,255,255,.7)'; g.fillRect(m * 1.6 + (i % 2) * (tw + m), m * 1.6 + ((i / 2) | 0) * (th + m), tw * 0.5, th * 0.08); }); glassSheen(g, 0, 0, w, h, 0.25); };
  P.microwave = (g, w, h) => { g.fillStyle = '#2E3338'; g.fillRect(0, 0, w, h); g.fillStyle = '#0B0E11'; rr(g, w * 0.05, h * 0.1, w * 0.66, h * 0.8, 6); g.fill(); g.fillStyle = 'rgba(255,200,120,.08)'; g.fillRect(w * 0.1, h * 0.2, w * 0.56, h * 0.6); glassSheen(g, w * 0.05, h * 0.1, w * 0.66, h * 0.8, 0.3); g.fillStyle = '#6F777E'; g.fillRect(w * 0.76, h * 0.1, w * 0.2, h * 0.8); g.fillStyle = '#7CFFB0'; g.fillRect(w * 0.79, h * 0.16, w * 0.14, h * 0.1); for (let i = 0; i < 6; i++) { g.fillStyle = '#3B4045'; g.fillRect(w * 0.79 + (i % 2) * w * 0.08, h * 0.35 + ((i / 2) | 0) * h * 0.15, w * 0.06, h * 0.1); } };

  // стеллаж: чёрный каркас, белые полки, банки и пачки (прозрачные промежутки)
  P.snackFront = (g, w, h) => {
    srand(21); g.clearRect(0, 0, w, h);
    const post = Math.max(6, w * 0.035), n = 5;
    for (let s = 0; s < n; s++) {
      const y = h * 0.04 + s * (h * 0.92 / (n - 1));
      if (s > 0) { // товары на полке
        let x = post + 4; const shH = h * 0.92 / (n - 1) * 0.7;
        while (x < w - post - 20) { const jw = 18 + rnd() * 22, jh = shH * (0.55 + rnd() * 0.4); if (x + jw > w - post - 4) break; const k = rnd();
          if (k < 0.55) { g.fillStyle = 'rgba(225,235,240,.95)'; g.fillRect(x, y - jh, jw, jh); g.fillStyle = ['#C9893F', '#E9C46A', '#B03A2E', '#6B3E26', '#F3C6D3', '#7DB547'][(rnd() * 6) | 0]; g.fillRect(x + 1, y - jh * 0.82, jw - 2, jh * 0.8); for (let q = 0; q < 6; q++) { g.fillStyle = ['#E8412C', '#F5C400', '#3BAA35', '#fff'][(rnd() * 4) | 0]; g.beginPath(); g.arc(x + 3 + rnd() * (jw - 6), y - jh * 0.1 - rnd() * jh * 0.6, 2, 0, 7); g.fill(); } g.fillStyle = '#1E2124'; g.fillRect(x - 1, y - jh - 3, jw + 2, 5); }
          else { vgrad(g, x, y - jh, jw, jh, [[0, ['#F39200', '#3BAA35', '#F07EB0', '#F5C400', '#D3B183'][(rnd() * 5) | 0]], [1, '#B8925F']]); g.fillStyle = '#fff'; g.fillRect(x + 3, y - jh * 0.6, jw - 6, jh * 0.22); }
          x += jw + 2 + rnd() * 3; }
        g.fillStyle = '#fff'; g.fillRect(post, y + 3, w - post * 2, 7); for (let px = post + 4; px < w - post - 30; px += 40) { g.fillStyle = '#F7F7F4'; g.fillRect(px, y + 4, 30, 5); }
      }
      g.fillStyle = '#F4F4F2'; g.fillRect(post, y, w - post * 2, 5);
    }
    g.fillStyle = '#16181A'; g.fillRect(0, 0, post, h); g.fillRect(w - post, 0, post, h); g.fillRect(0, 0, w, post * 0.6);
  };
  P.snackSide = (g, w, h) => { g.clearRect(0, 0, w, h); const post = Math.max(6, w * 0.06); g.fillStyle = '#16181A'; g.fillRect(0, 0, post, h); g.fillRect(w - post, 0, post, h); for (let s = 0; s < 5; s++) { const y = h * 0.04 + s * (h * 0.92 / 4); g.fillStyle = '#F4F4F2'; g.fillRect(0, y, w, 6); } };

  P.sinkTop = (g, w, h) => { brushed(g, 0, 0, w, h, '#C3C8CC', false); const m = w * 0.14; const gr = g.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w * 0.45); gr.addColorStop(0, '#7D868D'); gr.addColorStop(1, '#A9B1B7'); g.fillStyle = gr; rr(g, m, m, w - 2 * m, h - 2 * m, 18); g.fill(); g.fillStyle = '#3B4045'; g.beginPath(); g.arc(w / 2, h / 2, 8, 0, 7); g.fill(); g.fillStyle = '#9AA1A7'; g.fillRect(w / 2 - 6, 2, 12, m * 0.9); };
  P.steelCabinet = (g, w, h) => { brushed(g, 0, 0, w, h, '#C3C8CC', true); g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 3; g.strokeRect(w * 0.06, h * 0.12, w * 0.88, h * 0.78); g.beginPath(); g.moveTo(w / 2, h * 0.12); g.lineTo(w / 2, h * 0.9); g.stroke(); vgrad(g, w * 0.44, h * 0.18, 4, h * 0.14, [[0, '#EEE'], [1, '#888']]); vgrad(g, w * 0.54, h * 0.18, 4, h * 0.14, [[0, '#EEE'], [1, '#888']]); g.fillStyle = '#9AA1A7'; g.fillRect(0, 0, w, h * 0.06); };
  P.steelTableFront = (g, w, h) => { g.clearRect(0, 0, w, h); brushed(g, 0, 0, w, h * 0.06, '#C3C8CC', false); const leg = Math.max(8, w * 0.04); brushed(g, 0, 0, leg, h, '#AEB4B9', true); brushed(g, w - leg, 0, leg, h, '#AEB4B9', true); brushed(g, 0, h * 0.72, w, h * 0.04, '#B9BEC2', false); for (let x = leg + 10; x < w - leg - 40; x += 70) { g.fillStyle = '#E6E8EA'; g.fillRect(x, h * 0.6, 50, h * 0.12); g.fillStyle = '#C9CED2'; g.fillRect(x, h * 0.6, 50, 4); } };
  P.ovenFront = (g, w, h) => { brushed(g, 0, 0, w, h, '#B9BEC2', true); g.fillStyle = '#0F1316'; rr(g, w * 0.04, h * 0.06, w * 0.7, h * 0.88, 10); g.fill(); g.fillStyle = 'rgba(255,170,90,.12)'; g.fillRect(w * 0.1, h * 0.14, w * 0.58, h * 0.72); for (let i = 1; i < 5; i++) { g.fillStyle = 'rgba(180,180,180,.35)'; g.fillRect(w * 0.1, h * 0.14 + i * h * 0.144, w * 0.58, 3); } glassSheen(g, w * 0.04, h * 0.06, w * 0.7, h * 0.88, 0.35); g.fillStyle = '#2B2F33'; g.fillRect(w * 0.78, h * 0.06, w * 0.18, h * 0.88); g.fillStyle = '#E2412C'; g.fillRect(w * 0.8, h * 0.12, w * 0.14, h * 0.1); g.fillStyle = '#9AA1A7'; g.beginPath(); g.arc(w * 0.87, h * 0.45, w * 0.06, 0, 7); g.fill(); g.beginPath(); g.arc(w * 0.87, h * 0.68, w * 0.06, 0, 7); g.fill(); text(g, 'UNOX', w * 0.87, h * 0.88, h * 0.06, '#E6E8EA', 700); };
  P.chestWhite = (g, w, h) => { vgrad(g, 0, 0, w, h, [[0, '#FBFBFA'], [0.85, '#ECEDEB'], [1, '#D9DBD9']]); g.fillStyle = 'rgba(0,0,0,.1)'; g.fillRect(0, h * 0.12, w, 3); g.fillStyle = '#3B4045'; g.fillRect(w * 0.08, h * 0.82, w * 0.25, h * 0.08); for (let x = w * 0.09; x < w * 0.32; x += 8) { g.fillStyle = '#AEB4B9'; g.fillRect(x, h * 0.83, 3, h * 0.06); } g.fillStyle = '#BFC4C8'; g.fillRect(w * 0.45, h * 0.13, w * 0.1, h * 0.05); text(g, 'FROSTOR', w * 0.8, h * 0.3, h * 0.06, '#9AA1A7', 700); };
  P.chestLid = (g, w, h) => { vgrad(g, 0, 0, w, h, [[0, '#F7F8F7'], [1, '#E7E8E6']]); g.strokeStyle = 'rgba(0,0,0,.12)'; g.lineWidth = 4; g.strokeRect(6, 6, w - 12, h - 12); g.fillStyle = '#BFC4C8'; g.fillRect(w * 0.42, h - 18, w * 0.16, 10); };
  P.solidDoors = (g, w, h, o) => { const n = o.doors || 1; brushed(g, 0, 0, w, h, '#C3C8CC', true); g.fillStyle = '#2B2F33'; g.fillRect(0, 0, w, h * 0.08); g.fillStyle = '#E2412C'; g.font = '700 ' + (h * 0.04) + 'px Arial'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(o.temp || '+3°', w * 0.05, h * 0.04); const dw = w / n; for (let i = 0; i < n; i++) { g.strokeStyle = 'rgba(0,0,0,.28)'; g.lineWidth = 3; g.strokeRect(i * dw + 4, h * 0.09, dw - 8, h * 0.84); const hx = i % 2 ? i * dw + 14 : (i + 1) * dw - 20; vgrad(g, hx, h * 0.35, 6, h * 0.2, [[0, '#F0F2F3'], [1, '#8F969C']]); } g.fillStyle = '#5A5F64'; g.fillRect(0, h * 0.94, w, h * 0.06); };
  P.lockerFront = (g, w, h) => { vgrad(g, 0, 0, w, h, [[0, '#A9B1B7'], [1, '#8F979D']]); for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(w * 0.25, h * 0.06 + i * 10, w * 0.5, 4); g.fillRect(w * 0.25, h * 0.84 + i * 10, w * 0.5, 4); } g.fillStyle = '#3B4045'; g.fillRect(w * 0.78, h * 0.45, 6, h * 0.1); g.fillStyle = '#fff'; g.fillRect(w * 0.35, h * 0.25, w * 0.3, h * 0.05); g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 3; g.strokeRect(3, 3, w - 6, h - 6); };
  P.kitchenRack = (g, w, h) => { g.clearRect(0, 0, w, h); srand(9); const post = Math.max(6, w * 0.02); for (let s = 0; s < 4; s++) { const y = h * 0.1 + s * h * 0.29; brushed(g, 0, y, w, 6, '#C3C8CC', false); if (s < 3) { let x = post + 6; while (x < w - 60) { const bw = 40 + rnd() * 50, bh = 30 + rnd() * h * 0.12; g.fillStyle = ['#F4F4F2', '#D3B183', '#E9E2C9', '#CFD8DC'][(rnd() * 4) | 0]; g.fillRect(x, y - bh, bw, bh); g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(x, y - bh, bw, 4); x += bw + 6; } } } brushed(g, 0, 0, post, h, '#AEB4B9', true); brushed(g, w - post, 0, post, h, '#AEB4B9', true); };
  P.menuBoard = (g, w, h) => { g.fillStyle = '#16181A'; g.fillRect(0, 0, w, h); const cols = ['#F39200', '#F07EB0', '#3BAA35', '#F5C400']; const bw = w / 4; cols.forEach((c, i) => { g.fillStyle = c; g.fillRect(i * bw + 6, 6, bw - 12, h * 0.62); g.fillStyle = 'rgba(30,30,30,.75)'; for (let k = 0; k < 5; k++) g.fillRect(i * bw + 16, 20 + k * h * 0.1, bw * 0.55, 4); }); g.fillStyle = '#F5C400'; g.fillRect(6, h * 0.7, w - 12, h * 0.24); g.fillStyle = 'rgba(30,30,30,.75)'; for (let k = 0; k < 4; k++) g.fillRect(20 + k * w / 4, h * 0.78, w / 6, 5); };
  P.kioskFront = (g, w, h) => { vgrad(g, 0, 0, w, h, [[0, '#F7F7F4'], [1, '#E2E3E0']]); g.fillStyle = '#121518'; rr(g, w * 0.08, h * 0.05, w * 0.84, h * 0.36, 8); g.fill(); const cols = ['#F39200', '#F07EB0', '#3BAA35', '#F5C400']; cols.forEach((c, i) => { g.fillStyle = c; g.fillRect(w * 0.13 + (i % 2) * w * 0.38, h * 0.08 + ((i / 2) | 0) * h * 0.15, w * 0.34, h * 0.13); }); g.fillStyle = '#2B2F33'; g.fillRect(w * 0.3, h * 0.48, w * 0.4, h * 0.06); text(g, 'UPPETIT', w / 2, h * 0.7, w * 0.1, '#3B4045', 700); g.fillStyle = '#1E2124'; g.fillRect(0, h * 0.94, w, h * 0.06); };
  P.genericFront = (g, w, h, o) => { vgrad(g, 0, 0, w, h, [[0, '#D5D9DC'], [1, '#B9BEC2']]); g.strokeStyle = 'rgba(0,0,0,.12)'; g.lineWidth = 2; for (let x = -h; x < w; x += 24) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + h, 0); g.stroke(); } g.strokeStyle = 'rgba(0,0,0,.3)'; g.lineWidth = 4; g.strokeRect(2, 2, w - 4, h - 4); text(g, o && o.label ? o.label.slice(0, 18) : '?', w / 2, h / 2, Math.min(h * 0.18, w * 0.12), '#3B4045', 600); };
  P.wood = (g, w, h) => { srand(4); vgrad(g, 0, 0, w, h, [[0, '#DCC193'], [1, '#CDAE7D']]); for (let i = 0; i < 60; i++) { g.strokeStyle = 'rgba(120,80,40,' + (rnd() * 0.12) + ')'; g.lineWidth = 1 + rnd() * 2; g.beginPath(); const y = rnd() * h; g.moveTo(0, y); g.bezierCurveTo(w * 0.3, y + rnd() * 8 - 4, w * 0.6, y + rnd() * 8 - 4, w, y + rnd() * 6 - 3); g.stroke(); } };
  P.marble = (g, w, h) => { srand(8); g.fillStyle = '#F2F1EE'; g.fillRect(0, 0, w, h); for (let i = 0; i < 14; i++) { g.strokeStyle = 'rgba(140,140,140,' + (0.05 + rnd() * 0.1) + ')'; g.lineWidth = 1 + rnd() * 2; g.beginPath(); let x = rnd() * w, y = rnd() * h; g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += rnd() * 60 - 30; y += rnd() * 60 - 30; g.lineTo(x, y); } g.stroke(); } };

  /* ---------- поверхности зала ---------- */
  const S = {};
  S.terrazzoLight = (g, w, h) => { srand(31); g.fillStyle = '#D8D5CF'; g.fillRect(0, 0, w, h); noise(g, w, h, 0.05, 0, 2); const ch = ['#8C8A86', '#4A4A48', '#F4F2EE', '#B9A98F', '#6E6A64', '#E9E4DA']; for (let i = 0; i < w * h / 90; i++) { g.fillStyle = ch[(rnd() * ch.length) | 0]; const r = 1 + rnd() * 4; g.beginPath(); g.ellipse(rnd() * w, rnd() * h, r, r * (0.5 + rnd() * 0.6), rnd() * 3, 0, 7); g.fill(); } };
  S.terrazzoWarm = (g, w, h) => { srand(32); g.fillStyle = '#D9CFC0'; g.fillRect(0, 0, w, h); noise(g, w, h, 0.05, 0, 2); const ch = ['#A0896C', '#5B4E40', '#F4EFE6', '#C4A47E', '#7C6B58']; for (let i = 0; i < w * h / 100; i++) { g.fillStyle = ch[(rnd() * ch.length) | 0]; const r = 1 + rnd() * 4; g.beginPath(); g.ellipse(rnd() * w, rnd() * h, r, r * 0.7, rnd() * 3, 0, 7); g.fill(); } };
  S.porcelainGrey = (g, w, h) => { srand(33); g.fillStyle = '#A9ABAA'; g.fillRect(0, 0, w, h); noise(g, w, h, 0.07, 0, 2); g.fillStyle = 'rgba(60,60,60,.45)'; g.fillRect(0, 0, w, 2); g.fillRect(0, 0, 2, h); };
  S.plasterWhite = (g, w, h) => { srand(34); g.fillStyle = '#F1EFEA'; g.fillRect(0, 0, w, h); for (let i = 0; i < 60; i++) { const gr = g.createRadialGradient(rnd() * w, rnd() * h, 2, rnd() * w, rnd() * h, 40 + rnd() * 80); gr.addColorStop(0, 'rgba(200,195,185,.12)'); gr.addColorStop(1, 'rgba(200,195,185,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); } noise(g, w, h, 0.04, 0, 2); };
  S.plasterBeige = (g, w, h) => { srand(35); g.fillStyle = '#DCD3C6'; g.fillRect(0, 0, w, h); for (let i = 0; i < 80; i++) { const gr = g.createRadialGradient(rnd() * w, rnd() * h, 2, rnd() * w, rnd() * h, 30 + rnd() * 70); gr.addColorStop(0, 'rgba(150,135,115,.13)'); gr.addColorStop(1, 'rgba(150,135,115,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); } noise(g, w, h, 0.07, 0, 2); };
  S.microcement = (g, w, h) => { srand(36); g.fillStyle = '#C9CAC7'; g.fillRect(0, 0, w, h); for (let i = 0; i < 80; i++) { const gr = g.createRadialGradient(rnd() * w, rnd() * h, 2, rnd() * w, rnd() * h, 30 + rnd() * 90); gr.addColorStop(0, 'rgba(90,92,92,.1)'); gr.addColorStop(1, 'rgba(90,92,92,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); } noise(g, w, h, 0.05, 0, 2); };
  S.tileWhite = (g, w, h) => { g.fillStyle = '#5E6266'; g.fillRect(0, 0, w, h); const n = 8, s = w / n; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { vgrad(g, i * s + 1.5, j * s + 1.5, s - 3, s - 3, [[0, '#FCFCFB'], [1, '#EDEDEB']]); } };
  S.checkerFood = (g, w, h) => {
    srand(37); const cols = ['#E8412C', '#F5C400', '#3BAA35', '#F07EB0', '#F39200', '#F5C400', '#3BAA35', '#E8412C', '#F07EB0'];
    const n = 3, s = w / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const c = cols[(i + j * 2) % cols.length]; g.fillStyle = c; g.fillRect(i * s, j * s, s, s); const cx = i * s + s / 2, cy = j * s + s / 2; g.fillStyle = '#fff'; g.beginPath(); g.arc(cx, cy, s * 0.3, 0, 7); g.fill(); g.fillStyle = shade(c, 0.8); g.beginPath(); g.arc(cx, cy, s * 0.24, 0, 7); g.fill(); for (let k = 0; k < 7; k++) { g.fillStyle = ['#7DB547', '#E9C46A', '#C0392B', '#fff'][(rnd() * 4) | 0]; g.beginPath(); g.arc(cx + (rnd() - 0.5) * s * 0.3, cy + (rnd() - 0.5) * s * 0.3, s * 0.04, 0, 7); g.fill(); } }
  };
  S.lettering = (g, w, h) => { S.plasterWhite(g, w, h); text(g, 'сделано', w * 0.5, h * 0.42, h * 0.1, '#1E2124', 500); text(g, 'с аппетитом', w * 0.5, h * 0.54, h * 0.1, '#1E2124', 500); g.fillStyle = '#1E2124'; g.fillRect(w * 0.3, h * 0.64, w * 0.08, 6); g.fillRect(w * 0.62, h * 0.64, w * 0.08, 6); };
  S.ceilingBlack = (g, w, h) => { g.fillStyle = '#1D2023'; g.fillRect(0, 0, w, h); noise(g, w, h, 0.05, 0, 2); };
  S.ceilingGraphite = (g, w, h) => { g.fillStyle = '#34383C'; g.fillRect(0, 0, w, h); noise(g, w, h, 0.05, 0, 2); };
  S.ceilingWhite = (g, w, h) => { g.fillStyle = '#EEEDEA'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(0,0,0,.12)'; g.lineWidth = 2; g.strokeRect(0, 0, w, h); noise(g, w, h, 0.03, 0, 2); };
  S.facadeYellow = (g, w, h) => { srand(38); g.fillStyle = '#E3D6A6'; g.fillRect(0, 0, w, h); for (let i = 0; i < 25; i++) { const gr = g.createRadialGradient(rnd() * w, rnd() * h, 2, rnd() * w, rnd() * h, 30 + rnd() * 80); gr.addColorStop(0, 'rgba(150,130,80,.05)'); gr.addColorStop(1, 'rgba(150,130,80,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); } noise(g, w, h, 0.06, 0, 2); g.fillStyle = 'rgba(120,100,60,.35)'; g.fillRect(0, h - 3, w, 3); };
  S.pavement = (g, w, h) => { srand(39); g.fillStyle = '#9C958D'; g.fillRect(0, 0, w, h); noise(g, w, h, 0.12, 0, 2); g.fillStyle = 'rgba(60,55,50,.5)'; g.fillRect(0, 0, w, 3); g.fillRect(0, 0, 3, h); g.fillRect(w / 2, 0, 2, h); };
  S.asphalt = (g, w, h) => { srand(40); g.fillStyle = '#4E5155'; g.fillRect(0, 0, w, h); noise(g, w, h, 0.15, 0, 2); };

  /* ---------- реклама и вывеска ---------- */
  function plate(g, cx, cy, r, kind) { // круглая «фотография» блюда
    srand(cx + cy + kind * 7);
    g.fillStyle = 'rgba(0,0,0,.18)'; g.beginPath(); g.arc(cx + r * 0.04, cy + r * 0.05, r, 0, 7); g.fill();
    g.fillStyle = '#F7F5F0'; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill();
    g.fillStyle = '#EAE6DD'; g.beginPath(); g.arc(cx, cy, r * 0.78, 0, 7); g.fill();
    const sets = [['#C0392B', '#E9C46A', '#F4E3B0', '#D35400'], ['#7DB547', '#E8412C', '#F7D046', '#A9CF6B'], ['#E07A2E', '#F0B04A', '#fff', '#8C5A3A']][kind % 3];
    g.fillStyle = sets[0]; g.beginPath(); g.arc(cx, cy, r * 0.62, 0, 7); g.fill();
    for (let i = 0; i < 40; i++) { const a = rnd() * 6.28, d = rnd() * r * 0.55; g.fillStyle = sets[1 + ((rnd() * 3) | 0)]; g.beginPath(); g.ellipse(cx + Math.cos(a) * d, cy + Math.sin(a) * d, r * (0.04 + rnd() * 0.07), r * (0.03 + rnd() * 0.05), rnd() * 3, 0, 7); g.fill(); }
    const gr = g.createRadialGradient(cx - r * 0.3, cy - r * 0.4, r * 0.1, cx, cy, r); gr.addColorStop(0, 'rgba(255,255,255,.25)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill();
  }
  function face(g, cx, cy, r, col) { // круглый наклеечный персонаж
    g.fillStyle = col; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill();
    g.fillStyle = '#1E2124'; g.beginPath(); g.ellipse(cx - r * 0.32, cy - r * 0.12, r * 0.16, r * 0.2, 0, 0, 7); g.fill(); g.beginPath(); g.ellipse(cx + r * 0.32, cy - r * 0.12, r * 0.16, r * 0.2, 0, 0, 7); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(cx - r * 0.28, cy - r * 0.18, r * 0.06, 0, 7); g.fill(); g.beginPath(); g.arc(cx + r * 0.36, cy - r * 0.18, r * 0.06, 0, 7); g.fill();
    g.strokeStyle = '#1E2124'; g.lineWidth = r * 0.09; g.lineCap = 'round'; g.beginPath(); g.arc(cx, cy + r * 0.12, r * 0.32, 0.25, Math.PI - 0.25); g.stroke();
  }
  // плёнка на окно: прозрачный фон, круги с блюдами, наклейки, надпись, нижняя полоса
  S.windowAd = (g, w, h, o) => {
    g.clearRect(0, 0, w, h); const i = (o && o.i) || 0;
    const r = Math.min(w, h) * 0.26;
    plate(g, w * (i % 2 ? 0.34 : 0.66), h * 0.42, r, i);
    face(g, w * (i % 2 ? 0.78 : 0.2), h * 0.18, Math.min(w, h) * 0.07, ['#3BAA35', '#F07EB0', '#F5C400', '#F39200'][i % 4]);
    face(g, w * (i % 2 ? 0.12 : 0.86), h * 0.62, Math.min(w, h) * 0.055, ['#F5C400', '#F39200', '#3BAA35', '#F07EB0'][i % 4]);
    // нижняя полоса с надписью
    g.fillStyle = 'rgba(30,33,36,.92)'; g.fillRect(0, h * 0.8, w, h * 0.2);
    const cols = ['#3BAA35', '#F39200', '#F5C400', '#F07EB0']; cols.forEach((c, k) => { g.fillStyle = c; g.fillRect(k * w / 4, h * 0.8, w / 4, h * 0.025); });
    text(g, i % 2 ? 'кофе · салаты · супы · десерты' : 'магазин вкусной еды', w / 2, h * 0.9, Math.min(h * 0.055, w * 0.06), '#F4F4F2', 500);
  };
  S.doorAd = (g, w, h) => { g.clearRect(0, 0, w, h); face(g, w * 0.3, h * 0.12, w * 0.16, '#3BAA35'); face(g, w * 0.75, h * 0.86, w * 0.16, '#F5C400'); text(g, 'UPPETIT', w / 2, h * 0.42, w * 0.16, '#F4F4F2', 800); text(g, 'режим работы 8:00–22:00', w / 2, h * 0.5, w * 0.06, '#F4F4F2', 500); };
  S.signLetters = (g, w, h, o) => { g.clearRect(0, 0, w, h); const style = (o && o.style) || 'letters'; if (style === 'panel') { g.fillStyle = '#1E2124'; g.fillRect(0, 0, w, h); } g.save(); g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = h * 0.04; g.shadowOffsetY = h * 0.02; text(g, 'UPPETIT', w * 0.36, h * 0.5, h * 0.62, '#FFFFFF', 800, 'center'); g.font = '500 ' + (h * 0.24) + 'px "Golos Text", Arial, sans-serif'; g.textAlign = 'left'; g.fillText('магазин', w * 0.7, h * 0.36); g.fillText('вкусной еды', w * 0.7, h * 0.64); g.restore(); };
  S.poster = (g, w, h, o) => { const c = (o && o.color) || '#F39200'; g.fillStyle = c; g.fillRect(0, 0, w, h); plate(g, w * 0.5, h * 0.42, w * 0.32, (o && o.i) || 0); text(g, 'UPPETIT', w * 0.5, h * 0.82, w * 0.12, '#fff', 800); text(g, 'сделано с аппетитом', w * 0.5, h * 0.9, w * 0.06, '#fff', 500); };

  const PAINTERS = Object.assign({}, P, S);

  /* ---------- кэш текстур three.js ---------- */
  const cache = new Map();
  let userPhotos = {}; // ключ «тип:грань» → Image
  function setUserPhotos(map) { userPhotos = map || {}; cache.clear(); }
  function canvasFor(painter, wPx, hPx, opts) {
    const c = cv(wPx, hPx); const g = c.getContext('2d'); (PAINTERS[painter] || P.genericFront)(g, c.width, c.height, opts || {}); return c;
  }
  // размер канвы по размеру грани (метры)
  function sizeFor(wm, hm, ppm) { ppm = ppm || 420; let w = wm * ppm, h = hm * ppm; const m = Math.max(w, h); if (m > 1024) { w *= 1024 / m; h *= 1024 / m; } if (Math.min(w, h) < 48) { const k = 48 / Math.max(1, Math.min(w, h)); w *= k; h *= k; } return [Math.round(w), Math.round(h)]; }
  function tex(T, painter, wm, hm, opts, photoKey) {
    const key = painter + '|' + wm.toFixed(2) + 'x' + hm.toFixed(2) + '|' + JSON.stringify(opts || {}) + '|' + (photoKey || '');
    if (cache.has(key)) return cache.get(key);
    let src;
    if (photoKey && userPhotos[photoKey]) src = userPhotos[photoKey];
    else { const [w, h] = sizeFor(wm, hm); src = canvasFor(painter, w, h, opts); }
    const t = new T.CanvasTexture(src); t.encoding = T.sRGBEncoding; t.anisotropy = 8;
    cache.set(key, t); return t;
  }
  // повторяющаяся текстура поверхности: tile — размер плитки в метрах
  function surface(T, painter, tile, opts) {
    const key = 'S|' + painter + '|' + tile + '|' + JSON.stringify(opts || {});
    if (cache.has(key)) return cache.get(key);
    const c = canvasFor(painter, 512, 512, opts); const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.encoding = T.sRGBEncoding; t.anisotropy = 8; t.userData = { tile };
    cache.set(key, t); return t;
  }

  root.UTex = { ZONE, ZONE_NAMES, PAINTERS, canvasFor, tex, surface, setUserPhotos, sizeFor, plate, face };
})(window);
