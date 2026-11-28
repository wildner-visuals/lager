/* Web-Push-Anmeldung, gemeinsam für alle Apps. Ohne öffentlichen Schlüssel passiert nichts. */
(function () {
  const VAPID_PUBLIC = ''; // Öffentlicher VAPID-Schlüssel, nach der Einrichtung eintragen
  const URL_ABO = 'https://xgutbeabqmyvmvlgqlwu.supabase.co/functions/v1/push-abo';

  function zuBytes(s) {
    const b = (s + '='.repeat((4 - s.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/');
    return Uint8Array.from(atob(b), c => c.charCodeAt(0));
  }

  /* Aufruf aus einer Schaltfläche: window.pushAnmelden('Lager') */
  window.pushAnmelden = async function (app) {
    if (!VAPID_PUBLIC || !('serviceWorker' in navigator) || !('PushManager' in window)) return false;
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
      body: JSON.stringify({ app, subscription: sub.toJSON() }),
    });
    return r.ok;
  };
})();
