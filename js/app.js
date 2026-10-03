/* Приложение: вкладки, проект, отмена, сохранение, загрузка PDF, база с фото граней, отделка. */
(function () {
  'use strict';
  const $ = s => document.querySelector(s), $$ = s => Array.from(document.querySelectorAll(s));
  const C = window.UCat, U = window.UTex, S = window.UStore;
  if (!window.THREE) { document.body.insertAdjacentHTML('afterbegin', '<p style="padding:16px;background:#fde">Не загрузилась 3D-библиотека. Проверьте интернет и обновите страницу.</p>'); return; }

  let P = null;                 // текущий проект
  let undo = [], redo = [];
  const toastEl = $('#toast'); let toastT = null;
  function toast(t) { toastEl.textContent = t; toastEl.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('on'), 2600); }
  const mm = v => Math.round(v * 1000);

  /* ---------- 3D ---------- */
  const v3d = $('#v3d');
  const scene = window.UScene.create(v3d);
  let curView = null;
  function rebuildPresets() {
    const box = $('#presets'); box.innerHTML = '';
    scene.views().forEach(v => { const b = document.createElement('button'); b.textContent = v.name; b.onclick = () => { curView = v.id; scene.go(v); markPreset(); }; b.dataset.id = v.id; box.appendChild(b); });
    markPreset();
  }
  function markPreset() { $$('#presets button').forEach(b => b.classList.toggle('on', b.dataset.id === curView)); }
  scene.controls.addEventListener('start', () => { curView = null; markPreset(); });
  $('#tLabels').addEventListener('change', e => scene.setLabels(e.target.checked));
  $('#tAds').addEventListener('change', e => { change(() => { P.ads = e.target.checked; }, 'none'); scene.setAds(P.ads); });
  scene.setLabels(false);

  /* ---------- вкладки ---------- */
  let tab = 'edit';
  function showTab(v) {
    tab = v;
    $$('.tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.v === v ? 'true' : 'false'));
    $$('.view').forEach(s => s.classList.toggle('on', s.id === 'v-' + v));
    const slot = document.querySelector(`.slot3d[data-slot="${v}"]`);
    if (slot) { slot.appendChild(v3d); v3d.hidden = false; scene.setActive(true); setTimeout(scene.resize, 0); } else { v3d.hidden = true; scene.setActive(false); }
    if (v === 'facade') facade.sync();
    if (v === 'cat') buildCatalog();
    if (v === 'compare') buildCompare();
    if (v === 'interior') buildInteriors();
    if (v === 'edit') setTimeout(() => plan.render(), 0);
    try { localStorage.setItem('uppetit-tab', v); } catch (e) { }
  }
  $$('.tabs button').forEach(b => b.addEventListener('click', () => showTab(b.dataset.v)));

  /* ---------- проект: изменения, отмена, сохранение ---------- */
  const snap = () => JSON.stringify(P);
  let saveT = null;
  function save() { $('#saveState').textContent = 'Сохраняю…'; clearTimeout(saveT); saveT = setTimeout(async () => { const ok = await S.set('project', P); $('#saveState').textContent = ok ? 'Сохранено в этом браузере' : 'Не удалось сохранить'; }, 400); }
  function change(fn, what) {
    undo.push(snap()); if (undo.length > 80) undo.shift(); redo = [];
    fn(); save(); refresh(what); updUndo();
  }
  function refresh(what) {
    if (what === 'none') return;
    if (what === 'all') { scene.build(P); rebuildPresets(); }
    else if (what === 'items') scene.buildItems();
    else if (what && what.item) scene.rebuildItem(what.item);
    plan.render(); renderSel(); scene.highlight(typeof plan.getSel() === 'number' ? plan.getSel() : null);
  }
  function updUndo() { $('#bUndo').disabled = !undo.length; $('#bRedo').disabled = !redo.length; }
  function restore(json) { const keepSel = plan.getSel(); P = JSON.parse(json); scene.build(P); rebuildPresets(); plan.setProject(P, true); plan.select(byId(keepSel) ? keepSel : null); save(); }
  $('#bUndo').onclick = () => { if (!undo.length) return; redo.push(snap()); restore(undo.pop()); updUndo(); };
  $('#bRedo').onclick = () => { if (!redo.length) return; undo.push(snap()); restore(redo.pop()); updUndo(); };
  const byId = id => (P.items || []).find(i => i.id === id);
  const nextId = () => { P.uid = Math.max(P.uid || 1, ...(P.items || []).map(i => i.id + 1)); return P.uid++; };

  /* ---------- схема ---------- */
  const plan = window.UPlan.create($('#editPlan'), {
    onMove: it => scene.place(it),
    onResize: it => scene.rebuildItem(it),
    onCommit: (it, before) => { const cur = JSON.stringify(it); const o = JSON.parse(before); Object.assign(it, o); change(() => Object.assign(it, JSON.parse(cur)), { item: it }); },
    onSelect: id => { renderSel(); scene.highlight(typeof id === 'number' ? id : null); },
    onAddOpening: o => change(() => { (P.openings = P.openings || []).push(o); }, 'all'),
    onAddWall: w => change(() => { (P.extraWalls = P.extraWalls || []).push(w); }, 'all'),
    onHint: t => toast(t),
    onMode: m => { ['bAddWin', 'bAddDoor', 'bAddWall'].forEach(id => $('#' + id).classList.toggle('on', ({ addWindow: 'bAddWin', addDoor: 'bAddDoor', addWall: 'bAddWall' })[m] === id)); if (m === 'addWall') toast('Нажмите начало и конец новой стены'); else if (m !== 'select') toast('Нажмите на стену, где нужен проём'); }
  });
  $('#bAddWin').onclick = () => plan.setMode(plan.getMode() === 'addWindow' ? 'select' : 'addWindow');
  $('#bAddDoor').onclick = () => plan.setMode(plan.getMode() === 'addDoor' ? 'select' : 'addDoor');
  $('#bAddWall').onclick = () => plan.setMode(plan.getMode() === 'addWall' ? 'select' : 'addWall');
  $('#zIn').onclick = () => plan.zoom(1 / 1.25); $('#zOut').onclick = () => plan.zoom(1.25); $('#zAll').onclick = () => plan.fitView(); $('#zHall').onclick = () => plan.focusHall(scene.getHall());

  // список «Добавить»
  const addSel = $('#addType');
  C.CATS.forEach(([k, nm]) => { const og = document.createElement('optgroup'); og.label = nm; C.TYPES.filter(t => t.cat === k).forEach(t => { const o = document.createElement('option'); o.value = t.id; o.textContent = t.n + '. ' + t.name; og.appendChild(o); }); addSel.appendChild(og); });
  function addItem(t) {
    const h = scene.getHall(); const ty = C.BY[t];
    const it = { id: nextId(), t, x: h ? +(h.cx).toFixed(2) : 2, y: h ? +(h.inner - Math.min(h.depth, 6) / 2).toFixed(2) : 2, r: 0 };
    if (ty.zone) it.zone = 'yellow'; if (ty.custom && ty.custom.w) it.w = ty.W;
    change(() => P.items.push(it), { item: it }); plan.select(it.id); if (tab !== 'edit') showTab('edit');
  }
  $('#bAdd').onclick = () => addItem(addSel.value);

  // панель выбранного
  const ZN = { green: 'зелёный — салаты', orange: 'оранжевый — супы', yellow: 'жёлтый — основное', pink: 'розовый — десерты' };
  const CN = { grey: 'серый', green: 'зелёный', yellow: 'жёлтый', orange: 'оранжевый', pink: 'розовый' };
  function renderSel() {
    const box = $('#selPanel'), id = plan.getSel();
    if (id == null) { box.innerHTML = '<span class="muted">Нажмите на предмет, окно или дверь на схеме, чтобы выбрать.</span>'; return; }
    if (typeof id === 'string' && id[0] === 'o') { return renderOpening(+id.slice(1)); }
    if (typeof id === 'string' && id[0] === 'w') { box.innerHTML = `<b>Добавленная стена</b><button class="btn" id="sDelW">Удалить</button>`; $('#sDelW').onclick = () => { const i = +id.slice(1); change(() => P.extraWalls.splice(i, 1), 'all'); plan.select(null); }; return; }
    const it = byId(id); if (!it) { box.innerHTML = ''; return; }
    const t = C.BY[it.t] || C.BY.generic, d = C.dims(it);
    let h = `<span class="num">${t.n}</span><b>${t.name}</b>`;
    if (t.custom) {
      h += `<span class="row">${t.custom.w ? `длина <input type="number" step="0.05" min="${t.custom.w[0]}" max="${t.custom.w[1]}" value="${d.W.toFixed(2)}" id="sW"> м` : ''}${t.custom.d ? ` глубина <input type="number" step="0.05" min="${t.custom.d[0]}" max="${t.custom.d[1]}" value="${d.D.toFixed(2)}" id="sD"> м` : ''}${t.custom.h ? ` высота <input type="number" step="0.05" min="${t.custom.h[0]}" max="${t.custom.h[1]}" value="${d.H.toFixed(2)}" id="sH"> м` : ''}<span class="badge c">заказной</span></span>`;
    } else h += `<span class="muted">${mm(d.W)}×${mm(d.D)}×${mm(d.H)} мм <span class="badge">размер фиксированный</span></span>`;
    if (t.zone) h += `<span class="row">цвет полок <select id="sZone">${Object.keys(ZN).map(k => `<option value="${k}" ${it.zone === k ? 'selected' : ''}>${ZN[k]}</option>`).join('')}</select></span>`;
    if (t.color) h += `<span class="row">сиденье <select id="sCol">${Object.keys(CN).map(k => `<option value="${k}" ${(it.color || (t.id === 'stool' ? 'orange' : 'grey')) === k ? 'selected' : ''}>${CN[k]}</option>`).join('')}</select></span>`;
    if (it.label) h += `<span class="muted small">на чертеже: «${it.label}»</span>`;
    h += `<span class="row">заменить на <select id="sType">${C.TYPES.map(x => `<option value="${x.id}" ${x.id === it.t ? 'selected' : ''}>${x.n}. ${x.name}</option>`).join('')}</select></span>`;
    h += `<span class="row"><button class="btn" id="sCopy">Копировать</button><button class="btn" id="sR90">Повернуть 90°</button><button class="btn" id="sR15">15°</button><button class="btn" id="sDel">Удалить</button></span>`;
    box.innerHTML = h;
    const num = (el, k) => el && (el.onchange = () => { const v = parseFloat(el.value); if (!isFinite(v)) return; change(() => { it[k] = v; }, { item: it }); });
    num($('#sW'), 'w'); num($('#sD'), 'd'); num($('#sH'), 'h');
    if ($('#sZone')) $('#sZone').onchange = e => change(() => { it.zone = e.target.value; }, { item: it });
    if ($('#sCol')) $('#sCol').onchange = e => change(() => { it.color = e.target.value; }, { item: it });
    $('#sType').onchange = e => change(() => { const nt = C.BY[e.target.value]; it.t = nt.id; if (nt.zone && !it.zone) it.zone = 'yellow'; if (!(nt.custom && nt.custom.w)) delete it.w; else it.w = it.w || nt.W; }, { item: it });
    $('#sCopy').onclick = copySel; $('#sR90').onclick = () => rot(90); $('#sR15').onclick = () => rot(15); $('#sDel').onclick = delSel;
  }
  function renderOpening(i) {
    const o = P.openings[i], box = $('#selPanel'); if (!o) return;
    const K = { window: 'Окно', door: 'Дверь', pass: 'Проход без двери' };
    let h = `<b>${K[o.kind]}</b><span class="row">тип <select id="oK">${Object.keys(K).map(k => `<option value="${k}" ${o.kind === k ? 'selected' : ''}>${K[k]}</option>`).join('')}</select></span>`;
    h += `<span class="row">ширина <input type="number" step="0.05" min="0.4" max="4" value="${o.L.toFixed(2)}" id="oL"> м</span>`;
    if (o.kind === 'window') h += `<span class="row">низ <input type="number" step="0.05" min="0" max="2" value="${(o.sill || 0.55).toFixed(2)}" id="oS"> верх <input type="number" step="0.05" min="1" max="3.3" value="${(o.top || 2.15).toFixed(2)}" id="oT"> м</span>`;
    else h += `<span class="row">высота <input type="number" step="0.05" min="1.8" max="3.3" value="${(o.top || 2.1).toFixed(2)}" id="oT"> м</span>`;
    h += `<label class="chk"><input type="checkbox" id="oF" ${o.facade ? 'checked' : ''}> на фасаде (с улицы)</label>`;
    if (o.kind === 'door') h += `<label class="chk"><input type="checkbox" id="oE" ${o.entrance ? 'checked' : ''}> вход в зал (вид «от двери»)</label>`;
    h += `<span class="row"><button class="btn" id="oM1">← сдвинуть</button><button class="btn" id="oM2">сдвинуть →</button><button class="btn" id="oDel">Удалить проём</button></span>`;
    box.innerHTML = h;
    const set = (k, v) => change(() => { o[k] = v; }, 'all');
    $('#oK').onchange = e => set('kind', e.target.value);
    $('#oL').onchange = e => { const v = parseFloat(e.target.value); if (v > 0.3) set('L', v); };
    if ($('#oS')) $('#oS').onchange = e => set('sill', parseFloat(e.target.value));
    $('#oT').onchange = e => set('top', parseFloat(e.target.value));
    $('#oF').onchange = e => set('facade', e.target.checked);
    if ($('#oE')) $('#oE').onchange = e => change(() => { P.openings.forEach(q => { if (q !== o) delete q.entrance; }); o.entrance = e.target.checked; }, 'all');
    const mv = s => change(() => { o.c = [+(o.c[0] + o.u[0] * s).toFixed(3), +(o.c[1] + o.u[1] * s).toFixed(3)]; }, 'all');
    $('#oM1').onclick = () => mv(-0.05); $('#oM2').onclick = () => mv(0.05);
    $('#oDel').onclick = () => { change(() => P.openings.splice(i, 1), 'all'); plan.select(null); };
  }
  function copySel() { const it = byId(plan.getSel()); if (!it) return; const c = JSON.parse(JSON.stringify(it)); c.id = nextId(); c.x = +(it.x + 0.3).toFixed(2); c.y = +(it.y - 0.3).toFixed(2); change(() => P.items.push(c), { item: c }); plan.select(c.id); }
  function rot(a) { const it = byId(plan.getSel()); if (!it) return; change(() => { it.r = ((((it.r || 0) + a) % 360) + 360) % 360; }, { item: it }); }
  function delSel() { const id = plan.getSel(); const it = byId(id); if (!it) return; change(() => { P.items = P.items.filter(x => x !== it); scene.removeItem(id); }, 'none'); plan.select(null); plan.render(); }
  document.addEventListener('keydown', e => {
    if (tab !== 'edit' || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.key === 'Escape') { plan.setMode('select'); return; }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'я')) { e.preventDefault(); (e.shiftKey ? $('#bRedo') : $('#bUndo')).click(); return; }
    const it = byId(plan.getSel()); if (!it) return;
    const st = e.shiftKey ? 0.25 : 0.05, mv = { ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, -st], ArrowDown: [0, st] }[e.key];
    if (mv) { e.preventDefault(); change(() => { it.x = +(it.x + mv[0]).toFixed(3); it.y = +(it.y + mv[1]).toFixed(3); scene.place(it); }, 'plan'); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); delSel(); }
    else if (e.key === 'r' || e.key === 'к') rot(90);
    else if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'в')) { e.preventDefault(); copySel(); }
  });

  /* ---------- фасад ---------- */
  const facade = window.UFacade.create($('#facadeHost'), {
    getProject: () => P, scene: () => scene, save,
    setAds: v => { change(() => { P.ads = v; }, 'none'); scene.setAds(v); $('#tAds').checked = v; },
    setSign: v => change(() => { P.sign = v; }, 'all')
  });

  /* ---------- база оборудования ---------- */
  let thumbs = {}, catBuilt = false;
  function makeThumbs(only) {
    const T = THREE, r = new T.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); r.setSize(360, 270, false); r.outputEncoding = T.sRGBEncoding; r.toneMapping = T.ACESFilmicToneMapping;
    const sc = new T.Scene(); const pm = new T.PMREMGenerator(r); const env = T.RoomEnvironment ? pm.fromScene(new T.RoomEnvironment(), 0.04).texture : null;
    sc.add(new T.HemisphereLight('#F4F8FC', '#8A8278', 0.75)); const dl = new T.DirectionalLight('#FFF6EA', 0.8); r.toneMappingExposure = 0.9; dl.position.set(3, 6, 5); sc.add(dl);
    const cam = new T.PerspectiveCamera(30, 4 / 3, 0.05, 50), dir = new T.Vector3(0.75, 0.55, 1.5).normalize();
    C.TYPES.forEach(t => { if (only && only !== t.id) return; const it = { id: -1, t: t.id, x: 0, y: 0, r: 0, zone: t.zone ? 'green' : undefined }; const g = C.build(T, it, U); if (env) g.traverse(o => { if (o.material) [].concat(o.material).forEach(m => { if (m.metalness > 0.2 || m.roughness < 0.32) { m.envMap = env; m.envMapIntensity = 0.7; } }); }); sc.add(g); const bb = new T.Box3().setFromObject(g), sz = bb.getSize(new T.Vector3()), ctr = bb.getCenter(new T.Vector3()); const rad = sz.length() / 2, dist = rad / Math.sin(cam.fov * Math.PI / 360) * 1.05; cam.position.copy(ctr).addScaledVector(dir, dist); cam.lookAt(ctr); r.render(sc, cam); thumbs[t.id] = r.domElement.toDataURL('image/png'); sc.remove(g); });
    r.dispose(); if (r.forceContextLoss) r.forceContextLoss();
  }
  const FACE_NAMES = { front: 'перед', side: 'бок', top: 'верх' };
  function buildCatalog(force) {
    if (catBuilt && !force) return updCounts(); catBuilt = true;
    try { makeThumbs(); } catch (e) { console.warn(e); }
    let h = '';
    C.CATS.forEach(([k, nm]) => {
      h += `<h3 class="cat-h">${nm}</h3><div class="cards">`;
      C.TYPES.filter(t => t.cat === k).forEach(t => {
        const fix = t.custom ? `<span class="badge c">заказной: длина ${t.custom.w ? t.custom.w[0] + '–' + t.custom.w[1] + ' м' : ''}</span>` : '<span class="badge">размер фиксированный</span>';
        const box = !t.model;
        h += `<div class="card" data-t="${t.id}"><img class="pic" alt="" src="${thumbs[t.id] || ''}"><div class="b"><div class="nm"><i class="num">${t.n}</i><span>${t.name}</span></div>
          <div class="meta">${mm(t.W)} × ${mm(t.D)} × ${mm(t.H)} мм (ш × г × в)</div><div>${fix}</div>
          <div class="meta">${t.note || ''}</div>${t.src ? `<div class="meta small">Откуда: ${t.src}</div>` : ''}
          <div class="meta cnt" data-cnt="${t.id}"></div>
          <div class="acts"><button class="btn sm" data-add="${t.id}">Добавить в зал</button>${box ? `<button class="btn sm" data-ph="${t.id}">Фото граней</button>` : ''}</div>
          <div class="photoslots" data-slots="${t.id}" hidden>${['front', 'side', 'top'].map(f => `<label class="btn sm">${FACE_NAMES[f]}<input type="file" accept="image/*" hidden data-up="${t.id}:${f}"></label>`).join('')}<button class="btn sm" data-clr="${t.id}">Убрать фото</button></div>
        </div></div>`;
      });
      h += '</div>';
    });
    const cb = $('#catBox'); cb.innerHTML = h;
    cb.onclick = e => { const a = e.target.closest('[data-add]'); if (a) return addItem(a.dataset.add); const p = e.target.closest('[data-ph]'); if (p) { const s = cb.querySelector(`[data-slots="${p.dataset.ph}"]`); s.hidden = !s.hidden; return; } const c = e.target.closest('[data-clr]'); if (c) clearPhotos(c.dataset.clr); };
    cb.onchange = async e => { const u = e.target.closest('[data-up]'); if (!u || !u.files[0]) return; const [t, f] = u.dataset.up.split(':'); const src = await S.fileToDataURL(u.files[0]); u.value = ''; cropDialog(src, t, f); };
    updCounts();
  }
  function updCounts() { const c = {}; (P.items || []).forEach(i => c[i.t] = (c[i.t] || 0) + 1); $$('[data-cnt]').forEach(el => { const n = c[el.dataset.cnt] || 0; el.textContent = n ? `В проекте: ${n} шт.` : 'В проекте нет'; }); }
  async function loadUserPhotos() {
    const map = {}; for (const k of await S.keys()) { if (!String(k).startsWith('photo:')) continue; try { map[k.slice(6)] = await S.loadImg(await S.get(k)); } catch (e) { } }
    U.setUserPhotos(map);
  }
  async function clearPhotos(t) { for (const k of await S.keys()) if (String(k).startsWith('photo:' + t + ':')) await S.del(k); await loadUserPhotos(); scene.build(P); thumbs = {}; buildCatalog(true); toast('Фото убраны — снова рисованная текстура'); }
  // выпрямление грани: 4 угла на снимке → прямоугольник нужных пропорций
  function cropDialog(src, typeId, face) {
    const t = C.BY[typeId], fw = face === 'side' ? t.D : t.W, fh = face === 'top' ? t.D : t.H;
    const dlg = document.createElement('div'); dlg.className = 'cropdlg';
    dlg.innerHTML = `<div class="box"><h2>${t.name}: ${FACE_NAMES[face]}</h2><p class="muted small">Перетащите 4 кружка на углы грани на фото (верх-лево, верх-право, низ-право, низ-лево). Фото выпрямится в прямоугольник ${mm(fw)}×${mm(fh)} мм.</p><canvas></canvas><div class="tools" style="margin-top:10px"><button class="btn primary" data-ok>Готово</button><button class="btn" data-no>Отмена</button></div></div>`;
    document.body.appendChild(dlg);
    const cv = dlg.querySelector('canvas'), g = cv.getContext('2d');
    S.loadImg(src).then(img => {
      const k = Math.min(1, 1400 / Math.max(img.width, img.height)); cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
      let q = [[0.15, 0.1], [0.85, 0.1], [0.85, 0.9], [0.15, 0.9]], dragK = -1;
      const draw = () => { g.drawImage(img, 0, 0, cv.width, cv.height); g.strokeStyle = '#E2B32A'; g.lineWidth = 3; g.beginPath(); q.forEach((p, i) => i ? g.lineTo(p[0] * cv.width, p[1] * cv.height) : g.moveTo(p[0] * cv.width, p[1] * cv.height)); g.closePath(); g.stroke(); q.forEach(p => { g.fillStyle = '#fff'; g.beginPath(); g.arc(p[0] * cv.width, p[1] * cv.height, 9, 0, 7); g.fill(); g.stroke(); }); };
      const ev = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; };
      cv.onpointerdown = e => { const p = ev(e); let b = -1, bd = 1e9; q.forEach((c, i) => { const d = Math.hypot((c[0] - p[0]) * cv.width, (c[1] - p[1]) * cv.height); if (d < bd) { bd = d; b = i; } }); if (bd < 40) { dragK = b; cv.setPointerCapture(e.pointerId); } };
      cv.onpointermove = e => { if (dragK < 0) return; q[dragK] = ev(e).map(v => Math.max(0, Math.min(1, v))); draw(); };
      cv.onpointerup = () => { dragK = -1; };
      draw();
      dlg.querySelector('[data-ok]').onclick = async () => {
        const [ow, oh] = U.sizeFor(fw, fh, 480);
        const Hm = window.UFacade.homography([[0, 0], [1, 0], [1, 1], [0, 1]], q.map(p => [p[0] * img.width, p[1] * img.height]));
        const sc = document.createElement('canvas'); sc.width = img.width; sc.height = img.height; const sg = sc.getContext('2d'); sg.drawImage(img, 0, 0); const sd = sg.getImageData(0, 0, img.width, img.height).data;
        const out = document.createElement('canvas'); out.width = ow; out.height = oh; const og = out.getContext('2d'); const od = og.createImageData(ow, oh);
        for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) { const u = (x + 0.5) / ow, v = (y + 0.5) / oh, w = Hm[2][0] * u + Hm[2][1] * v + Hm[2][2]; const sx = Math.round((Hm[0][0] * u + Hm[0][1] * v + Hm[0][2]) / w), sy = Math.round((Hm[1][0] * u + Hm[1][1] * v + Hm[1][2]) / w); const o = (y * ow + x) * 4; if (sx < 0 || sy < 0 || sx >= img.width || sy >= img.height) { od.data[o + 3] = 255; continue; } const s = (sy * img.width + sx) * 4; od.data[o] = sd[s]; od.data[o + 1] = sd[s + 1]; od.data[o + 2] = sd[s + 2]; od.data[o + 3] = 255; }
        og.putImageData(od, 0, 0);
        const url = out.toDataURL('image/jpeg', 0.9);
        await S.set('photo:' + typeId + ':' + face, url);
        if (face === 'side') await S.set('photo:' + typeId + ':back', url);
        dlg.remove(); await loadUserPhotos(); scene.build(P); thumbs = {}; buildCatalog(true); toast('Фото натянуто на модель');
      };
    });
    dlg.querySelector('[data-no]').onclick = () => dlg.remove();
  }

  /* ---------- отделка ---------- */
  function buildInteriors() {
    const box = $('#intBox'); box.innerHTML = '';
    scene.INTERIORS.forEach(it => {
      const b = document.createElement('button'); b.className = 'intcard'; b.setAttribute('aria-pressed', P.interior === it.id ? 'true' : 'false');
      b.innerHTML = `<div class="sws"></div><div><b>${it.name}</b><span class="muted small">Где подсмотрено: ${it.where}</span><br><span class="small">Пол, стены, ${it.accent ? 'акцентная стена, ' : ''}потолок; свет — ${({ track: 'трековые споты', bulbs: 'лампы-«груши» на проводах', linear: 'линейные светильники' })[it.lights]}</span></div>`;
      const sws = b.querySelector('.sws');
      [it.floor, it.wall, it.accent || it.wall, it.ceil].forEach(s => { const c = U.canvasFor(s[0], 160, 88); sws.appendChild(c); });
      b.onclick = () => { change(() => { P.interior = it.id; }, 'none'); scene.setInterior(it.id); rebuildPresets(); buildInteriors(); const v = scene.views().find(x => x.id === 'walk'); if (v) { curView = v.id; scene.go(v); markPreset(); } };
      box.appendChild(b);
    });
  }

  /* ---------- загрузка PDF ---------- */
  const pdfPlan = window.UPlan.create($('#pdfPlan'), { onSelect: () => { } });
  let pending = null, pendRes = null, pendFlat = null, pendOpt = {}, pendUnder = null, pendName = '';
  $('#pdfZoomIn').onclick = () => pdfPlan.zoom(1 / 1.25); $('#pdfZoomOut').onclick = () => pdfPlan.zoom(1.25); $('#pdfFit').onclick = () => pdfPlan.fitView();
  $('#pdfUnder').onchange = e => { if (pendUnder) { pendUnder.show = e.target.checked; pdfPlan.setUnderlay(pendUnder); } else if (underlay) { underlay.show = e.target.checked; pdfPlan.setUnderlay(underlay); } };
  function loadPdfJs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    return new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'; s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; res(window.pdfjsLib); }; s.onerror = () => rej(new Error('Не загрузилась библиотека чтения PDF')); document.head.appendChild(s); });
  }
  $('#pdfFile').addEventListener('change', async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    const st = $('#pdfStatus'); st.textContent = 'Читаю PDF…'; $('#pdfReport').innerHTML = '';
    try {
      const lib = await loadPdfJs();
      const doc = await lib.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise;
      const page = await doc.getPage(1);
      st.textContent = 'Ищу стены, окна, двери и оборудование…';
      pendFlat = await window.PlanRec.extract(page, lib);
      // картинка чертежа для подложки
      const vp = page.getViewport({ scale: 2.5 }); const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height; await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
      pendUnder = { src: c.toDataURL('image/jpeg', 0.85), w: c.width, h: c.height, scale: 2.5, show: $('#pdfUnder').checked, opacity: 0.4 };
      pendName = f.name.replace(/\.pdf$/i, ''); pendOpt = {};
      runRecognition();
    } catch (err) { console.error(err); st.textContent = 'Не получилось прочитать файл: ' + (err.message || err); }
  });
  const KIND_NAMES = { wall: 'стены', wallline: 'контуры стен', window: 'окна', equip: 'оборудование и мебель', table: 'столы (заливка)', ignore: 'не учитывать' };
  function underMatrix(src, U0) { const cs = Math.round(Math.cos(src.rot * Math.PI / 180)), sn = Math.round(Math.sin(src.rot * Math.PI / 180)), k = src.k / U0.scale; return [cs * k, sn * k, -sn * k, cs * k, -src.mnx, -src.mny]; }
  function runRecognition() {
    const st = $('#pdfStatus');
    const res = window.PlanRec.recognize(pendFlat, pendOpt); pendRes = res;
    if (res.error) {
      st.innerHTML = res.error === 'scale' ? 'Не нашла на чертеже размерных линий с числами. Укажите масштаб: сколько миллиметров в одном пункте PDF.' : 'Не нашла стен. Проверьте в таблице ниже, какой цвет на чертеже — стены.';
      renderReport(res); return;
    }
    pending = window.PlanRec.toProject(res, pendName);
    pendUnder.m = underMatrix(pending.source, pendUnder);
    pdfPlan.setProject(pending); pdfPlan.setUnderlay(pendUnder);
    st.textContent = 'Готово. Проверьте результат на схеме справа.';
    renderReport(res);
  }
  function renderReport(res) {
    const box = $('#pdfReport'); let h = '<div class="report">';
    if (!res.error) {
      const cnt = {}; res.items.forEach(i => cnt[i.t] = (cnt[i.t] || 0) + 1);
      const wins = res.windows, fw = wins.filter(w => w.facade).length;
      h += `<div class="kv"><span>Масштаб</span><b>${res.scale.mmPerPt.toFixed(2)} мм в пункте ${res.scale.manual ? '(вручную)' : `(по ${res.scale.support} размерам)`}</b><span>Помещение</span><b>${res.bounds.w.toFixed(1)} × ${res.bounds.h.toFixed(1)} м</b><span>Окна</span><b>${wins.length}, на фасаде ${fw}</b><span>Двери и проходы</span><b>${res.doors.length}</b></div>`;
      h += '<table><tr><th>Нашлось</th><th>шт.</th></tr>' + Object.keys(cnt).sort((a, b) => (C.BY[a] ? C.BY[a].n : 99) - (C.BY[b] ? C.BY[b].n : 99)).map(k => `<tr><td>${C.BY[k] ? C.BY[k].n + '. ' + C.BY[k].name : k}</td><td>${cnt[k]}</td></tr>`).join('') + '</table>';
      if (res.unmatched.length) h += `<p class="small">Не узнала по подписи: ${res.unmatched.length} шт. (розовые). Их можно выбрать в «Расстановке» и заменить на нужный тип.</p>`;
      if (!fw) h += '<p class="small" style="color:var(--red)">Не нашла окон на фасаде — проверьте, какой цвет на чертеже означает окна, или поверните план.</p>';
    }
    h += `<div class="tools"><span>Масштаб, мм/пт</span><input type="number" step="0.1" id="pScale" value="${res.scale ? res.scale.mmPerPt.toFixed(2) : ''}"><button class="btn sm" id="pScaleOk">Применить</button></div>`;
    h += `<div class="tools"><button class="btn sm" id="pRot">Повернуть на 90° (если улица не внизу)</button></div>`;
    h += '<table><tr><th>Цвет на чертеже</th><th>Что это</th></tr>';
    res.stats.filter(s => s.n > 0).sort((a, b) => (b.area + b.len) - (a.area + a.len)).forEach(s => { h += `<tr><td><span class="sw" style="background:${s.color}"></span>${s.fill ? 'заливка' : 'линии'} · ${s.n}</td><td><select data-k="${s.key}">${Object.keys(KIND_NAMES).map(k => `<option value="${k}" ${res.kinds[s.key] === k ? 'selected' : ''}>${KIND_NAMES[k]}</option>`).join('')}</select></td></tr>`; });
    h += '</table>';
    if (!res.error) h += `<button class="btn primary big" id="pApply">Взять этот план в работу</button><p class="small muted">Текущая расстановка заменится. Если нужна, сначала сохраните её в файл.</p>`;
    box.innerHTML = h + '</div>';
    box.querySelectorAll('select[data-k]').forEach(s => s.onchange = () => { pendOpt.kinds = Object.assign({}, pendOpt.kinds, { [s.dataset.k]: s.value }); runRecognition(); });
    $('#pScaleOk').onclick = () => { const v = parseFloat($('#pScale').value); if (v > 0) { pendOpt.mmPerPt = v; runRecognition(); } };
    $('#pRot').onclick = () => { pendOpt.rot = (((pendRes && pendRes.rot) || 0) + 90) % 360; runRecognition(); };
    if ($('#pApply')) $('#pApply').onclick = async () => {
      undo.push(snap()); redo = []; updUndo();
      P = pending; underlay = pendUnder; await S.set('underlay', underlay); save(); scene.setInterior(P.interior);
      scene.build(P); rebuildPresets(); plan.setProject(P); plan.setUnderlay(underlay); setName(); showTab('edit'); toast('План загружен. Отметьте окна на фото фасада во вкладке 4.');
    };
  }

  /* ---------- файл проекта, пример ---------- */
  $('#bExport').onclick = async () => { const b = await S.exportAll(); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = (P.name || 'проект').replace(/[\\/:*?"<>|]/g, '_') + '.uppetit.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
  $('#bImport').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; try { await S.importAll(await f.text()); location.reload(); } catch (err) { toast('Не получилось открыть: ' + err.message); } };
  $('#bDemo').onclick = async () => { if (!confirm('Открыть пример «Московский пр., 38»? Текущая расстановка заменится (её можно вернуть кнопкой «Отменить»).')) return; undo.push(snap()); updUndo(); P = await loadDemo(); underlay = null; await S.del('underlay'); save(); scene.setInterior(P.interior); scene.build(P); rebuildPresets(); plan.setProject(P); plan.setUnderlay(null); setName(); };
  async function loadDemo() { const r = await fetch('data/moskovsky38.json', { cache: 'no-store' }); return r.json(); }
  const plural = (n, a, b, c) => { const m = n % 100, k = n % 10; return n + ' ' + (m > 10 && m < 20 ? c : k === 1 ? a : k >= 2 && k <= 4 ? b : c); };
  function setName() { $('#projName').textContent = (P.name || 'Проект') + ' · ' + plural((P.items || []).length, 'предмет', 'предмета', 'предметов'); }

  /* ---------- варианты планировки и прогулка ---------- */
  let variants = [];
  async function loadVariants() { try { variants = await (await fetch('data/variants.json', { cache: 'no-store' })).json(); } catch (e) { variants = []; } renderVariants(); }
  function renderVariants() {
    const box = $('#varList'); if (!box) return; box.innerHTML = '';
    variants.forEach(v => { const b = document.createElement('button'); b.className = 'varbtn'; b.setAttribute('aria-pressed', P && P.variant === v.id ? 'true' : 'false'); b.innerHTML = '<b>' + v.name + '</b><span>' + v.summary + '</span>'; b.onclick = () => pickVariant(v); box.appendChild(b); });
    const cur = variants.find(v => P && v.id === P.variant);
    $('#varDesc').innerHTML = cur ? '<b>Что сделано и почему</b><ul>' + cur.points.map(t => '<li>' + t + '</li>').join('') + '</ul>' : '<p class="small muted">Сейчас открыт ваш собственный проект. Выберите вариант, чтобы сравнить (текущий можно вернуть кнопкой «Отменить» на вкладке «Расстановка»).</p>';
  }
  async function pickVariant(v) {
    if (P && P.variant === v.id) return;
    const np = await (await fetch(v.file, { cache: 'no-store' })).json();
    np.facade = P && P.facade ? P.facade : np.facade; // разметка фото фасада общая
    undo.push(snap()); redo = []; updUndo();
    P = np; save(); scene.setInterior(P.interior || 'grib-color'); scene.build(P); rebuildPresets(); plan.setProject(P); setName(); renderVariants();
    const vw = scene.views().find(x => x.id === 'x0') || scene.views().find(x => x.id === 'door'); if (vw) { curView = vw.id; scene.go(vw); markPreset(); }
    toast(v.name + ' — открыт');
  }
  function startWalk() { if (tab !== 'views' && tab !== 'edit') showTab('views'); scene.walkStart(); }
  $('#bWalk').onclick = startWalk; $('#bWalk2').onclick = startWalk;
  $('#bTour').onclick = () => { if (tab !== 'views') showTab('views'); const path = P.tour; if (!path) { toast('Для этого проекта маршрута нет — включаю прогулку'); return scene.walkStart(); } scene.tour(path); };
  scene.onWalk(on => { v3d.classList.toggle('walking', on); $('#bWalk').textContent = on ? 'Идёт прогулка' : 'Прогулка'; });

  /* ---------- сравнение вариантов и PDF ---------- */
  const R = window.UReport, varCache = {};
  const tick = () => new Promise(r => setTimeout(r, 0));
  async function variantProject(v) {
    if (P && P.variant === v.id) return P;                       // открытый вариант — со всеми правками
    if (!varCache[v.id]) varCache[v.id] = await (await fetch(v.file, { cache: 'no-store' })).json();
    const p = JSON.parse(JSON.stringify(varCache[v.id])); p.facade = JSON.parse(JSON.stringify(P.facade || { quads: {}, patches: [], refl: 0.12 })); p.ads = P.ads; p.sign = P.sign; return p;
  }
  function columns() { const cols = variants.slice(); if (!P.variant || !variants.some(v => v.id === P.variant)) cols.push({ id: P.variant || 'mine', name: 'Ваш проект', summary: P.name || '', points: [], mine: true }); return cols; }
  let cmpKey = '', cmpBusy = false;
  async function buildCompare(force) {
    const key = JSON.stringify([P.variant, (P.items || []).length, P.interior, facade.ready(), variants.length]);
    if (cmpBusy || (!force && key === cmpKey)) return; cmpBusy = true; cmpKey = key;
    const st = $('#cmpState'), box = $('#cmpBox'), cols = columns();
    const rows = [{ id: 'plan', name: 'Схема' }].concat(facade.ready() ? [{ id: 'facade', name: 'Фасад на фото' }] : []).concat(R.SHOTS.map(s => ({ id: s.id, name: s.name })));
    let h = '<table class="cmp"><tr><td></td>' + cols.map((v, i) => '<th' + (v.id === P.variant || v.mine ? ' aria-current="true"' : '') + '><b>' + v.name + '</b><span class="small muted">' + (v.summary || '') + '</span><div class="row">' + (v.mine ? '' : '<button class="btn sm" data-open="' + i + '">Открыть</button>') + '<button class="btn sm primary" data-pdf="' + i + '">Скачать PDF</button></div></th>').join('') + '</tr>';
    rows.forEach(r => { h += '<tr><td class="rowname">' + r.name + '</td>' + cols.map((v, i) => '<td><img data-c="' + i + '" data-r="' + r.id + '" alt=""></td>').join('') + '</tr>'; });
    box.innerHTML = h + '</table>';
    try {
      for (let i = 0; i < cols.length; i++) {
        st.textContent = 'Готовлю: ' + cols[i].name + '…'; await tick();
        const p = await variantProject(cols[i]);
        const pl = await R.planImage(p, 700); setImg(i, 'plan', pl.canvas, 'Схема');
        const sh = R.shots(p, 640, 400); sh.forEach(x => setImg(i, x.id, x.canvas, x.name));
        if (facade.ready()) { const m = facade.montageFor(p, R.scene()); if (m) setImg(i, 'facade', m, 'Фасад на фото'); }
        await tick();
      }
      st.textContent = '';
    } catch (e) { console.error(e); st.textContent = 'Не получилось: ' + e.message; }
    cmpBusy = false;
    function setImg(i, r, c, name) { const el = box.querySelector('img[data-c="' + i + '"][data-r="' + r + '"]'); if (el) { el.src = c.toDataURL('image/jpeg', 0.85); el.dataset.name = cols[i].name + ' — ' + name; } }
  }
  $('#cmpRun').onclick = () => buildCompare(true);
  $('#cmpBox').addEventListener('click', async e => {
    const im = e.target.closest('img[src]'); if (im) { const lb = $('#lightbox'); lb.querySelector('img').src = im.src; lb.querySelector('span').textContent = im.dataset.name || ''; lb.hidden = false; return; }
    const o = e.target.closest('[data-open]'); if (o) { await pickVariant(columns()[+o.dataset.open]); buildCompare(true); return; }
    const d = e.target.closest('[data-pdf]'); if (d) { const v = columns()[+d.dataset.pdf]; makePdf(await variantProject(v), v); }
  });
  $('#lightbox').onclick = () => { $('#lightbox').hidden = true; };
  async function makePdf(p, meta) {
    try {
      toast('Готовлю PDF…'); await tick();
      let fc = null; if (facade.ready()) { R.shots(p, 64, 40, []); fc = facade.montageFor(p, R.scene()); }
      await R.pdf(p, { name: meta.mine ? (p.name || 'Ваш проект') : meta.name, points: meta.points || [] }, fc, t => { if (t) toast(t); });
      toast('PDF сохранён в «Загрузки»');
    } catch (e) { console.error(e); toast('Не получилось сделать PDF: ' + e.message); }
  }
  $('#bPdf').onclick = () => { const v = variants.find(x => x.id === P.variant); makePdf(P, v ? { name: v.name, points: v.points } : { name: P.name || 'Ваш проект', points: [], mine: true }); };

  /* ---------- запуск ---------- */
  let underlay = null;
  (async function init() {
    P = await S.get('project');
    if (!P || P.version !== 2) { try { P = await loadDemo(); } catch (e) { P = { version: 2, name: 'Пустой проект', walls: [], openings: [], items: [], bounds: { w: 10, h: 10 }, facadeY: 10 }; } }
    await loadUserPhotos();
    scene.setInterior(P.interior || 'manch-coffee');
    scene.build(P); rebuildPresets(); setName();
    plan.setProject(P);
    underlay = await S.get('underlay'); if (underlay) { plan.setUnderlay(Object.assign({}, underlay, { show: false })); pdfPlan.setProject(P); pdfPlan.setUnderlay(underlay); }
    const ph = await S.get('facadePhoto'); if (ph) await facade.setImage(ph);
    $('#tAds').checked = P.ads !== false; scene.setAds(P.ads !== false);
    let t0 = 'edit'; try { t0 = localStorage.getItem('uppetit-tab') || 'edit'; } catch (e) { }
    showTab(t0);
    const v = scene.views().find(x => x.id === 'walk'); if (v) { curView = v.id; scene.go(v, true); markPreset(); }
    setTimeout(() => plan.focusHall(scene.getHall()), 50);
    renderSel(); loadVariants();
    window.__app = { get P() { return P; }, scene, plan, showTab, facade };
  })();
})();
