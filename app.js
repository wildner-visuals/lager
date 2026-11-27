(() => {
  'use strict';

  // ---- Einstellungen ----------------------------------------------------
  const PIN = '1234';                 // Code für die verantwortliche Person – bitte ändern
  const STORE_KEY = 'lager.v1';
  const LOW_FACTOR = 2;               // gelb, wenn bis zum Doppelten der Bestell-Grenze
  const QTY_STEPS = [1, 2, 5, 10];

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
  let cloudDirty = false;
  let cloudOk = true;

  const cloudHeaders = { apikey: CLOUD.key, 'Content-Type': 'application/json' };
  async function cloudFetch() {
    const r = await fetch(`${CLOUD.url}/rest/v1/${CLOUD.table}?id=eq.main&select=data`, { headers: cloudHeaders, cache: 'no-store' });
    if (!r.ok) throw new Error('lesen');
    const rows = await r.json();
    return rows[0] ? rows[0].data : null;
  }
  async function cloudPush() {
    const r = await fetch(`${CLOUD.url}/rest/v1/${CLOUD.table}?id=eq.main`, {
      method: 'PATCH',
      headers: { ...cloudHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({ data, updated_at: new Date().toISOString() })
    });
    if (!r.ok) throw new Error('schreiben');
    cloudDirty = false; cloudOk = true;
  }
  function syncStatus(msg) { const el = $('sync'); if (el) el.textContent = msg; }

  // Beim Öffnen und beim Zurückkehren in die App: gemeinsamen Stand holen (der Server gewinnt, wenn er Daten hat)
  async function pullCloud() {
    try {
      const remote = await cloudFetch();
      cloudOk = true;
      if (remote && Array.isArray(remote.products)) {
        data = remote;
        Store.save(data);
        renderAll();
      } else {
        await cloudPush();
      }
      syncStatus('');
    } catch (e) {
      cloudOk = false;
      syncStatus('Keine Verbindung – Stand nur auf diesem Gerät');
    }
  }
  async function pushCloud() {
    try { await cloudPush(); syncStatus(''); }
    catch (e) { cloudDirty = true; cloudOk = false; syncStatus('Nicht gesendet – wird erneut versucht'); }
  }

  const save = () => {
    Store.save(data);
    cloudDirty = true;
    pushCloud();
  };
  window.addEventListener('online', () => { if (cloudDirty) pushCloud(); else pullCloud(); });
  // Gemeinsamer Stand alle 30 Sekunden holen, solange die App offen ist und nichts offen bearbeitet wird
  setInterval(() => {
    if (document.hidden || cloudDirty || document.querySelector('.sheet:not([hidden])')) return;
    pullCloud();
  }, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) pullCloud(); });

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

  function move(p, delta) {
    const before = p.stock;
    p.stock = Math.max(0, p.stock + delta);
    const real = p.stock - before;
    if (real === 0) return toast('Nichts mehr da zum Herausnehmen');
    logMove(p, real);
    save();
    renderAll();
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
  function closeSheet() { $('sheet').hidden = true; current = null; pendingCode = null; }

  function linkCode(p, code) {
    if (!code) return;
    data.products.forEach((x) => (x.codes = (x.codes || []).filter((c) => c !== code)));
    p.codes = [...(p.codes || []), code];
    save();
    toast(`Code mit „${p.name}“ verbunden`);
  }

  // ---- Produkt-Auswahl (für unbekannte Codes) -------------------------
  function pickProduct(title, onPick) {
    const sheet = $('sheet');
    $('sheet-head').innerHTML = `<h2 class="sheet-head">${esc(title)}</h2>`;
    $('qty-minus').parentElement.hidden = true;
    $('btn-out').hidden = true; $('btn-in').hidden = true; $('sheet-link').hidden = true;
    const list = document.createElement('div');
    list.id = 'pick-list';
    list.innerHTML = data.products.map((p) =>
      `<button class="big-btn secondary" data-pick="${esc(p.id)}">${esc(p.icon)} ${esc(p.name)}</button>`).join('');
    $('sheet-head').after(list);
    list.addEventListener('click', (e) => {
      const b = e.target.closest('[data-pick]'); if (!b) return;
      cleanupPick();
      onPick(data.products.find((x) => x.id === b.dataset.pick));
    }, { once: true });
    $('btn-close').onclick = () => { cleanupPick(); closeSheet(); };
    sheet.hidden = false;
    function cleanupPick() {
      list.remove();
      $('qty-minus').parentElement.hidden = false;
      $('btn-out').hidden = false; $('btn-in').hidden = false;
      $('btn-close').onclick = closeSheet;
      sheet.hidden = true;
    }
  }

  // ---- Scanner --------------------------------------------------------
  let stream = null, scanTimer = null, detector = null;
  function findByCode(code) {
    const c = norm(code);
    return data.products.find((p) => (p.codes || []).some((x) => norm(x) === c))
      || data.products.find((p) => norm(p.name) === c);
  }
  function handleCode(code) {
    stopScan();
    showView('view-start');
    const p = findByCode(code);
    if (p) return openSheet(p);
    pendingCode = code;
    pickProduct('Dieser Code ist neu. Zu welchem Produkt gehört er?', (prod) => {
      if (prod) { linkCode(prod, code); openSheet(prod); }
    });
  }
  async function startScan() {
    showView('view-scan');
    $('scan-manual').hidden = false;
    if (!('BarcodeDetector' in window) || !navigator.mediaDevices) {
      $('scan-status').textContent = 'Kamera-Scan geht hier nicht. Bitte unten eintippen.';
      return;
    }
    try {
      detector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'code_128', 'qr_code', 'upc_a', 'code_39'] });
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      $('video').srcObject = stream;
      await $('video').play();
      $('scan-status').textContent = 'Halte den Code vor die Kamera.';
      scanTimer = setInterval(async () => {
        try {
          const codes = await detector.detect($('video'));
          if (codes.length) handleCode(codes[0].rawValue);
        } catch (e) { /* weiter versuchen */ }
      }, 400);
    } catch (e) {
      $('scan-status').textContent = 'Keine Kamera-Freigabe. Bitte unten eintippen.';
    }
  }
  function stopScan() {
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
    if (id) Object.assign(data.products.find((p) => p.id === id), vals);
    else data.products.push({ id: uid(), ...vals });
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

  // ---- Start ----------------------------------------------------------
  renderTiles();
  pullCloud();
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
