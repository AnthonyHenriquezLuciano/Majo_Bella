/* MAJOBELLA · El estudio en memoria: servicios, horario, promociones y horas ocupadas.
   Misma lógica que la web (booking-api.js): las horas posibles salen del horario y la duración,
   y se quitan las ocupadas que manda la API (GET ?action=busy). */
import { CONFIG, SERVICES } from './data';
import { addDaysKey, daysBetween, studioDate, todayKey, weekdayIndex } from './format';
import type { Catalog, DayStatus, Pricing, Promo, ScheduleConfig, ServiceInfo, Appointment } from './types';

const toMin = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const toHHMM = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

export interface Slot { time: string; busy: boolean }

export class Studio {
  schedule: ScheduleConfig;
  services: ServiceInfo[];
  byId: Record<string, ServiceInfo>;
  promos: Promo[] = [];
  payments = { ...CONFIG.payments, cancelHours: CONFIG.policies.changeHours };
  catalog: Catalog | null = null;
  busy: [number, number][] = [];
  busyAt = 0;

  constructor(cat?: Catalog | null) {
    this.schedule = { ...CONFIG.schedule, hours: { ...CONFIG.schedule.hours }, blockedDates: [...CONFIG.schedule.blockedDates] };
    this.services = SERVICES.map((s, i) => ({ ...s, order: i }));
    this.byId = Object.fromEntries(this.services.map((s) => [s.id, s]));
    if (cat) this.apply(cat);
  }

  /* Aplica el catálogo del estudio: precios, duraciones, servicios activos, horario y promociones */
  apply(cat: Catalog) {
    this.catalog = cat;
    const local = Object.fromEntries(SERVICES.map((s) => [s.id, s]));
    if (cat.services && cat.services.length) {
      this.services = cat.services.map((r, i) => {
        const base = local[r.id] || { id: r.id, category: r.name, name: r.name, description: '' };
        return { ...base, name: base.name || r.name, price: r.price, durationMinutes: r.durationMinutes, priceFrom: !!r.priceFrom, depositPercent: r.depositPercent, order: i } as ServiceInfo;
      });
      this.byId = Object.fromEntries(this.services.map((s) => [s.id, s]));
    }
    if (cat.payments) this.payments = { ...this.payments, ...cat.payments };
    const sc = cat.schedule || {};
    if (sc.hours) this.schedule.hours = sc.hours;
    if (Array.isArray(sc.blockedDates)) this.schedule.blockedDates = sc.blockedDates;
    (['minNoticeHours', 'maxDaysAhead', 'slotStepMinutes'] as const).forEach((k) => { if (sc[k]) this.schedule[k] = sc[k] as number; });
    this.promos = cat.promos || [];
    return this;
  }

  setBusy(list: { start: string; end: string }[]) {
    this.busy = list.map((b) => [new Date(b.start).getTime(), new Date(b.end).getTime()]);
    this.busyAt = Date.now();
  }

  /* ---- Servicios ---- */
  categories() { return [...new Set(this.services.map((s) => s.category))]; }
  totals(ids: string[]) {
    const items = ids.map((id) => this.byId[id]).filter(Boolean);
    return {
      items,
      price: items.reduce((a, s) => a + s.price, 0),
      minutes: items.reduce((a, s) => a + s.durationMinutes, 0),
      hasFrom: items.some((s) => s.priceFrom),
    };
  }

  /* ---- Horario ---- */
  hoursFor(key: string) { return this.schedule.hours[String(weekdayIndex(key))] || null; }
  /* Día abierto y dentro del rango de reserva (puede estar lleno) */
  isOpenDay(key: string) {
    if (this.schedule.blockedDates.includes(key)) return false;
    if (!this.hoursFor(key)) return false;
    const diff = daysBetween(todayKey(), key);
    if (diff < 0 || diff > this.schedule.maxDaysAhead) return false;
    return this.baseSlots(key, this.schedule.slotStepMinutes).length > 0;
  }
  /* Horas posibles según horario, duración y antelación mínima */
  baseSlots(key: string, minutes: number) {
    const hrs = this.hoursFor(key);
    if (!hrs) return [];
    const open = toMin(hrs.open), close = toMin(hrs.close);
    const earliest = Date.now() + this.schedule.minNoticeHours * 3600000;
    const out: string[] = [];
    for (let t = open; t + minutes <= close; t += this.schedule.slotStepMinutes) {
      const hhmm = toHHMM(t);
      if (studioDate(key, hhmm).getTime() >= earliest) out.push(hhmm);
    }
    return out;
  }
  isBusy(key: string, hhmm: string, minutes: number) {
    const s = studioDate(key, hhmm).getTime(), e = s + minutes * 60000;
    return this.busy.some(([bs, be]) => s < be && e > bs);
  }
  dayStatus(key: string, minutes: number): DayStatus {
    if (!this.isOpenDay(key)) return 'closed';
    const m = minutes || this.schedule.slotStepMinutes;
    const base = this.baseSlots(key, m);
    if (!base.length) return 'full';
    if (!this.busyAt) return 'unknown';
    return base.some((t) => !this.isBusy(key, t, m)) ? 'open' : 'full';
  }
  slots(key: string, minutes: number): Slot[] {
    return this.baseSlots(key, minutes).map((time) => ({ time, busy: this.isBusy(key, time, minutes) }));
  }
  /* Horas libres para cambiar una cita (su propio horario no cuenta como ocupado) */
  slotsFor(a: Pick<Appointment, 'start' | 'end' | 'date' | 'time' | 'durationMinutes'>, key: string) {
    const minutes = a.durationMinutes || 30;
    const own = [new Date(a.start).getTime(), new Date(a.end).getTime()];
    return this.baseSlots(key, minutes).filter((t) => {
      const s = studioDate(key, t).getTime(), e = s + minutes * 60000;
      return !this.busy.some(([bs, be]) => !(bs === own[0] && be === own[1]) && s < be && e > bs);
    }).filter((t) => !(key === a.date && t === a.time));
  }
  /* Próximos días abiertos (i = días desde hoy) */
  nextOpenDays(n: number) {
    const out: { key: string; i: number }[] = [];
    const t0 = todayKey();
    for (let i = 0; i <= this.schedule.maxDaysAhead && out.length < n; i++) {
      const key = addDaysKey(t0, i);
      if (this.isOpenDay(key)) out.push({ key, i });
    }
    return out;
  }
  /* Primera hora libre en los próximos días abiertos */
  firstFree(minutes: number, days = 21) {
    for (const d of this.nextOpenDays(days)) {
      const free = this.slots(d.key, minutes).find((s) => !s.busy);
      if (free) return { key: d.key, time: free.time, i: d.i };
    }
    return null;
  }
  /* Días del mes para el calendario: null = fuera del mes */
  monthGrid(y: number, m: number) {
    const first = new Date(Date.UTC(y, m, 1)).getUTCDay();
    const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const cells: (string | null)[] = Array(first).fill(null);
    for (let d = 1; d <= days; d++) cells.push(`${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    while (cells.length % 7) cells.push(null);
    return cells;
  }

  /* ---- Precio: promociones automáticas y depósito (el backend calcula el definitivo) ---- */
  promoFor(id: string) {
    const s = this.byId[id];
    if (!s) return null;
    let best: (Promo & { discount: number }) | null = null, bestValue = 0;
    this.promos.forEach((p) => {
      if (!(p.services || []).includes('todos') && !(p.services || []).includes(id)) return;
      const v = p.kind === 'monto' ? Math.min(s.price, Math.round(p.value)) : Math.round(s.price * Math.min(100, p.value) / 100);
      if (v > bestValue) { bestValue = v; best = { ...p, discount: v }; }
    });
    return best as (Promo & { discount: number }) | null;
  }
  depositPct(s?: ServiceInfo) { return s && s.depositPercent != null && (s.depositPercent as unknown) !== '' ? Number(s.depositPercent) : this.payments.depositPercent; }
  depositRatio(items: ServiceInfo[]) {
    const base = items.reduce((t, s) => t + s.price, 0);
    if (!items.length) return this.payments.depositPercent / 100;
    if (!base) return this.depositPct(items[0]) / 100;
    return items.reduce((t, s) => t + s.price * this.depositPct(s), 0) / base / 100;
  }
  depositPctLabel(items: ServiceInfo[]) {
    const set = [...new Set(items.map((s) => this.depositPct(s)))];
    return set.length === 1 ? `${set[0]}%` : null;
  }
  deposit(totalRD: number, items: ServiceInfo[]) {
    const ratio = items.length ? this.depositRatio(items) : this.payments.depositPercent / 100;
    const depositRD = Math.round(totalRD * ratio);
    const depositUSD = Math.ceil((depositRD / this.payments.usdRate) * 100) / 100;
    return { depositRD, depositUSD, balanceRD: totalRD - depositRD };
  }
  pricing(ids: string[]): Pricing {
    const items = ids.map((id) => this.byId[id]).filter(Boolean);
    const subtotal = items.reduce((t, s) => t + s.price, 0);
    const discount = Math.min(subtotal, items.reduce((t, s) => { const p = this.promoFor(s.id); return t + (p ? p.discount : 0); }, 0));
    const total = subtotal - discount;
    const dep = this.deposit(total, items);
    const promo = items.map((s) => this.promoFor(s.id)).find(Boolean);
    return { subtotalRD: subtotal, discountRD: discount, totalRD: total, promoName: promo ? promo.name : '', giftAppliedRD: 0, depositRD: dep.depositRD, depositUSD: dep.depositUSD, balanceRD: dep.balanceRD };
  }
}
