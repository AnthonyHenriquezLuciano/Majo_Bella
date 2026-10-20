/* MAJOBELLA · Formatos (iguales a los de la web, sin depender de Intl: funcionan igual en cualquier celular) */
import { CONFIG } from './data';

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];
const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const DAYS_SHORT = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/* 2500 → "2,500" */
export const thousands = (n: number) => String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
export const fmtPrice = (n: number) => `${CONFIG.currency.symbol} ${n < 0 ? '−' : ''}${thousands(n)}`;
export const fmtServicePrice = (s: { price: number; priceFrom?: boolean }) => (s.priceFrom ? 'Desde ' : '') + fmtPrice(s.price);
export const fmtUSD = (n: number | string) => `US$ ${Number(n).toFixed(2)}`;
export const fmtDuration = (min: number) => {
  if (min < 60) return `${min} minutos`;
  const h = Math.floor(min / 60), m = min % 60;
  return `${h} ${h === 1 ? 'hora' : 'horas'}${m ? ` ${m} min` : ''}`;
};
export const fmtDurationShort = (min: number) => {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
};
export const fmtTime12 = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

/* ---- Fechas del estudio (República Dominicana: UTC−4 todo el año) ---- */
const OFFSET_MIN = (() => { const m = CONFIG.schedule.utcOffset.match(/([+-])(\d{2}):(\d{2})/); return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : -240; })();
export const dateKey = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
export const parseKey = (key: string) => { const [y, m, d] = key.split('-').map(Number); return { y, m: m - 1, d }; };
/* Fecha AAAA-MM-DD en el estudio para un instante */
export const keyAt = (t: number | Date) => new Date(Number(t) + OFFSET_MIN * 60000).toISOString().slice(0, 10);
export const todayKey = () => keyAt(Date.now());
export const addDaysKey = (key: string, n: number) => { const { y, m, d } = parseKey(key); return new Date(Date.UTC(y, m, d + n)).toISOString().slice(0, 10); };
export const daysBetween = (a: string, b: string) => { const x = parseKey(a), y = parseKey(b); return Math.round((Date.UTC(y.y, y.m, y.d) - Date.UTC(x.y, x.m, x.d)) / 86400000); };
export const weekdayIndex = (key: string) => { const { y, m, d } = parseKey(key); return new Date(Date.UTC(y, m, d)).getUTCDay(); };
export const studioDate = (key: string, hhmm: string) => new Date(`${key}T${hhmm}:00${CONFIG.schedule.utcOffset}`);
/* Hora HH:MM en el estudio para un instante */
export const timeAt = (t: number | Date | string) => new Date(new Date(t as any).getTime() + OFFSET_MIN * 60000).toISOString().slice(11, 16);

export const weekdayName = (key: string) => cap(DAYS[weekdayIndex(key)]);
export const weekdayShort = (key: string) => cap(DAYS_SHORT[weekdayIndex(key)]);
export const dayMonth = (key: string) => { const { m, d } = parseKey(key); return `${d} de ${MONTHS[m]}`; };
export const dayMonthShort = (key: string) => { const { m, d } = parseKey(key); return `${d} ${MONTHS_SHORT[m]}`; };
export const monthName = (m: number) => cap(MONTHS[m]);
export const longDate = (key: string) => { const { y, m, d } = parseKey(key); return `${d} de ${MONTHS[m]} de ${y}`; };
/* "Martes 21 de octubre · 10:00 AM" */
export const whenText = (key: string, hhmm?: string) => `${weekdayName(key)} ${dayMonth(key)}${hhmm ? ` · ${fmtTime12(hhmm)}` : ''}`;
/* "Hoy", "Mañana" o "Martes 21 de octubre" */
export const relativeDay = (key: string) => {
  const diff = daysBetween(todayKey(), key);
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Mañana';
  return `${weekdayName(key)} ${dayMonth(key)}`;
};
/* "2026-03-14" (cumpleaños MM-DD) → "14 de marzo" */
export const birthdayText = (mmdd: string) => { const [m, d] = mmdd.split('-').map(Number); return m && d ? `${d} de ${MONTHS[m - 1]}` : ''; };
export const MONTH_NAMES = MONTHS.map(cap);

/* "Ana María Pérez" → "Ana" */
export const firstName = (name: string) => String(name || '').trim().split(/\s+/)[0] || '';
/* Enlace de WhatsApp del estudio */
export const whatsappUrl = (text?: string, number = CONFIG.whatsapp.number) => `https://wa.me/${number}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
