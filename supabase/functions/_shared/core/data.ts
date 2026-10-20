/* MAJOBELLA · Lecturas frecuentes: ajustes, servicios y reservas */
import { cx } from './ctx.ts';
import { readTable_, updateTable_ } from './db.ts';
import { DEFAULT_SETTINGS } from './constants.ts';
import { pctOrNull_ } from './util.ts';

export function settings_(): Record<string, string> {
  const out: Record<string, string> = {};
  DEFAULT_SETTINGS.forEach((x) => { out[x[0]] = x[1]; });
  readTable_('Ajustes').forEach((r) => { if (r.clave) out[String(r.clave).trim()] = String(r.valor == null ? '' : r.valor).trim(); });
  return out;
}
export function settingsCached_() { const c = cx(); if (!c.settings) c.settings = settings_(); return c.settings; }
export function resetCaches_() { const c = cx(); c.settings = null; c.svc = null; }

export function services_() {
  return readTable_('Servicios').filter((r) => !/^no$/i.test(String(r.activo))).map((r) => ({
    id: String(r.id).trim(), name: String(r.nombre).trim(), durationMinutes: Number(r.duracionMin) || 30,
    price: Number(r.precioRD) || 0, priceFrom: /^s[ií]$/i.test(String(r.precioDesde)), returnDays: Number(r.volverDias) || 0,
    depositPercent: pctOrNull_(r.depositoPct),
    retoqueDays: Number(r.retoqueDias) || 0, consent: /^s[ií]$/i.test(String(r.consentimiento)),
  }));
}
export function servicesMap_(): Record<string, any> {
  const c = cx();
  if (!c.svc) {
    c.svc = {};
    readTable_('Servicios').forEach((r) => {
      c.svc[String(r.id).trim()] = { id: String(r.id).trim(), name: String(r.nombre).trim(), price: Number(r.precioRD) || 0, retoqueDays: Number(r.retoqueDias) || 0, consent: /^s[ií]$/i.test(String(r.consentimiento)), active: !/^no$/i.test(String(r.activo)) };
    });
  }
  return c.svc;
}
export function catalogItems_(ids: string[]) {
  const catalog: Record<string, any> = {};
  services_().forEach((x) => { catalog[x.id] = x; });
  return ids.map((id) => catalog[id]);
}

export function rows_() { return readTable_('Reservas'); }
export function findRow_(id: any): { index: any; row: any } | null {
  if (!id) return null;
  const r = rows_().filter((x) => String(x.id) === String(id))[0];
  return r ? { index: r._row, row: r } : null;
}
export function updateRow_(index: any, patch: Record<string, any>) { updateTable_('Reservas', index, patch); }
