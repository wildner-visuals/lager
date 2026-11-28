/* Web-Push-Anmeldung, gemeinsam für alle Apps. Der öffentliche Schlüssel kommt vom Server. */
(function () {
  const URL_ABO = 'https://xgutbeabqmyvmvlgqlwu.supabase.co/functions/v1/push-abo';
  const script = document.querySelector('script[data-app]');
  const APP = script ? script.dataset.app : '';
  const MERKER = 'push.v5.aktiv.' + APP;

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

  async function anmelden() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return false;
    const erlaubnis = await Notification.requestPermission();
    if (erlaubnis !== 'granted') return false;
    const key = await holeSchluessel();
    if (!key) return false;
    const reg = await navigator.serviceWorker.ready;
    // Alte Anmeldung (evtl. mit altem Schlüssel) verwerfen und neu anmelden
    const alt = await reg.pushManager.getSubscription();
    if (alt) await alt.unsubscribe();
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: zuBytes(key) });
    return speichern(sub);
  }

  window.pushAnmelden = anmelden;

  // Hat der Browser schon ein Abo (Erlaubnis erteilt, aber Speichern vorher gescheitert)?
  // Dann beim Server nachholen und den Knopf gar nicht erst zeigen.
  async function vorhandenesAboNachholen() {
    try {
      if (Notification.permission !== 'granted') return false;
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (!sub) return false;
      return await speichern(sub);
    } catch (e) { return false; }
  }

  function knopf() {
    if (!APP || !('PushManager' in window)) return;
    try { if (localStorage.getItem(MERKER) === '1') return; } catch (e) {}
    vorhandenesAboNachholen().then((ok) => { if (!ok) zeigeKnopf(); });
  }

  function zeigeKnopf() {
    try { if (localStorage.getItem(MERKER) === '1') return; } catch (e) {}
    if (document.querySelector('[data-push-knopf]')) return;
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.pushKnopf = '1';
    b.textContent = 'Erinnerungen aufs Handy';
    b.style.cssText = 'position:fixed;left:16px;bottom:calc(env(safe-area-inset-bottom) + 88px);z-index:12;padding:10px 14px;border-radius:999px;border:0;background:var(--accent,#b5651d);color:var(--accent-ink,#fff);font:600 .88rem system-ui,sans-serif;box-shadow:0 2px 10px rgba(0,0,0,.25);cursor:pointer';
    b.addEventListener('click', async () => {
      // Gesperrt: der Browser fragt dann nicht mehr, nur die Einstellungen helfen
      if ('Notification' in window && Notification.permission === 'denied') {
        b.textContent = 'Mitteilungen sind gesperrt: in den Einstellungen erlauben';
        return;
      }
      b.disabled = true;
      b.textContent = 'Wird eingerichtet ...';
      let ok = false;
      try { ok = await anmelden(); } catch (e) { ok = false; }
      if (ok) b.remove(); else { b.disabled = false; b.textContent = 'Nicht geklappt, nochmal tippen'; }
    });
    document.body.append(b);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', knopf); else knopf();
})();
