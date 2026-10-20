/* MAJOBELLA · Utilidades sin estado (fechas, textos, montos, validación de datos de clientas) */
import { createHash, randomUUID } from 'node:crypto';
import { TZ, NAME_PARTICLES, PHONE_ERROR, EMAIL_RE, NAME_RE } from './constants.ts';

export const uuid = () => randomUUID();
export function hash_(text: any) { return createHash('sha256').update(String(text), 'utf8').digest('hex'); }

/* Fecha con formato en una zona horaria (equivalente a Utilities.formatDate de Apps Script).
   Patrones usados: yyMMdd, yyyy-MM-dd, H, HH:mm, yyyy-MM-dd HH:mm, d/M/yyyy, h:mm a */
export function fmtDate(d: Date, tz: string, pattern: string): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d).map((x) => [x.type, x.value]));
  const H = Number(p.hour), h12 = (H % 12) || 12;
  const map: Record<string, string> = {
    yyyy: p.year, yy: p.year.slice(2), MM: p.month, M: String(Number(p.month)), dd: p.day, d: String(Number(p.day)),
    HH: p.hour, H: String(H), hh: String(h12).padStart(2, '0'), h: String(h12), mm: p.minute, a: H < 12 ? 'AM' : 'PM',
  };
  return pattern.replace(/yyyy|yy|MM|M|dd|d|HH|H|hh|h|mm|a/g, (t) => map[t]);
}

export function todayKey_() { return fmtDate(new Date(), TZ, 'yyyy-MM-dd'); }
export function addDaysKey_(key: string, n: number) {
  const p = String(key).split('-').map(Number);
  return new Date(Date.UTC(p[0], p[1] - 1, p[2] + n)).toISOString().slice(0, 10);
}
export function longDate_(key: string) {
  const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const p = String(key).split('-').map(Number);
  return p[2] + ' de ' + months[p[1] - 1] + ' de ' + p[0];
}
export function time12_(hhmm: string) {
  const t = String(hhmm).split(':').map(Number);
  return ((t[0] % 12) || 12) + ':' + ('0' + (t[1] || 0)).slice(-2) + (t[0] < 12 ? ' a. m.' : ' p. m.');
}
export function whenText_(r: any) {
  const days = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const p = String(r.fecha).split('-').map(Number);
  const dow = new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay();
  return days[dow] + ' ' + p[2] + ' de ' + months[p[1] - 1] + ', ' + time12_(r.hora || '00:00');
}

/* Acepta "MM-DD", "AAAA-MM-DD" o "DD/MM" y devuelve "MM-DD" */
export function monthDay_(v: any) {
  const t = String(v == null ? '' : v).trim();
  const valid = (mo: number, d: number) => (mo >= 1 && mo <= 12 && d >= 1 && d <= 31 ? ('0' + mo).slice(-2) + '-' + ('0' + d).slice(-2) : '');
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return m[2] + '-' + m[3];
  m = t.match(/^(\d{1,2})-(\d{1,2})$/);
  if (m) return valid(Number(m[1]), Number(m[2]));
  m = t.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (m) return valid(Number(m[2]), Number(m[1]));
  return '';
}

export function on_(v: any) { return /^s[ií]$/i.test(String(v == null ? '' : v).trim()); }
export function usd_(rd: any, rate: number) { return Math.ceil((Number(rd) / rate) * 100) / 100; }
export function num_(v: any, def: number) { const n = Number(String(v == null ? '' : v).replace(',', '.')); return isFinite(n) && n > 0 ? n : def; }
export function money_(n: any) { return Math.round(Number(n) || 0).toLocaleString('en-US'); }
export function pad_(h: any) { return ('0' + h).slice(-2); }
export function toMin_(hhmm: string) { const p = hhmm.split(':').map(Number); return p[0] * 60 + p[1]; }
export function isDateKey_(k: any) { return /^\d{4}-\d{2}-\d{2}$/.test(String(k || '')); }
export function clean_(v: any, max: number) { return String(v == null ? '' : v).replace(/[\u0000-\u0009\u000b-\u001f]/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, max); }
export function esc_(t: any) { return String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as any)[c]); }
export function safeJson_(t: any, def: any) { try { return JSON.parse(t); } catch (e) { return def; } }
export function msg_(err: any) { return String((err && err.message) || err); }
export function pctOrNull_(v: any) { const t = String(v == null ? '' : v).trim(); if (t === '') return null; const n = Number(t.replace(',', '.')); return isFinite(n) ? Math.max(0, Math.min(100, n)) : null; }
export function depositRatio_(items: any[], fallbackPct: number) {
  const base = items.reduce((t, x) => t + x.price, 0);
  if (!base) return (items.length ? (items[0].depositPercent == null ? fallbackPct : items[0].depositPercent) : fallbackPct) / 100;
  return items.reduce((t, x) => t + x.price * (x.depositPercent == null ? fallbackPct : x.depositPercent), 0) / base / 100;
}
export function normCode_(c: any) { return String(c || '').toUpperCase().replace(/[^A-Z0-9-]/g, ''); }
export function randCode_(n: number) { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = ''; for (let i = 0; i < n; i++) s += a.charAt(Math.floor(Math.random() * a.length)); return s; }
export function slug_(t: any) { return String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || ('servicio-' + Date.now()); }
export function firstName_(n: any) { return String(n || '').trim().split(/\s+/)[0] || ''; }
export function plainText_(html: string) {
  return String(html).replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|h1|tr|div)>/gi, '\n').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/[ \t]+/g, ' ').replace(/\n\s*\n\s*/g, '\n\n').trim();
}
export function strip_(o: any) { const c: any = {}; Object.keys(o).forEach((k) => { if (k !== '_row' && k !== 'tokenHash') c[k] = o[k]; }); return c; }

/* Identificador de una clienta: su correo o, si no tiene, su teléfono */
export function clientKey_(email: any, phone: any, name: any) {
  const e = String(email || '').trim().toLowerCase();
  if (e) return 'e:' + e;
  const t = String(phone || '').replace(/\D/g, '').slice(-10);
  if (t) return 't:' + t;
  return 'n:' + String(name || '').trim().toLowerCase();
}

/* "maría JOSÉ de la cruz" → "María José de la Cruz" */
export function properName_(v: any) {
  const words = String(v == null ? '' : v).replace(/\s+/g, ' ').trim().toLocaleLowerCase('es').split(' ').filter(Boolean);
  return words.map((w, i) => {
    if (i > 0 && NAME_PARTICLES.indexOf(w) >= 0) return w;
    return w.split('-').map((part) => part.split("'").map((x) => (x ? x.charAt(0).toLocaleUpperCase('es') + x.slice(1) : x)).join("'")).join('-');
  }).join(' ');
}
/* Teléfono: 10 dígitos (809/829/849 → 809-555-1234), +1 de EE. UU./Canadá, u otro país empezando con + */
export function normPhone_(v: any): { ok: boolean; value?: string } {
  const raw = String(v == null ? '' : v).trim();
  if (!raw) return { ok: true, value: '' };
  let d = raw.replace(/\D/g, '');
  if (raw.charAt(0) === '+' && d.charAt(0) !== '1') return d.length >= 8 && d.length <= 15 ? { ok: true, value: '+' + d } : { ok: false };
  if (d.length === 11 && d.charAt(0) === '1') d = d.slice(1);
  if (d.length !== 10) return { ok: false };
  const f = d.slice(0, 3) + '-' + d.slice(3, 6) + '-' + d.slice(6);
  return { ok: true, value: /^(809|829|849)/.test(d) ? f : '+1 ' + f };
}
/* Valida y deja con el mismo formato los datos de una clienta.
   strict (web y app): nombre y apellido, teléfono y correo obligatorios. Sin strict (panel): solo el nombre. */
export function client_(c: any, strict: boolean): any {
  c = c || {};
  const first = clean_(c.firstName, 60), last = clean_(c.lastName, 60);
  const full = clean_(first || last ? first + ' ' + last : c.name, 90).replace(/\s+/g, ' ');
  if (full.length < 2) return { ok: false, error: strict ? 'Escribe tu nombre y tu apellido.' : 'Escribe el nombre de la clienta.' };
  if (!NAME_RE.test(full)) return { ok: false, error: 'El nombre y el apellido solo pueden tener letras.' };
  if (strict) {
    const parts = first || last ? [first, last] : [full.split(' ')[0], full.split(' ').slice(1).join(' ')];
    if (parts[0].replace(/[^\p{L}]/gu, '').length < 2) return { ok: false, error: 'Escribe tu nombre (al menos 2 letras).' };
    if (parts[1].replace(/[^\p{L}]/gu, '').length < 2) return { ok: false, error: 'Escribe también tu apellido.' };
  }
  const ph = normPhone_(c.phone);
  if (!ph.ok || (strict && !ph.value)) return { ok: false, error: ph.ok ? 'Escribe tu teléfono.' : PHONE_ERROR };
  const email = clean_(c.email, 120).toLowerCase();
  if (strict && !email) return { ok: false, error: 'Escribe tu correo.' };
  if (email && !EMAIL_RE.test(email)) return { ok: false, error: 'Revisa el correo: parece incompleto (ejemplo: nombre@gmail.com).' };
  return { ok: true, name: properName_(full), phone: ph.value, email, notes: clean_(c.notes, 300) };
}

/* Base64 ↔ bytes (Deno y Node) */
export function b64ToBytes(b64: string): Uint8Array {
  const s = String(b64 || '').replace(/^data:[^,]*,/, '').replace(/\s/g, '');
  try { const bin = atob(s); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; } catch (e) { return new Uint8Array(0); }
}
export function bytesToB64(bytes: Uint8Array): string {
  let bin = ''; const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CH)));
  return btoa(bin);
}
