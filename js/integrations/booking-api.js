/* MAJOBELLA · Agenda, disponibilidad y pagos (backend de Google Apps Script + Google Sheets)
   Sin backend (config.booking.apiUrl vacío):
     - las horas se calculan con el horario de config.schedule y no se conocen las reservas ya hechas.
   Con backend (apiUrl definido):
     GET  ?action=catalog                       → precios, duración, tasa del dólar y horario desde la hoja
     GET  ?action=busy&from=AAAA-MM-DD&to=…     → { busy: [{ start, end }] } horarios ocupados (sin datos personales)
     POST { action: 'hold', … }                 → aparta el horario y crea la orden de PayPal del depósito
     POST { action: 'capture', id, orderId }    → cobra el depósito y confirma la cita
     POST { action: 'release', id, token }      → libera el horario si no se pagó
     POST { action: 'cancel', id, token|idToken }
     POST { action: 'balanceOrder' | 'balanceCapture', id, token|idToken, orderId }
     POST { action: 'myAppointments', idToken } · { action: 'lookup', items: [{ id, token }] }
   Implementado en backend/google-apps-script/Code.gs */
(function (M) {
  const SCH = M.config.schedule;
  const API = M.config.booking;
  const BUSY_TTL = 90 * 1000;

  const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
  const toHHMM = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
  const addDays = (key, n) => { const { y, m, d } = M.parseKey(key); const t = new Date(Date.UTC(y, m, d + n)); return M.dateKey(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()); };

  M.Schedule = {
    hoursFor(key) {
      const { y, m, d } = M.parseKey(key);
      const dow = new Date(Date.UTC(y, m, d)).getUTCDay();
      return SCH.hours[dow] || null;
    },

    /* Día abierto y dentro del rango de reserva (puede estar lleno) */
    isOpenDay(key) {
      if (SCH.blockedDates.includes(key)) return false;
      if (!this.hoursFor(key)) return false;
      const today = M.todayKey();
      if (key < today) return false;
      const { y, m, d } = M.parseKey(key);
      const t = M.parseKey(today);
      const diff = (Date.UTC(y, m, d) - Date.UTC(t.y, t.m, t.d)) / 86400000;
      if (diff > SCH.maxDaysAhead) return false;
      return this.baseSlots(key, SCH.slotStepMinutes).length > 0;
    },
    isBookableDay(key) { return this.isOpenDay(key); },

    /* Horas posibles según horario, duración y antelación mínima */
    baseSlots(key, durationMinutes) {
      const hrs = this.hoursFor(key);
      if (!hrs) return [];
      const open = toMin(hrs.open), close = toMin(hrs.close);
      const earliest = Date.now() + SCH.minNoticeHours * 3600000;
      const out = [];
      for (let t = open; t + durationMinutes <= close; t += SCH.slotStepMinutes) {
        const hhmm = toHHMM(t);
        if (M.studioDate(key, hhmm).getTime() >= earliest) out.push(hhmm);
      }
      return out;
    },
  };

  /* Horarios ocupados en memoria (toda la ventana de reserva en una sola consulta) */
  const busyCache = { at: 0, list: [], pending: null, error: null };
  const busyListeners = new Set();

  M.BookingAPI = {
    enabled() { return !!(API.apiUrl && API.apiUrl.trim()); },
    url(params) { return `${API.apiUrl}${API.apiUrl.includes('?') ? '&' : '?'}${new URLSearchParams(params)}`; },

    async get(params) {
      const res = await fetch(this.url(params), { method: 'GET' });
      const data = await res.json().catch(() => ({ ok: false, error: 'Respuesta no válida del servidor.' }));
      if (!res.ok || data.ok === false) throw new Error(data.error || `Error ${res.status}`);
      return data;
    },

    /* Envío POST (text/plain evita la petición previa CORS con Google Apps Script) */
    async post(body, fallbackError) {
      if (!this.enabled()) throw new Error('No hay backend configurado.');
      let res;
      try {
        res = await fetch(API.apiUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) });
      } catch (e) { throw new Error('Sin conexión. Revisa tu internet e intenta de nuevo.'); }
      const data = await res.json().catch(() => ({ ok: false, error: 'Respuesta no válida del servidor.' }));
      if (!res.ok || !data.ok) { const err = new Error(data.error || fallbackError); err.data = data; throw err; }
      return data;
    },

    /* Precios, duraciones, tasa y horario desde la hoja de MAJOBELLA */
    async loadCatalog() {
      if (!this.enabled()) return false;
      const data = await this.get({ action: 'catalog' });
      (data.services || []).forEach((r) => {
        const s = M.serviceById[r.id];
        if (s) { s.price = r.price; s.durationMinutes = r.durationMinutes; s.priceFrom = !!r.priceFrom; }
      });
      if (data.payments) Object.assign(M.config.payments, data.payments);
      if (data.schedule) {
        const sc = data.schedule;
        if (sc.hours) SCH.hours = sc.hours;
        if (Array.isArray(sc.blockedDates)) SCH.blockedDates = sc.blockedDates;
        ['minNoticeHours', 'maxDaysAhead', 'slotStepMinutes'].forEach((k) => { if (sc[k]) SCH[k] = sc[k]; });
      }
      if (data.payments && data.payments.cancelHours) M.config.policies.changeHours = data.payments.cancelHours;
      return true;
    },

    onBusy(fn) { busyListeners.add(fn); return () => busyListeners.delete(fn); },
    busyReady() { return !this.enabled() || busyCache.at > 0; },
    busyError() { return busyCache.error; },

    /* Descarga los horarios ocupados de hoy hasta el final de la ventana de reserva */
    async refreshBusy(force) {
      if (!this.enabled()) return [];
      if (!force && busyCache.at && Date.now() - busyCache.at < BUSY_TTL) return busyCache.list;
      if (busyCache.pending) return busyCache.pending;
      const from = M.todayKey(), to = addDays(from, SCH.maxDaysAhead + 1);
      busyCache.pending = this.get({ action: 'busy', from, to })
        .then((data) => {
          busyCache.list = (data.busy || []).map((b) => [new Date(b.start).getTime(), new Date(b.end).getTime()]);
          busyCache.at = Date.now(); busyCache.error = null;
          busyListeners.forEach((fn) => fn());
          return busyCache.list;
        })
        .catch((err) => { busyCache.error = err.message; busyListeners.forEach((fn) => fn()); throw err; })
        .finally(() => { busyCache.pending = null; });
      return busyCache.pending;
    },

    isBusy(key, hhmm, minutes) {
      const s = M.studioDate(key, hhmm).getTime();
      const e = s + minutes * 60000;
      return busyCache.list.some(([bs, be]) => s < be && e > bs);
    },

    /* Estado del día para la duración elegida: 'closed' | 'full' | 'open' | 'unknown' */
    dayStatus(key, minutes) {
      if (!M.Schedule.isOpenDay(key)) return 'closed';
      const base = M.Schedule.baseSlots(key, minutes || SCH.slotStepMinutes);
      if (!base.length) return 'full';
      if (!this.enabled()) return 'open';
      if (!busyCache.at) return 'unknown';
      return base.some((t) => !this.isBusy(key, t, minutes || SCH.slotStepMinutes)) ? 'open' : 'full';
    },

    /* { slots: ['10:00', …] libres, all: [{ time, busy }] } */
    async availability(key, durationMinutes) {
      const base = M.Schedule.baseSlots(key, durationMinutes);
      if (!this.enabled()) return { slots: base, all: base.map((time) => ({ time, busy: false })), source: 'schedule' };
      await this.refreshBusy();
      const all = base.map((time) => ({ time, busy: this.isBusy(key, time, durationMinutes) }));
      return { slots: all.filter((x) => !x.busy).map((x) => x.time), all, source: 'agenda' };
    },

    /* ---- Reserva con depósito ---- */
    hold(appointment, idToken) {
      return this.post({
        action: 'hold',
        services: appointment.services.map((s) => s.id),
        date: appointment.date, time: appointment.time,
        client: appointment.client, idToken: idToken || null,
      }, 'No se pudo apartar el horario.');
    },
    capture(id, orderId) { return this.post({ action: 'capture', id, orderId }, 'No se pudo confirmar el pago.'); },
    release(id, token) { return this.post({ action: 'release', id, token }, '').catch(() => null); },

    /* ---- Citas ---- */
    async myAppointments(idToken) {
      const data = await this.post({ action: 'myAppointments', idToken }, 'No se pudieron cargar tus citas.');
      return data.items || [];
    },
    async lookup(items) {
      if (!items.length) return [];
      const data = await this.post({ action: 'lookup', items }, 'No se pudieron actualizar tus citas.');
      return data.items || [];
    },
    cancel(id, auth) { return this.post({ action: 'cancel', id, ...auth }, 'No se pudo cancelar la cita.'); },
    balanceOrder(id, auth) { return this.post({ action: 'balanceOrder', id, ...auth }, 'No se pudo preparar el pago.'); },
    balanceCapture(id, orderId, auth) { return this.post({ action: 'balanceCapture', id, orderId, ...auth }, 'No se pudo confirmar el pago.'); },
  };

  /* Montos del depósito (se muestran antes de pagar; el backend calcula los definitivos) */
  M.deposit = function (totalRD) {
    const P = M.config.payments;
    const depositRD = Math.round(totalRD * (P.depositPercent / 100));
    const depositUSD = Math.ceil((depositRD / P.usdRate) * 100) / 100;
    return { depositRD, depositUSD, balanceRD: totalRD - depositRD };
  };
  M.fmtUSD = (n) => `US$ ${Number(n).toFixed(2)}`;
})(window.MJB);
