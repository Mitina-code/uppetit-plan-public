/* База оборудования и мебели.
   Почти всё — «псевдо-3D»: параллелепипед нужного размера, на грани которого натянута фото-текстура.
   Размеры фиксированные (взяты с чертежа Московского, 38, или типовые), меняются только у заказных (custom).
   Мебель (столы, стулья) сделана простыми объёмными моделями — коробкой стул выглядит неправдоподобно. */
(function (root) {
  'use strict';
  const CATS = [
    ['hall', 'Торговый зал'],
    ['seat', 'Посадка'],
    ['prod', 'Производство и склад'],
    ['misc', 'Прочее']
  ];
  // faces: front / back / side / top — имена рисовалок из UTex.PAINTERS
  const TYPES = [
    { id: 'fridgeGlass', n: 1, cat: 'hall', name: 'Холодильник витринный +4 °C, двухдверный', W: 1.30, D: 0.87, H: 2.10, zone: true, faces: { front: 'fridgeGlassFront', side: 'fridgeSide', back: 'metalLight', top: 'metalLight' }, opts: { doors: 2 }, src: 'чертёж: «+4°С» 1300×869', note: 'Главный элемент зала. Стеклянные двери, подсветка, полки с готовой едой. Цвет — зона: зелёный салаты, оранжевый супы, жёлтый основное, розовый десерты.' },
    { id: 'fridge1', n: 2, cat: 'hall', name: 'Холодильник витринный +4 °C, однодверный (напитки)', W: 0.65, D: 0.70, H: 2.05, zone: true, faces: { front: 'fridgeGlassFront', side: 'fridgeSide', back: 'metalLight', top: 'metalLight' }, opts: { doors: 1 }, src: 'типовой', note: 'Та же модель, узкая: напитки, соки, вода.' },
    { id: 'cube', n: 3, cat: 'hall', name: 'Витрина «Куб» KC70 (выпечка и десерты)', W: 0.90, D: 0.70, H: 1.30, faces: { front: 'cubeFront', side: 'cubeFront', back: 'cubeFront', top: 'glassTop' }, src: 'чертёж: «Куб KC70 VV 0,9-1», серо-чёрный', note: 'Стеклянный куб на чёрной тумбе с серебряным поясом.' },
    { id: 'iceChest', n: 4, cat: 'hall', name: 'Ларь для мороженого (в цветной плёнке)', W: 1.20, D: 0.61, H: 0.85, faces: { front: 'stripes', side: 'stripes', back: 'stripes', top: 'iceTop' }, src: 'чертёж: «Мороженое» 1204×606', note: 'Как в Uppetit на Грибалёвой: ларь обклеен полосами фирменных цветов, сверху стеклянная крышка.' },
    { id: 'bar', n: 5, cat: 'hall', name: 'Барная стойка с кассой', W: 2.00, D: 0.60, H: 1.05, custom: { w: [0.8, 5] }, faces: { front: 'counterFront', side: 'counterSide', back: 'steelCabinet', top: 'counterTop' }, parts: [{ w: 0.32, d: 0.06, h: 0.26, x: 0.45, z: -0.05, y: 1.05, rx: -0.3, faces: { front: 'screen', back: 'black', side: 'black', top: 'black' } }, { w: 0.2, d: 0.3, h: 0.08, x: 0.1, z: 0.05, y: 1.05, faces: { front: 'black', side: 'black', back: 'black', top: 'black' } }], src: 'чертёж: «Касса» 1998×602', note: 'Заказная: длина подбирается под зал. Светлый дуб, белая столешница, экран кассы.' },
    { id: 'coffee', n: 6, cat: 'hall', name: 'Кофейная стойка с кофемашиной', W: 2.00, D: 0.70, H: 0.90, custom: { w: [1.2, 4] }, faces: { front: 'counterFront', side: 'counterSide', back: 'steelCabinet', top: 'counterTop' }, parts: [{ w: 0.78, d: 0.56, h: 0.5, x: -0.35, z: -0.04, y: 0.9, faces: { front: 'espresso', side: 'steelV', back: 'steelV', top: 'steel' } }, { w: 0.2, d: 0.3, h: 0.55, x: 0.25, z: -0.1, y: 0.9, faces: { front: 'grinder', side: 'grinder', back: 'grinder', top: 'black' } }, { w: 0.2, d: 0.3, h: 0.55, x: 0.5, z: -0.1, y: 0.9, faces: { front: 'grinder', side: 'grinder', back: 'grinder', top: 'black' } }], src: 'чертёж: «Кофе» 2002×698', note: 'Заказная. Рожковая кофемашина, две кофемолки, со стороны гостя — светлый дуб.' },
    { id: 'pos', n: 7, cat: 'hall', name: 'Касса на тумбе', W: 1.00, D: 0.40, H: 1.05, faces: { front: 'counterFront', side: 'counterSide', back: 'steelCabinet', top: 'counterTop' }, parts: [{ w: 0.32, d: 0.06, h: 0.26, x: 0, z: -0.04, y: 1.05, rx: -0.3, faces: { front: 'screen', back: 'black', side: 'black', top: 'black' } }], src: 'чертёж: «Касса» 1001×399', note: 'Небольшая касса рядом с кофе.' },
    { id: 'selfpos', n: 8, cat: 'hall', name: 'Касса самообслуживания', W: 0.50, D: 0.45, H: 1.50, faces: { front: 'kioskFront', side: 'white', back: 'white', top: 'white' }, src: 'Uppetit: самообслуживание', note: 'Стойка с экраном и терминалом.' },
    { id: 'rack', n: 9, cat: 'hall', name: 'Стеллаж «Снеки»', W: 0.60, D: 0.30, H: 1.80, alpha: true, faces: { front: 'snackFront', side: 'snackSide', back: 'snackFront', top: 'black' }, src: 'чертёж: «Снеки» 600×300; вид — как в Uppetit', note: 'Чёрный металлический каркас, белые полки, банки и пачки.' },
    { id: 'heat', n: 10, cat: 'hall', name: 'Стойка разогрева с микроволновками', W: 1.10, D: 0.60, H: 0.95, faces: { front: 'counterFront', side: 'counterSide', back: 'counterSide', top: 'counterTop' }, parts: [{ w: 0.5, d: 0.4, h: 0.3, x: -0.27, z: -0.05, y: 0.95, faces: { front: 'microwave', side: 'black', back: 'black', top: 'black' } }, { w: 0.5, d: 0.4, h: 0.3, x: 0.27, z: -0.05, y: 0.95, faces: { front: 'microwave', side: 'black', back: 'black', top: 'black' } }], src: 'чертёж: «разогрев» 1097×598', note: 'Две микроволновки, чтобы гость разогрел купленное.' },
    { id: 'sink', n: 11, cat: 'prod', name: 'Ванна моечная ВМЭ-1/430', W: 0.53, D: 0.53, H: 0.87, faces: { front: 'steelCabinet', side: 'steelV', back: 'steelV', top: 'sinkTop' }, src: 'чертёж: «ВМЭ-1/430» 531×531', note: 'Одна модель для бара и производства.' },
    { id: 'tv', n: 12, cat: 'hall', name: 'Меню-экран на стене', W: 1.00, D: 0.06, H: 0.60, elev: 1.85, faces: { front: 'menuBoard', side: 'black', back: 'black', top: 'black' }, src: 'чертёж: «тв»; вид — меню-борд Uppetit', note: 'Висит на стене, низ на высоте 1,85 м.' },

    { id: 'table', n: 13, cat: 'seat', name: 'Стол круглый Ø70, белый на чёрной ножке', W: 0.70, D: 0.70, H: 0.75, model: 'table', src: 'чертёж: круглые столы; вид — как в Uppetit', note: 'Одна модель стола на весь зал.' },
    { id: 'chair', n: 14, cat: 'seat', name: 'Стул деревянный с мягким сиденьем', W: 0.46, D: 0.50, H: 0.82, model: 'chair', color: true, src: 'чертёж: стулья у столов; вид — как в Uppetit', note: 'Одна модель стула, меняется только цвет сиденья.' },
    { id: 'wincounter', n: 15, cat: 'seat', name: 'Стойка у окна', W: 1.60, D: 0.40, H: 1.05, custom: { w: [0.8, 6] }, model: 'wincounter', src: 'Uppetit: посадка вдоль окна', note: 'Заказная: длина по окну. Белая столешница на чёрных опорах.' },
    { id: 'stool', n: 16, cat: 'seat', name: 'Барный стул', W: 0.42, D: 0.42, H: 1.0, model: 'stool', color: true, src: 'Uppetit: высокие стулья у стойки', note: 'Дерево и мягкое цветное сиденье.' },

    { id: 'prodTable', n: 17, cat: 'prod', name: 'Стол производственный СП-222 (800×600)', W: 0.80, D: 0.60, H: 0.87, alpha: true, faces: { front: 'steelTableFront', side: 'steelTableFront', back: 'steelTableFront', top: 'steel' }, src: 'чертёж: «СП-222/0806», «СП-222/0608»', note: 'Нержавейка, нижняя полка.' },
    { id: 'oven', n: 18, cat: 'prod', name: 'Печь конвекционная Unox XEFR-04HS', W: 0.60, D: 0.67, H: 0.50, elev: 0.87, faces: { front: 'ovenFront', side: 'steelV', back: 'steelV', top: 'steel' }, src: 'чертёж: «XEFR-04HS-ELDV»; размеры производителя 600×669×500', note: 'Стоит на производственном столе.' },
    { id: 'chestFreezer', n: 19, cat: 'prod', name: 'Ларь морозильный Frostor F 600 S', W: 1.60, D: 0.60, H: 0.85, faces: { front: 'chestWhite', side: 'white', back: 'white', top: 'chestLid' }, src: 'чертёж: «F 600 S БЕЛ» 1600×602', note: 'Белый, с глухой крышкой.' },
    { id: 'fridgeSolid', n: 20, cat: 'prod', name: 'Шкаф холодильный ХО +4 °C', W: 0.82, D: 0.69, H: 2.05, faces: { front: 'solidDoors', side: 'steelV', back: 'steelV', top: 'steel' }, opts: { doors: 1, temp: '+3°' }, src: 'чертёж: «ХО+4» 816×688', note: 'Глухая дверь, нержавейка.' },
    { id: 'fridgePremier', n: 21, cat: 'prod', name: 'Шкаф холодильный «Премьер» +4 °C, двухдверный', W: 1.40, D: 0.70, H: 2.05, faces: { front: 'solidDoors', side: 'steelV', back: 'steelV', top: 'steel' }, opts: { doors: 2, temp: '+4°' }, src: 'чертёж: «Премьер» 1400×698', note: 'Две глухие двери.' },
    { id: 'freezerCab', n: 22, cat: 'prod', name: 'Шкаф морозильный −18 °C, большой', W: 2.62, D: 0.87, H: 2.05, faces: { front: 'solidDoors', side: 'steelV', back: 'steelV', top: 'steel' }, opts: { doors: 3, temp: '−18°' }, src: 'чертёж: «−18°С» 2618×869', note: 'По ведомости — «ХО −18, большой под заморозку». Высота типовая.' },
    { id: 'iceIsland', n: 23, cat: 'prod', name: 'Ларь морозильный для мороженого, большой', W: 1.25, D: 1.00, H: 0.85, faces: { front: 'chestWhite', side: 'white', back: 'white', top: 'chestLid' }, src: 'чертёж: «Мороженое» 1247×1001', note: 'Запас мороженого на складе.' },
    { id: 'kitchenRack', n: 24, cat: 'prod', name: 'Стеллаж кухонный НСК-12/3', W: 1.20, D: 0.30, H: 1.80, alpha: true, faces: { front: 'kitchenRack', side: 'snackSide', back: 'kitchenRack', top: 'steel' }, src: 'чертёж: «НСК-12/3» 1200×300', note: 'Нержавеющие полки, коробки и контейнеры.' },
    { id: 'locker', n: 25, cat: 'prod', name: 'Шкаф для одежды ШГ-40/50', W: 0.40, D: 0.50, H: 1.80, faces: { front: 'lockerFront', side: 'metalLight', back: 'metalLight', top: 'metalLight' }, src: 'чертёж: «ШГ-40/50» 400×500', note: 'Для персонала.' },
    { id: 'generic', n: 26, cat: 'misc', name: 'Оборудование (не распознано)', W: 0.80, D: 0.60, H: 0.90, custom: { w: [0.2, 6], d: [0.2, 3], h: [0.1, 3] }, faces: { front: 'genericFront', side: 'genericFront', back: 'genericFront', top: 'genericFront' }, src: 'прямоугольник на чертеже без подписи', note: 'Размер — как на чертеже. Можно заменить на подходящий тип.' },
    { id: 'trash', n: 27, cat: 'misc', name: 'Урна', W: 0.36, D: 0.36, H: 0.66, model: 'trash', src: 'чертёж: «+ урна»', note: '' },
    { id: 'person', n: 28, cat: 'misc', name: 'Сотрудник (для масштаба)', W: 0.45, D: 0.30, H: 1.75, model: 'person', src: '', note: 'Чёрная футболка — как у персонала Uppetit.' }
  ];
  const BY = {}; TYPES.forEach(t => BY[t.id] = t);
  const CHAIR_COLORS = { grey: '#8E959B', green: '#8DB33A', yellow: '#E7B92E', orange: '#E8612C' };

  function dims(it) {
    const t = BY[it.t] || BY.generic, c = t.custom || {};
    const cl = (v, r, def) => r ? Math.max(r[0], Math.min(r[1], v || def)) : def;
    return { W: c.w ? cl(it.w, c.w, t.W) : t.W, D: c.d ? cl(it.d, c.d, t.D) : t.D, H: c.h ? cl(it.h, c.h, t.H) : t.H };
  }

  /* ---------- построение в three.js ---------- */
  function build(T, it, U) {
    const t = BY[it.t] || BY.generic, d = dims(it), g = new T.Group();
    const M = (c, o) => new T.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.7 }, o || {}));
    const elev = it.on ? (BY.prodTable.H) : (t.elev || 0);
    if (!t.model) {
      const opts = Object.assign({}, t.opts || {}, { zone: it.zone || (t.zone ? 'yellow' : undefined), label: it.label });
      g.add(texBox(T, U, t.id, d.W, d.H, d.D, t.faces, opts, t.alpha, 0, elev, 0));
      (t.parts || []).forEach((p, i) => { const pm = texBox(T, U, t.id + '.p' + i, p.w, p.h, p.d, p.faces, opts, false, p.x * (d.W / t.W), p.y + elev, p.z); if (p.rx) { pm.rotation.x = p.rx; } g.add(pm); });
    } else if (t.model === 'table') {
      const top = new T.Mesh(new T.CylinderGeometry(0.35, 0.35, 0.03, 40), new T.MeshStandardMaterial({ map: U.tex(T, 'marble', 0.7, 0.7), roughness: 0.25 })); top.position.y = 0.74; g.add(top);
      const blk = M('#1E2124', { roughness: 0.4, metalness: 0.3 });
      const col = new T.Mesh(new T.CylinderGeometry(0.035, 0.035, 0.72, 12), blk); col.position.y = 0.37; g.add(col);
      const base = new T.Mesh(new T.CylinderGeometry(0.22, 0.24, 0.025, 28), blk); base.position.y = 0.012; g.add(base);
    } else if (t.model === 'chair') {
      g.add(chair(T, U, CHAIR_COLORS[it.color] || it.color || CHAIR_COLORS.grey));
    } else if (t.model === 'stool') {
      const wood = new T.MeshStandardMaterial({ map: U.tex(T, 'wood', 0.4, 0.4), roughness: 0.6 }), cush = M(CHAIR_COLORS[it.color] || CHAIR_COLORS.orange, { roughness: 0.9 });
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => { const l = new T.Mesh(new T.BoxGeometry(0.035, 0.76, 0.035), wood); l.position.set(a * 0.15, 0.38, b * 0.15); l.rotation.z = -a * 0.06; l.rotation.x = b * 0.06; g.add(l); });
      const seat = new T.Mesh(new T.BoxGeometry(0.4, 0.06, 0.38), cush); seat.position.y = 0.78; g.add(seat);
      const back = new T.Mesh(new T.BoxGeometry(0.4, 0.16, 0.04), cush); back.position.set(0, 0.95, -0.18); g.add(back);
      const fr = new T.Mesh(new T.BoxGeometry(0.34, 0.025, 0.025), wood); fr.position.set(0, 0.3, 0.15); g.add(fr);
    } else if (t.model === 'wincounter') {
      const topM = new T.MeshStandardMaterial({ map: U.tex(T, 'counterTop', d.W, d.D), roughness: 0.35 });
      const top = new T.Mesh(new T.BoxGeometry(d.W, 0.04, d.D), topM); top.position.set(0, 1.03, 0); g.add(top);
      const blk = M('#1E2124', { roughness: 0.45, metalness: 0.3 });
      [-1, 1].forEach(s => { const l = new T.Mesh(new T.BoxGeometry(0.05, 1.01, 0.05), blk); l.position.set(s * (d.W / 2 - 0.12), 0.505, 0); g.add(l); const f = new T.Mesh(new T.BoxGeometry(0.05, 0.03, d.D * 0.9), blk); f.position.set(s * (d.W / 2 - 0.12), 0.015, 0); g.add(f); });
    } else if (t.model === 'trash') {
      const m = M('#3B4045', { roughness: 0.5, metalness: 0.3 }); const c = new T.Mesh(new T.CylinderGeometry(0.17, 0.15, 0.62, 24), m); c.position.y = 0.31; g.add(c); const l = new T.Mesh(new T.CylinderGeometry(0.18, 0.18, 0.04, 24), M('#9AA1A7', { metalness: 0.6, roughness: 0.3 })); l.position.y = 0.64; g.add(l);
    } else if (t.model === 'person') {
      const legs = new T.Mesh(new T.CylinderGeometry(0.13, 0.11, 0.9, 12), M('#3A3F46')); legs.position.y = 0.45; g.add(legs);
      const body = new T.Mesh(new T.CylinderGeometry(0.18, 0.15, 0.62, 16), M('#1D2024')); body.position.y = 1.21; g.add(body);
      const apron = new T.Mesh(new T.BoxGeometry(0.3, 0.55, 0.02), M('#3B4045')); apron.position.set(0, 1.0, 0.16); g.add(apron);
      const head = new T.Mesh(new T.SphereGeometry(0.11, 18, 14), M('#E2B996')); head.position.y = 1.65; g.add(head);
      const hair = new T.Mesh(new T.SphereGeometry(0.115, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), M('#4A3426')); hair.position.y = 1.67; g.add(hair);
    }
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    g.userData = { item: it, H: d.H + elev };
    return g;
  }
  function chair(T, U, color) {
    const c = new T.Group(), wood = new T.MeshStandardMaterial({ map: U.tex(T, 'wood', 0.4, 0.4), roughness: 0.6 }), cush = new T.MeshStandardMaterial({ color, roughness: 0.92 });
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => { const l = new T.Mesh(new T.BoxGeometry(0.035, 0.45, 0.035), wood); l.position.set(a * 0.19, 0.225, b * 0.19); g0(l); });
    function g0(m) { c.add(m); }
    const seat = new T.Mesh(new T.BoxGeometry(0.44, 0.06, 0.42), cush); seat.position.y = 0.48; c.add(seat);
    const back = new T.Mesh(new T.BoxGeometry(0.44, 0.2, 0.05), cush); back.position.set(0, 0.74, -0.2); back.rotation.x = -0.12; c.add(back);
    [-1, 1].forEach(a => { const p = new T.Mesh(new T.BoxGeometry(0.035, 0.36, 0.035), wood); p.position.set(a * 0.19, 0.66, -0.19); p.rotation.x = -0.12; c.add(p); });
    return c;
  }
  // параллелепипед с текстурами на гранях; локально «лицо» смотрит в +z
  function texBox(T, U, key, W, H, D, faces, opts, alpha, x, y, z) {
    const f = faces || {};
    const mk = (painter, wm, hm, face) => {
      const map = U.tex(T, painter || 'metalLight', wm, hm, opts, key + ':' + face);
      const m = new T.MeshStandardMaterial({ map, roughness: /glass|fridge|cube|screen|menu|kiosk|microwave|oven/i.test(painter) ? 0.3 : /steel|metal/i.test(painter) ? 0.35 : 0.7, metalness: /steel|metal/i.test(painter) ? 0.35 : 0 });
      if (/fridgeGlassFront|cubeFront|screen|menuBoard|kioskFront/.test(painter)) { m.emissive = new T.Color('#ffffff'); m.emissiveMap = map; m.emissiveIntensity = painter === 'fridgeGlassFront' ? 0.38 : 0.22; }
      if (alpha && /snack|kitchenRack|steelTableFront/.test(painter)) { m.transparent = false; m.alphaTest = 0.4; m.side = T.DoubleSide; }
      return m;
    };
    const mats = [mk(f.side, D, H, 'side'), mk(f.side, D, H, 'side'), mk(f.top, W, D, 'top'), mk(f.top, W, D, 'top'), mk(f.front, W, H, 'front'), mk(f.back || f.side, W, H, 'back')];
    const m = new T.Mesh(new T.BoxGeometry(W, H, D), mats);
    m.position.set(x || 0, (y || 0) + H / 2, z || 0);
    return m;
  }

  root.UCat = { CATS, TYPES, BY, dims, build, CHAIR_COLORS };
})(window);
