/* MAJOBELLA · Conector de Google (Gmail, Google Calendar y PDF)
   Un pequeño script de Apps Script en la cuenta del estudio (backend/google-relay/Relay.gs) envía los
   correos desde su Gmail, agenda las citas en su Google Calendar y convierte el consentimiento a PDF.
   La API le habla con una clave compartida (GOOGLE_RELAY_URL y GOOGLE_RELAY_KEY en los secretos).
   Alternativa para el correo: Resend (RESEND_API_KEY y MAIL_FROM). */
import { cx, env_ } from './ctx.ts';
import { msg_ } from './util.ts';
import { describe_ } from './mail.ts';

export function relayOn_() { return !!(env_('GOOGLE_RELAY_URL') && env_('GOOGLE_RELAY_KEY')); }

export async function relay_(ops: any[]): Promise<any[]> {
  const res = await cx().deps.fetch(env_('GOOGLE_RELAY_URL'), {
    method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ key: env_('GOOGLE_RELAY_KEY'), ops }),
    redirect: 'follow',
  });
  const text = await res.text();
  let data: any = null;
  try { data = JSON.parse(text); } catch (e) { throw new Error('El conector de Google no respondió bien (' + res.status + ').'); }
  if (!data.ok) throw new Error('Conector de Google: ' + (data.error || 'error'));
  return data.results || [];
}

/* ---- Google Calendar: se agenda después de guardar la cita ---- */
function calendarOn_(s: any) { return relayOn_() && !!String(s.calendarioId || '').trim(); }

export function calendarCreate_(r: any, s: any) {
  if (!calendarOn_(s)) return '';
  cx().out.push({
    kind: 'calendar.create', citaId: r.id,
    event: {
      calendarId: String(s.calendarioId).trim(), title: 'MAJOBELLA · ' + r.servicios + ' · ' + r.clienta, start: r.inicio, end: r.fin,
      description: describe_(r, s), location: s.direccion || '', guest: r.correo && /^s[ií]$/i.test(s.invitarClienta) ? r.correo : '',
    },
  });
  return '';
}
export function calendarMove_(r: any, s: any) {
  if (!calendarOn_(s) || !r.eventoId) return;
  cx().out.push({ kind: 'calendar.move', eventId: r.eventoId, start: r.inicio, end: r.fin });
}
export function calendarCancel_(r: any, s: any) {
  if (!calendarOn_(s) || !r.eventoId) return;
  cx().out.push({ kind: 'calendar.cancel', eventId: r.eventoId });
}
export function calendarIdFor_(s: any) { return String(s.calendarioId || '').trim(); }

/* ---- HTML → PDF (consentimiento firmado). Sin conector se guarda el HTML. ---- */
export async function htmlToPdf_(html: string, name: string): Promise<string | null> {
  if (!relayOn_()) return null;
  try {
    const r = await relay_([{ type: 'pdf', html, name }]);
    return r[0] && r[0].ok && r[0].data ? r[0].data : null;
  } catch (e) { void msg_(e); return null; }
}
