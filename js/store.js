/* Хранение проекта в браузере (IndexedDB) и обмен файлом.
   В браузере лежат: проект (план, расстановка, настройки), исходный PDF, фото фасада, свои фото оборудования. */
(function (root) {
  'use strict';
  const DB = 'uppetit-planner', ST = 'kv';
  let dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => { try { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(ST); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); } catch (e) { rej(e); } });
    return dbp;
  }
  async function get(k) { try { const d = await db(); return await new Promise((res, rej) => { const q = d.transaction(ST).objectStore(ST).get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); } catch (e) { return undefined; } }
  async function set(k, v) { try { const d = await db(); return await new Promise((res, rej) => { const tx = d.transaction(ST, 'readwrite'); tx.objectStore(ST).put(v, k); tx.oncomplete = () => res(true); tx.onerror = () => rej(tx.error); }); } catch (e) { return false; } }
  async function del(k) { try { const d = await db(); return await new Promise(res => { const tx = d.transaction(ST, 'readwrite'); tx.objectStore(ST).delete(k); tx.oncomplete = () => res(true); tx.onerror = () => res(false); }); } catch (e) { return false; } }
  async function keys() { try { const d = await db(); return await new Promise(res => { const q = d.transaction(ST).objectStore(ST).getAllKeys(); q.onsuccess = () => res(q.result || []); q.onerror = () => res([]); }); } catch (e) { return []; } }

  const fileToDataURL = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(f); });
  const loadImg = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  // уменьшаем большие фото, чтобы проект не разрастался
  async function shrink(dataURL, max) { const im = await loadImg(dataURL); const k = Math.min(1, (max || 1600) / Math.max(im.width, im.height)); if (k >= 1) return dataURL; const c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', 0.88); }

  // выгрузка всего проекта одним файлом (PDF не кладём — он может быть закрытым)
  async function exportAll() {
    const out = { app: 'uppetit-planner', version: 2, savedAt: new Date().toISOString(), data: {} };
    for (const k of await keys()) { if (k === 'pdf') continue; out.data[k] = await get(k); }
    return new Blob([JSON.stringify(out)], { type: 'application/json' });
  }
  async function importAll(text) {
    const o = JSON.parse(text); if (!o || o.app !== 'uppetit-planner' || !o.data) throw new Error('Это не файл проекта');
    for (const k of await keys()) if (k !== 'pdf') await del(k);
    for (const k of Object.keys(o.data)) await set(k, o.data[k]);
  }
  root.UStore = { get, set, del, keys, fileToDataURL, loadImg, shrink, exportAll, importAll };
})(window);
