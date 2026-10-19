/* MAJOBELLA · Disponibilidad y registro de citas
   Sin backend (config.booking.apiUrl vacío):
     - las horas se calculan con el horario de config.schedule;
     - no se conocen las citas ya tomadas, por eso la confirmación final la hace el estudio por WhatsApp.
   Con backend (apiUrl definido):
     - GET  {apiUrl}?action=availability&date=AAAA-MM-DD  → { busy: [{ start, end }] } (ISO 8601)
     - POST {apiUrl}  body JSON { action: 'create', ...cita } → { ok: true, id } o { ok: false, error }
     - POST {apiUrl}  body JSON { action: 'myAppointments', idToken } → { ok: true, items: [...] }
     - POST {apiUrl}  body JSON { action: 'cancel', id, idToken }     → { ok: true }
   El archivo backend/google-apps-script/Code.gs implementa todo usando Google Calendar. */
(function (M) {
  const SCH = M.config.schedule;
  const API = M.config.booking;

  const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
  const toHHMM = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

  M.Schedule = {
    hoursFor(key) {
      const { y, m, d } = M.parseKey(key);
      const dow = new Date(Date.UTC(y, m, d)).getUTCDay();
      return SCH.hours[dow] || null;
    },

    isBookableDay(key) {
      if (SCH.blockedDates.includes(key)) return false;
      if (!this.hoursFor(key)) return false;
      const today = M.todayKey();
      if (key < today) return false;
      const { y, m, d } = M.parseKey(key);
      const t = M.parseKey(today);
      const diff = (Date.UTC(y, m, d) - Date.UTC(t.y, t.m, t.d)) / 86400000;
      if (diff > SCH.maxDaysAhead) return false;
      return this.baseSlots(key, 30).length > 0;
    },

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

  M.BookingAPI = {
    enabled() { return !!(API.apiUrl && API.apiUrl.trim()); },

    /* Devuelve { slots: ['10:00', ...], source: 'schedule' | 'calendar' } */
    async availability(key, durationMinutes) {
      const base = M.Schedule.baseSlots(key, durationMinutes);
      if (!this.enabled()) return { slots: base, source: 'schedule' };
      const url = `${API.apiUrl}${API.apiUrl.includes('?') ? '&' : '?'}action=availability&date=${encodeURIComponent(key)}`;
      const res = await fetch(url, { method: 'GET' });
      if (!res.ok) throw new Error(`Disponibilidad no disponible (${res.status})`);
      const data = await res.json();
      const busy = (data.busy || []).map((b) => [new Date(b.start).getTime(), new Date(b.end).getTime()]);
      const slots = base.filter((hhmm) => {
        const s = M.studioDate(key, hhmm).getTime();
        const e = s + durationMinutes * 60000;
        return !busy.some(([bs, be]) => s < be && e > bs);
      });
      return { slots, source: 'calendar' };
    },

    /* Envío POST común (text/plain evita la petición previa CORS con Google Apps Script) */
    async post(body, fallbackError) {
      if (!this.enabled()) throw new Error('No hay backend configurado.');
      const res = await fetch(API.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({ ok: false, error: 'Respuesta no válida del servidor.' }));
      if (!res.ok || !data.ok) throw new Error(data.error || fallbackError);
      return data;
    },

    /* Registra la cita en el calendario de MAJOBELLA */
    create(appointment, idToken) {
      return this.post({ action: 'create', ...appointment, idToken: idToken || null }, 'No se pudo registrar la cita.');
    },

    /* Citas de la clienta que inició sesión con Google */
    async myAppointments(idToken) {
      const data = await this.post({ action: 'myAppointments', idToken }, 'No se pudieron cargar tus citas.');
      return data.items || [];
    },

    cancel(id, idToken) {
      return this.post({ action: 'cancel', id, idToken }, 'No se pudo cancelar la cita.');
    },
  };
})(window.MJB);
