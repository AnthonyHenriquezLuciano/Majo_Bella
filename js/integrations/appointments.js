/* MAJOBELLA · Registro de citas de la clienta
   - En este dispositivo: cada cita confirmada desde la web se guarda en el navegador.
   - Con Google + backend: las citas se leen de la agenda de MAJOBELLA (en cualquier dispositivo). */
(function (M) {
  const KEY = 'mjb.citas.v1';
  const listeners = new Set();

  const readLocal = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; } };
  const writeLocal = (list) => { try { localStorage.setItem(KEY, JSON.stringify(list)); return true; } catch (e) { return false; } };

  M.STATUS = {
    pendiente: 'Pendiente de confirmación',
    confirmada: 'Confirmada',
    'cancelacion-solicitada': 'Cancelación solicitada',
    cancelada: 'Cancelada',
  };

  M.Appointments = {
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    emit() { listeners.forEach((fn) => fn()); },

    add(appt) {
      const list = readLocal();
      list.push(appt);
      writeLocal(list);
      this.emit();
    },

    update(id, patch) {
      const list = readLocal().map((a) => (a.id === id ? { ...a, ...patch } : a));
      writeLocal(list);
      this.emit();
    },

    /* Devuelve { items, source: 'device' | 'agenda', error } */
    async list() {
      const user = M.Auth.user;
      let items = readLocal();
      if (user) items = items.filter((a) => !a.client || !a.client.email || a.client.email.toLowerCase() === user.email.toLowerCase());
      if (user && M.Auth.token && M.BookingAPI.enabled()) {
        try {
          const remote = await M.BookingAPI.myAppointments(M.Auth.token);
          const byId = new Map(items.map((a) => [a.id, a]));
          remote.forEach((r) => byId.set(r.id, { ...(byId.get(r.id) || {}), ...r }));
          return { items: [...byId.values()], source: 'agenda' };
        } catch (err) {
          return { items, source: 'device', error: err.message };
        }
      }
      return { items, source: 'device' };
    },
  };
})(window.MJB);
