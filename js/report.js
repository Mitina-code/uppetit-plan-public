/* Сравнение вариантов и выгрузка в PDF.
   Для кадров используется отдельная 3D-сцена (не трогает то, что открыто на экране). */
(function (root) {
  'use strict';
  const T = root.THREE, C = root.UCat;
  // какие ракурсы показываем (id из UScene.views()); для внутренних — шире угол
  const SHOTS = [
    { id: 'walk', name: 'С тротуара' }, { id: 'across', name: 'С другой стороны улицы' }, { id: 'win1', name: 'Вплотную к правому окну' },
    { id: 'x0', name: 'Вход: что видно с порога', inside: true }, { id: 'x1', name: 'Барная зона', inside: true }, { id: 'x3', name: 'Посадка за колонной', inside: true },
    { id: 'x4', name: 'Коридор', inside: true }, { id: 'x5', name: 'Дальний зал', inside: true }, { id: 'x6', name: 'Подсобка', inside: true }
  ];
  let comp = null, planHost = null, planView = null;
  function compScene() {
    if (comp) return comp;
    const h = document.createElement('div'); h.style.cssText = 'position:fixed;left:-3000px;top:0;width:640px;height:400px;'; document.body.appendChild(h);
    comp = root.UScene.create(h); comp.setActive(false); return comp;
  }
  function copy(c) { const o = document.createElement('canvas'); o.width = c.width; o.height = c.height; o.getContext('2d').drawImage(c, 0, 0); return o; }
  function shots(proj, w, h, list) {
    const sc = compScene(); sc.setInterior(proj.interior || 'manch-coffee'); sc.build(proj); sc.setLabels(false); sc.setAds(proj.ads !== false);
    const vs = sc.views(), out = [];
    (list || SHOTS).forEach(s => {
      const v = vs.find(q => q.id === s.id); if (!v) return;
      const cam = new T.PerspectiveCamera(s.inside ? 66 : 55, w / h, 0.05, 900); cam.position.fromArray(v.p); cam.lookAt(new T.Vector3().fromArray(v.t)); cam.updateMatrixWorld();
      out.push({ id: s.id, name: s.inside && v.name ? v.name : s.name, canvas: copy(sc.renderView(cam, w, h, false, true)) });
    });
    return out;
  }
  // схема сверху → картинка; возвращает и масштаб (пикселей на метр)
  async function planImage(proj, W) {
    if (!planHost) { planHost = document.createElement('div'); planHost.style.cssText = 'position:fixed;left:-3000px;top:0;width:800px;height:1000px;'; document.body.appendChild(planHost); planView = root.UPlan.create(planHost, {}); }
    planView.setProject(proj); planView.fitView();
    const svg = planHost.querySelector('svg'), vb = svg.viewBox.baseVal;
    const s = new XMLSerializer().serializeToString(svg).replace('<svg ', '<svg width="' + vb.width + '" height="' + vb.height + '" ');
    const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
    const H = Math.round(W * vb.height / vb.width), c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.drawImage(img, 0, 0, W, H);
    return { canvas: c, ppm: W / (vb.width / 60) };
  }

  /* ---------- PDF: страницы рисуем на холсте A4 (150 точек на дюйм) и кладём картинками ---------- */
  const PW = 1240, PH = 1754, M = 70;
  const FONT = '"Golos Text", Arial, sans-serif';
  function page() { const c = document.createElement('canvas'); c.width = PW; c.height = PH; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, PW, PH); return { c, g }; }
  function text(g, s, x, y, size, weight, color, align) { g.font = (weight || 400) + ' ' + size + 'px ' + FONT; g.fillStyle = color || '#1A2836'; g.textAlign = align || 'left'; g.textBaseline = 'alphabetic'; g.fillText(s, x, y); }
  function wrap(g, s, x, y, maxW, size, lh, color, weight) { g.font = (weight || 400) + ' ' + size + 'px ' + FONT; g.fillStyle = color || '#1A2836'; g.textAlign = 'left'; const words = s.split(' '); let line = ''; for (const w of words) { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > maxW && line) { g.fillText(line, x, y); y += lh; line = w; } else line = t; } if (line) { g.fillText(line, x, y); y += lh; } return y; }
  function header(g, title, sub, n, total) {
    g.fillStyle = '#1E2124'; g.fillRect(0, 0, PW, 96);
    text(g, 'UPPETIT', M, 62, 34, 800, '#fff'); text(g, title, M + 190, 52, 24, 600, '#fff'); text(g, sub, M + 190, 80, 17, 400, '#C9D2DA');
    const cols = ['#3BAA35', '#F39200', '#F5C400', '#F07EB0']; cols.forEach((c, i) => { g.fillStyle = c; g.fillRect(i * PW / 4, 96, PW / 4, 6); });
    text(g, 'стр. ' + n + ' из ' + total, PW - M, PH - 36, 15, 400, '#8A96A3', 'right');
    text(g, 'Сделано в планировщике Uppetit · размеры с чертежа, высоты и отделка — примерные', M, PH - 36, 15, 400, '#8A96A3');
  }
  function fitDraw(g, c, x, y, w, h) { const k = Math.min(w / c.width, h / c.height), dw = c.width * k, dh = c.height * k; g.drawImage(c, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh); return { x: x + (w - dw) / 2, y: y + (h - dh) / 2, k }; }

  async function pdf(proj, meta, facadeCanvas, onStep) {
    const step = t => onStep && onStep(t);
    step('Готовлю схему…');
    const plan = await planImage(proj, 2200);
    step('Снимаю виды в 3D…');
    const views = shots(proj, 1200, 760);
    const title = meta.name || proj.name || 'Проект', sub = 'Московский пр., 38 · ' + new Date().toLocaleDateString('ru-RU');
    const pages = [];
    // 1. схема
    { const { c, g } = page(); pages.push(c);
      text(g, 'Схема расстановки', M, 160, 30, 700);
      text(g, 'Вид сверху. Улица — внизу. Номера — позиции в спецификации на следующей странице.', M, 194, 17, 400, '#5F6B78');
      const r = fitDraw(g, plan.canvas, M, 220, PW - 2 * M, PH - 220 - 170);
      // масштабная линейка: 1 м и 5 м
      const m1 = plan.ppm * r.k; const bx = M, by = PH - 120;
      g.fillStyle = '#1A2836'; g.fillRect(bx, by, m1 * 5, 6); for (let i = 0; i <= 5; i++) g.fillRect(bx + m1 * i - 1, by - 8, 2, 22);
      for (let i = 0; i < 5; i += 2) { g.fillStyle = '#fff'; g.fillRect(bx + m1 * i + 1, by + 1, m1 - 2, 4); }
      text(g, '0', bx, by + 36, 15, 400, '#1A2836', 'center'); text(g, '1 м', bx + m1, by + 36, 15, 400, '#1A2836', 'center'); text(g, '5 м', bx + m1 * 5, by + 36, 15, 400, '#1A2836', 'center');
      text(g, 'Помещение ' + proj.bounds.w.toFixed(1) + ' × ' + proj.bounds.h.toFixed(1) + ' м · масштаб на листе A4 ≈ 1:' + Math.round(1000 / (m1 / (PW / 210))), bx + m1 * 5 + 40, by + 12, 16, 400, '#5F6B78');
    }
    // 2. спецификация и пояснения
    { const { c, g } = page(); pages.push(c);
      text(g, 'Спецификация', M, 160, 30, 700);
      const cnt = {}; (proj.items || []).forEach(i => { const t = C.BY[i.t] || C.BY.generic; const d = C.dims(i); const key = t.id + (t.custom ? '|' + Math.round(d.W * 1000) + '×' + Math.round(d.D * 1000) : ''); (cnt[key] = cnt[key] || { t, d, n: 0 }).n++; });
      const rows = Object.values(cnt).sort((a, b) => a.t.n - b.t.n);
      let y = 210; g.fillStyle = '#F0F3F6'; g.fillRect(M, y - 26, PW - 2 * M, 36);
      text(g, '№', M + 12, y, 16, 600); text(g, 'Наименование', M + 70, y, 16, 600); text(g, 'Размер, мм (ш×г×в)', PW - M - 330, y, 16, 600); text(g, 'Кол-во', PW - M - 12, y, 16, 600, '#1A2836', 'right');
      y += 40;
      rows.forEach(r => { if (y > PH - 520 && rows.length > 30) return; g.fillStyle = '#E2B32A'; g.beginPath(); g.arc(M + 22, y - 6, 14, 0, 7); g.fill(); text(g, String(r.t.n), M + 22, y, 13, 700, '#1A2836', 'center'); text(g, r.t.name + (r.t.custom ? ' (заказн.)' : ''), M + 70, y, 16); text(g, Math.round(r.d.W * 1000) + ' × ' + Math.round(r.d.D * 1000) + ' × ' + Math.round(r.d.H * 1000), PW - M - 330, y, 16, 400, '#5F6B78'); text(g, String(r.n), PW - M - 12, y, 16, 600, '#1A2836', 'right'); g.fillStyle = '#E6EAEE'; g.fillRect(M, y + 10, PW - 2 * M, 1); y += 34; });
      y += 30;
      if (meta.points && meta.points.length) { text(g, 'Что сделано и почему', M, y, 24, 700); y += 40; meta.points.forEach(p => { g.fillStyle = '#E2B32A'; g.fillRect(M, y - 13, 8, 8); y = wrap(g, p, M + 24, y, PW - 2 * M - 24, 17, 25) + 10; }); }
    }
    // 3+. виды
    const pics = (facadeCanvas ? [{ name: 'Фасад на фото: зал из 3D в окнах снимка', canvas: facadeCanvas }] : []).concat(views);
    for (let i = 0; i < pics.length; i += 4) {
      const { c, g } = page(); pages.push(c);
      text(g, i === 0 ? 'Как это будет выглядеть' : 'Виды (продолжение)', M, 160, 30, 700);
      pics.slice(i, i + 4).forEach((p, k) => { const y = 200 + k * 375; fitDraw(g, p.canvas, M, y, PW - 2 * M, 325); text(g, p.name, M, y + 350, 17, 500, '#1A2836'); });
    }
    pages.forEach((c, i) => header(c.getContext('2d'), title, sub, i + 1, pages.length));
    step('Собираю PDF…');
    if (!root.jspdf) await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'; s.onload = res; s.onerror = () => rej(new Error('Не загрузилась библиотека PDF')); document.head.appendChild(s); });
    const doc = new root.jspdf.jsPDF({ unit: 'mm', format: 'a4', compress: true });
    pages.forEach((c, i) => { if (i) doc.addPage(); doc.addImage(c.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, 210, 297); });
    doc.save(('Uppetit ' + title).replace(/[\\/:*?"<>|«»]/g, '').replace(/\s+/g, ' ').trim() + '.pdf');
    step('');
  }
  root.UReport = { SHOTS, shots, planImage, pdf, scene: compScene };
})(window);
