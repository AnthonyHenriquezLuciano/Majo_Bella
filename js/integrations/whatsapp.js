/* MAJOBELLA · WhatsApp para dudas e información (enlaces wa.me con mensaje preparado).
   Las citas se reservan y se pagan en la web; WhatsApp no confirma reservas. */
(function (M) {
  const C = M.config.whatsapp;

  M.WhatsApp = {
    isConfigured() { return /^\d{8,15}$/.test(String(C.number || '').trim()); },

    /* Arma el mensaje con los datos disponibles de la cita */
    buildMessage({ services = [], dateKey = null, time = null, name = '' } = {}, greeting) {
      const lines = [greeting || C.greeting];
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

    /* Pregunta general; si ya eligió servicios, se mencionan para darle contexto al estudio */
    linkFromState() {
      const items = M.totals().items;
      const extra = items.length ? `\n\nMe interesa: ${items.map((s) => s.name).join(' + ')}` : '';
      return this.link(`${C.greeting}${extra}`);
    },
  };
})(window.MJB);
