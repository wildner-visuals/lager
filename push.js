/* Web-Push-Anmeldung, gemeinsam für alle Apps. Der Knopf erscheint nur, solange die App noch nicht angemeldet ist. */
(function () {
  const VAPID_PUBLIC = 'BCPvid5woemLJtlYUK4lFPItRY1PaDPepddTJGXOntx13ntkWjENEOIt95fE-e7qO0mhbzPZpv0lfRgPKPWVTRo';
  const URL_ABO = 'https://xgutbeabqmyvmvlgqlwu.supabase.co/functions/v1/push-abo';
  const script = document.querySelector('script[data-app]');
  const APP = script ? script.dataset.app : '';
  const MERKER = 'push.aktiv.' + APP;

  function zuBytes(s) {
    const b = (s + '='.repeat((4 - s.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/');
    return Uint8Array.from(atob(b), c => c.charCodeAt(0));
  }

  async function anmelden() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return false;
    const erlaubnis = await Notification.requestPermission();
    if (erlaubnis !== 'granted') return false;
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: zuBytes(VAPID_PUBLIC) });
    }
    const r = await fetch(URL_ABO, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app: APP, subscription: sub.toJSON() }),
    });
    if (r.ok) { try { localStorage.setItem(MERKER, '1'); } catch (e) {} }
    return r.ok;
  }

  window.pushAnmelden = anmelden;

  // Knopf nur zeigen, wenn noch nicht angemeldet
  function knopf() {
    if (!APP || !VAPID_PUBLIC || !('PushManager' in window)) return;
    try { if (localStorage.getItem(MERKER) === '1') return; } catch (e) {}
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = 'Erinnerungen aufs Handy';
    b.style.cssText = 'position:fixed;left:16px;bottom:calc(env(safe-area-inset-bottom) + 88px);z-index:12;padding:10px 14px;border-radius:999px;border:0;background:var(--accent,#b5651d);color:var(--accent-ink,#fff);font:600 .88rem system-ui,sans-serif;box-shadow:0 2px 10px rgba(0,0,0,.25);cursor:pointer';
    b.addEventListener('click', async () => {
      b.disabled = true;
      const ok = await anmelden();
      if (ok) b.remove(); else { b.disabled = false; b.textContent = 'Nicht erlaubt, nochmal versuchen'; }
    });
    document.body.append(b);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', knopf); else knopf();
})();
