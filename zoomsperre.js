/* Zoomen in allen Apps aus: Zwei-Finger-Geste und Safari-Gesten werden blockiert.
   Dazu kommen 16 px Schrift für Eingabefelder, damit iPhone beim Antippen nicht hineinzoomt. */
(function () {
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(t =>
    document.addEventListener(t, e => e.preventDefault(), { passive: false }));
  document.addEventListener('touchmove', e => {
    if (e.touches.length > 1) e.preventDefault();
  }, { passive: false });
  const st = document.createElement('style');
  st.textContent = 'html,body{touch-action:pan-x pan-y}input,select,textarea{font-size:16px}';
  document.head.appendChild(st);
})();
