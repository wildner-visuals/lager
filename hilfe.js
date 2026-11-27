/* Hilfe-Fenster: runder Knopf unten rechts, Nachricht geht an Julius (Telegram + E-Mail).
   Einbinden: <script src="hilfe.js" data-app="Name der App" defer></script>
   Identische Datei in allen Apps unter Apps/. Bei Änderung in allen Kopien angleichen. */
(() => {
  'use strict';
  const URL_HILFE = 'https://xgutbeabqmyvmvlgqlwu.supabase.co/functions/v1/hilfe';
  const APP = (document.currentScript && document.currentScript.dataset.app) || document.title;

  const css = `
.hh-btn{position:fixed;right:14px;bottom:calc(14px + env(safe-area-inset-bottom));z-index:9000;width:46px;height:46px;border-radius:50%;border:0;background:#2563eb;color:#fff;font:700 20px/1 -apple-system,system-ui,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.25);cursor:pointer}
.hh-back{position:fixed;inset:0;z-index:9001;background:rgba(0,0,0,.55);display:flex;align-items:flex-end;justify-content:center}
.hh-card{box-sizing:border-box;width:100%;max-width:560px;max-height:88vh;overflow:auto;padding:20px 18px calc(18px + env(safe-area-inset-bottom));border-radius:22px 22px 0 0;background:#fff;color:#111;font:16px/1.4 -apple-system,system-ui,sans-serif}
@media (prefers-color-scheme: dark){.hh-card{background:#1c1c1e;color:#f2f2f7}}
.hh-card h2{margin:0 0 6px;font-size:19px}
.hh-card p{margin:0 0 12px;font-size:14px;opacity:.75}
.hh-card input,.hh-card textarea{box-sizing:border-box;width:100%;padding:12px;margin:0 0 10px;border:1px solid rgba(127,127,127,.4);border-radius:12px;font:inherit;background:transparent;color:inherit}
.hh-card textarea{min-height:140px;resize:vertical}
.hh-hp{position:absolute;left:-9999px;width:1px;height:1px;opacity:0}
.hh-row{display:flex;gap:10px}
.hh-row button{flex:1;padding:14px;border:0;border-radius:12px;font:600 16px -apple-system,system-ui,sans-serif;cursor:pointer}
.hh-send{background:#2563eb;color:#fff}
.hh-cancel{background:rgba(127,127,127,.2);color:inherit}
.hh-status{min-height:20px;margin-top:10px;font-size:14px}
`;

  const el = (tag, attrs = {}, text) => {
    const n = document.createElement(tag);
    Object.assign(n, attrs);
    if (text) n.textContent = text;
    return n;
  };

  function oeffnen() {
    const back = el('div', { className: 'hh-back' });
    const card = el('div', { className: 'hh-card' });
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-label', 'Hilfe');

    const name = el('input', { placeholder: 'Dein Name (optional)', maxLength: 60 });
    const text = el('textarea', { placeholder: 'Was klappt nicht? Schreib einfach los.', maxLength: 2000 });
    const hp = el('input', { className: 'hh-hp', tabIndex: -1, autocomplete: 'off' });
    hp.name = 'website';
    const status = el('div', { className: 'hh-status' });
    const senden = el('button', { className: 'hh-send', type: 'button' }, 'Senden');
    const abbrechen = el('button', { className: 'hh-cancel', type: 'button' }, 'Schließen');

    card.append(
      el('h2', {}, 'Hilfe'),
      el('p', {}, `Deine Nachricht geht direkt an Julius (App: ${APP}).`),
      name, text, hp,
      el('div', { className: 'hh-row' }, abbrechen, senden),
      status
    );
    back.append(card);
    document.body.append(back);

    const schliessen = () => back.remove();
    abbrechen.addEventListener('click', schliessen);
    back.addEventListener('click', (e) => { if (e.target === back) schliessen(); });

    senden.addEventListener('click', async () => {
      const msg = text.value.trim();
      if (!msg) { status.textContent = 'Bitte schreib kurz, was nicht klappt.'; return; }
      senden.disabled = true;
      status.textContent = 'Wird gesendet …';
      try {
        const r = await fetch(URL_HILFE, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            app: APP,
            name: name.value.trim(),
            message: msg,
            page: location.pathname + location.search,
            website: hp.value,
          }),
        });
        if (r.status === 429) throw new Error('zu_viele');
        if (!r.ok) throw new Error('fehler');
        status.textContent = 'Danke! Die Nachricht ist angekommen.';
        text.value = '';
        setTimeout(schliessen, 1500);
      } catch (e) {
        senden.disabled = false;
        status.textContent = e.message === 'zu_viele'
          ? 'Gerade sind schon viele Nachrichten angekommen. Versuch es später nochmal.'
          : 'Das hat nicht geklappt. Prüfe deine Verbindung und versuch es nochmal.';
      }
    });
    text.focus();
  }

  function start() {
    const style = el('style');
    style.textContent = css;
    document.head.append(style);
    const knopf = el('button', { className: 'hh-btn', type: 'button', title: 'Hilfe' }, '?');
    knopf.setAttribute('aria-label', 'Hilfe öffnen');
    knopf.addEventListener('click', oeffnen);
    document.body.append(knopf);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
