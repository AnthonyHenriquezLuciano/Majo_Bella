/* MAJOBELLA · Protección contra robots (Cloudflare Turnstile)
   Solo se activa si el estudio puso la clave del sitio en el dashboard (Ajustes → Seguridad) y la clave secreta
   en Apps Script. Casi siempre es invisible; a veces pide marcar una casilla. */
(function (M) {
  let loading = null, widget = null, box = null;
  function load() {
    if (window.turnstile) return Promise.resolve();
    if (loading) return loading;
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => { loading = null; reject(new Error('No se pudo cargar la verificación. Revisa tu conexión.')); };
      document.head.appendChild(s);
    });
    return loading;
  }
  M.Captcha = {
    key() { return (M.security && M.security.turnstileSiteKey) || ''; },
    enabled() { return !!this.key(); },
    /* Devuelve un token nuevo (cada uno sirve una sola vez) */
    async token() {
      if (!this.enabled()) return '';
      await load();
      if (!box) { box = document.createElement('div'); box.className = 'captcha-box'; box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
      if (widget != null) { try { window.turnstile.remove(widget); } catch (e) { /* nada */ } widget = null; }
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('La verificación tardó demasiado. Intenta de nuevo.')), 45000);
        widget = window.turnstile.render(box, {
          sitekey: this.key(), appearance: 'interaction-only', language: 'es',
          callback: (t) => { clearTimeout(timer); resolve(t); },
          'error-callback': () => { clearTimeout(timer); reject(new Error('No pudimos comprobar que no eres un robot. Intenta de nuevo.')); },
        });
      });
    },
  };
})(window.MJB);
