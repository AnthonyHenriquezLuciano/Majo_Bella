/* MAJOBELLA · Páginas legales: completa los datos del estudio y los valores actuales (horas, minutos, tasa)
   con lo que el estudio configuró en el dashboard. Si el sistema no responde, quedan los valores escritos. */
(function () {
  document.querySelectorAll('[data-year]').forEach(function (n) { n.textContent = new Date().getFullYear(); });
  var C = window.MAJOBELLA_CONFIG || {};
  var url = C.booking && C.booking.apiUrl;
  if (!url || !window.fetch) return;
  fetch(url + (url.indexOf('?') < 0 ? '?' : '&') + 'action=catalog').then(function (r) { return r.json(); }).then(function (d) {
    if (!d || !d.ok) return;
    var p = d.payments || {}, g = d.giftShop || {}, t = d.transfer || {}, b = (d.site && d.site.business) || {}, rs = d.reschedule || {};
    var set = function (k, v) { if (v !== undefined && v !== null && v !== '') document.querySelectorAll('[data-v="' + k + '"]').forEach(function (n) { n.textContent = v; }); };
    set('cancelHours', p.cancelHours); set('holdMinutes', p.holdMinutes); set('usdRate', p.usdRate);
    set('transferMinutes', t.minutes);
    if (rs.max !== undefined) set('changesMax', rs.max === 1 ? 'una vez' : rs.max === 0 ? 'solo por WhatsApp' : rs.max + ' veces');
    if (g.validDays) set('giftValid', g.validDays % 365 === 0 ? (g.validDays / 365 === 1 ? '12 meses' : (g.validDays / 365) + ' años') : g.validDays + ' días');
    set('bizName', b.name); set('bizAddress', b.address);
    document.querySelectorAll('[data-biz-rnc]').forEach(function (n) { n.hidden = !b.rnc; var v = n.querySelector('[data-v="bizRnc"]'); if (v && b.rnc) v.textContent = b.rnc; });
    document.querySelectorAll('[data-biz-mail]').forEach(function (n) { n.hidden = !b.email; var a = n.querySelector('a'); if (a && b.email) { a.href = 'mailto:' + b.email; a.textContent = b.email; } });
    document.querySelectorAll('[data-transfer-only]').forEach(function (n) { n.hidden = !t.enabled; });
  }).catch(function () {});
})();
