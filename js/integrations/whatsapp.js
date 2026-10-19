/* MAJOBELLA · Integración con WhatsApp (enlaces wa.me con mensaje preparado) */
(function (M) {
  const C = M.config.whatsapp;

  M.WhatsApp = {
    isConfigured() { return /^\d{8,15}$/.test(String(C.number || '').trim()); },

    /* Arma el mensaje con los datos disponibles de la cita */
    buildMessage({ services = [], dateKey = null, time = null, name = '' } = {}) {
      const lines = [C.greeting];
      if (services.length) lines.push('', `Servicio: ${services.map((s) => s.name).join(' + ')}`);
      if (dateKey) lines.push('', `Fecha: ${M.weekdayName(dateKey)} ${M.dayMonth(dateKey)}`);
      if (time) lines.push('', `Hora: ${M.fmtTime12(time)}`);
      if (name) lines.push('', `Nombre: ${name}`);
      return lines.join('\n');
    },

    link(message) {
      if (!this.isConfigured()) return null;
      const text = encodeURIComponent(message || C.greeting);
      return `https://wa.me/${String(C.number).trim()}?text=${text}`;
    },

    /* Mensaje con lo que la clienta haya elegido hasta ahora */
    linkFromState(extra = {}) {
      const st = M.state;
      return this.link(this.buildMessage({
        services: M.totals().items,
        dateKey: st.dateKey,
        time: st.time,
        ...extra,
      }));
    },
  };
})(window.MJB);
