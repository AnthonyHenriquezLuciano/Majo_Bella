/* MAJOBELLA · Botones "Instala la app" de la web
   - Android/Chrome: abre el aviso de instalación del navegador.
   - iPhone y el resto: abre la app (app/?instalar=1), que explica cómo añadirla a la pantalla de inicio.
   - Si ya se abre como app instalada, los botones se ocultan. */
(function (M) {
  const KEY = 'mjb.app.nudge.v1';
  const get = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const set = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* nada */ } };

  M.initGetApp = function () {
    if (!M.Install) return;
    M.Install.register('sw.js');
    const standalone = M.Install.standalone();
    document.querySelectorAll('[data-get-app]').forEach((a) => { if (standalone) a.hidden = true; });
    if (standalone) return;

    document.addEventListener('click', async (e) => {
      const a = e.target.closest('[data-get-app]');
      if (!a) return;
      e.preventDefault();
      hideNudge(true);
      if (M.Install.canPrompt()) {
        const r = await M.Install.prompt();
        if (r === 'accepted') return;
      }
      location.href = 'app/?instalar=1';
    });

    /* Aviso discreto en el celular: una sola vez, cuando la clienta ya está navegando */
    const nudge = document.getElementById('app-nudge');
    if (!nudge || get(KEY) || !window.matchMedia('(max-width: 760px)').matches) return;
    nudge.querySelector('[data-nudge-x]').addEventListener('click', () => hideNudge(true));
    let shown = false;
    const maybe = () => {
      if (shown || window.scrollY < 900 || document.body.classList.contains('has-selbar')) return;
      shown = true; nudge.hidden = false;
      requestAnimationFrame(() => nudge.classList.add('is-in'));
      window.removeEventListener('scroll', maybe);
    };
    window.addEventListener('scroll', maybe, { passive: true });
    function hideNudge(remember) {
      if (remember) set(KEY, '1');
      nudge.classList.remove('is-in');
      setTimeout(() => { nudge.hidden = true; }, 300);
    }
    new MutationObserver(() => { if (document.body.classList.contains('has-selbar') && !nudge.hidden) hideNudge(false); }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  };
})(window.MJB);
