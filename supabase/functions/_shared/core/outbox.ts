/* MAJOBELLA · Lo que sale después de guardar: correos, Google Calendar y archivos por borrar.
   Si algo falla aquí la cita ya está guardada; el fallo queda anotado en Correos o en Avisos del sistema. */
import { cx, env_, type OutTask } from './ctx.ts';
import { msg_ } from './util.ts';
import { relay_, relayOn_ } from './google.ts';
import { removeNow } from './storage.ts';

async function sendResend(m: any) {
  const res = await cx().deps.fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + env_('RESEND_API_KEY'), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env_('MAIL_FROM') || 'MAJOBELLA <onboarding@resend.dev>', to: [m.to], subject: m.subject, html: m.html, text: m.text,
      attachments: (m.attachments || []).map((a: any) => ({ filename: a.name, content: a.data })),
    }),
  });
  if (res.status >= 300) throw new Error('Resend ' + res.status + ': ' + (await res.text()).slice(0, 200));
}

export async function runOutbox(sql: any) {
  const c = cx();
  const tasks: OutTask[] = c.out;
  c.out = [];
  if (!tasks.length) return;
  const mailStatus: { log: any; ok: boolean; error?: string; to: string; subject: string; ref: string }[] = [];
  const eventIds: { citaId: string; id: string }[] = [];
  const problems: { tipo: string; mensaje: string; ref: string }[] = [];

  const mails = tasks.filter((t) => t.kind === 'mail') as any[];
  const useResend = !!env_('RESEND_API_KEY');
  const relayOps: any[] = [];
  const relayRefs: any[] = [];
  for (const t of tasks) {
    if (t.kind === 'mail' && !useResend) { relayOps.push({ type: 'mail', to: t.mail.to, subject: t.mail.subject, html: t.mail.html, text: t.mail.text, name: 'MAJOBELLA', attachments: t.mail.attachments || [] }); relayRefs.push(t); }
    if (t.kind === 'calendar.create') { relayOps.push({ type: 'calendar.create', ...t.event }); relayRefs.push(t); }
    if (t.kind === 'calendar.move') { relayOps.push({ type: 'calendar.move', eventId: t.eventId, start: t.start, end: t.end }); relayRefs.push(t); }
    if (t.kind === 'calendar.cancel') { relayOps.push({ type: 'calendar.cancel', eventId: t.eventId }); relayRefs.push(t); }
  }

  if (useResend) {
    for (const t of mails) {
      try { await sendResend(t.mail); mailStatus.push({ log: t.mail.log, ok: true, to: t.mail.to, subject: t.mail.subject, ref: t.mail.ref }); }
      catch (e) { mailStatus.push({ log: t.mail.log, ok: false, error: msg_(e), to: t.mail.to, subject: t.mail.subject, ref: t.mail.ref }); }
    }
  }
  if (relayOps.length) {
    let results: any[] = [];
    let failAll = '';
    if (!relayOn_()) failAll = 'Falta conectar el correo (conector de Google o Resend).';
    else { try { results = await relay_(relayOps); } catch (e) { failAll = msg_(e); } }
    relayRefs.forEach((t, i) => {
      const r = results[i] || { ok: false, error: failAll || 'sin respuesta' };
      if (t.kind === 'mail') mailStatus.push({ log: t.mail.log, ok: !!r.ok, error: r.error, to: t.mail.to, subject: t.mail.subject, ref: t.mail.ref });
      else if (t.kind === 'calendar.create') { if (r.ok && r.id) eventIds.push({ citaId: t.citaId, id: r.id }); else problems.push({ tipo: 'sistema', mensaje: 'No se pudo agendar la cita ' + t.citaId + ' en Google Calendar: ' + (r.error || failAll), ref: t.citaId }); }
    });
  }
  for (const t of tasks) {
    if (t.kind === 'storage.remove') { try { await removeNow(t.bucket, t.paths); } catch (e) { /* el archivo ya no existía */ } }
  }

  // Resultado de los envíos
  const failed = mailStatus.filter((m) => !m.ok);
  failed.forEach((m) => problems.push({ tipo: 'correo', mensaje: 'No se pudo enviar «' + m.subject + '» a ' + m.to + ': ' + (m.error || 'error'), ref: m.ref }));
  try {
    await sql.begin(async (tx: any) => {
      for (const m of mailStatus) {
        if (m.log && typeof m.log._row === 'number') await tx`update public.correos set estado = ${m.ok ? 'enviado' : 'error'} where row_id = ${m.log._row}`;
      }
      for (const e of eventIds) await tx`update public.reservas set evento_id = ${e.id} where id = ${e.citaId}`;
      for (const p of problems.slice(0, 20)) {
        await tx`insert into public.errores (fecha, tipo, mensaje, ref, detalle) values (now(), ${p.tipo}, ${p.mensaje.slice(0, 600)}, ${p.ref.slice(0, 80)}, ${'después de guardar'})`;
      }
    });
  } catch (e) { console.error('No se pudo anotar el resultado de los envíos:', msg_(e)); }
}
