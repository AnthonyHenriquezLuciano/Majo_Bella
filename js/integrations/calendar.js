/* MAJOBELLA · Añadir la cita al calendario de la clienta
   - Google Calendar: enlace de plantilla de evento (no requiere API).
   - Apple Calendar / Outlook / otros: archivo .ics estándar (RFC 5545). */
(function (M) {
  const pad = (n) => String(n).padStart(2, '0');
  const toUTC = (d) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;

  const escapeICS = (s) => String(s).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
  const fold = (line) => {
    const out = [];
    let rest = line;
    while (rest.length > 73) { out.push(rest.slice(0, 73)); rest = ' ' + rest.slice(73); }
    out.push(rest);
    return out.join('\r\n');
  };

  M.CalendarLinks = {
    /* evt: { title, start: Date, end: Date, description, location } */
    googleUrl(evt) {
      const p = new URLSearchParams({
        action: 'TEMPLATE',
        text: evt.title,
        dates: `${toUTC(evt.start)}/${toUTC(evt.end)}`,
        details: evt.description || '',
        location: evt.location || '',
        ctz: M.config.schedule.timeZone,
      });
      return `https://calendar.google.com/calendar/render?${p.toString()}`;
    },

    icsText(evt) {
      const uid = `${toUTC(evt.start)}-${Math.random().toString(36).slice(2, 10)}@majobella`;
      const rem = M.config.booking.reminderMinutesBefore;
      const lines = [
        'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//MAJOBELLA//Reservas//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
        'BEGIN:VEVENT',
        `UID:${uid}`,
        `DTSTAMP:${toUTC(new Date())}`,
        `DTSTART:${toUTC(evt.start)}`,
        `DTEND:${toUTC(evt.end)}`,
        `SUMMARY:${escapeICS(evt.title)}`,
        `DESCRIPTION:${escapeICS(evt.description || '')}`,
        evt.location ? `LOCATION:${escapeICS(evt.location)}` : null,
        'STATUS:TENTATIVE',
        rem ? 'BEGIN:VALARM' : null,
        rem ? `TRIGGER:-PT${rem}M` : null,
        rem ? 'ACTION:DISPLAY' : null,
        rem ? `DESCRIPTION:${escapeICS(evt.title)}` : null,
        rem ? 'END:VALARM' : null,
        'END:VEVENT', 'END:VCALENDAR',
      ].filter(Boolean);
      return lines.map(fold).join('\r\n') + '\r\n';
    },

    downloadICS(evt, filename = 'cita-majobella.ics') {
      const blob = new Blob([this.icsText(evt)], { type: 'text/calendar;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    },
  };
})(window.MJB);
