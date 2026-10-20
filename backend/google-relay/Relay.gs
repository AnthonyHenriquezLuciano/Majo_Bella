/**
 * MAJOBELLA · Conector de Google (Gmail, Google Calendar y PDF)
 *
 * La API de MAJOBELLA (Supabase) le pide a este pequeño script que:
 *   - envíe los correos desde el Gmail del estudio (con el diseño de la marca),
 *   - agende, mueva o borre las citas en Google Calendar (e invite a la clienta),
 *   - convierta a PDF el consentimiento firmado.
 *
 * Instalación (una sola vez, ver supabase/INSTALAR.md):
 *   1. script.google.com → Proyecto nuevo → pega este archivo → guarda.
 *   2. Ejecuta la función preparar() y acepta los permisos. En el registro aparece la CLAVE.
 *   3. Implementar → Nueva implementación → Aplicación web → Ejecutar como: yo · Acceso: cualquier usuario.
 *   4. En Supabase guarda la URL /exec como GOOGLE_RELAY_URL y la clave como GOOGLE_RELAY_KEY.
 * La clave solo vive aquí (Propiedades del script) y en los secretos de Supabase.
 */

function preparar() {
  const props = PropertiesService.getScriptProperties();
  let key = props.getProperty('RELAY_KEY');
  if (!key) { key = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, ''); props.setProperty('RELAY_KEY', key); }
  // Toca Gmail, Calendar y Drive para que Google pida los permisos ahora
  MailApp.getRemainingDailyQuota(); CalendarApp.getDefaultCalendar().getName();
  Logger.log('Listo. Copia esta clave en Supabase como GOOGLE_RELAY_KEY:\n' + key);
  return key;
}

function doPost(e) {
  let req;
  try { req = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) { return out_({ ok: false, error: 'Datos no válidos.' }); }
  const key = PropertiesService.getScriptProperties().getProperty('RELAY_KEY');
  if (!key || req.key !== key) return out_({ ok: false, error: 'Clave no válida.' });
  const results = (req.ops || []).slice(0, 60).map(function (op) {
    try { return run_(op); } catch (err) { return { ok: false, error: String((err && err.message) || err) }; }
  });
  return out_({ ok: true, results: results, quota: MailApp.getRemainingDailyQuota() });
}

function doGet() { return out_({ ok: true, service: 'MAJOBELLA · conector de Google' }); }

function run_(op) {
  switch (op.type) {
    case 'mail': {
      const opts = { to: op.to, subject: op.subject, htmlBody: op.html, body: op.text || '', name: op.name || 'MAJOBELLA' };
      if (op.attachments && op.attachments.length) {
        opts.attachments = op.attachments.map(function (a) { return Utilities.newBlob(Utilities.base64Decode(a.data), a.mime, a.name); });
      }
      MailApp.sendEmail(opts);
      return { ok: true };
    }
    case 'calendar.create': {
      const cal = op.calendarId === 'primary' ? CalendarApp.getDefaultCalendar() : CalendarApp.getCalendarById(op.calendarId);
      if (!cal) return { ok: false, error: 'No se encontró el calendario ' + op.calendarId };
      const opts = { description: op.description || '', location: op.location || '' };
      if (op.guest) { opts.guests = op.guest; opts.sendInvites = true; }
      const ev = cal.createEvent(op.title, new Date(op.start), new Date(op.end), opts);
      return { ok: true, id: ev.getId() };
    }
    case 'calendar.move': {
      const ev = CalendarApp.getEventById(op.eventId);
      if (ev) ev.setTime(new Date(op.start), new Date(op.end));
      return { ok: true };
    }
    case 'calendar.cancel': {
      const ev = CalendarApp.getEventById(op.eventId);
      if (ev) ev.deleteEvent();
      return { ok: true };
    }
    case 'pdf': {
      const pdf = Utilities.newBlob(op.html, 'text/html', (op.name || 'documento') + '.html').getAs('application/pdf');
      return { ok: true, data: Utilities.base64Encode(pdf.getBytes()) };
    }
    default: return { ok: false, error: 'Operación desconocida.' };
  }
}

function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
