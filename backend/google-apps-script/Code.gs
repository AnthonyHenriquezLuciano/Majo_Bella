/**
 * MAJOBELLA · Backend de reservas con Google Calendar (Google Apps Script)
 *
 * Acciones:
 *   GET  ?action=availability&date=AAAA-MM-DD   → { busy: [{ start, end }] } con las citas activas de ese día
 *   POST { action: 'create', ..., idToken? }     → crea la cita en el calendario de MAJOBELLA e invita a la clienta
 *   POST { action: 'myAppointments', idToken }   → citas de la clienta que inició sesión con Google
 *   POST { action: 'cancel', id, idToken }       → cancela una cita de esa clienta y libera el horario
 *
 * Instalación (una sola vez):
 *   1. Entra en https://script.google.com con la cuenta de Google de MAJOBELLA y crea un proyecto.
 *   2. Pega este archivo como Code.gs.
 *   3. Configuración del proyecto → zona horaria America/Santo_Domingo.
 *   4. Completa CALENDAR_ID y GOOGLE_CLIENT_ID (el mismo de js/config.js → google.clientId).
 *   5. Implementar → Nueva implementación → "Aplicación web". Ejecutar como: "Yo". Acceso: "Cualquier usuario".
 *   6. Copia la URL que termina en /exec en js/config.js → booking.apiUrl.
 *   Si cambias el código, crea una nueva versión de la implementación.
 */

const CALENDAR_ID = 'primary';
const GOOGLE_CLIENT_ID = '333956941163-rlgrb3759jf2uc05olhhpm9e2ggrhm1s.apps.googleusercontent.com';            // ID de cliente OAuth (termina en .apps.googleusercontent.com)
const SEND_INVITE_TO_CLIENT = true;     // la clienta recibe la invitación y la cita aparece en su calendario
const HISTORY_DAYS = 365;               // cuánto historial devuelve "Mis citas"

function doGet(e) {
  try {
    if ((e.parameter.action || '') !== 'availability') return json_({ ok: false, error: 'Acción no válida.' });
    const date = e.parameter.date;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return json_({ ok: false, error: 'Fecha no válida.' });
    const start = new Date(date + 'T00:00:00-04:00');
    const end = new Date(date + 'T23:59:59-04:00');
    const busy = activeEvents_(start, end).map(function (ev) {
      return { start: ev.getStartTime().toISOString(), end: ev.getEndTime().toISOString() };
    });
    return json_({ ok: true, busy: busy });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

function doPost(e) {
  let data;
  try { data = JSON.parse(e.postData.contents || '{}'); } catch (err) { return json_({ ok: false, error: 'Datos no válidos.' }); }
  if (data.action === 'create') return withLock_(function () { return create_(data); });
  if (data.action === 'myAppointments') return myAppointments_(data);
  if (data.action === 'cancel') return withLock_(function () { return cancel_(data); });
  return json_({ ok: false, error: 'Acción no válida.' });
}

/* ---------- Acciones ---------- */

function create_(data) {
  const c = data.client || {};
  if (!c.name || !c.phone || !c.email) return json_({ ok: false, error: 'Faltan datos de la clienta.' });
  const start = new Date(data.start), end = new Date(data.end);
  if (isNaN(start) || isNaN(end) || end <= start) return json_({ ok: false, error: 'Horario no válido.' });
  if (start.getTime() < Date.now()) return json_({ ok: false, error: 'Ese horario ya pasó.' });
  if (activeEvents_(start, end).length) return json_({ ok: false, error: 'Ese horario acaba de ocuparse.' });

  // Si inició sesión con Google, se usa el correo verificado por Google
  let email = String(c.email).trim().toLowerCase();
  if (data.idToken) {
    const verified = verifyIdToken_(data.idToken);
    if (verified) email = verified.email;
  }

  const services = (data.services || []).map(function (s) { return s.name; }).join(' + ');
  const description = [
    'Servicio: ' + services,
    'Duración: ' + data.durationMinutes + ' min',
    'Precio: ' + (data.currency || 'RD$') + ' ' + data.totalPrice,
    '',
    'Clienta: ' + c.name,
    'Teléfono: ' + c.phone,
    'Correo: ' + email,
    c.notes ? 'Nota: ' + c.notes : '',
  ].join('\n');

  const options = { description: description };
  if (SEND_INVITE_TO_CLIENT) { options.guests = email; options.sendInvites = true; }
  const ev = CalendarApp.getCalendarById(CALENDAR_ID).createEvent('MAJOBELLA · ' + services + ' · ' + c.name, start, end, options);
  ev.setTag('mjb', '1');
  ev.setTag('clientEmail', email);
  ev.setTag('clientName', c.name);
  ev.setTag('services', JSON.stringify(data.services || []));
  ev.setTag('totalPrice', String(data.totalPrice || 0));
  ev.setTag('durationMinutes', String(data.durationMinutes || 0));
  ev.setTag('status', 'confirmada');
  return json_({ ok: true, id: ev.getId() });
}

function myAppointments_(data) {
  const user = verifyIdToken_(data.idToken);
  if (!user) return json_({ ok: false, error: 'Tu sesión expiró. Vuelve a iniciar sesión.' });
  const from = new Date(Date.now() - HISTORY_DAYS * 86400000);
  const to = new Date(Date.now() + 365 * 86400000);
  const items = CalendarApp.getCalendarById(CALENDAR_ID).getEvents(from, to)
    .filter(function (ev) { return ev.getTag('mjb') === '1' && (ev.getTag('clientEmail') || '') === user.email; })
    .map(function (ev) {
      const s = ev.getStartTime(), en = ev.getEndTime();
      const tz = 'America/Santo_Domingo';
      return {
        id: ev.getId(),
        remote: true,
        status: ev.getTag('status') || 'confirmada',
        start: s.toISOString(),
        end: en.toISOString(),
        date: Utilities.formatDate(s, tz, 'yyyy-MM-dd'),
        time: Utilities.formatDate(s, tz, 'HH:mm'),
        durationMinutes: Number(ev.getTag('durationMinutes')) || Math.round((en - s) / 60000),
        totalPrice: Number(ev.getTag('totalPrice')) || 0,
        services: JSON.parse(ev.getTag('services') || '[]'),
        client: { name: ev.getTag('clientName') || '', email: user.email },
      };
    });
  return json_({ ok: true, items: items });
}

function cancel_(data) {
  const user = verifyIdToken_(data.idToken);
  if (!user) return json_({ ok: false, error: 'Tu sesión expiró. Vuelve a iniciar sesión.' });
  const ev = CalendarApp.getCalendarById(CALENDAR_ID).getEventById(data.id);
  if (!ev || ev.getTag('clientEmail') !== user.email) return json_({ ok: false, error: 'No encontramos esa cita.' });
  if (ev.getStartTime().getTime() < Date.now()) return json_({ ok: false, error: 'Esa cita ya pasó.' });
  ev.setTag('status', 'cancelada');
  ev.setTitle('CANCELADA · ' + ev.getTitle());
  ev.setColor(CalendarApp.EventColor.GRAY);
  return json_({ ok: true });
}

/* ---------- Utilidades ---------- */

// Citas que ocupan agenda (ignora las canceladas)
function activeEvents_(start, end) {
  return CalendarApp.getCalendarById(CALENDAR_ID).getEvents(start, end).filter(function (ev) {
    return ev.getTag('status') !== 'cancelada' && ev.getStartTime() < end && ev.getEndTime() > start;
  });
}

// Verifica con Google el token de "Iniciar sesión con Google" y devuelve { email, name } o null
function verifyIdToken_(idToken) {
  if (!idToken || !GOOGLE_CLIENT_ID) return null;
  const res = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken), { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) return null;
  const info = JSON.parse(res.getContentText());
  if (info.aud !== GOOGLE_CLIENT_ID) return null;
  if (String(info.email_verified) !== 'true') return null;
  if (Number(info.exp) * 1000 < Date.now()) return null;
  return { email: String(info.email).toLowerCase(), name: info.name || '' };
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try { return fn(); }
  catch (err) { return json_({ ok: false, error: String(err && err.message || err) }); }
  finally { lock.releaseLock(); }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
