/* Hilfe-Fenster: dezenter Knopf oben rechts, Nachricht geht an Julius (Telegram + E-Mail).
   Passt sich dem Design der jeweiligen App an (Farben, Schrift aus den CSS-Variablen).
   Einbinden: <script src="hilfe.js" data-app="Name" data-accent="#hex" defer></script>
     data-app     Name der App (steht in der Nachricht)
     data-accent  Akzentfarbe der App (Hex)
   Der Knopf sitzt oben rechts in der Ecke (wie bei den meisten Apps).
   Identische Datei in allen Apps unter Apps/. Bei Änderung in allen Kopien angleichen. */
(() => {
  'use strict';
  const URL_HILFE = 'https://xgutbeabqmyvmvlgqlwu.supabase.co/functions/v1/hilfe';
  const script = document.currentScript;
  const APP = (script && script.dataset.app) || document.title;
  const ACCENT = (script && script.dataset.accent) || '#2563eb';

  /* Farben und Schrift aus der App übernehmen */
  const root = getComputedStyle(document.documentElement);
  const body = getComputedStyle(document.body);
  const pick = (...names) => {
    for (const n of names) { const v = root.getPropertyValue(n).trim(); if (v) return v; }
    return '';
  };
  const bgBody = body.backgroundColor && body.backgroundColor !== 'rgba(0, 0, 0, 0)' ? body.backgroundColor : '';
  const SURFACE = pick('--card', '--surface', '--raised', '--paper') || bgBody || '#ffffff';
  const FG = body.color || '#111111';
  const MUTED = pick('--muted', '--mute') || 'rgba(127,127,127,1)';
  const LINE = pick('--line') || 'rgba(127,127,127,.35)';
  const FONT = body.fontFamily || 'system-ui, sans-serif';
  const HEAD = pick('--display') || FONT;

  const css = `
.hh-btn{position:fixed;right:max(14px,env(safe-area-inset-right));top:calc(12px + env(safe-area-inset-top));z-index:9000;width:30px;height:30px;border-radius:50%;border:1px solid ${LINE};background:${SURFACE};color:${MUTED};font:600 15px/1 ${FONT};opacity:.85;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.12)}
.hh-btn:active{transform:scale(.95)}
.hh-back{position:fixed;inset:0;z-index:9001;background:rgba(0,0,0,.45);display:flex;align-items:flex-end;justify-content:center}
.hh-card{box-sizing:border-box;width:100%;max-width:560px;max-height:88vh;overflow:auto;padding:12px 20px calc(20px + env(safe-area-inset-bottom));border-radius:22px 22px 0 0;background:${SURFACE};color:${FG};font:16px/1.45 ${FONT}}
.hh-grab{width:40px;height:5px;border-radius:3px;background:${LINE};margin:0 auto 14px}
.hh-head{display:flex;align-items:center;gap:12px;margin:0 0 6px}
.hh-head h2{margin:0;font:700 22px/1.1 ${HEAD};letter-spacing:.02em;text-transform:uppercase;color:${FG}}
.hh-head i{flex:1;height:4px;border-radius:2px;background:${ACCENT};opacity:.85}
.hh-card p{margin:0 0 14px;font-size:14px;color:${MUTED}}
.hh-card input,.hh-card textarea{box-sizing:border-box;width:100%;padding:12px 14px;margin:0 0 10px;border:1px solid ${LINE};border-radius:14px;font:inherit;background:transparent;color:${FG};outline:none}
.hh-card input:focus,.hh-card textarea:focus{border-color:${ACCENT}}
.hh-card textarea{min-height:130px;resize:vertical}
.hh-card ::placeholder{color:${MUTED};opacity:.9}
.hh-hp{position:absolute;left:-9999px;width:1px;height:1px;opacity:0}
.hh-row{display:flex;gap:10px;margin-top:4px}
.hh-row button{flex:1;padding:14px;border:0;border-radius:14px;font:600 16px ${FONT};cursor:pointer}
.hh-send{background:${ACCENT};color:#fff}
.hh-send:disabled{opacity:.5}
.hh-cancel{background:transparent;color:${FG};border:1px solid ${LINE}!important}
.hh-status{min-height:20px;margin-top:10px;font-size:14px;color:${MUTED}}
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

    const head = el('div', { className: 'hh-head' });
    head.append(el('h2', {}, 'Hilfe'), el('i'));
    const name = el('input', { placeholder: 'Dein Name (optional)', maxLength: 60 });
    const text = el('textarea', { placeholder: 'Was klappt nicht? Schreib einfach los.', maxLength: 2000 });
    const hp = el('input', { className: 'hh-hp', tabIndex: -1, autocomplete: 'off' });
    hp.name = 'website';
    const status = el('div', { className: 'hh-status' });
    const abbrechen = el('button', { className: 'hh-cancel', type: 'button' }, 'Schließen');
    const senden = el('button', { className: 'hh-send', type: 'button' }, 'Senden');
    const row = el('div', { className: 'hh-row' });
    row.append(abbrechen, senden);

    card.append(
      el('div', { className: 'hh-grab' }),
      head,
      el('p', {}, `Deine Nachricht geht direkt an Julius. App: ${APP}`),
      name, text, hp, row, status
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
