/* MAJOBELLA · Tareas automáticas (cada hora, con pg_cron): recordatorios, pedir reseña, retoques,
   cumpleaños, lista de espera y aviso de transferencias sin revisar */
import { cx } from './ctx.ts';
import { appendRow_, readOpt_, readTable_, sysGet, sysSet, updateTable_ } from './db.ts';
import { rows_, servicesMap_, settings_, updateRow_ } from './data.ts';
import { codeTaken_ } from './pricing.ts';
import { checkWaitlist_ } from './waitlist.ts';
import { logError_ } from './errors.ts';
import { needAdmin_ } from './security.ts';
import { adminTo_, layout_, mailBirthday_, mailRetouch_, mailReminder_, mailReview_, mailUrl_, safeMail_ } from './mail.ts';
import { TZ } from './constants.ts';
import { addDaysKey_, clientKey_, esc_, fmtDate, monthDay_, money_, msg_, num_, on_, randCode_, safeJson_, strip_, todayKey_, uuid, whenText_ } from './util.ts';

/* Cotización informativa: no es la tasa oficial de venta del BCRD ni la liquidación PayPal.
   Solo modifica el precio publicado si el estudio activó explícitamente el modo automático.
   Máximo una consulta por día, con controles de antigüedad y cambio brusco. */
export async function updateUsdRate_() {
  const s = settings_();
  if (String(s.tasaUSDModo || 'manual') !== 'automatico') return { estado: 'manual' };
  const now = Date.now(), last = Number(sysGet('FX_LAST_ATTEMPT') || 0);
  if (Number.isFinite(last) && last > 0 && now - last < 22 * 3600000) return { estado: 'sin_cambios', motivo: 'Ya se consultó hoy' };
  sysSet('FX_LAST_ATTEMPT', String(now));
  try {
    const response = await cx().deps.fetch('https://open.er-api.com/v6/latest/USD', {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw Error('La fuente USD/DOP respondió HTTP ' + response.status);
    const data = await response.json();
    const rate = Number(data?.rates?.DOP);
    const dated = Number(data?.time_last_update_unix) * 1000;
    if (data?.result !== 'success' || data?.base_code !== 'USD' ||
        !Number.isFinite(rate) || rate < 30 || rate > 200 ||
        !Number.isFinite(dated) || dated > now + 3600000 || now - dated > 72 * 3600000)
      throw Error('La cotización USD/DOP está incompleta, fuera de rango o desactualizada');
    const old = Number(s.tasaUSD);
    if (Number.isFinite(old) && old > 0 && Math.abs(rate / old - 1) > .03)
      throw Error('La variación supera 3% respecto a la tasa publicada: requiere revisión manual');
    const rounded = (Math.round(rate * 100) / 100).toFixed(2);
    const values = { tasaUSD: rounded, tasaUSDFuente: 'ExchangeRate-API · referencial', tasaUSDActualizada: new Date(dated).toISOString() };
    const rows = readTable_('Ajustes');
    for (const [key, value] of Object.entries(values)) {
      const r = rows.find(x => x.clave === key);
      if (r) updateTable_('Ajustes', r._row, { valor: value });
      else appendRow_('Ajustes', { clave: key, valor: value, 'qué es': 'Actualizado automáticamente' });
    }
    sysSet('FX_LAST_SUCCESS', JSON.stringify({ at: now, sourceAt: dated, rate: rounded }));
    return { estado: 'actualizada', tasa: rounded, fecha: new Date(dated).toISOString() };
  } catch (error) {
    const reason = msg_(error);
    logError_('automatizacion', 'Tasa USD automática: ' + reason, '', '');
    return { estado: 'error', motivo: reason, tasaActualConservada: true };
  }
}

export async function runAutomations_() {
  const s = settings_();
  const now = new Date();
  const hour = Number(fmtDate(now, TZ, 'H'));
  const daytime = hour >= 8 && hour < 21;
  const out: any = { recordatorios: 0, resenas: 0, retoques: 0, cumpleanos: 0, espera: 0 };
  out.tasaUSD = await updateUsdRate_();
  const rows = rows_();
  const step = function (key, fn) { try { out[key] = fn(); } catch (e) { out[key] = 'error: ' + msg_(e); logError_('automatizacion', key + ': ' + msg_(e), '', ''); } };
  step('gastosProgramados', scheduleRecurringExpenses_);
  if (on_(s.recordatorioActivo) && hour >= 7 && hour < 22) step('recordatorios', function () { return sendReminders_(rows, s, now); });
  if (daytime && on_(s.resenaActiva) && s.googleResenaUrl) step('resenas', function () { return askReviews_(rows, s, now); });
  if (daytime && on_(s.retoqueActivo)) step('retoques', function () { return retouchNotices_(rows, s); });
  if (daytime && on_(s.cumpleActivo)) step('cumpleanos', function () { return birthdays_(rows, s); });
  if (on_(s.esperaActiva)) step('espera', function () { return checkWaitlist_(s, null); });
  if (hour >= 8 && hour < 22) step('transferencias', function () { return nagTransfers_(rows, s, now); });
  sysSet('LAST_AUTO', JSON.stringify({ at: now.toISOString(), out: out }));
  return out;
}

/* Las cuotas fijas se generan como PENDIENTES. No se restan de caja ni de
   ganancia hasta que una persona confirme que se pagaron. */
export function scheduleRecurringExpenses_() {
  let templates:any[] = [];
  try {const value=JSON.parse(String(settings_().gastosRecurrentes||'[]'));if(Array.isArray(value))templates=value;} catch {return 0;}
  const today=todayKey_(), month=today.slice(0,7), rows=readTable_('Gastos');
  let created=0;
  for (const t of templates.slice(0,20)) {
    if (t?.activo !== true || !/^[A-Z0-9]{8}$/.test(String(t.id||'')))continue;
    const day=Math.min(28,Math.max(1,Math.floor(Number(t.dia)||1)));
    const due=month+'-'+String(day).padStart(2,'0');
    const id='GRE-'+t.id+'-'+month.replace('-','');
    const monto=Math.round(Number(t.montoRD)||0);
    if (due>today || rows.some(r=>r.id===id) || !Number.isFinite(monto) || monto<=0 || monto>10000000)continue;
    appendRow_('Gastos',{id,fecha:due,concepto:String(t.concepto||'Gasto recurrente').slice(0,120),
      categoria:String(t.categoria||'Otros').slice(0,40),montoRD:monto,metodo:'pendiente',creada:new Date().toISOString()});
    created++;
  }
  return created;
}

export function automationStatus_() {
  return { lastRun: safeJson_(sysGet('LAST_AUTO'), null), trigger: cx().cronActive, quota: null };
}

/* Recordatorio X horas antes (una vez por cita) */
export function sendReminders_(rows, s, now) {
  const H = num_(s.recordatorioHoras, 24);
  let n = 0;
  rows.forEach(function (r) {
    if (r.estado !== 'confirmada' || r.recordatorio || !r.correo) return;
    const hoursLeft = (new Date(r.inicio).getTime() - now.getTime()) / 3600000;
    const age = (now.getTime() - new Date(r.creada || r.depositoPagado || 0).getTime()) / 3600000;
    if (hoursLeft > H || hoursLeft < 1 || age < 6) return;
    const m = mailReminder_(r, s);
    if (safeMail_(r.correo, m.subject, m.html, { tipo: 'recordatorio', ref: r.id })) { updateRow_(r._row, { recordatorio: now.toISOString() }); n++; }
  });
  return n;
}

/* Pedir reseña unas horas después de una cita realizada (una vez cada 120 días por clienta) */
export function askReviews_(rows, s, now) {
  const H = Math.max(0, Number(String(s.resenaHoras).replace(',', '.')) || 0);
  const lastAsked: any = {};
  rows.forEach(function (r) { if (r.resenaPedida && /^\d{4}-/.test(r.resenaPedida)) { const k = clientKey_(r.correo, r.telefono, r.clienta); if (!lastAsked[k] || r.resenaPedida > lastAsked[k]) lastAsked[k] = r.resenaPedida; } });
  let n = 0;
  rows.forEach(function (r) {
    if (r.estado !== 'completada' || r.resenaPedida || !r.correo) return;
    const end = new Date(r.fin).getTime();
    if (now.getTime() < end + H * 3600000 || now.getTime() > end + 7 * 86400000) return;
    const k = clientKey_(r.correo, r.telefono, r.clienta);
    if (lastAsked[k] && now.getTime() - new Date(lastAsked[k]).getTime() < 120 * 86400000) { updateRow_(r._row, { resenaPedida: 'no (pedida hace poco)' }); return; }
    const m = mailReview_(r, s);
    if (safeMail_(r.correo, m.subject, m.html, { tipo: 'resena', ref: r.id })) { updateRow_(r._row, { resenaPedida: now.toISOString() }); lastAsked[k] = now.toISOString(); n++; }
  });
  return n;
}

/* Aviso de retoque una semana antes de la fecha ideal (días por servicio en "Servicios") */
export function retouchNotices_(rows, s) {
  const svcs = servicesMap_();
  const today = todayKey_();
  let n = 0;
  rows.forEach(function (r) {
    if (r.estado !== 'completada' || r.retoqueAviso || !r.correo) return;
    const ids = safeJson_(r.serviciosJson, []).map(function (x) { return x.id; });
    const svc = ids.map(function (id) { return svcs[id]; }).filter(function (x) { return x && x.retoqueDays > 0; })[0];
    if (!svc) return;
    const ideal = addDaysKey_(r.fecha, svc.retoqueDays);
    if (today < addDaysKey_(ideal, -7)) return;
    const k = clientKey_(r.correo, r.telefono, r.clienta);
    const booked = rows.some(function (x) {
      return x.id !== r.id && x.fecha > r.fecha && ['confirmada', 'completada', 'retenida'].indexOf(x.estado) >= 0 &&
        clientKey_(x.correo, x.telefono, x.clienta) === k && safeJson_(x.serviciosJson, []).some(function (y) { return y.id === svc.id; });
    });
    if (booked) { updateRow_(r._row, { retoqueAviso: 'no (ya reservó)' }); return; }
    if (today > addDaysKey_(ideal, 21)) { updateRow_(r._row, { retoqueAviso: 'no (pasó la fecha)' }); return; }
    const m = mailRetouch_(r, s, svc, ideal);
    if (safeMail_(r.correo, m.subject, m.html, { tipo: 'retoque', ref: r.id })) { updateRow_(r._row, { retoqueAviso: new Date().toISOString() }); n++; }
  });
  return n;
}

/* Cumpleaños: código de un solo uso con el % de Ajustes */
export function birthdays_(rows, s) {
  const today = todayKey_();
  const md = today.slice(5);
  const year = today.slice(0, 4);
  let n = 0;
  readOpt_('Clientas').forEach(function (c) {
    if (monthDay_(c.cumpleanos) !== md || String(c.cumpleEnviado) === year) return;
    let email = c.correo;
    if (!email) {
      const last = rows.filter(function (r) { return r.correo && clientKey_(r.correo, r.telefono, r.clienta) === c.clave; }).pop();
      email = last ? last.correo : '';
    }
    if (!email) return;
    const pct = num_(s.cumpleDescuento, 15);
    const until = addDaysKey_(today, num_(s.cumpleDias, 30));
    let code = '';
    for (let i = 0; i < 6 && (!code || codeTaken_(code)); i++) code = 'CUMPLE-' + randCode_(5);
    appendRow_('Promociones', {
      id: 'PRM-' + uuid().slice(0, 6).toUpperCase(), nombre: 'Cumpleaños de ' + (c.nombre || 'clienta'), tipo: 'codigo', codigo: code,
      servicios: 'todos', descuentoTipo: 'porcentaje', valor: pct, desde: today, hasta: until, usosMax: 1, usos: 0, activo: 'si', creada: new Date().toISOString(),
    });
    const m = mailBirthday_(c.nombre, s, code, pct, until);
    safeMail_(email, m.subject, m.html, { tipo: 'cumpleanos', ref: c.clave });
    updateTable_('Clientas', c._row, { cumpleEnviado: year });
    n++;
  });
  return n;
}

/* Recuerda al estudio las transferencias sin revisar (como mucho cada 4 horas) */
export function nagTransfers_(rows, s, now) {
  const pending = rows.filter(function (r) { return r.estado === 'por-confirmar' && now.getTime() - new Date(r.comprobanteEn || r.creada).getTime() > 2 * 3600000; });
  if (!pending.length) return 0;
  const last = Number(sysGet('TRANSFER_NAG') || 0);
  if (now.getTime() - last < 4 * 3600000) return 0;
  sysSet('TRANSFER_NAG', String(now.getTime()));
  const html = layout_(s, {
    kicker: 'Transferencias por revisar', title: pending.length === 1 ? 'Tienes 1 transferencia sin revisar' : 'Tienes ' + pending.length + ' transferencias sin revisar',
    intro: 'Estas clientas subieron su comprobante y esperan tu confirmación. Su horario sigue apartado.',
    details: pending.slice(0, 10).map(function (r) { return [r.clienta, esc_(whenText_(r)) + '<br>Depósito RD$ ' + money_(r.depositoRD)]; }),
    cta: { text: 'Revisar en el dashboard', url: mailUrl_(s, 'admin.html#agenda') },
  });
  safeMail_(adminTo_(s), 'Transferencias por revisar (' + pending.length + ') · MAJOBELLA', html, { tipo: 'aviso', ref: 'transferencias' });
  return pending.length;
}

export async function adminRunAutomations_(d) {
  needAdmin_(d);
  const out = await runAutomations_();
  return { ok: true, result: out, automation: automationStatus_(), emails: readOpt_('Correos').slice(-200).reverse().map(strip_) };
}
