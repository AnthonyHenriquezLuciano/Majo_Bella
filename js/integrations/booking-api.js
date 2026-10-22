/* MAJOBELLA · Agenda, disponibilidad y pagos (backend Supabase PostgreSQL)
   Sin backend (config.booking.apiUrl vacío):
     - las horas se calculan con el horario de config.schedule y no se conocen las reservas ya hechas.
   Con backend (apiUrl definido):
     GET  ?action=catalog                       → precios, duración, tasa del dólar y horario desde Supabase
     GET  ?action=busy&from=AAAA-MM-DD&to=…     → { busy: [{ start, end }] } horarios ocupados (sin datos personales)
     POST { action: 'hold', … }                 → aparta el horario y crea la orden de PayPal del depósito
     POST { action: 'capture', id, orderId }    → cobra el depósito y confirma la cita
     POST { action: 'release', id, token }      → libera el horario si no se pagó
     POST { action: 'cancel', id, token|idToken }
     POST { action: 'balanceOrder' | 'balanceCapture', id, token|idToken, orderId }
     POST { action: 'myAppointments', idToken } · { action: 'lookup', items: [{ id, token }] }
     POST { action: 'hold', method: 'transferencia' } → aparta el horario; luego 'transferProof' con el comprobante
     POST { action: 'reschedule', id, token|idToken, date, time } · { action: 'myWallet', idToken } · { action: 'walletEmail', email }
   Implementado en supabase/functions/_shared/core/api.ts */
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

  /* Copia local del catálogo (para mostrar la web y la app al instante) */
  // Separa las cachés por servidor: no utilizar precios ni pagos de Apps Script al cambiar a Supabase.
  const CAT_KEY = 'mjb.catalog.v3:' + encodeURIComponent(String(API.apiUrl || '').trim());
  const catalogListeners = new Set();
  let refreshing = null, catalogAt = 0, applied = false;
  const catalogSig = (d) => { const c = Object.assign({}, d); delete c.cached; return JSON.stringify(c); };
  function readCatalog() {
    try {
      const o = JSON.parse(localStorage.getItem(CAT_KEY));
      return o && o.data && Date.now() - o.at < 7 * 86400000 ? o : null;
    } catch (e) { return null; }
  }
  function saveCatalog(data) { try { localStorage.setItem(CAT_KEY, JSON.stringify({ at: Date.now(), sig: catalogSig(data), data })); } catch (e) { /* sin espacio */ } }
  // Al volver a la pestaña después de un rato, se revisa si el estudio cambió algo
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && M.BookingAPI && M.BookingAPI.catalogAge() > 120000) M.BookingAPI.refreshCatalog();
  });

  /* Horarios ocupados en memoria (toda la ventana de reserva en una sola consulta) */
  const busyCache = { at: 0, list: [], pending: null, error: null };
  const busyListeners = new Set();

  /* Identificador anónimo del dispositivo (para limitar intentos con códigos equivocados) */
  M.deviceId = () => {
    try {
      let id = localStorage.getItem('mjb.device.v1');
      if (!id) { id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`; localStorage.setItem('mjb.device.v1', id); }
      return id;
    } catch (e) { return ''; }
  };

  M.BookingAPI = {
    enabled() { return !!(API.apiUrl && API.apiUrl.trim()); },
    url(params) { return `${API.apiUrl}${API.apiUrl.includes('?') ? '&' : '?'}${new URLSearchParams(params)}`; },

    async get(params) {
      let res;
      try { res = await fetch(this.url(params), { method: 'GET', cache: 'no-store' }); }
      catch (e) { throw new Error('sin conexión con el servidor de reservas'); }
      const data = await res.json().catch(() => ({ ok: false, error: 'el servidor no respondió con datos (revisa que la implementación tenga acceso "Cualquier usuario")' }));
      if (!res.ok || data.ok === false) throw new Error(data.error || `Error ${res.status}`);
      return data;
    },

    /* Envío POST JSON; el backend Supabase acepta text/plain por compatibilidad. */
    async post(body, fallbackError) {
      if (!this.enabled()) throw new Error('No hay backend configurado.');
      let res;
      try {
        res = await fetch(API.apiUrl, { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(Object.assign({ device: M.deviceId() }, body)) });
      } catch (e) { throw new Error('Sin conexión. Revisa tu internet e intenta de nuevo.'); }
      const data = await res.json().catch(() => ({ ok: false, error: 'Respuesta no válida del servidor.' }));
      if (!res.ok || !data.ok) { const err = new Error(data.error || fallbackError); err.data = data; throw err; }
      return data;
    },

    /* Precios, duraciones, tasa y horario desde Supabase.
       Con una copia guardada se muestra al instante y se actualiza por detrás; si cambió algo, avisa con onCatalogChange. */
    async loadCatalog() {
      if (!this.enabled()) return false;
      const saved = readCatalog();
      if (saved) {
        this.applyCatalog(saved.data);
        this.refreshCatalog();
        return 'cache';
      }
      const data = await this.get({ action: 'catalog' });
      this.applyCatalog(data);
      saveCatalog(data);
      catalogAt = Date.now();
      return 'network';
    },
    /* Pide el catálogo fresco; si es distinto al que se está mostrando, lo aplica y avisa */
    async refreshCatalog() {
      if (!this.enabled() || refreshing) return refreshing;
      refreshing = (async () => {
        try {
          const data = await this.get({ action: 'catalog' });
          catalogAt = Date.now();
          const before = (readCatalog() || {}).sig;
          saveCatalog(data);
          if (catalogSig(data) !== before || !applied) {
            this.applyCatalog(data);
            catalogListeners.forEach((fn) => { try { fn(data); } catch (e) { console.error(e); } });
          }
        } catch (e) { /* sin conexión: queda la copia */ }
        finally { refreshing = null; }
      })();
      return refreshing;
    },
    onCatalogChange(fn) { catalogListeners.add(fn); return () => catalogListeners.delete(fn); },
    catalogAge() { return catalogAt ? Date.now() - catalogAt : Infinity; },

    applyCatalog(data) {
      applied = true;
      M.serviceCategories = data.categories || [];
      M.serviceGroups = data.serviceGroups || [];
      M.consentTemplates = data.consentTemplates || [];
      M.membershipPlans = data.membershipPlans || [];
      (data.services || []).forEach((r) => {
        const s = M.serviceById[r.id];
        if (s) {
          s.name = r.name; s.category = r.category || s.category;
          s.categoryId = r.categoryId || ''; s.parentId = r.parentId || '';
          s.description = r.description === undefined ? s.description : r.description;
          s.price = r.price; s.durationMinutes = r.durationMinutes;
          s.priceFrom = !!r.priceFrom; s.depositPercent = r.depositPercent; s.consentTemplateId = r.consentTemplateId || '';
        }
      });
      if (data.payments) Object.assign(M.config.payments, data.payments);
      if (data.schedule) {
        const sc = data.schedule;
        if (sc.hours) SCH.hours = sc.hours;
        if (Array.isArray(sc.blockedDates)) SCH.blockedDates = sc.blockedDates;
        ['minNoticeHours', 'maxDaysAhead', 'slotStepMinutes'].forEach((k) => { if (sc[k]) SCH[k] = sc[k]; });
      }
      if (data.payments && data.payments.cancelHours) M.config.policies.changeHours = data.payments.cancelHours;
      // La API es la fuente de verdad; reactivar un servicio lo devuelve al catálogo.
      // Se conserva serviceById para consultar el nombre de citas antiguas.
      if (Array.isArray(data.services)) {
        M.services.length = 0;
        data.services.forEach((r, i) => {
          let s = M.serviceById[r.id];
          if (!s) {
            s = { id: r.id, name: r.name, category: r.category || r.name,
              categoryId: r.categoryId || '', parentId: r.parentId || '',
              description: r.description || '', durationMinutes: r.durationMinutes, price: r.price,
              priceFrom: !!r.priceFrom, depositPercent: r.depositPercent, consentTemplateId: r.consentTemplateId || '' };
            M.serviceById[s.id] = s;
          }
          s.name = r.name; s.category = r.category || s.category; s.categoryId = r.categoryId || '';
          s.parentId = r.parentId || ''; s.description = r.description === undefined ? s.description : r.description;
          s.price = r.price; s.durationMinutes = r.durationMinutes; s.priceFrom = !!r.priceFrom;
          s.depositPercent = r.depositPercent; s.consentTemplateId = r.consentTemplateId || ''; s.order = r.order ?? i;
          M.services.push(s);
        });
      }
      M.promos = data.promos || [];
      M.site = Object.assign(M.site || {}, data.site || {}, {
        gallery: data.gallery || [], reviews: data.reviews || [], giftShop: data.giftShop || null, packages: data.packages || [], loaded: true,
      });
      M.loyalty = data.loyalty || { enabled: false };
      M.waitlistInfo = data.waitlist || { enabled: false };
      M.transfer = data.transfer || { enabled: false, accounts: [] };
      M.rescheduleInfo = data.reschedule || { max: 1 };
      M.security = data.security || {};
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
        .catch((err) => {
          // Sin una lectura válida del servidor no se deben anunciar horas como libres.
          // Descartar datos anteriores para evitar disponibilidad obsoleta tras un fallo.
          busyCache.at = 0;
          busyCache.list = [];
          busyCache.error = err.message;
          busyListeners.forEach((fn) => fn());
          throw err;
        })
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

    /* Horas libres para cambiar una cita (su propio horario no cuenta como ocupado) */
    async availabilityFor(a, key) {
      const minutes = a.durationMinutes || 30;
      const base = M.Schedule.baseSlots(key, minutes);
      if (!this.enabled()) return base;
      await this.refreshBusy();
      const own = [new Date(a.start).getTime(), new Date(a.end).getTime()];
      return base.filter((t) => {
        const s = M.studioDate(key, t).getTime(), e = s + minutes * 60000;
        return !busyCache.list.some(([bs, be]) => !(bs === own[0] && be === own[1]) && s < be && e > bs);
      }).filter((t) => !(key === a.date && t === a.time));
    },

    /* ---- Reserva con depósito ---- */
    async hold(appointment, idToken, opts = {}) {
      return this.post({
        action: 'hold',
        services: appointment.services.map((s) => s.id),
        date: appointment.date, time: appointment.time,
        client: appointment.client, idToken: idToken || null, birthday: appointment.client.birthday || '',
        code: M.Pricing.code || '', giftCode: M.Pricing.gift || '',
        origen: appointment.origen || '', canal: M.Origin.channel(),
        method: opts.method || 'paypal', consents: appointment.consents || [], captcha: M.Captcha ? await M.Captcha.token() : '',
      }, 'No se pudo apartar el horario.');
    },
    transferProof(id, auth, file, accountId, ref) {
      return this.post({ action: 'transferProof', id, ...auth, mime: file.mime, data: file.data, accountId: accountId || '', ref: ref || '' }, 'No se pudo enviar el comprobante.');
    },
    reschedule(id, auth, date, time) { return this.post({ action: 'reschedule', id, ...auth, date, time }, 'No se pudo cambiar la cita.'); },
    myWallet(idToken) { return this.post({ action: 'myWallet', idToken }, 'No se pudo cargar tu billetera.'); },
    async walletEmail(email) { return this.post({ action: 'walletEmail', email, captcha: M.Captcha ? await M.Captcha.token() : '' }, 'No se pudo enviar el correo.'); },
    checkCode(serviceIds, code, giftCode) {
      return this.post({ action: 'checkCode', services: serviceIds, code: code || '', giftCode: giftCode || '', client: M.Pricing.client || null }, 'No se pudo revisar el código.');
    },
    loyalty(client) { return this.post({ action: 'loyalty', client }, 'No se pudo revisar tu premio.'); },
    async waitlistJoin(d) { return this.post(Object.assign({ action: 'waitlistJoin', captcha: M.Captcha ? await M.Captcha.token() : '' }, d), 'No se pudo guardar tu lugar en la lista.'); },
    async bonoOrder(d) { return this.post(Object.assign({ action: 'bonoOrder', captcha: M.Captcha ? await M.Captcha.token() : '' }, d), 'No se pudo preparar el pago del paquete.'); },
    bonoCapture(id, orderId) { return this.post({ action: 'bonoCapture', id, orderId }, 'No se pudo confirmar el pago del paquete.'); },
    async giftOrder(d) { return this.post(Object.assign({ action: 'giftOrder', captcha: M.Captcha ? await M.Captcha.token() : '' }, d), 'No se pudo preparar el pago de la tarjeta.'); },
    giftCapture(id, orderId) { return this.post({ action: 'giftCapture', id, orderId }, 'No se pudo confirmar el pago de la tarjeta.'); },
    capture(id, orderId) { return this.post({ action: 'capture', id, orderId }, 'No se pudo confirmar el pago.'); },
    release(id, token) { return this.post({ action: 'release', id, token }, '').catch(() => null); },

    /* ---- Citas ---- */
    async myAppointments(idToken) {
      const data = await this.post({ action: 'myAppointments', idToken }, 'No se pudieron cargar tus citas.');
      M.myLoyalty = data.loyalty || null;
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

  /* ---- Promociones automáticas publicadas por el estudio ---- */
  M.promos = [];
  M.promoFor = (id) => {
    let best = null, bestValue = 0;
    const s = M.serviceById[id];
    if (!s) return null;
    M.promos.forEach((p) => {
      if (!(p.services || []).includes('todos') && !(p.services || []).includes(id)) return;
      const v = p.kind === 'monto' ? Math.min(s.price, Math.round(p.value)) : Math.round(s.price * Math.min(100, p.value) / 100);
      if (v > bestValue) { bestValue = v; best = { ...p, discount: v }; }
    });
    return best;
  };
  M.promoLabel = (p) => (p.kind === 'monto' ? `−${M.fmtPrice(p.value)}` : `−${Number(p.value)}%`);

  /* ---- Precio de la cita: promociones automáticas, código y tarjeta de regalo ----
     Sin código ni tarjeta se calcula aquí con las promociones publicadas; con código o tarjeta lo calcula el backend. */
  const sigOf = (ids) => `${ids.join(',')}|${M.Pricing.code}|${M.Pricing.gift}|${M.Pricing.loyal ? JSON.stringify(M.Pricing.client) : ''}`;
  M.Pricing = {
    code: '', gift: '', server: null, label: '', giftBalance: 0, loyal: false, client: null,
    local(items) {
      const subtotal = items.reduce((t, s) => t + s.price, 0);
      const discount = Math.min(subtotal, items.reduce((t, s) => { const p = M.promoFor(s.id); return t + (p ? p.discount : 0); }, 0));
      const total = subtotal - discount;
      const dep = M.deposit(total, items);
      const promo = items.map((s) => M.promoFor(s.id)).find(Boolean);
      return { subtotalRD: subtotal, discountRD: discount, totalRD: total, promoName: promo ? promo.name : '', giftAppliedRD: 0, depositRD: dep.depositRD, depositUSD: dep.depositUSD, balanceRD: dep.balanceRD };
    },
    current(items) {
      const ids = items.map((s) => s.id);
      if ((this.code || this.gift || this.loyal) && this.server && this.server.sig === sigOf(ids)) return this.server.pricing;
      return this.local(items);
    },
    /* Pide al backend el precio con el código o la tarjeta; devuelve el estado de cada uno */
    async refresh(items) {
      if (!(this.code || this.gift || this.loyal) || !items.length || !M.BookingAPI.enabled()) { this.server = null; return null; }
      const ids = items.map((s) => s.id);
      const sig = sigOf(ids);
      const res = await M.BookingAPI.checkCode(ids, this.code, this.gift);
      const pr = res.pricing;
      pr.depositUSD = Number(pr.depositUSD);
      this.server = { sig, pricing: pr };
      return pr;
    },
    clear(kind) { if (kind === 'gift') this.gift = ''; else this.code = ''; this.server = null; },
  };

  /* ---- De dónde llega la clienta (primer enlace con el que entró) ---- */
  M.Origin = {
    KEY: 'mjb.src.v1',
    capture() {
      try {
        const q = new URLSearchParams(location.search);
        const utm = q.get('utm_source') || q.get('ref') || q.get('src');
        let channel = '';
        if (utm) channel = utm.toLowerCase();
        else if (document.referrer) {
          const host = new URL(document.referrer).hostname.replace(/^www\./, '').replace(/^l\./, '').replace(/^lm\./, '').replace(/^m\./, '');
          if (host && host !== location.hostname) channel = host;
        }
        if (channel && !localStorage.getItem(this.KEY)) localStorage.setItem(this.KEY, JSON.stringify({ channel, at: new Date().toISOString() }));
      } catch (e) { /* sin almacenamiento */ }
    },
    channel() { try { return (JSON.parse(localStorage.getItem(this.KEY)) || {}).channel || ''; } catch (e) { return ''; } },
    /* Sugerencia para "¿Cómo nos conociste?" a partir del enlace */
    guess() {
      const c = this.channel();
      if (/instagram/.test(c)) return 'Instagram';
      if (/tiktok/.test(c)) return 'TikTok';
      if (/google/.test(c)) return 'Google';
      return '';
    },
  };
  M.Origin.capture();

  /* Montos del depósito (se muestran antes de pagar; el backend calcula los definitivos) */
  /* % de depósito de un servicio (lo define el estudio en el dashboard; vacío = el general) */
  M.depositPct = (s) => (s && s.depositPercent != null && s.depositPercent !== '' ? Number(s.depositPercent) : M.config.payments.depositPercent);
  /* Porcentaje de una cita con varios servicios: promedio ponderado por precio */
  M.depositRatio = (items) => {
    const base = items.reduce((t, s) => t + s.price, 0);
    if (!items.length) return M.config.payments.depositPercent / 100;
    if (!base) return M.depositPct(items[0]) / 100;
    return items.reduce((t, s) => t + s.price * M.depositPct(s), 0) / base / 100;
  };
  /* Texto del porcentaje: "50%" si todos coinciden; si no, null */
  M.depositPctLabel = (items) => {
    const set = [...new Set(items.map((s) => M.depositPct(s)))];
    return set.length === 1 ? `${set[0]}%` : null;
  };
  M.deposit = function (totalRD, items) {
    const P = M.config.payments;
    const ratio = items && items.length ? M.depositRatio(items) : P.depositPercent / 100;
    const depositRD = Math.round(totalRD * ratio);
    const depositUSD = Math.ceil((depositRD / P.usdRate) * 100) / 100;
    return { depositRD, depositUSD, balanceRD: totalRD - depositRD };
  };
  M.fmtUSD = (n) => `US$ ${Number(n).toFixed(2)}`;
})(window.MJB);
