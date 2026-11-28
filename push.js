/* Web-Push-Anmeldung, gemeinsam für alle Apps. Der öffentliche Schlüssel kommt vom Server.
   Wer „Nein“ sagt (oder den Browser-Dialog schließt), sieht den Knopf nicht mehr.
   ANFRAGE hochzählen (z. B. '2'), dann werden alle, die abgelehnt haben, einmal neu gefragt. */
(function () {
  const URL_ABO = 'https://xgutbeabqmyvmvlgqlwu.supabase.co/functions/v1/push-abo';
  const ANFRAGE = '1';
  // Name kommt vom eigenen <script src="push.js" data-app="...">-Tag, nicht von anderen Skripten der Seite
  const script = document.currentScript || document.querySelector('script[src$="push.js"]');
  const APP = script ? (script.dataset.app || '') : '';
  const MERKER = 'push.v6.aktiv.' + APP;
  const RESET = 'push.reset.v6.' + APP;
  const HINWEIS = 'push.hinweis.v7.' + APP;
  const NEIN = 'push.nein.' + APP;   // speichert die Anfrage-Runde, in der „Nein“ gesagt wurde

  function unterstuetzt() {
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  }

  function zuBytes(s) {
    const b = (s + '='.repeat((4 - s.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/');
    return Uint8Array.from(atob(b), c => c.charCodeAt(0));
  }

  async function holeSchluessel() {
    const r = await fetch(URL_ABO);
    const d = await r.json();
    return d.key || '';
  }

  function merken() { try { localStorage.setItem(MERKER, '1'); } catch (e) {} }
  function lieseNein() { try { return localStorage.getItem(NEIN); } catch (e) { return null; } }
  function merkeNein() { try { localStorage.setItem(NEIN, ANFRAGE); } catch (e) {} }

  // Abo beim Server speichern (Abo-Objekt aus dem Browser)
  async function speichern(sub) {
    const r = await fetch(URL_ABO, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app: APP, subscription: sub.toJSON() }),
    });
    if (r.ok) merken();
    return r.ok;
  }

  // Ergebnis: 'ok' = angemeldet, 'nein' = abgelehnt/geschlossen, 'fehler' = nicht geklappt (z. B. offline)
  async function anmelden() {
    if (!unterstuetzt()) return 'fehler';
    const erlaubnis = await Notification.requestPermission();
    if (erlaubnis !== 'granted') { merkeNein(); return 'nein'; }
    const key = await holeSchluessel();
    if (!key) return 'fehler';
    const reg = await navigator.serviceWorker.ready;
    // Alte Anmeldung (evtl. mit altem Schlüssel) verwerfen und neu anmelden
    const alt = await reg.pushManager.getSubscription();
    if (alt) await alt.unsubscribe();
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: zuBytes(key) });
    return (await speichern(sub)) ? 'ok' : 'fehler';
  }

  window.pushAnmelden = anmelden;

  // Tagesstatus an den Server: nur ein Datum pro Gerät (erledigt heute), keine Inhalte.
  // erledigt=false oder datum=null heißt: heute noch offen.
  window.pushStatusMelden = async function (erledigt, datum) {
    try {
      if (!unterstuetzt() || Notification.permission !== 'granted') return false;
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (!sub) return false;
      const r = await fetch(URL_ABO, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: { endpoint: sub.endpoint, erledigt_datum: erledigt ? datum : null } }),
      });
      return r.ok;
    } catch (e) { return false; }
  };

  // Prüft das vorhandene Abo: passt es zum aktuellen Server-Schlüssel, wird es (erneut) beim Server gespeichert.
  // Passt es nicht (alter Schlüssel), wird es entfernt, damit neu angemeldet werden kann.
  // Gibt true zurück, wenn alles in Ordnung ist und kein Knopf nötig ist.
  async function pruefen() {
    if (!unterstuetzt()) return false;
    if (Notification.permission !== 'granted') return false;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return false;
    const key = await holeSchluessel();
    if (!key) return false; // offline: nichts verwerfen, lieber Knopf zeigen
    const neu = zuBytes(key);
    const alt = sub.options && sub.options.applicationServerKey ? new Uint8Array(sub.options.applicationServerKey) : null;
    const passt = !!alt && alt.length === neu.length && alt.every((x, i) => x === neu[i]);
    if (!passt) { await sub.unsubscribe(); return false; }
    return await speichern(sub);
  }

  // Einmalig je Gerät und App: vorhandene Anmeldungen entfernen, damit sich alles neu anmeldet
  async function resetEinmal() {
    try {
      if (localStorage.getItem(RESET) === '1') return;
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) await sub.unsubscribe();
      }
      localStorage.setItem(RESET, '1');
    } catch (e) {}
  }

  function knopf() {
    if (!APP || !('PushManager' in window)) return;
    // Hinweis erscheint allen einmal, auch wenn schon angemeldet; der Knopf nur, wenn noch keine Anmeldung besteht
    resetEinmal().then(() => pruefen()).then((ok) => zeigeHinweis(() => { if (!ok) zeigeKnopf(); })).catch(() => zeigeHinweis(() => zeigeKnopf()));
  }

  // Einmaliger Hinweis: Support oben, Benachrichtigung unten links
  function zeigeHinweis(danach) {
    try { if (localStorage.getItem(HINWEIS) === '1') return danach(); } catch (e) {}
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;left:12px;right:12px;top:calc(env(safe-area-inset-top) + 64px);z-index:20;padding:14px 16px;border-radius:14px;background:var(--surface,#fff);color:var(--ink,#111);font:500 .9rem/1.45 system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.25)';
    const text = document.createElement('div');
    text.textContent = 'Kurz vorab: Für eine bessere Kommunikation nutz bitte oben den Support-Knopf, wenn du Wünsche, Fehler oder Fragen hast. Und damit du auf dem Laufenden bleibst, kannst du unten links „Erinnerungen aufs Handy“ aktivieren. Das ist nur eine Push-Benachrichtigung. Liebe Grüße, Julius.';
    const ok = document.createElement('button');
    ok.type = 'button';
    ok.textContent = 'Verstanden';
    ok.style.cssText = 'margin-top:10px;padding:8px 14px;border-radius:999px;border:0;background:var(--accent,#b5651d);color:var(--accent-ink,#fff);font:600 .88rem system-ui,sans-serif;cursor:pointer';
    ok.addEventListener('click', () => {
      try { localStorage.setItem(HINWEIS, '1'); } catch (e) {}
      box.remove();
      danach();
    });
    box.append(text, ok);
    document.body.append(box);
  }

  // Entscheidet, was unten links angezeigt wird:
  // - Browser sagt „gesperrt“ oder Nutzer hat in dieser Runde Nein gesagt: nichts
  // - Nein aus einer früheren Runde: einmal neu fragen (Pop-up)
  // - sonst: der normale Knopf
  function zeigeKnopf() {
    if (document.querySelector('[data-push-knopf], [data-push-anfrage]')) return;
    if (!unterstuetzt() || Notification.permission === 'denied') return;
    const nein = lieseNein();
    if (nein === ANFRAGE) return;
    if (nein) { zeigeAnfrage(); return; }
    baueKnopf();
  }

  // Erneute Anfrage (nur bei Nutzern, die in einer früheren Runde Nein gesagt haben)
  function zeigeAnfrage() {
    const box = document.createElement('div');
    box.dataset.pushAnfrage = '1';
    box.style.cssText = 'position:fixed;left:12px;right:12px;bottom:calc(env(safe-area-inset-bottom) + 12px);z-index:20;padding:14px 16px;border-radius:14px;background:var(--surface,#fff);color:var(--ink,#111);font:500 .9rem/1.45 system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.25)';
    const text = document.createElement('div');
    text.textContent = 'Magst du doch Erinnerungen aufs Handy? Das ist nur eine Push-Benachrichtigung, und du kannst jederzeit Nein sagen.';
    const ja = document.createElement('button');
    ja.type = 'button';
    ja.textContent = 'Ja, gern';
    ja.style.cssText = 'margin-top:10px;margin-right:8px;padding:8px 14px;border-radius:999px;border:0;background:var(--accent,#b5651d);color:var(--accent-ink,#fff);font:600 .88rem system-ui,sans-serif;cursor:pointer';
    const nein = document.createElement('button');
    nein.type = 'button';
    nein.textContent = 'Nein danke';
    nein.style.cssText = 'margin-top:10px;padding:8px 14px;border-radius:999px;border:0;background:transparent;color:var(--ink,#111);font:600 .88rem system-ui,sans-serif;cursor:pointer';
    ja.addEventListener('click', async () => {
      ja.disabled = true; nein.disabled = true;
      text.textContent = 'Wird eingerichtet ...';
      let ergebnis = 'fehler';
      try { ergebnis = await anmelden(); } catch (e) {}
      if (ergebnis === 'fehler') {
        ja.disabled = false; nein.disabled = false;
        text.textContent = 'Nicht geklappt, nochmal tippen.';
        return;
      }
      box.remove();
    });
    nein.addEventListener('click', () => { merkeNein(); box.remove(); });
    box.append(text, ja, nein);
    document.body.append(box);
  }

  function baueKnopf() {
    if (document.querySelector('[data-push-knopf]')) return;
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.pushKnopf = '1';
    b.textContent = 'Erinnerungen aufs Handy';
    b.style.cssText = 'position:fixed;left:16px;bottom:calc(env(safe-area-inset-bottom) + 88px);z-index:12;padding:10px 14px;border-radius:999px;border:0;background:var(--accent,#b5651d);color:var(--accent-ink,#fff);font:600 .88rem system-ui,sans-serif;box-shadow:0 2px 10px rgba(0,0,0,.25);cursor:pointer';
    b.addEventListener('click', async () => {
      // Gesperrt: der Browser fragt nicht mehr, dann verschwindet der Knopf
      if (!unterstuetzt() || Notification.permission === 'denied') { b.remove(); return; }
      b.disabled = true;
      b.textContent = 'Wird eingerichtet ...';
      let ergebnis = 'fehler';
      try { ergebnis = await anmelden(); } catch (e) { ergebnis = 'fehler'; }
      // Angemeldet oder abgelehnt: Knopf weg. Nur bei echtem Fehler bleibt er für einen neuen Versuch.
      if (ergebnis === 'ok' || ergebnis === 'nein') b.remove();
      else { b.disabled = false; b.textContent = 'Nicht geklappt, nochmal tippen'; }
    });
    document.body.append(b);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', knopf); else knopf();
})();
