/* MAJOBELLA · Avisos del sistema: se guardan en la tabla errores y se avisan por correo
   (como mucho uno cada 3 horas por tipo; los de cobros, siempre). */
import { cx } from './ctx.ts';
import { appendRow_, sysGet, sysSet } from './db.ts';
import { ERROR_TITLES, TZ } from './constants.ts';
import { clean_, esc_, fmtDate, plainText_, safeJson_ } from './util.ts';
import { settingsCached_ } from './data.ts';
import { adminTo_, layout_, mailUrl_ } from './mail.ts';

export function logError_(tipo: string, mensaje: string, ref: string, detalle: string, urgent?: boolean) {
  try {
    const now = Date.now();
    const key = 'ERR_' + tipo;
    let avisado = '';
    if (urgent || now - Number(sysGet(key) || 0) > 3 * 3600000) {
      let s: any = {};
      try { s = settingsCached_(); } catch (e) { s = {}; }
      const to = adminTo_(s);
      if (to) {
        const html = layout_(s, {
          kicker: 'Aviso del sistema', title: ERROR_TITLES[tipo] || 'Aviso del sistema',
          intro: esc_(mensaje),
          details: [['Cuándo', esc_(fmtDate(new Date(now), TZ, 'yyyy-MM-dd HH:mm'))], ref ? ['Referencia', esc_(ref)] : null, detalle ? ['Detalle', esc_(detalle)] : null].filter(Boolean),
          cta: { text: 'Ver en el panel', url: mailUrl_(s, 'admin.html#ajustes') },
          note: urgent ? 'Este aviso es importante: revísalo hoy.' : 'Si el problema se repite en las próximas 3 horas, quedará anotado en el panel sin enviar más correos.',
        });
        cx().out.push({ kind: 'mail', mail: { to, subject: '⚠ MAJOBELLA · ' + (ERROR_TITLES[tipo] || 'Aviso del sistema'), html, text: plainText_(html), log: null, ref: ref || '' } });
        avisado = new Date(now).toISOString();
        sysSet(key, String(now));
      }
    }
    appendRow_('Errores', { fecha: new Date(now).toISOString(), tipo, mensaje: clean_(mensaje, 600), ref: clean_(ref, 80), detalle: clean_(detalle, 600), avisado, resuelto: '' });
  } catch (e) { /* nunca romper la petición por anotar un error */ }
}

/* Si las tareas automáticas llevan más de 3 horas sin ejecutarse, se anota y se avisa */
export function heartbeat_() {
  try {
    const last = safeJson_(sysGet('LAST_AUTO'), null);
    if (!last || !last.at) return;
    const hours = (Date.now() - new Date(last.at).getTime()) / 3600000;
    if (hours > 3 && Date.now() - Number(sysGet('HB_LOGGED') || 0) > 3 * 3600000) {
      sysSet('HB_LOGGED', String(Date.now()));
      logError_('automatizacion', 'Las tareas automáticas (recordatorios, reseñas, cumpleaños) no se ejecutan desde hace ' + Math.floor(hours) + ' horas. Abre el panel para que se vuelvan a programar.', '', '');
    }
  } catch (e) { /* nada */ }
}
