/* MAJOBELLA · Instalar la app en el celular (PWA)
   - Android/Chrome: guarda el aviso "beforeinstallprompt" y lo muestra al tocar el botón.
   - iPhone/iPad: no existe ese aviso; se explica cómo añadirla con "Compartir → Agregar a inicio".
   - Ya instalada (modo app): los botones de instalar se ocultan. */
(function (M) {
  let deferred = null;
  const listeners = new Set();
  const ua = navigator.userAgent || '';
  const isIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; listeners.forEach((fn) => fn()); });
  window.addEventListener('appinstalled', () => { deferred = null; try { localStorage.setItem('mjb.app.installed', '1'); } catch (err) { /* nada */ } listeners.forEach((fn) => fn()); });

  M.Install = {
    isIOS,
    standalone() { return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true; },
    canPrompt() { return !!deferred; },
    available() { return !this.standalone() && (!!deferred || isIOS || /android/i.test(ua)); },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    async prompt() {
      if (!deferred) return 'unavailable';
      deferred.prompt();
      const choice = await deferred.userChoice.catch(() => ({ outcome: 'dismissed' }));
      deferred = null;
      listeners.forEach((fn) => fn());
      return choice.outcome;
    },
    register(path) {
      if ('serviceWorker' in navigator && location.protocol !== 'file:') {
        window.addEventListener('load', () => navigator.serviceWorker.register(path || 'sw.js').catch(() => {}));
      }
    },
  };
})(window.MJB);
