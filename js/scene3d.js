/* 3D-сцена из проекта: стены по плану, проёмы, фасад, улица, оборудование, свет, отделка.
   Система координат: план (x, y) → мир (X = x, Z = y), Y — вверх. Улица — в сторону +Z (за линией фасада). */
(function (root) {
  'use strict';
  const T = root.THREE, U = root.UTex, C = root.UCat;

  // пять вариантов отделки по реальным залам Uppetit (Санкт-Петербург)
  const INTERIORS = [
    { id: 'manch-coffee', name: 'Терраццо, белая плитка, чёрный потолок', where: 'Манчестерская ул., 3 — кофейная зона', floor: ['terrazzoLight', 1.2], wall: ['plasterWhite', 2], accent: ['tileWhite', 1.2], ceil: ['ceilingBlack', 2], lights: 'track', ducts: true, frame: '#2F3336' },
    { id: 'grib-window', name: 'Терраццо, белая штукатурка, лампы-«груши»', where: 'ул. Грибалёвой, 7 — посадка у окна', floor: ['terrazzoLight', 1.2], wall: ['plasterWhite', 2], accent: ['lettering', 3.2], ceil: ['ceilingGraphite', 2], lights: 'bulbs', ducts: false, frame: '#2F3336' },
    { id: 'grib-fresh', name: 'Серый керамогранит, микроцемент, графитовый потолок', where: 'ул. Грибалёвой, 7 — фреш-зона с холодильниками', floor: ['porcelainGrey', 0.6], wall: ['microcement', 2.4], accent: null, ceil: ['ceilingGraphite', 2], lights: 'linear', ducts: true, frame: '#2F3336' },
    { id: 'manch-seat', name: 'Тёплое терраццо, бежевая штукатурка, постеры', where: 'Манчестерская ул., 3 — посадка', floor: ['terrazzoWarm', 1.2], wall: ['plasterBeige', 2], accent: null, posters: true, ceil: ['ceilingBlack', 2], lights: 'bulbs', ducts: false, frame: '#1E2124' },
    { id: 'grib-color', name: 'Терраццо, яркая стена-«шахматка», растения', where: 'ул. Грибалёвой, 7 — зал', floor: ['terrazzoLight', 1.2], wall: ['plasterWhite', 2], accent: ['checkerFood', 2.4], ceil: ['ceilingGraphite', 2], lights: 'bulbs', plants: true, ducts: false, frame: '#2F3336' }
  ];

  /* ---------- геометрия плана ---------- */
  const area = r => { let s = 0; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; s += p[0] * q[1] - q[0] * p[1]; } return s / 2; };
  const inRing = (p, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
  function rayHit(p, d, rings) { let best = Infinity; for (const r of rings) for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length], ex = b[0] - a[0], ey = b[1] - a[1]; const den = d[0] * ey - d[1] * ex; if (Math.abs(den) < 1e-12) continue; const t = ((a[0] - p[0]) * ey - (a[1] - p[1]) * ex) / den, u = ((a[0] - p[0]) * d[1] - (a[1] - p[1]) * d[0]) / den; if (t > 1e-6 && u >= 0 && u <= 1 && t < best) best = t; } return best; }
  function rectRing(x0, y0, x1, y1) { return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]; } // против часовой при y вниз → площадь > 0

  // все кольца стен проекта: распознанные + добавленные + продолжение фасада влево/вправо
  function allRings(p) {
    const rings = (p.walls || []).map(r => r.slice());
    (p.extraWalls || []).forEach(w => { const dx = w.b[0] - w.a[0], dy = w.b[1] - w.a[1], L = Math.hypot(dx, dy); if (L < 0.05) return; const t = (w.t || 0.12) / 2, n = [-dy / L * t, dx / L * t]; const r = [[w.a[0] + n[0], w.a[1] + n[1]], [w.b[0] + n[0], w.b[1] + n[1]], [w.b[0] - n[0], w.b[1] - n[1]], [w.a[0] - n[0], w.a[1] - n[1]]]; rings.push(area(r) < 0 ? r.reverse() : r); });
    const f = facadeInfo(p);
    if (f) {
      const segs = [[f.ext0, f.x0], [f.x1, f.ext1]];
      segs.forEach(([a, b]) => {
        if (b - a < 0.05) return;
        // вырезаем двери/окна, которые пользователь поставил на продолжении фасада
        const cuts = (p.openings || []).filter(o => o.facade && Math.abs(o.u[1]) < 0.2).map(o => [o.c[0] - o.L / 2, o.c[0] + o.L / 2]).filter(c => c[1] > a && c[0] < b).sort((m, n) => m[0] - n[0]);
        let s = a; cuts.forEach(c => { if (c[0] > s + 0.02) rings.push(rectRing(s, f.y - f.th, c[0], f.y)); s = Math.max(s, c[1]); }); if (b > s + 0.02) rings.push(rectRing(s, f.y - f.th, b, f.y));
      });
    }
    return rings;
  }
  // фасад: линия, толщина, где кончаются стены зала, ширина «соседних» участков
  function facadeInfo(p) {
    const fw = (p.openings || []).filter(o => o.facade && o.kind === 'window');
    if (p.facadeY == null) return null;
    const y = p.facadeY, th = fw.length ? Math.max(0.3, Math.min(1.2, ...fw.map(o => o.t1 - o.t0))) : 0.6;
    let x0 = Infinity, x1 = -Infinity;
    (p.walls || []).forEach(r => r.forEach((q, i) => { const s = r[(i + 1) % r.length]; if (Math.abs(q[1] - y) < 0.03 && Math.abs(s[1] - y) < 0.03) { x0 = Math.min(x0, q[0], s[0]); x1 = Math.max(x1, q[0], s[0]); } }));
    if (!isFinite(x0)) { x0 = 0; x1 = p.bounds ? p.bounds.w : 5; }
    return { y, th, x0, x1, ext0: Math.min(0, x0) - 10, ext1: Math.max(p.bounds ? p.bounds.w : x1, x1) + 10, wins: fw };
  }
  // зал — помещение за окнами фасада: середина окон, глубина до первой стены
  function hallInfo(p, rings) {
    const fw = (p.openings || []).filter(o => o.facade && o.kind === 'window');
    const f = facadeInfo(p); if (!f) return null;
    const cx = fw.length ? fw.reduce((a, o) => a + o.c[0], 0) / fw.length : (f.x0 + f.x1) / 2;
    const inner = f.y - f.th - 0.05;
    const depth = Math.min(30, rayHit([cx, inner], [0, -1], rings));
    const left = rayHit([cx, inner - 0.3], [-1, 0], rings), right = rayHit([cx, inner - 0.3], [1, 0], rings);
    return { cx, inner, depth: isFinite(depth) ? depth : 6, x0: cx - (isFinite(left) ? left : 3), x1: cx + (isFinite(right) ? right : 3) };
  }

  /* ---------- сцена ---------- */
  function create(host) {
    const renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(root.devicePixelRatio || 1, 2));
    renderer.outputEncoding = T.sRGBEncoding; renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.82;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.physicallyCorrectLights = false;
    host.insertBefore(renderer.domElement, host.firstChild);
    const scene = new T.Scene();
    const pm = new T.PMREMGenerator(renderer);
    const envTex = T.RoomEnvironment ? pm.fromScene(new T.RoomEnvironment(), 0.04).texture : null;
    // отражения окружения — только стеклу и металлу (на матовых поверхностях они «засвечивают» картинку)
    function applyEnv(root3) { if (!envTex) return; root3.traverse(o => { if (!o.material) return; [].concat(o.material).forEach(m => { if (m.envMap || !(m.metalness > 0.2 || m.transparent || (m.roughness != null && m.roughness < 0.32))) return; m.envMap = envTex; m.envMapIntensity = m.transparent ? 1.2 : 0.7; m.needsUpdate = true; }); }); }
    // небо
    const skyC = document.createElement('canvas'); skyC.width = 4; skyC.height = 256; const sg = skyC.getContext('2d'); const gr = sg.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, '#8FB3D4'); gr.addColorStop(0.55, '#CFDDE8'); gr.addColorStop(1, '#E8EEF2'); sg.fillStyle = gr; sg.fillRect(0, 0, 4, 256);
    const skyT = new T.CanvasTexture(skyC); skyT.encoding = T.sRGBEncoding;
    const sky = new T.Mesh(new T.SphereGeometry(400, 24, 12), new T.MeshBasicMaterial({ map: skyT, side: T.BackSide, fog: false, depthWrite: false })); scene.add(sky);
    scene.fog = new T.Fog('#D6E1EA', 60, 260);

    const camera = new T.PerspectiveCamera(55, 1, 0.05, 900);
    const controls = new T.OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.maxPolarAngle = Math.PI * 0.497;

    const hemi = new T.HemisphereLight('#EAF1F8', '#8A8278', 0.25); scene.add(hemi);
    const sun = new T.DirectionalLight('#FFF3DF', 0.9); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02; scene.add(sun); scene.add(sun.target);

    const roots = { arch: new T.Group(), items: new T.Group(), ads: new T.Group(), sign: new T.Group(), lights: new T.Group(), street: new T.Group(), upper: new T.Group() };
    Object.values(roots).forEach(g => scene.add(g));
    let project = null, rings = [], hall = null, fac = null, interior = INTERIORS[0], itemsById = {}, labels = true;
    const labelSprites = [];

    function clear(g) { while (g.children.length) { const c = g.children.pop(); c.traverse(o => { if (o.geometry) o.geometry.dispose(); }); } }
    const M = (c, o) => new T.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.8 }, o || {}));
    function surf(spec, extra) { const t = U.surface(T, spec[0], spec[1]); t.repeat.set(1 / spec[1], 1 / spec[1]); return new T.MeshStandardMaterial(Object.assign({ map: t, roughness: 0.85 }, extra || {})); }
    function box(w, h, d, mat, x, y, z, ry, parent) { const m = new T.Mesh(new T.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); if (ry) m.rotation.y = ry; m.castShadow = true; m.receiveShadow = true; (parent || roots.arch).add(m); return m; }

    function build(p) {
      project = p; rings = allRings(p); fac = facadeInfo(p); hall = hallInfo(p, rings);
      ['arch', 'ads', 'sign', 'lights', 'street', 'upper'].forEach(k => clear(roots[k]));
      buildArch(); buildStreet(); buildUpper(); buildSign(); buildLights(); buildItems(); setAds(p.ads !== false); applyEnv(scene);
      const b = p.bounds || { w: 10, h: 10 };
      sun.position.set(b.w / 2 - 14, 22, (p.facadeY || b.h) + 16); sun.target.position.set(b.w / 2, 0, (p.facadeY || b.h) - 3);
      const sc = sun.shadow.camera; sc.left = -18; sc.right = 18; sc.top = 18; sc.bottom = -18; sc.near = 1; sc.far = 80; sc.updateProjectionMatrix();
    }

    function buildArch() {
      const it = interior, W = project.bounds ? project.bounds.w : 10, Hh = project.bounds ? project.bounds.h : 10, H = project.H || 3.4;
      const floorM = surf(it.floor, { roughness: 0.55 });
      const fl = new T.Mesh(new T.PlaneGeometry(W + 0.2, Hh + 0.2), floorM); fl.rotation.x = -Math.PI / 2; fl.position.set(W / 2, 0.002, Hh / 2); fl.receiveShadow = true; roots.arch.add(fl);
      floorM.map.repeat.set((W + 0.2) / it.floor[1], (Hh + 0.2) / it.floor[1]);
      const ceilM = surf(it.ceil, { side: T.DoubleSide, roughness: 0.95 }); ceilM.map.repeat.set(W / it.ceil[1], Hh / it.ceil[1]);
      const ce = new T.Mesh(new T.PlaneGeometry(W, Hh), ceilM); ce.rotation.x = Math.PI / 2; ce.position.set(W / 2, H, Hh / 2); roots.arch.add(ce);
      // стены: экструзия контуров (x, -y), потом поворот → (X, Z)
      const outers = [], holes = [];
      rings.forEach(r => (area(r) > 0 ? outers : holes).push(r));
      const shapes = outers.map(o => ({ o, h: [] }));
      holes.forEach(h => { const host = shapes.filter(s => inRing(h[0], s.o)).sort((a, b) => Math.abs(area(a.o)) - Math.abs(area(b.o)))[0]; if (host) host.h.push(h); });
      const wallM = surf(it.wall), capM = M('#2A2D30'), facM = surf(['facadeYellow', 2.2], { roughness: 0.9 }), accM = it.accent ? surf(it.accent) : wallM;
      const geos = [];
      shapes.forEach(s => {
        const sh = new T.Shape(s.o.map(q => new T.Vector2(q[0], -q[1])));
        s.h.forEach(h => sh.holes.push(new T.Path(h.map(q => new T.Vector2(q[0], -q[1])))));
        const g = new T.ExtrudeGeometry(sh, { depth: H, bevelEnabled: false }); g.rotateX(-Math.PI / 2); geos.push(g);
      });
      // акцентная стена: та, что смотрит на улицу и первая видна из окон
      const ent = (project.openings || []).find(o => o.entrance) || null;
      const accX = hall ? ((ent && ent.c[0] < hall.cx) ? hall.x1 : (ent ? hall.x0 : hall.x1)) : null;
      const accZ0 = hall ? hall.inner - Math.min(hall.depth, 9) : null;
      geos.forEach(g => {
        const pos = g.attributes.position, uv = g.attributes.uv, n = pos.count / 3, buckets = [[], [], [], []];
        const a = new T.Vector3(), b = new T.Vector3(), c = new T.Vector3(), nn = new T.Vector3();
        for (let i = 0; i < n; i++) {
          a.fromBufferAttribute(pos, i * 3); b.fromBufferAttribute(pos, i * 3 + 1); c.fromBufferAttribute(pos, i * 3 + 2);
          nn.subVectors(c, b).cross(new T.Vector3().subVectors(a, b)).normalize();
          let k = 1;
          if (Math.abs(nn.y) > 0.9) k = 0;
          else if (fac && nn.z > 0.9 && Math.abs((a.z + b.z + c.z) / 3 - fac.y) < 0.06) k = 2;
          else if (it.accent && accX != null && Math.abs(nn.x) > 0.9 && Math.abs((a.x + b.x + c.x) / 3 - accX) < 0.08 && Math.max(a.z, b.z, c.z) > accZ0 && Math.min(a.z, b.z, c.z) < hall.inner) k = 3;
          buckets[k].push(i);
        }
        const P = [], UV = [], groups = []; let off = 0;
        buckets.forEach((list, k) => { if (!list.length) return; list.forEach(i => { for (let j = 0; j < 3; j++) { P.push(pos.getX(i * 3 + j), pos.getY(i * 3 + j), pos.getZ(i * 3 + j)); UV.push(uv.getX(i * 3 + j), uv.getY(i * 3 + j)); } }); groups.push([off, list.length * 3, k]); off += list.length * 3; });
        const ng = new T.BufferGeometry(); ng.setAttribute('position', new T.Float32BufferAttribute(P, 3)); ng.setAttribute('uv', new T.Float32BufferAttribute(UV, 2)); ng.computeVertexNormals(); groups.forEach(q => ng.addGroup(q[0], q[1], q[2]));
        const mesh = new T.Mesh(ng, [capM, wallM, facM, accM]); mesh.castShadow = true; mesh.receiveShadow = true; roots.arch.add(mesh);
      });
      [[wallM, it.wall[1]], [facM, 2.2], [accM, it.accent ? it.accent[1] : it.wall[1]]].forEach(([m, tile]) => { if (m.map) m.map.repeat.set(1 / tile, 1 / tile); });
      // проёмы: подоконник, перемычка, рама, стекло, дверное полотно
      (project.openings || []).forEach(o => buildOpening(o, H, wallM, facM));
      // цоколь и карниз первого этажа
      if (fac) {
        box(fac.ext1 - fac.ext0, 0.25, 0.06, M('#B9AE98'), (fac.ext0 + fac.ext1) / 2, 0.125, fac.y + 0.03);
        box(fac.ext1 - fac.ext0, 0.18, 0.22, M('#E9DFC0', { roughness: 0.9 }), (fac.ext0 + fac.ext1) / 2, H + 0.09, fac.y + 0.11);
      }
      // постеры и растения
      if (it.posters && hall) { [[hall.x0 + 0.02, hall.inner - hall.depth * 0.55, Math.PI / 2, '#F39200', 0], [hall.x0 + 0.02, hall.inner - hall.depth * 0.75, Math.PI / 2, '#F07EB0', 1]].forEach(q => { const pm = new T.Mesh(new T.PlaneGeometry(0.7, 1.0), new T.MeshStandardMaterial({ map: U.tex(T, 'poster', 0.7, 1.0, { color: q[3], i: q[4] }) })); pm.position.set(q[0], 1.7, q[1]); pm.rotation.y = q[2]; roots.arch.add(pm); }); }
      if (it.ducts && hall) { const dm = M('#55595D', { metalness: 0.5, roughness: 0.4 }); const L = hall.depth; const d1 = new T.Mesh(new T.CylinderGeometry(0.16, 0.16, L, 16), dm); d1.rotation.x = Math.PI / 2; d1.position.set(hall.x0 + (hall.x1 - hall.x0) * 0.3, H - 0.32, hall.inner - L / 2); roots.arch.add(d1); }
      if (it.plants && hall) { for (let i = 0; i < 3; i++) { const pg = new T.Group(); const pot = new T.Mesh(new T.CylinderGeometry(0.22, 0.16, 0.22, 16), M('#F4F4F2')); pg.add(pot); for (let k = 0; k < 46; k++) { const l = new T.Mesh(new T.ConeGeometry(0.035, 0.16, 5), M(['#2F6B2A', '#3E7D33', '#4F8F3C', '#24561F'][k % 4], { roughness: 0.7 })); const a = Math.random() * 6.28, r0 = 0.08 + Math.random() * 0.2; l.position.set(Math.cos(a) * r0, -0.02 - Math.random() * 0.7, Math.sin(a) * r0); l.rotation.set(Math.PI + (Math.random() - 0.5) * 0.8, a, (Math.random() - 0.5) * 0.8); pg.add(l); } pg.position.set(hall.x0 + (hall.x1 - hall.x0) * (0.2 + i * 0.3), H - 0.7, hall.inner - 1.2 - i * 1.6); roots.arch.add(pg); } }
    }

    function buildOpening(o, H, wallM, facM) {
      const ry = -Math.atan2(o.u[1], o.u[0]), th = o.t1 - o.t0, cn = (o.t0 + o.t1) / 2;
      const cx = o.c[0] + o.n[0] * cn, cz = o.c[1] + o.n[1] * cn;
      const outward = o.facade ? (o.n[1] > 0 ? 1 : -1) : 0; // +1 — локальный +z смотрит на улицу
      const mats = s => { const m = [wallM, wallM, wallM, wallM, wallM, wallM]; if (outward > 0) m[4] = facM; if (outward < 0) m[5] = facM; return m; };
      const put = (y0, y1) => { if (y1 - y0 < 0.01) return; const m = new T.Mesh(new T.BoxGeometry(o.L + 0.002, y1 - y0, th + 0.002), mats()); m.position.set(cx, (y0 + y1) / 2, cz); m.rotation.y = ry; m.castShadow = m.receiveShadow = true; roots.arch.add(m); };
      const isWin = o.kind === 'window', top = isWin ? (o.top || 2.15) : (o.top || 2.1), sill = isWin ? (o.sill || 0.55) : 0;
      put(top, H); if (isWin) put(0, sill);
      if (o.kind === 'pass') return;
      // рама и стекло — у наружной стороны, с отступом 12 см
      const glassT = outward ? (outward > 0 ? o.t1 - 0.14 : o.t0 + 0.14) : cn;
      const gx = o.c[0] + o.n[0] * glassT, gz = o.c[1] + o.n[1] * glassT;
      const frameM = M(interior.frame, { roughness: 0.5, metalness: 0.2 });
      const g = new T.Group(); g.position.set(gx, 0, gz); g.rotation.y = ry; roots.arch.add(g);
      const fw = 0.06, L = o.L, h0 = sill, h1 = top;
      [[0, h1 - fw / 2, L, fw], [0, h0 + fw / 2, L, fw], [-L / 2 + fw / 2, (h0 + h1) / 2, fw, h1 - h0], [L / 2 - fw / 2, (h0 + h1) / 2, fw, h1 - h0]].forEach(q => { const m = new T.Mesh(new T.BoxGeometry(q[2], q[3], 0.07), frameM); m.position.set(q[0], q[1], 0); g.add(m); });
      if (!isWin) { const m = new T.Mesh(new T.BoxGeometry(L, 0.12, 0.05), frameM); m.position.set(0, 0.06, 0); g.add(m); const hd = new T.Mesh(new T.BoxGeometry(0.03, 0.5, 0.05), M('#C9CED2', { metalness: 0.7, roughness: 0.3 })); hd.position.set(L / 2 - 0.15, 1.05, outward >= 0 ? 0.05 : -0.05); g.add(hd); }
      const glass = new T.Mesh(new T.PlaneGeometry(L - fw * 2, h1 - h0 - fw * 2), new T.MeshPhysicalMaterial({ color: '#DCEBF2', metalness: 0, roughness: 0.04, transparent: true, opacity: 0.16, envMapIntensity: 1.4, side: T.DoubleSide, depthWrite: false }));
      glass.position.set(0, (h0 + h1) / 2, 0); glass.renderOrder = 5; g.add(glass);
      // плёнка с рекламой — изнутри к стеклу, видна с улицы
      if (o.facade) {
        const idx = (project.openings || []).filter(q => q.facade && q.kind === o.kind).indexOf(o);
        const tex = U.tex(T, isWin ? 'windowAd' : 'doorAd', L - fw * 2, h1 - h0 - fw * 2, { i: idx });
        const ad = new T.Mesh(new T.PlaneGeometry(L - fw * 2, h1 - h0 - fw * 2), new T.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.05, side: T.DoubleSide, roughness: 0.5 }));
        ad.position.set((gx - o.c[0]) * 0 , (h0 + h1) / 2, -outward * 0.012); ad.position.x = 0; ad.rotation.y = 0; ad.renderOrder = 6;
        const ag = new T.Group(); ag.position.copy(g.position); ag.rotation.y = ry; ag.add(ad); roots.ads.add(ag);
      }
      if (isWin) { const sl = new T.Mesh(new T.BoxGeometry(L + 0.1, 0.04, 0.3), M('#F3F2EE')); sl.position.set(0, sill + 0.02, -outward * 0.15); g.add(sl); }
    }

    function buildStreet() {
      if (!fac) return; const y = fac.y, x0 = fac.ext0 - 30, x1 = fac.ext1 + 30, W = x1 - x0;
      const pv = surf(['pavement', 1.0], { roughness: 0.9 }); pv.map.repeat.set(W, 6);
      const p1 = new T.Mesh(new T.PlaneGeometry(W, 6), pv); p1.rotation.x = -Math.PI / 2; p1.position.set((x0 + x1) / 2, 0, y + 3); p1.receiveShadow = true; roots.street.add(p1);
      box(W, 0.15, 0.3, M('#8C877F'), (x0 + x1) / 2, 0.075, y + 6.15, 0, roots.street);
      const asp = surf(['asphalt', 4], { roughness: 0.95 }); asp.map.repeat.set(W / 4, 4);
      const rd = new T.Mesh(new T.PlaneGeometry(W, 16), asp); rd.rotation.x = -Math.PI / 2; rd.position.set((x0 + x1) / 2, -0.02, y + 14.3); rd.receiveShadow = true; roots.street.add(rd);
      for (let x = x0; x < x1; x += 6) box(3, 0.005, 0.15, M('#E9E9E4'), x, -0.01, y + 14.3, 0, roots.street);
      const p2 = new T.Mesh(new T.PlaneGeometry(W, 6), pv); p2.rotation.x = -Math.PI / 2; p2.position.set((x0 + x1) / 2, 0, y + 25.3); roots.street.add(p2);
      // дома напротив
      const opp = M('#D8CDB0', { roughness: 0.95 }); box(W, 16, 2, opp, (x0 + x1) / 2, 8, y + 29.3, 0, roots.street).castShadow = false;
      for (let x = x0 + 2; x < x1; x += 3.2) for (let f = 0; f < 4; f++) box(1.3, 1.8, 0.05, M('#5E6A73', { roughness: 0.2, metalness: 0.3 }), x, 1.6 + f * 3.6, y + 28.27, 0, roots.street);
      // столбики и фонарь
      [fac.x0 - 1.2, fac.x1 + 1.5].forEach(x => { const c = new T.Mesh(new T.CylinderGeometry(0.08, 0.1, 0.85, 14), M('#1E2124')); c.position.set(x, 0.42, y + 1.4); c.castShadow = true; roots.street.add(c); });
      const lp = new T.Mesh(new T.CylinderGeometry(0.07, 0.1, 6, 12), M('#2B2F33')); lp.position.set(fac.x1 + 9, 3, y + 5.8); roots.street.add(lp);
    }

    function buildUpper() {
      if (!fac) return; const H = project.H || 3.4, x0 = fac.ext0, x1 = fac.ext1, W = x1 - x0, h = 10.5, y = fac.y;
      const sh = new T.Shape([new T.Vector2(x0, H), new T.Vector2(x1, H), new T.Vector2(x1, H + h), new T.Vector2(x0, H + h)]);
      const wins = []; for (let x = x0 + 1.4; x < x1 - 1.6; x += 3.2) for (let f = 0; f < 3; f++) { const yb = H + 0.9 + f * 3.4; wins.push([x, yb]); sh.holes.push(new T.Path([new T.Vector2(x, yb), new T.Vector2(x + 1.3, yb), new T.Vector2(x + 1.3, yb + 1.9), new T.Vector2(x, yb + 1.9)].reverse())); }
      const g = new T.ExtrudeGeometry(sh, { depth: 0.6, bevelEnabled: false });
      const fm = surf(['facadeYellow', 2.2], { roughness: 0.9 }); fm.map.repeat.set(1 / 2.2, 1 / 2.2);
      const m = new T.Mesh(g, fm); m.position.z = y - 0.6; m.castShadow = true; m.receiveShadow = true; roots.upper.add(m);
      const gl = M('#4E5A63', { roughness: 0.15, metalness: 0.4 });
      wins.forEach(([x, yb]) => { const p = new T.Mesh(new T.PlaneGeometry(1.3, 1.9), gl); p.position.set(x + 0.65, yb + 0.95, y - 0.25); roots.upper.add(p); box(1.5, 0.06, 0.16, M('#EEE6CF'), x + 0.65, yb - 0.03, y + 0.05, 0, roots.upper); });
      // массивы соседних зданий и перекрытие сверху (чтобы сквозь «крышу» не было видно неба)
      const mass = M('#CFC6AC', { roughness: 1 }), b = project.bounds || { w: 10, h: 10 };
      box(Math.max(0.1, Math.min(0, fac.x0) - x0), H, 30, mass, (x0 + Math.min(0, fac.x0)) / 2, H / 2, y - fac.th - 15, 0, roots.upper);
      box(Math.max(0.1, x1 - Math.max(b.w, fac.x1)), H, 30, mass, (x1 + Math.max(b.w, fac.x1)) / 2, H / 2, y - fac.th - 15, 0, roots.upper);
      box(W, h, 30, mass, (x0 + x1) / 2, H + h / 2 + 0.01, y - 15.6, 0, roots.upper);
    }

    function buildSign() {
      if (!fac || project.sign === 'none') return;
      const fw = fac.wins; if (!fw.length) return;
      const xs = fw.map(o => [o.c[0] - o.L / 2, o.c[0] + o.L / 2]).flat(), x0 = Math.min(...xs), x1 = Math.max(...xs);
      const top = Math.max(...fw.map(o => o.top || 2.15)), H = project.H || 3.4;
      const w = Math.min(5.5, Math.max(2.4, (x1 - x0) * 1.05)), h = Math.min(0.62, Math.max(0.35, H - top - 0.35));
      const t = U.tex(T, 'signLetters', w, h, { style: project.sign || 'letters' });
      const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshStandardMaterial({ map: t, transparent: project.sign !== 'panel', alphaTest: 0.02, roughness: 0.4, emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 0.25 }));
      m.position.set((x0 + x1) / 2, Math.min(H - h / 2 - 0.12, top + 0.25 + h / 2), fac.y + 0.04); m.castShadow = true; roots.sign.add(m);
    }

    function haloTex() { if (haloTex.t) return haloTex.t; const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(0.25, 'rgba(255,220,160,.35)'); gr.addColorStop(1, 'rgba(255,200,120,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); haloTex.t = new T.CanvasTexture(c); return haloTex.t; }
    function buildLights() {
      if (!hall) return; const H = project.H || 3.4, it = interior;
      // точечный свет над залом: сетка, только внутри помещений
      const pts = [];
      for (let z = hall.inner - 0.9; z > hall.inner - Math.min(hall.depth, 14); z -= 2.2) for (let x = hall.x0 + 0.9; x < hall.x1; x += 2.0) { if (!rings.some(r => inRing([x, z], r))) pts.push([x, z]); }
      pts.slice(0, 8).forEach(p => { const l = new T.PointLight('#FFE9CF', 1.0, 9, 1.4); l.position.set(p[0], H - 0.5, p[1]); roots.lights.add(l); });
      const fixtures = [];
      if (it.lights === 'track') { const bm = M('#16181A', { roughness: 0.4 }); [hall.x0 + (hall.x1 - hall.x0) * 0.3, hall.x0 + (hall.x1 - hall.x0) * 0.7].forEach(x => { box(0.04, 0.03, Math.min(hall.depth, 12), bm, x, H - 0.02, hall.inner - Math.min(hall.depth, 12) / 2, 0, roots.lights); for (let z = hall.inner - 0.6; z > hall.inner - Math.min(hall.depth, 12); z -= 1.1) { const s = new T.Mesh(new T.CylinderGeometry(0.045, 0.045, 0.14, 12), bm); s.position.set(x, H - 0.12, z); s.rotation.x = 0.4; roots.lights.add(s); const b = new T.Mesh(new T.CircleGeometry(0.04, 12), new T.MeshBasicMaterial({ color: '#FFF4D8' })); b.position.set(x, H - 0.19, z + 0.03); b.rotation.x = Math.PI / 2 + 0.4; roots.lights.add(b); } }); }
      if (it.lights === 'bulbs') { const wire = M('#111'), bulbM = new T.MeshBasicMaterial({ color: '#FFE2B0' }), haloM = new T.SpriteMaterial({ map: haloTex(), color: '#FFC870', transparent: true, depthWrite: false, blending: T.AdditiveBlending }); pts.concat(pts.map(p => [p[0] + 0.7, p[1] - 0.6])).slice(0, 16).forEach((p, i) => { const len = 0.8 + (i % 3) * 0.35; box(0.008, len, 0.008, wire, p[0], H - len / 2, p[1], 0, roots.lights); const b = new T.Mesh(new T.SphereGeometry(0.07, 16, 12), bulbM); b.scale.y = 1.25; b.position.set(p[0], H - len - 0.07, p[1]); roots.lights.add(b); const hs = new T.Sprite(haloM); hs.scale.set(0.5, 0.5, 1); hs.position.copy(b.position); roots.lights.add(hs); }); }
      if (it.lights === 'linear') { const lm = new T.MeshBasicMaterial({ color: '#F6FAFF' }); [hall.x0 + (hall.x1 - hall.x0) * 0.33, hall.x0 + (hall.x1 - hall.x0) * 0.67].forEach(x => box(0.06, 0.04, Math.min(hall.depth, 12) * 0.85, lm, x, H - 0.25, hall.inner - Math.min(hall.depth, 12) / 2, 0, roots.lights)); }
    }

    /* ---------- предметы ---------- */
    function makeLabel(n) { const c = document.createElement('canvas'); c.width = c.height = 96; const g = c.getContext('2d'); g.fillStyle = '#E2B32A'; g.beginPath(); g.arc(48, 48, 42, 0, 7); g.fill(); g.lineWidth = 5; g.strokeStyle = '#1A2836'; g.stroke(); g.fillStyle = '#1A2836'; g.font = 'bold 46px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(n, 48, 51); const t = new T.CanvasTexture(c); const s = new T.Sprite(new T.SpriteMaterial({ map: t, depthTest: true, sizeAttenuation: false })); s.scale.set(0.04, 0.04, 1); s.renderOrder = 10; s.userData.label = true; return s; }
    function buildItems() { clear(roots.items); itemsById = {}; (project.items || []).forEach(addItem); }
    function addItem(it) {
      const g = C.build(T, it, U); const ty = C.BY[it.t] || C.BY.generic;
      const lb = makeLabel(ty.n); lb.position.y = g.userData.H + 0.18; lb.visible = labels; g.add(lb);
      roots.items.add(g); itemsById[it.id] = g; place(it); applyEnv(g);
    }
    function place(it) { const g = itemsById[it.id]; if (!g) return; g.position.set(it.x, 0, it.y); g.rotation.y = -(it.r || 0) * Math.PI / 180; }
    function removeItem(id) { const g = itemsById[id]; if (g) { roots.items.remove(g); delete itemsById[id]; } }
    function rebuildItem(it) { removeItem(it.id); addItem(it); }
    const hl = new T.BoxHelper(undefined, 0xF2C014); hl.visible = false; scene.add(hl);
    function highlight(id) { const g = id != null && itemsById[id]; if (g) { hl.setFromObject(g); hl.visible = true; } else hl.visible = false; }
    function setLabels(v) { labels = v; roots.items.traverse(o => { if (o.userData && o.userData.label) o.visible = v; }); }
    function setAds(v) { roots.ads.visible = !!v; }
    function setInterior(id) { interior = INTERIORS.find(i => i.id === id) || INTERIORS[0]; if (project) build(project); }

    /* ---------- ракурсы ---------- */
    function views() {
      const v = []; if (!fac || !hall) return v;
      const y = fac.y, cx = hall.cx, H = project.H || 3.4;
      v.push({ id: 'walk', name: 'Прохожий у витрин', p: [cx, 1.6, y + 4.6], t: [cx, 1.3, y - 3] });
      v.push({ id: 'across', name: 'С другой стороны улицы', p: [cx + 1, 1.65, y + 23], t: [cx, 2.0, y] });
      v.push({ id: 'angle', name: 'Под углом вдоль фасада', p: [cx + 7, 1.7, y + 7], t: [cx - 1, 1.4, y - 1] });
      fac.wins.forEach((o, i) => v.push({ id: 'win' + i, name: 'Вплотную к окну ' + (i + 1), p: [o.c[0], 1.55, y + 1.4], t: [o.c[0], 1.15, y - 4] }));
      // от двери: дверь, ближайшая к фасаду (вход)
      const ent = (project.openings || []).filter(o => o.kind === 'door').sort((a, b) => (b.entrance ? 1 : 0) - (a.entrance ? 1 : 0) || Math.abs(y - a.c[1]) - Math.abs(y - b.c[1]))[0];
      if (ent) {
        // с какой стороны двери зал
        const toHall = [hall.cx - ent.c[0], (hall.inner - hall.depth / 2) - ent.c[1]], s = toHall[0] * ent.n[0] + toHall[1] * ent.n[1] >= 0 ? 1 : -1;
        const pIn = [ent.c[0] + ent.n[0] * s * 1.1, ent.c[1] + ent.n[1] * s * 1.1];
        v.push({ id: 'door', name: 'От входной двери', p: [pIn[0], 1.62, pIn[1]], t: [hall.cx, 1.3, hall.inner - hall.depth * 0.45] });
      }
      v.push({ id: 'inside', name: 'Изнутри к окнам', p: [cx - 0.3, 1.6, hall.inner - Math.min(hall.depth, 9) + 0.5], t: [cx, 1.2, y + 1] });
      v.push({ id: 'top', name: 'Сверху: весь план', p: [project.bounds.w / 2, Math.max(project.bounds.w, project.bounds.h) * 1.25, y - project.bounds.h * 0.45], t: [project.bounds.w / 2, 0, y - project.bounds.h * 0.5], top: true });
      return v;
    }
    let anim = null;
    function go(view, instant) {
      roots.upper.visible = !view.top; roots.arch.children.forEach(c => { if (c.geometry && c.geometry.type === 'PlaneGeometry' && Math.abs(c.position.y - (project.H || 3.4)) < 0.01) c.visible = !view.top; });
      roots.lights.visible = !view.top;
      const to = { p: new T.Vector3().fromArray(view.p), t: new T.Vector3().fromArray(view.t) };
      const reduce = root.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (instant || reduce) { camera.position.copy(to.p); controls.target.copy(to.t); controls.update(); return; }
      anim = { fp: camera.position.clone(), ft: controls.target.clone(), to, t0: performance.now() };
    }

    let w0 = 0, h0 = 0, active = true;
    function resize() { const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return; if (w === w0 && h === h0) return; w0 = w; h0 = h; renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = w / h < 1.2 ? 70 : 55; camera.updateProjectionMatrix(); }
    function loop(now) { requestAnimationFrame(loop); if (!active) return; resize(); if (anim) { let k = Math.min(1, (now - anim.t0) / 900); k = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; camera.position.lerpVectors(anim.fp, anim.to.p, k); controls.target.lerpVectors(anim.ft, anim.to.t, k); if (k >= 1) anim = null; } controls.update(); renderer.render(scene, camera); }
    requestAnimationFrame(loop);

    // кадр с произвольной камеры (для фото фасада): вернёт canvas
    function renderView(cam, w, h, onlySign, keep) {
      const off = renderView.r || (renderView.r = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true }));
      off.outputEncoding = T.sRGBEncoding; off.toneMapping = T.ACESFilmicToneMapping; off.toneMappingExposure = 0.82; off.shadowMap.enabled = true; off.shadowMap.type = T.PCFSoftShadowMap;
      off.setPixelRatio(1); off.setSize(w, h, false);
      const vis = {}; Object.keys(roots).forEach(k => vis[k] = roots[k].visible);
      const bg = sky.visible, lb = labels; setLabels(false); hl.visible = false;
      if (onlySign) { Object.keys(roots).forEach(k => roots[k].visible = k === 'sign'); sky.visible = false; off.setClearColor(0x000000, 0); }
      else if (!keep) { roots.upper.visible = true; roots.lights.visible = true; }
      off.render(scene, cam);
      Object.keys(roots).forEach(k => roots[k].visible = vis[k]); sky.visible = bg; setLabels(lb);
      return off.domElement;
    }

    return {
      renderer, scene, camera, controls, INTERIORS,
      build, buildItems, place, rebuildItem, removeItem, addItem, highlight, setLabels, setAds, setInterior, views, go, renderView,
      setActive(v) { active = v; }, getHall: () => hall, getFacade: () => fac, resize: () => { w0 = 0; resize(); }
    };
  }

  root.UScene = { create, INTERIORS, allRings, facadeInfo };
})(window);
