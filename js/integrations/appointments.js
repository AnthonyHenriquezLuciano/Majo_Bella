/* MAJOBELLA · Registro de citas de la clienta
   - En este dispositivo: cada reserva se guarda en el navegador con su código y su clave de gestión
     (la clave permite ver el estado, pagar el saldo o cancelar sin iniciar sesión).
   - Con el backend: el estado real se lee de la hoja de MAJOBELLA (y con Google, desde cualquier dispositivo). */
(function (M) {
  const KEY = 'mjb.citas.v1';
  const listeners = new Set();

  const readLocal = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; } };
  const writeLocal = (list) => { try { localStorage.setItem(KEY, JSON.stringify(list)); return true; } catch (e) { return false; } };

  M.STATUS = {
    pendiente: 'Solicitud enviada',
    retenida: 'Pago sin completar',
    'por-confirmar': 'Por confirmar',
    expirada: 'Pago sin completar',
    confirmada: 'Confirmada',
    completada: 'Realizada',
    'no-asistio': 'No asistió',
    'cancelacion-solicitada': 'Cancelación solicitada',
    cancelada: 'Cancelada',
  };

  M.Appointments = {
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    emit() { listeners.forEach((fn) => fn()); },

    add(appt) {
      const list = readLocal().filter((a) => a.id !== appt.id);
      list.push(appt);
      writeLocal(list);
      this.emit();
    },

    update(id, patch) {
      const list = readLocal().map((a) => (a.id === id ? { ...a, ...patch } : a));
      writeLocal(list);
      this.emit();
    },

    get(id) { return readLocal().find((a) => a.id === id) || null; },

    /* Reservada por transferencia y aún a tiempo de subir el comprobante */
    waitingProof(a) {
      const t = a && a.payment && a.payment.transfer;
      return !!(a && a.status === 'retenida' && t && !t.proof && t.deadline && new Date(t.deadline).getTime() > Date.now());
    },
    /* Cuántas veces más puede cambiar la fecha ella misma */
    changesLeft(a) {
      const c = a.changes || { used: 0, max: (M.rescheduleInfo && M.rescheduleInfo.max) ?? 1 };
      return Math.max(0, (c.max ?? 1) - (c.used || 0));
    },

    /* Credenciales para gestionar una cita: clave guardada o sesión de Google */
    auth(a) {
      const local = this.get(a.id);
      const token = (local && local.token) || a.token;
      return token ? { token } : (M.Auth.token ? { idToken: M.Auth.token } : null);
    },

    /* Devuelve { items, source: 'device' | 'agenda', error } */
    async list() {
      const user = M.Auth.user;
      let items = readLocal().filter((a) => a.status !== 'expirada' && (a.status !== 'retenida' || M.Appointments.waitingProof(a)));
      if (user) items = items.filter((a) => !a.client || !a.client.email || a.client.email.toLowerCase() === user.email.toLowerCase());
      if (!M.BookingAPI.enabled()) return { items, source: 'device' };

      const byId = new Map(items.map((a) => [a.id, a]));
      let error = null, synced = false;
      // Citas de este dispositivo: se actualiza su estado con la clave guardada
      const withToken = items.filter((a) => a.token).map((a) => ({ id: a.id, token: a.token }));
      try {
        const fresh = await M.BookingAPI.lookup(withToken);
        fresh.forEach((r) => byId.set(r.id, { ...(byId.get(r.id) || {}), ...r, client: { ...((byId.get(r.id) || {}).client || {}), ...r.client } }));
        if (fresh.length) {
          const store = readLocal().map((a) => { const r = fresh.find((x) => x.id === a.id); return r ? { ...a, status: r.status, payment: r.payment, date: r.date, time: r.time, start: r.start, end: r.end, changes: r.changes, consent: r.consent } : a; });
          writeLocal(store);
        }
        synced = withToken.length > 0;
      } catch (err) { error = err.message; }
      // Con Google: todas sus citas, en cualquier dispositivo
      if (user && M.Auth.token) {
        try {
          const remote = await M.BookingAPI.myAppointments(M.Auth.token);
          remote.forEach((r) => byId.set(r.id, { ...(byId.get(r.id) || {}), ...r }));
          synced = true;
        } catch (err) { error = err.message; }
      }
      const keep = (a) => a.status !== 'expirada' && (a.status !== 'retenida' || M.Appointments.waitingProof(a));
      return { items: [...byId.values()].filter(keep), source: synced && !error ? 'agenda' : 'device', error };
    },
  };
})(window.MJB);
