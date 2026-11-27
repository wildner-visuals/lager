(() => {
  'use strict';

  // ---- Einstellungen ----------------------------------------------------
  const PIN = '1234';                 // Code für die verantwortliche Person – bitte ändern
  const STORE_KEY = 'lager.v1';
  const LOW_FACTOR = 2;               // gelb, wenn bis zum Doppelten der Bestell-Grenze
  const QTY_STEPS = [1, 2, 5, 10];

  // Neuigkeiten-Fenster: bei jeder spürbaren Änderung Kennung und Punkte ersetzen
  const NEWS_ID = '2026-11-28-icon';
  const NEWS = [
    ['App-Icon neu gerendert:', 'Gleiche Farben und Motive wie das Titelbild.'],
    ['Scannen auf dem iPhone:', 'Safari kann keine Barcodes lesen. Jetzt übernimmt ein eingebauter Decoder (ZXing) – die Kamera geht an, Codes werden direkt erkannt.'],
    ['Kein Umbau bei den Daten:', 'Bestand, Grenzen und Codes bleiben unverändert.']
  ];

  // Startbestand – Mengen und Grenzen bitte anpassen
  const SEED = [
    { id: 'hand-desinfektion', name: 'Händedesinfektion (Flasche für unterwegs)', icon: '🧴', stock: 0, threshold: 10, codes: [] },
    { id: 'flaechen', name: 'Flächendesinfektion', icon: '🧽', stock: 0, threshold: 3, codes: [] },
    { id: 'hand-spender', name: 'Händedesinfektion (Spender)', icon: '🫧', stock: 0, threshold: 2, codes: [] },
    { id: 'hand-s', name: 'Handschuhe S', icon: '🧤', stock: 0, threshold: 2, codes: [] },
    { id: 'hand-m', name: 'Handschuhe M', icon: '🧤', stock: 0, threshold: 2, codes: [] },
    { id: 'hand-l', name: 'Handschuhe L', icon: '🧤', stock: 0, threshold: 2, codes: [] },
    { id: 'hand-xl', name: 'Handschuhe XL', icon: '🧤', stock: 0, threshold: 2, codes: [] },
    { id: 'kuechenrolle', name: 'Küchenrolle', icon: '🧻', stock: 0, threshold: 4, codes: [] },
    { id: 'klopapier', name: 'Klopapier', icon: '🧻', stock: 0, threshold: 6, codes: [] },
    { id: 'klarspueler', name: 'Klarspüler', icon: '💧', stock: 0, threshold: 1, codes: [] },
    { id: 'spuelsalz', name: 'Geschirrspülsalz', icon: '🧂', stock: 0, threshold: 2, codes: [] },
    { id: 'gelbe-saecke', name: 'Gelbe Säcke', icon: '🟨', stock: 0, threshold: 2, codes: [] },
    { id: 'weisse-saecke', name: 'Weiße Säcke', icon: '⬜', stock: 0, threshold: 2, codes: [] }
  ];

  // ---- Speicher -------------------------------------------------------
  // Gerät (localStorage) + gemeinsamer Bestand in Supabase (Tabelle lager_bestand, Zeile 'main').
  // Öffentlicher Schlüssel ist für den Browser gedacht; die Zugriffsregeln stehen in der Datenbank.
  const CLOUD = {
    url: 'https://oyesontlhecbtqshhgtk.supabase.co',
    key: 'sb_publishable_18GRmrCwrUodSpv_-oZXGQ_VgpPFkkk',
    table: 'lager_bestand'
  };
  const Store = {
    load() {
      try {
        const raw = localStorage.getItem(STORE_KEY);
        if (raw) return JSON.parse(raw);
      } catch (e) { /* kaputter Speicher → neu anlegen */ }
      return { products: structuredClone(SEED), log: [] };
    },
    save(data) { localStorage.setItem(STORE_KEY, JSON.stringify(data)); }
  };
  let data = Store.load();
  // „base“ = letzter Stand, den dieses Gerät mit dem Server gemeinsam hatte. Nur die Änderungen
  // seitdem werden auf den Serverstand übertragen, nie der ganze Gerätestand.
  const BASE_KEY = STORE_KEY + '.base';
  const clone = (o) => JSON.parse(JSON.stringify(o));
  let base;
  try { base = JSON.parse(localStorage.getItem(BASE_KEY)); } catch (e) { base = null; }
  const saveBase = () => localStorage.setItem(BASE_KEY, JSON.stringify(base));
  if (!base || !Array.isArray(base.products)) { base = clone(data); saveBase(); }

  // Vergleich unabhängig von der Reihenfolge der Felder (die Datenbank sortiert um)
  const stable = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x))
    ? Object.fromEntries(Object.keys(x).sort().map((key) => [key, x[key]])) : x);
  const hasChanges = () => stable(data) !== stable(base);

  // Überträgt die Änderungen von „from“ nach „to“ auf den Stand „onto“
  function merge(from, to, onto) {
    const index = (list) => new Map(list.map((p) => [p.id, p]));
    const was = index(from.products), now = index(to.products), there = index(onto.products);
    const products = [];
    onto.products.forEach((r) => {
      const b = was.get(r.id), l = now.get(r.id);
      if (!l) { if (!b) products.push(r); return; }        // hier gelöscht → weg
      if (!b) return products.push(r);
      const p = { ...r };
      ['name', 'icon', 'threshold', 'codes'].forEach((k) => { if (stable(l[k]) !== stable(b[k])) p[k] = l[k]; });
      p.stock = Math.max(0, r.stock + l.stock - b.stock);  // Mengen werden addiert, nicht ersetzt
      products.push(p);
    });
    // neu angelegte Produkte; was auf dem Server gelöscht wurde, bleibt gelöscht
    to.products.forEach((p) => { if (!was.has(p.id) && !there.has(p.id)) products.push(p); });
    const key = (m) => `${m.t}|${m.id}|${m.delta}`;
    const known = new Set([...(from.log || []), ...(onto.log || [])].map(key));
    const log = [...(to.log || []).filter((m) => !known.has(key(m))), ...(onto.log || [])]
      .sort((x, y) => String(y.t).localeCompare(String(x.t))).slice(0, 200);
    return { products, log };
  }

  const cloudHeaders = { apikey: CLOUD.key, 'Content-Type': 'application/json' };
  const cloudRow = `${CLOUD.url}/rest/v1/${CLOUD.table}?id=eq.main`;
  async function cloudFetch() {
    const r = await fetch(`${cloudRow}&select=data,updated_at`, { headers: cloudHeaders, cache: 'no-store' });
    if (!r.ok) throw new Error('lesen');
    const rows = await r.json();
    if (!rows[0]) throw new Error('keine Zeile');
    return rows[0];
  }
  // Schreibt nur, wenn seit dem Lesen niemand anderes geschrieben hat
  async function cloudWrite(value, seen) {
    const guard = seen ? `eq.${encodeURIComponent(seen)}` : 'is.null';
    const r = await fetch(`${cloudRow}&updated_at=${guard}`, {
      method: 'PATCH',
      headers: { ...cloudHeaders, Prefer: 'return=representation' },
      body: JSON.stringify({ data: value, updated_at: new Date().toISOString() })
    });
    if (!r.ok) throw new Error('schreiben');
    return (await r.json()).length > 0;
  }
  function syncStatus(msg) { const el = $('sync'); if (el) el.textContent = msg; }

  async function syncOnce() {
    for (let attempt = 0; attempt < 5; attempt++) {
      const row = await cloudFetch();
      const remote = row.data && Array.isArray(row.data.products) ? row.data : null;
      const sent = clone(data);
      const pending = !remote || stable(sent) !== stable(base);
      const merged = remote ? (pending ? merge(base, sent, remote) : remote) : sent;
      if (pending && !(await cloudWrite(merged, row.updated_at))) continue;  // jemand war schneller
      data = merge(sent, data, merged);   // inzwischen Getipptes bleibt erhalten
      base = clone(merged);
      Store.save(data); saveBase();
      return;
    }
    throw new Error('zu viele gleichzeitige Änderungen');
  }

  // Immer nur ein Abgleich zur Zeit
  let syncing = null, again = false;
  function sync() {
    if (syncing) { again = true; return syncing; }
    syncing = (async () => {
      try {
        do { again = false; await syncOnce(); } while (again || hasChanges());
        syncStatus('');
        refreshOpen();
      } catch (e) {
        syncStatus(hasChanges() ? 'Nicht gesendet – wird erneut versucht' : 'Keine Verbindung – Stand nur auf diesem Gerät');
      } finally { syncing = null; }
    })();
    return syncing;
  }

  const save = () => {
    Store.save(data);
    sync();
  };
  window.addEventListener('online', sync);
  // Alle 30 Sekunden abgleichen, solange die App offen ist und nichts offen bearbeitet wird
  setInterval(() => {
    if (document.hidden || document.querySelector('.sheet:not([hidden])')) return;
    sync();
  }, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });

  // ---- Hilfen ---------------------------------------------------------
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Math.random().toString(36).slice(2, 10);
  const norm = (s) => String(s).trim().toLowerCase();

  function status(p) {
    if (p.stock <= p.threshold) return 'alarm';
    if (p.stock <= p.threshold * LOW_FACTOR) return 'low';
    return 'ok';
  }
  const statusText = { alarm: 'Bestellen!', low: 'bald bestellen', ok: 'genug da' };

  let toastTimer;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), 2200);
  }

  function logMove(p, delta) {
    data.log.unshift({ t: new Date().toISOString(), id: p.id, name: p.name, icon: p.icon, delta });
    data.log = data.log.slice(0, 200);
  }

  const byId = (id) => data.products.find((p) => p.id === id);
  // Nach einem Abgleich Anzeige und offenes Produkt auf den neuen Stand bringen
  function refreshOpen() {
    renderAll();
    if (!current || closePick) return;
    const fresh = byId(current.id);
    if (!fresh) return closeSheet();
    current = fresh;
    renderSheet();
  }

  function move(target, delta) {
    const p = byId(target.id);
    if (!p) return toast('Das Produkt gibt es nicht mehr');
    const before = p.stock;
    p.stock = Math.max(0, p.stock + delta);
    const real = p.stock - before;
    if (real === 0) return toast('Nichts mehr da zum Herausnehmen');
    logMove(p, real);
    current = current && p;
    save();
    renderAll();
    if (current) renderSheet();
    toast(real < 0 ? `${-real} × ${p.name} entnommen` : `${real} × ${p.name} eingeräumt`);
  }

  // ---- Ausgabe-Ansicht ------------------------------------------------
  function renderTiles() {
    const q = norm($('search').value);
    const list = data.products.filter((p) => !q || norm(p.name).includes(q) || norm(p.icon).includes(q));
    $('tiles').innerHTML = list.map((p) => {
      const s = status(p);
      return `<button class="tile ${s}" data-id="${esc(p.id)}" aria-label="${esc(p.name)}">
        <span class="ico">${esc(p.icon)}</span>
        <span class="name">${esc(p.name)}</span>
        <span class="num">${p.stock}</span>
      </button>`;
    }).join('') || '<p class="hint">Nichts gefunden.</p>';
  }

  // ---- Produkt-Blatt --------------------------------------------------
  let current = null;       // aktuell geöffnetes Produkt
  let qty = 1;
  let pendingCode = null;   // gescannter, noch unbekannter Code
  function openSheet(p, code) {
    current = p; qty = 1; pendingCode = code || null;
    renderSheet();
    $('sheet').hidden = false;
  }
  function renderSheet() {
    const p = current;
    $('sheet-head').innerHTML = `<div class="product-head"><span class="ico">${esc(p.icon)}</span>
      <div class="name">${esc(p.name)}</div><div class="num">Im Lager: ${p.stock}</div></div>`;
    $('qty').textContent = qty;
    $('sheet-link').hidden = !pendingCode;
  }
  function closeSheet() { if (closePick) closePick(); $('sheet').hidden = true; current = null; pendingCode = null; }

  function linkCode(target, code) {
    const p = byId(target.id);
    if (!code || !p) return;
    data.products.forEach((x) => (x.codes = (x.codes || []).filter((c) => c !== code)));
    p.codes = [...(p.codes || []), code];
    save();
    toast(`Code mit „${p.name}“ verbunden`);
  }

  // ---- Produkt-Auswahl (für unbekannte Codes) -------------------------
  let closePick = null;     // räumt die offene Auswahl wieder weg
  function pickProduct(title, onPick, onNew) {
    if (closePick) closePick();
    $('sheet-head').innerHTML = `<h2 class="sheet-head">${esc(title)}</h2>`;
    $('qty-minus').parentElement.hidden = true;
    $('btn-out').hidden = true; $('btn-in').hidden = true; $('sheet-link').hidden = true;
    const list = document.createElement('div');
    list.id = 'pick-list';
    list.innerHTML = '<button class="big-btn" data-new>➕ Neues Produkt anlegen</button>' + data.products.map((p) =>
      `<button class="big-btn secondary" data-pick="${esc(p.id)}">${esc(p.icon)} ${esc(p.name)}</button>`).join('');
    $('sheet-head').after(list);
    closePick = () => {
      closePick = null;
      list.remove();
      $('qty-minus').parentElement.hidden = false;
      $('btn-out').hidden = false; $('btn-in').hidden = false;
      $('sheet').hidden = true;
    };
    list.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      closePick();
      if ('new' in b.dataset) return onNew();
      onPick(data.products.find((x) => x.id === b.dataset.pick));
    });
    $('sheet').hidden = false;
    return list;
  }

  // Produktname zu einem Barcode in freien Datenbanken suchen (nur die Nummer wird gesendet)
  const LOOKUP_HOSTS = ['world.openfoodfacts.org', 'world.openproductsfacts.org', 'world.openbeautyfacts.org'];
  async function lookupName(code) {
    const ask = async (host) => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 6000);
      try {
        const r = await fetch(`https://${host}/api/v2/product/${code}.json?fields=product_name,product_name_de,brands,quantity`, { signal: ctrl.signal });
        const p = (await r.json()).product || {};
        const name = (p.product_name_de || p.product_name || '').trim();
        if (!name) throw new Error('unbekannt');
        const brand = String(p.brands || '').split(',')[0].trim();
        const parts = [brand && !norm(name).includes(norm(brand)) ? brand : '', name, (p.quantity || '').replace(/\s+[e℮]$/, '').trim()];
        return parts.filter(Boolean).join(' ');
      } finally { clearTimeout(timer); }
    };
    try { return await Promise.any(LOOKUP_HOSTS.map(ask)); }
    catch (e) { return null; }
  }

  // Unbekannter Code: vorhandenem Produkt zuordnen oder neu anlegen (Name wird online gesucht)
  function unknownCode(code) {
    const isBarcode = /^\d{8,14}$/.test(code);
    let found = isBarcode ? '' : code;   // eingetippter Text ist selbst der Name
    const list = pickProduct(isBarcode ? 'Neuer Code. Suche den Namen online …' : 'Nicht gefunden. Was ist es?',
      (prod) => {
        if (!prod) return;
        if (isBarcode) linkCode(prod, code);
        openSheet(prod);
      },
      () => {
        openEdit(null);
        $('f-name').value = found;
        $('f-codes').value = isBarcode ? code : '';
      });
    if (!isBarcode) return;
    lookupName(code).then((name) => {
      if (!list.isConnected) return;     // Auswahl wurde inzwischen geschlossen
      $('sheet-head').querySelector('h2').textContent = name
        ? 'Neuer Code. Online gefunden:'
        : 'Neuer Code, online nichts gefunden. Was ist es?';
      if (name) { found = name; list.querySelector('[data-new]').textContent = `➕ „${name}“ neu anlegen`; }
    });
  }

  // ---- Scanner --------------------------------------------------------
  let stream = null, scanTimer = null, scanSession = 0;
  // Safari (iPhone) kennt BarcodeDetector nicht – dann liest ZXing die Kamera-Bilder selbst.
  let zxingPromise = null;
  function loadZxing() {
    if (window.ZXing) return Promise.resolve(window.ZXing);
    if (!zxingPromise) zxingPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js';
      s.onload = () => resolve(window.ZXing);
      s.onerror = () => { zxingPromise = null; reject(new Error('zxing')); };
      document.head.appendChild(s);
    });
    return zxingPromise;
  }
  async function makeReader() {
    if ('BarcodeDetector' in window) {
      const det = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'code_128', 'qr_code', 'upc_a', 'code_39'] });
      return async () => {
        try { const c = await det.detect($('video')); return c.length ? c[0].rawValue : null; }
        catch (e) { return null; }
      };
    }
    const Z = await loadZxing();
    const hints = new Map();
    hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.EAN_13, Z.BarcodeFormat.EAN_8, Z.BarcodeFormat.CODE_128,
      Z.BarcodeFormat.QR_CODE, Z.BarcodeFormat.UPC_A, Z.BarcodeFormat.CODE_39]);
    const reader = new Z.MultiFormatReader();
    reader.setHints(hints);
    const canvas = document.createElement('canvas');
    return async () => {
      const v = $('video');
      if (!v.videoWidth) return null;
      canvas.width = v.videoWidth; canvas.height = v.videoHeight;
      canvas.getContext('2d').drawImage(v, 0, 0);
      try {
        const bitmap = new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.HTMLCanvasElementLuminanceSource(canvas)));
        return reader.decode(bitmap).getText();
      } catch (e) { return null; }
      finally { reader.reset(); }
    };
  }
  function findByCode(code) {
    const c = norm(code);
    return data.products.find((p) => (p.codes || []).some((x) => norm(x) === c))
      || data.products.find((p) => norm(p.name) === c);
  }
  function handleCode(raw) {
    const code = String(raw).trim();
    stopScan();
    showView('view-start');
    const p = findByCode(code);
    if (p) return openSheet(p);
    unknownCode(code);
  }
  async function startScan() {
    showView('view-scan');
    $('scan-manual').hidden = false;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      $('scan-status').textContent = 'Kamera-Scan geht hier nicht. Bitte unten eintippen.';
      return;
    }
    const session = ++scanSession;
    $('scan-status').textContent = 'Kamera startet …';
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      if (session !== scanSession) { s.getTracks().forEach((t) => t.stop()); return; }
      stream = s;
      $('video').srcObject = stream;
      await $('video').play();
    } catch (e) {
      if (session === scanSession) $('scan-status').textContent = 'Keine Kamera-Freigabe. Bitte unten eintippen.';
      return;
    }
    let readFrame;
    try {
      readFrame = await makeReader();
    } catch (e) {
      if (session === scanSession) $('scan-status').textContent = 'Scanner konnte nicht geladen werden. Bitte unten eintippen.';
      return;
    }
    if (session !== scanSession) return;
    $('scan-status').textContent = 'Halte den Code vor die Kamera.';
    scanTimer = setInterval(async () => {
      if (session !== scanSession) return;
      const code = await readFrame();
      if (code && session === scanSession) handleCode(code);
    }, 400);
  }
  function stopScan() {
    scanSession++;
    clearInterval(scanTimer); scanTimer = null;
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }

  // ---- Verantwortliche ------------------------------------------------
  let unlocked = false;
  function renderManage() {
    if (!unlocked) return;
    const alarms = data.products.filter((p) => status(p) === 'alarm');
    $('alarm-list').innerHTML = alarms.length
      ? alarms.map((p) => `<div class="list-item alarm"><span class="ico">${esc(p.icon)}</span>
          <div class="grow"><b>${esc(p.name)}</b><div class="sub">Bestellen ab ${p.threshold} Stück</div></div>
          <span class="num">${p.stock}</span></div>`).join('')
      : '<p class="hint">Alles gut – nichts zu bestellen. ✅</p>';
    $('stock-list').innerHTML = data.products.map((p) => {
      const s = status(p);
      return `<div class="list-item ${s === 'alarm' ? 'alarm' : ''}">
        <span class="ico">${esc(p.icon)}</span>
        <div class="grow"><b>${esc(p.name)}</b><div class="sub">${statusText[s]} · Grenze ${p.threshold}</div></div>
        <span class="num">${p.stock}</span>
        <button data-edit="${esc(p.id)}">✏️</button></div>`;
    }).join('');
    $('history').innerHTML = data.log.length
      ? data.log.slice(0, 40).map((m) => {
          const d = new Date(m.t);
          const when = d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
          return `<div class="history-line">${when} · ${esc(m.icon)} ${esc(m.name)}: <b>${m.delta < 0 ? '−' + -m.delta : '+' + m.delta}</b></div>`;
        }).join('')
      : '<p class="hint">Noch keine Bewegungen.</p>';
  }

  // Administrator: alle angelegten Produkte mit ihren Codes, ohne Bestand
  function renderAdmin() {
    if (!unlocked) return;
    $('admin-list').innerHTML = data.products.map((p) => `<div class="list-item">
        <span class="ico">${esc(p.icon)}</span>
        <div class="grow"><b>${esc(p.name)}</b><div class="sub">${(p.codes || []).length ? 'Code: ' + esc(p.codes.join(', ')) : 'kein Code hinterlegt'}</div></div>
        <button data-del="${esc(p.id)}" aria-label="${esc(p.name)} löschen">🗑️</button></div>`).join('')
      || '<p class="hint">Keine Produkte vorhanden.</p>';
  }

  function deleteProduct(id) {
    const p = data.products.find((x) => x.id === id);
    if (!p || !confirm(`„${p.name}“ wirklich löschen?`)) return false;
    data.products = data.products.filter((x) => x.id !== id);
    save(); renderAll();
    toast('Gelöscht');
    return true;
  }

  function openEdit(p) {
    $('edit-title').textContent = p ? 'Produkt bearbeiten' : 'Neues Produkt';
    $('f-name').value = p ? p.name : '';
    $('f-icon').value = p ? p.icon : '📦';
    $('f-stock').value = p ? p.stock : 0;
    $('f-threshold').value = p ? p.threshold : 2;
    $('f-codes').value = p ? (p.codes || []).join(', ') : '';
    $('btn-edit-del').hidden = !p;
    $('edit').hidden = false;
    $('edit').dataset.stock = $('f-stock').value;
    $('edit').dataset.id = p ? p.id : '';
  }
  function saveEdit() {
    const id = $('edit').dataset.id;
    const name = $('f-name').value.trim();
    if (!name) return toast('Bitte einen Namen eingeben');
    const vals = {
      name,
      icon: $('f-icon').value.trim() || '📦',
      stock: Math.max(0, parseInt($('f-stock').value, 10) || 0),
      threshold: Math.max(0, parseInt($('f-threshold').value, 10) || 0),
      codes: $('f-codes').value.split(',').map((s) => s.trim()).filter(Boolean)
    };
    if (id) {
      const p = byId(id);
      if (!p) { $('edit').hidden = true; renderAll(); return toast('Das Produkt wurde inzwischen gelöscht'); }
      // unveränderte Menge nicht zurückschreiben, falls inzwischen jemand entnommen hat
      if (String(vals.stock) === $('edit').dataset.stock) delete vals.stock;
      Object.assign(p, vals);
    } else data.products.push({ id: uid(), ...vals });
    save(); $('edit').hidden = true; renderAll();
    toast('Gespeichert');
  }
  function deleteEdit() {
    if (deleteProduct($('edit').dataset.id)) $('edit').hidden = true;
  }

  // ---- Ansichten ------------------------------------------------------
  function showView(id) {
    document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === id));
    document.querySelectorAll('.nav').forEach((b) => b.classList.toggle('active', b.dataset.view === (id === 'view-admin' ? 'view-manage' : id)));
    if (id !== 'view-scan') stopScan();
    if (id === 'view-start') renderTiles();
    if (id === 'view-manage') renderManage();
    if (id === 'view-admin') renderAdmin();
    window.scrollTo(0, 0);
  }

  function renderAll() { renderTiles(); renderManage(); renderAdmin(); }

  // ---- Ereignisse -----------------------------------------------------
  $('search').addEventListener('input', renderTiles);
  $('tiles').addEventListener('click', (e) => {
    const b = e.target.closest('.tile'); if (!b) return;
    openSheet(data.products.find((p) => p.id === b.dataset.id));
  });
  document.querySelectorAll('.nav').forEach((b) => b.addEventListener('click', () => showView(b.dataset.view)));
  $('btn-scan').addEventListener('click', startScan);
  $('btn-scan-close').addEventListener('click', () => showView('view-start'));
  $('btn-manual').addEventListener('click', () => {
    const v = $('manual-code').value.trim(); if (!v) return;
    $('manual-code').value = '';
    handleCode(v);
  });
  $('qty-minus').addEventListener('click', () => {
    const i = QTY_STEPS.indexOf(qty);
    qty = i > 0 ? QTY_STEPS[i - 1] : 1; $('qty').textContent = qty;
  });
  $('qty-plus').addEventListener('click', () => {
    const i = QTY_STEPS.indexOf(qty);
    qty = i < QTY_STEPS.length - 1 ? QTY_STEPS[i + 1] : qty; $('qty').textContent = qty;
  });
  $('btn-out').addEventListener('click', () => { if (current) move(current, -qty); });
  $('btn-in').addEventListener('click', () => { if (current) move(current, qty); });
  $('btn-link').addEventListener('click', () => {
    if (!current || !pendingCode) return;
    linkCode(current, pendingCode); pendingCode = null; renderSheet();
  });
  $('btn-close').addEventListener('click', closeSheet);
  $('sheet').addEventListener('click', (e) => { if (e.target.id === 'sheet') closeSheet(); });

  $('pin-btn').addEventListener('click', () => {
    if ($('pin-input').value === PIN) {
      unlocked = true; $('pin-box').hidden = true; $('manage-content').hidden = false;
      $('pin-error').textContent = ''; $('pin-input').value = ''; renderManage();
    } else { $('pin-error').textContent = 'Falscher Code.'; }
  });
  $('btn-lock').addEventListener('click', () => {
    unlocked = false; $('pin-box').hidden = false; $('manage-content').hidden = true;
  });
  $('stock-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-edit]'); if (!b) return;
    openEdit(data.products.find((p) => p.id === b.dataset.edit));
  });
  $('btn-add').addEventListener('click', () => openEdit(null));
  $('btn-admin').addEventListener('click', () => showView('view-admin'));
  $('btn-admin-close').addEventListener('click', () => showView('view-manage'));
  $('admin-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-del]'); if (b) deleteProduct(b.dataset.del);
  });
  $('btn-edit-save').addEventListener('click', saveEdit);
  $('btn-edit-del').addEventListener('click', deleteEdit);
  $('btn-edit-close').addEventListener('click', () => ($('edit').hidden = true));
  $('edit').addEventListener('click', (e) => { if (e.target.id === 'edit') $('edit').hidden = true; });

  $('btn-export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `lager-sicherung-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  });
  $('btn-import').addEventListener('click', () => $('file-import').click());
  $('file-import').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const obj = JSON.parse(await f.text());
      if (!Array.isArray(obj.products)) throw new Error('kein Lager');
      if (!confirm('Den aktuellen Stand durch die Sicherung ersetzen?')) return;
      data = { products: obj.products, log: Array.isArray(obj.log) ? obj.log : [] };
      save(); renderAll(); toast('Sicherung geladen');
    } catch (err) { toast('Die Datei passt nicht.'); }
    e.target.value = '';
  });

  // ---- Neuigkeiten ----------------------------------------------------
  const NEWS_KEY = STORE_KEY + '.news';
  function showNews() {
    if (localStorage.getItem(NEWS_KEY) === NEWS_ID) return;
    $('news-list').innerHTML = NEWS.map(([head, text]) => `<li><b>${esc(head)}</b> ${esc(text)}</li>`).join('');
    $('news').hidden = false;
  }
  $('btn-news-close').addEventListener('click', () => {
    localStorage.setItem(NEWS_KEY, NEWS_ID);
    $('news').hidden = true;
  });

  // ---- Start ----------------------------------------------------------
  showNews();
  renderTiles();
  sync();
  // Automatische Aktualisierung: beim Öffnen nach einer neuen Version suchen und,
  // wenn eine neue übernommen wurde, die Seite einmal neu laden (nicht beim Erststart).
  if ('serviceWorker' in navigator) {
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadController && !reloaded) { reloaded = true; location.reload(); }
    });
    navigator.serviceWorker.register('sw.js')
      .then((reg) => {
        document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
        return reg.update();
      })
      .catch(() => {});
  }
})();
