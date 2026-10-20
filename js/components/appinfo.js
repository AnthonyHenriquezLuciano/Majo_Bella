/* MAJOBELLA · Página «Aplicación»: botones de descarga e instrucciones según el celular
   Los enlaces se configuran en js/config.js → app (androidUrl, iosUrl, iosWebApp). */
(function (M) {
  const ua = navigator.userAgent || '';
  const isAndroid = /android/i.test(ua);
  const isIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const IC = {
    android: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 9.5h11v7.5a1.5 1.5 0 0 1-1.5 1.5H8a1.5 1.5 0 0 1-1.5-1.5z"/><path d="M6.8 8.5a5.2 5.2 0 0 1 10.4 0zM9.3 6.2 8.2 4.4M14.7 6.2l1.1-1.8M4 10v5M20 10v5M9.5 18.5V21M14.5 18.5V21"/><circle cx="10" cy="7.3" r=".5"/><circle cx="14" cy="7.3" r=".5"/></svg>',
    apple: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.6 3.5c.1 1.2-.4 2.3-1.1 3.1-.7.8-1.8 1.4-2.8 1.3-.1-1.1.4-2.3 1.1-3 .7-.8 1.9-1.4 2.8-1.4zM19 16.6c-.5 1.1-.8 1.6-1.4 2.6-.9 1.4-2.1 3.1-3.6 3.1-1.3 0-1.7-.9-3.5-.9s-2.2.9-3.5.9c-1.5 0-2.7-1.6-3.5-3C1.3 15.7 1 11.5 2.5 9.2c1-1.6 2.6-2.6 4.2-2.6 1.6 0 2.6.9 3.9.9 1.3 0 2.1-.9 3.9-.9 1.4 0 2.9.8 3.9 2.1-3.4 1.9-2.9 6.8.6 7.9z"/></svg>',
    web: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="3" width="10" height="18" rx="2.5"/><path d="M11 18h2"/></svg>',
  };

  function buttons() {
    const A = M.config.app || {};
    const out = [];
    const android = A.androidUrl
      ? `<a class="dl-btn${isAndroid ? ' is-main' : ''}" href="${M.escapeHtml(A.androidUrl)}" ${/\.apk(\?|$)/i.test(A.androidUrl) ? 'download' : 'target="_blank" rel="noopener"'}>${IC.android}<span><small>Descargar para</small>Android</span></a>`
      : `<span class="dl-btn is-soon">${IC.android}<span><small>Android</small>Muy pronto</span></span>`;
    let ios;
    if (A.iosUrl) ios = `<a class="dl-btn${isIOS ? ' is-main' : ''}" href="${M.escapeHtml(A.iosUrl)}" target="_blank" rel="noopener">${IC.apple}<span><small>Descargar para</small>iPhone</span></a>`;
    else if (A.iosWebApp) ios = `<a class="dl-btn${isIOS ? ' is-main' : ''}" href="app/?instalar=1">${IC.web}<span><small>En iPhone</small>Versión web de la app</span></a>`;
    else ios = `<span class="dl-btn is-soon">${IC.apple}<span><small>iPhone</small>Muy pronto</span></span>`;
    if (isIOS) out.push(ios, android); else out.push(android, ios);
    return out.join('');
  }

  function install() {
    const A = M.config.app || {};
    const steps = {
      android: A.androidUrl
        ? ['Toca <b>Descargar para Android</b>.', 'Abre el archivo descargado. Si tu celular lo pide, permite instalar apps de este navegador (solo esta vez).', 'Toca <b>Instalar</b>. La app aparece en tu pantalla de inicio.']
        : ['La app para Android estará disponible muy pronto en esta página.', 'Mientras tanto, reserva y mira tus citas en la web: todo lo que hagas aparecerá en la app con tu mismo correo.'],
      ios: A.iosUrl
        ? ['Toca <b>Descargar para iPhone</b>.', 'Se abre la tienda de Apple: toca <b>Obtener</b>.', 'Abre la app e inicia sesión con tu correo.']
        : A.iosWebApp
          ? ['Abre esta página en <b>Safari</b> y toca <b>Versión web de la app</b>.', 'Toca <b>Compartir</b> y luego <b>Agregar a inicio</b>.', 'Toca <b>Agregar</b>. Queda en tu pantalla como una app.']
          : ['La app para iPhone estará disponible muy pronto en esta página.', 'Mientras tanto, reserva y mira tus citas en la web.'],
    };
    const first = isIOS ? 'ios' : 'android';
    const tab = (k, label) => `<button type="button" class="ap-tab${k === first ? ' is-on' : ''}" data-ap-tab="${k}" aria-pressed="${k === first}">${label}</button>`;
    const list = (k) => `<ol class="ap-steps-list" data-ap-steps="${k}"${k === first ? '' : ' hidden'}>${steps[k].map((s, i) => `<li><span>${i + 1}</span><p>${s}</p></li>`).join('')}</ol>`;
    return `<div class="ap-tabs" role="group" aria-label="Tu celular">${tab('android', 'Android')}${tab('ios', 'iPhone')}</div>${list('android')}${list('ios')}`;
  }

  M.initAppPage = function () {
    document.querySelectorAll('#ap-downloads, #ap-downloads-2').forEach((el) => { el.innerHTML = buttons(); });
    const box = document.getElementById('ap-install');
    if (box) {
      box.innerHTML = install();
      box.addEventListener('click', (e) => {
        const b = e.target.closest('[data-ap-tab]');
        if (!b) return;
        box.querySelectorAll('[data-ap-tab]').forEach((x) => { const on = x === b; x.classList.toggle('is-on', on); x.setAttribute('aria-pressed', String(on)); });
        box.querySelectorAll('[data-ap-steps]').forEach((l) => { l.hidden = l.dataset.apSteps !== b.dataset.apTab; });
      });
    }
  };
})(window.MJB);
