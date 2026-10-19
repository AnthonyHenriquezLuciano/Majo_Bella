/* MAJOBELLA · Contacto, WhatsApp, redes y horario (todo desde js/config.js) */
(function (M) {
  const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  M.initContact = function () {
    const C = M.config;

    /* Enlaces de WhatsApp: el mensaje incluye lo que la clienta haya elegido */
    const waNodes = document.querySelectorAll('[data-wa]');
    const refreshWa = () => {
      waNodes.forEach((a) => {
        const link = M.WhatsApp.linkFromState();
        if (link) { a.href = link; a.target = '_blank'; a.rel = 'noopener'; a.classList.remove('is-pending'); }
        else { a.href = '#contacto'; a.removeAttribute('target'); a.classList.add('is-pending'); a.title = 'Número de WhatsApp pendiente de configurar'; }
      });
    };
    refreshWa();
    M.on(refreshWa);
    const waNote = document.getElementById('wa-note');
    if (waNote) waNote.hidden = M.WhatsApp.isConfigured();

    /* Redes sociales */
    document.querySelectorAll('[data-social]').forEach((a) => {
      const url = C.social[a.dataset.social];
      if (url) { a.href = url; a.target = '_blank'; a.rel = 'noopener'; }
      else { a.removeAttribute('href'); a.classList.add('is-pending'); a.title = 'Enlace pendiente de configurar'; }
    });

    /* Dirección y correo (solo si existen) */
    const addr = document.getElementById('contact-address');
    if (addr) {
      if (C.contact.address) {
        addr.hidden = false;
        addr.querySelector('dd').innerHTML = C.contact.mapsUrl
          ? `<a href="${M.escapeHtml(C.contact.mapsUrl)}" target="_blank" rel="noopener">${M.escapeHtml(C.contact.address)}</a>`
          : M.escapeHtml(C.contact.address);
      }
    }
    const mail = document.getElementById('contact-email');
    if (mail && C.contact.email) { mail.hidden = false; mail.querySelector('dd').textContent = C.contact.email; }

    /* Horario agrupado: "Lunes a viernes · 9:00 AM – 6:00 PM" */
    const hoursList = document.getElementById('contact-hours');
    if (hoursList) {
      const order = [1, 2, 3, 4, 5, 6, 0];
      const key = (d) => { const h = C.schedule.hours[d]; return h ? `${h.open}-${h.close}` : 'closed'; };
      const groups = [];
      order.forEach((d) => {
        const last = groups[groups.length - 1];
        if (last && last.key === key(d)) last.days.push(d); else groups.push({ key: key(d), days: [d] });
      });
      hoursList.innerHTML = groups.map((g) => {
        const name = g.days.length > 1 ? `${cap(DAYS[g.days[0]])} a ${DAYS[g.days[g.days.length - 1]]}` : cap(DAYS[g.days[0]]);
        const h = C.schedule.hours[g.days[0]];
        return `<li><span>${name}</span><span>${h ? `${M.fmtTime12(h.open)} – ${M.fmtTime12(h.close)}` : 'Cerrado'}</span></li>`;
      }).join('');
    }

    document.querySelectorAll('[data-year]').forEach((n) => { n.textContent = new Date().getFullYear(); });
    document.querySelectorAll('[data-slogan]').forEach((n) => { n.textContent = C.brand.slogan; });
  };
})(window.MJB);
