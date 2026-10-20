/* MAJOBELLA · Núcleo: estado compartido y utilidades de formato */
window.MJB = window.MJB || {};
(function (M) {
  const C = window.MAJOBELLA_CONFIG;
  const S = window.MAJOBELLA_SERVICES;

  M.config = C;
  M.services = S;
  M.serviceById = Object.fromEntries(S.map((s) => [s.id, s]));

  /* ---- Estado compartido (servicios elegidos, fecha y hora) ---- */
  const listeners = new Set();
  M.state = { selected: [], dateKey: null, time: null };
  M.on = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
  M.set = (patch, source) => {
    Object.assign(M.state, patch);
    listeners.forEach((fn) => fn(M.state, source));
  };
  M.toggleService = (id, source) => {
    const sel = M.state.selected.includes(id)
      ? M.state.selected.filter((x) => x !== id)
      : [...M.state.selected, id];
    M.set({ selected: sel, time: null }, source);
  };
  M.selectOnly = (ids, source) => M.set({ selected: [...ids], time: null }, source);
  /* Ir a reservar con estos servicios (y un código): en la página de reservas baja al formulario;
     en las demás páginas abre reservar.html?servicio=…&codigo=… */
  M.goBook = (ids, code, source) => {
    const list = (ids || []).filter((id) => M.serviceById[id]);
    if (document.getElementById('reservar') && M.applyBookingCode) {
      M.selectOnly(list, source);
      if (code) setTimeout(() => M.applyBookingCode(code), 50);
      M.scrollTo('#reservar');
      return;
    }
    const q = new URLSearchParams();
    if (list.length) q.set('servicio', list.join(','));
    if (code) q.set('codigo', code);
    location.href = 'reservar.html' + (String(q) ? '?' + q : '');
  };

  M.totals = (ids = M.state.selected) => {
    const items = ids.map((id) => M.serviceById[id]).filter(Boolean);
    return {
      items,
      price: items.reduce((a, s) => a + s.price, 0),
      minutes: items.reduce((a, s) => a + s.durationMinutes, 0),
      hasFrom: items.some((s) => s.priceFrom),
    };
  };

  /* ---- Formatos ---- */
  M.fmtPrice = (n) => `${C.currency.symbol} ${Math.round(n).toLocaleString(C.currency.locale)}`;
  M.fmtServicePrice = (s) => (s.priceFrom ? 'Desde ' : '') + M.fmtPrice(s.price);
  M.fmtDuration = (min) => {
    if (min < 60) return `${min} minutos`;
    const h = Math.floor(min / 60), m = min % 60;
    return `${h} ${h === 1 ? 'hora' : 'horas'}${m ? ` ${m} min` : ''}`;
  };
  M.fmtDurationShort = (min) => {
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60), m = min % 60;
    return `${h} h${m ? ` ${m} min` : ''}`;
  };
  M.fmtTime12 = (hhmm) => {
    let [h, m] = hhmm.split(':').map(Number);
    const ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${String(m).padStart(2, '0')} ${ap}`;
  };
  M.dateKey = (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  M.parseKey = (key) => { const [y, m, d] = key.split('-').map(Number); return { y, m: m - 1, d }; };
  const fmt = (opts) => new Intl.DateTimeFormat('es', { timeZone: 'UTC', ...opts });
  M.weekdayName = (key) => { const { y, m, d } = M.parseKey(key); const s = fmt({ weekday: 'long' }).format(Date.UTC(y, m, d)); return s.charAt(0).toUpperCase() + s.slice(1); };
  M.dayMonth = (key) => { const { y, m, d } = M.parseKey(key); return fmt({ day: 'numeric', month: 'long' }).format(Date.UTC(y, m, d)); };
  M.monthTitle = (y, m) => { const s = fmt({ month: 'long', year: 'numeric' }).format(Date.UTC(y, m, 1)); return s.charAt(0).toUpperCase() + s.slice(1); };

  /* Fecha y hora del estudio convertidas a un instante real (Date) */
  M.studioDate = (key, hhmm) => new Date(`${key}T${hhmm}:00${C.schedule.utcOffset}`);
  /* "Hoy" en la zona horaria del estudio */
  M.addDaysKey = (key, n) => { const [y, m, d] = key.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
  M.todayKey = () => {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: C.schedule.timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    return parts; // en-CA da AAAA-MM-DD
  };

  M.escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  M.reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  M.scrollTo = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - 72;
    window.scrollTo({ top, behavior: M.reduceMotion() ? 'auto' : 'smooth' });
  };
})(window.MJB);
