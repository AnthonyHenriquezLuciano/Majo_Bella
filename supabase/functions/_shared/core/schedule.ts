/* MAJOBELLA · Horario, bloqueos, horarios ocupados y choques */
import { readTable_ } from './db.ts';
import { rows_, settings_ } from './data.ts';
import { BUSY_STATES, DAY_KEYS, TZ, UTC_OFFSET } from './constants.ts';
import { fmtDate, isDateKey_, num_, pad_, strip_, toMin_ } from './util.ts';

export function schedule_(s: Record<string, string>) {
  const hours: Record<number, { open: string; close: string } | null> = {};
  DAY_KEYS.forEach((k, dow) => {
    const m = String(s[k] || '').match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
    hours[dow] = m ? { open: pad_(m[1]) + ':' + m[2], close: pad_(m[3]) + ':' + m[4] } : null;
  });
  return {
    hours,
    blocked: String(s.diasCerrados || '').split(',').map((x) => x.trim()).filter(isDateKey_),
    minNotice: num_(s.minAntelacionHoras, 3), maxDays: num_(s.maxDiasAdelante, 60), step: num_(s.intervaloMinutos, 30),
  };
}

export function slotProblem_(sch: any, date: string, time: string, minutes: number) {
  if (sch.blocked.indexOf(date) >= 0) return 'Ese día el estudio está cerrado.';
  const p = date.split('-').map(Number);
  const dow = new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay();
  const h = sch.hours[dow];
  if (!h) return 'Ese día el estudio está cerrado.';
  const t = toMin_(time);
  if (t < toMin_(h.open) || t + minutes > toMin_(h.close)) return 'Esa hora está fuera del horario del estudio.';
  const start = new Date(date + 'T' + time + ':00' + UTC_OFFSET).getTime();
  if (start < Date.now() + sch.minNotice * 3600000) return 'Ese horario ya no se puede reservar. Elige uno más adelante.';
  if (start > Date.now() + (sch.maxDays + 1) * 86400000) return 'Aún no abrimos la agenda para esa fecha.';
  return null;
}

export function blocks_() {
  return readTable_('Bloqueos').filter((b) => !/^no$/i.test(b.activo)).map(strip_);
}

/* Convierte los bloqueos en intervalos concretos entre dos fechas */
export function blockIntervals_(blocks: any[], from: string, to: string) {
  const out: any[] = [];
  let key = from;
  let guard = 0;
  while (key <= to && guard++ < 400) {
    const p = key.split('-').map(Number);
    const dow = new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay();
    blocks.forEach((b) => {
      let hit = false;
      if (b.tipo === 'semanal') hit = String(b.dias).split(',').indexOf(String(dow)) >= 0 && key >= b.fechaDesde && (!b.fechaHasta || key <= b.fechaHasta);
      else hit = key >= b.fechaDesde && key <= (b.fechaHasta || b.fechaDesde);
      if (hit) {
        out.push({
          id: b.id, motivo: b.motivo, block: true, fecha: key,
          start: new Date(key + 'T' + (b.horaDesde || '00:00') + ':00' + UTC_OFFSET).toISOString(),
          end: new Date(key + 'T' + (b.horaHasta || '23:59') + ':00' + UTC_OFFSET).toISOString(),
        });
      }
    });
    key = new Date(Date.UTC(p[0], p[1] - 1, p[2] + 1)).toISOString().slice(0, 10);
  }
  return out;
}

export function occupies_(r: any, now: number) {
  if (BUSY_STATES.indexOf(r.estado) >= 0) return true;
  return r.estado === 'retenida' && new Date(r.retenidaHasta).getTime() > now;
}

export function conflicts_(start: Date, end: Date, exceptId: string | null) {
  const now = Date.now();
  const clash: any[] = rows_().filter((r) => {
    if (r.id === exceptId || !occupies_(r, now)) return false;
    return new Date(r.inicio) < end && new Date(r.fin) > start;
  });
  const from = fmtDate(start, TZ, 'yyyy-MM-dd'), to = fmtDate(end, TZ, 'yyyy-MM-dd');
  blockIntervals_(blocks_(), from, to).forEach((b) => {
    if (new Date(b.start) < end && new Date(b.end) > start) clash.push(b);
  });
  return clash;
}

/* Intervalos ocupados entre dos fechas (sin datos de las clientas) */
export function busy_(from: string, to: string): any {
  if (!isDateKey_(from) || !isDateKey_(to)) return { ok: false, error: 'Fecha no válida.' };
  const a = new Date(from + 'T00:00:00' + UTC_OFFSET).getTime();
  const b = new Date(to + 'T23:59:59' + UTC_OFFSET).getTime();
  if (b < a || b - a > 120 * 86400000) return { ok: false, error: 'Rango no válido.' };
  const now = Date.now();
  const busy: any[] = rows_().filter((r) => {
    if (!occupies_(r, now)) return false;
    const s = new Date(r.inicio).getTime(), e = new Date(r.fin).getTime();
    return s <= b && e >= a;
  }).map((r) => ({ start: r.inicio, end: r.fin }));
  blockIntervals_(blocks_(), from, to).forEach((x) => { busy.push({ start: x.start, end: x.end }); });
  return { ok: true, busy };
}

/* Igual que busy_, con la hora hasta la que la respuesta sigue siendo válida (cuando vence un apartado) */
export function busyWithUntil_(from: string, to: string) {
  const out = busy_(from, to);
  if (!out.ok) return out;
  const now = Date.now();
  const holds = rows_().filter((r) => r.estado === 'retenida' && new Date(r.retenidaHasta).getTime() > now).map((r) => new Date(r.retenidaHasta).getTime());
  out.until = holds.length ? Math.min.apply(null, holds) : now + 300000;
  return out;
}

/* Horarios libres de un día para una duración (franja: manana | tarde | cualquiera) */
export function freeSlots_(date: string, minutes: number, franja: string, s?: Record<string, string>) {
  const sch = schedule_(s || settings_());
  if (sch.blocked.indexOf(date) >= 0) return [];
  const p = date.split('-').map(Number);
  const h = sch.hours[new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay()];
  if (!h) return [];
  const busy = (busy_(date, date).busy || []).map((b: any) => [new Date(b.start).getTime(), new Date(b.end).getTime()]);
  const out: string[] = [];
  const earliest = Date.now() + sch.minNotice * 3600000;
  for (let t = toMin_(h.open); t + minutes <= toMin_(h.close); t += sch.step) {
    const hhmm = pad_(Math.floor(t / 60)) + ':' + pad_(t % 60);
    if (franja === 'manana' && t >= 720) continue;
    if (franja === 'tarde' && t < 720) continue;
    const a = new Date(date + 'T' + hhmm + ':00' + UTC_OFFSET).getTime(), b = a + minutes * 60000;
    if (a < earliest) continue;
    if (busy.some((x: number[]) => x[0] < b && x[1] > a)) continue;
    out.push(hhmm);
  }
  return out;
}

export function describeClash_(x: any) {
  if (x.block) return 'un bloqueo (' + (x.motivo || 'horario bloqueado') + ')';
  return 'la cita de ' + (x.clienta || 'otra clienta') + ' (' + x.hora + ')';
}
