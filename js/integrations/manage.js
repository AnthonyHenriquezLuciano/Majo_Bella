/* MAJOBELLA · Gestionar citas desde la web y la app
   - M.Transfer: cuentas para el depósito por transferencia, preparar el comprobante (foto o PDF) y copiar datos.
   - M.Reschedule: días y horas libres para cambiar una cita. */
(function (M) {
  const esc = (s) => M.escapeHtml(s == null ? '' : String(s));

  M.Transfer = {
    enabled() { return !!(M.transfer && M.transfer.enabled && M.BookingAPI.enabled()); },
    accounts() { return (M.transfer && M.transfer.accounts) || []; },
    minutes() { return (M.transfer && M.transfer.minutes) || 60; },

    /* Lista de cuentas con botones para copiar; si hay varias, la clienta marca a cuál transfirió */
    accountsHtml(list, opts = {}) {
      const many = list.length > 1;
      return `<ul class="tf-accounts">${list.map((a, i) => `
        <li class="tf-acc">
          ${many ? `<label class="tf-pick"><input type="radio" name="${opts.name || 'tf-acc'}" value="${esc(a.id)}"${i === 0 ? ' checked' : ''}><span>Transferí a esta cuenta</span></label>` : ''}
          <p class="tf-bank">${esc(a.bank)}${a.type ? ` <span>· ${esc(a.type)}</span>` : ''}</p>
          <p class="tf-num"><b>${esc(a.number)}</b><button type="button" class="tf-copy" data-copy="${esc(a.number)}">Copiar</button></p>
          <p class="tf-holder">${esc(a.holder)}${a.doc ? ` · ${esc(a.doc)}` : ''}</p>
          ${a.note ? `<p class="tf-note">${esc(a.note)}</p>` : ''}
        </li>`).join('')}</ul>`;
    },
    pickedAccount(root, name) {
      const r = root.querySelector(`input[name="${name || 'tf-acc'}"]:checked`);
      return r ? r.value : ((this.accounts()[0] || {}).id || '');
    },

    /* Copiar al tocar (número de cuenta, monto) */
    bindCopy(root) {
      root.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-copy]');
        if (!b) return;
        e.preventDefault();
        const text = b.dataset.copy;
        try { await navigator.clipboard.writeText(text); }
        catch (err) { const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); } catch (x) { /* nada */ } t.remove(); }
        const old = b.textContent; b.textContent = 'Copiado ✓'; b.classList.add('is-done');
        setTimeout(() => { b.textContent = old; b.classList.remove('is-done'); }, 1600);
      });
    },

    /* Foto → JPEG reducido (máx. 1600 px); PDF tal cual. Devuelve { mime, data (base64), name, preview } */
    async prepare(file) {
      if (!file) throw new Error('Elige la foto o el PDF del comprobante.');
      if (file.type === 'application/pdf') {
        if (file.size > 8 * 1024 * 1024) throw new Error('El PDF pesa más de 8 MB.');
        return { mime: 'application/pdf', data: await toBase64(file), name: file.name, preview: '' };
      }
      if (!/^image\//.test(file.type)) throw new Error('Sube una foto o captura de pantalla (JPG o PNG) o un PDF.');
      const img = await loadImage(file);
      const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      const url = c.toDataURL('image/jpeg', 0.82);
      return { mime: 'image/jpeg', data: url.split(',')[1], name: file.name, preview: url };
    },

    deadlineText(a) {
      const t = a && a.payment && a.payment.transfer;
      if (!t || !t.deadline) return '';
      return new Intl.DateTimeFormat('es-DO', { timeZone: 'America/Santo_Domingo', hour: 'numeric', minute: '2-digit' }).format(new Date(t.deadline));
    },
  };

  function toBase64(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(',')[1]);
      r.onerror = () => reject(new Error('No se pudo leer el archivo.'));
      r.readAsDataURL(file);
    });
  }
  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo abrir la imagen. Prueba con una captura de pantalla.')); };
      img.src = url;
    });
  }

  M.Reschedule = {
    /* ¿Puede cambiar la fecha ella misma? Devuelve { ok, reason } */
    check(a) {
      if (!(a && a.remote && M.BookingAPI.enabled() && M.Appointments.auth(a))) return { ok: false, reason: 'whatsapp' };
      if (!['confirmada', 'por-confirmar'].includes(a.status)) return { ok: false, reason: 'status' };
      const max = a.changes ? a.changes.max : ((M.rescheduleInfo && M.rescheduleInfo.max) ?? 1);
      if (!max) return { ok: false, reason: 'off' };
      if (M.Appointments.changesLeft(a) <= 0) return { ok: false, reason: 'used' };
      const hrs = (M.config.policies && M.config.policies.changeHours) || 24;
      if ((new Date(a.start).getTime() - Date.now()) / 3600000 < hrs) return { ok: false, reason: 'late', hours: hrs };
      return { ok: true };
    },
    reasonText(r) {
      return {
        used: 'Ya usaste el cambio de fecha de esta cita. Para otro cambio, escríbenos por WhatsApp.',
        late: `Faltan menos de ${r.hours || 24} horas: para cambiarla escríbenos por WhatsApp.`,
        off: 'Para cambiar tu cita, escríbenos por WhatsApp.',
      }[r.reason] || '';
    },
    /* Próximos días con horario libre para la duración de la cita */
    async days(a, n = 21) {
      const out = [];
      let key = M.todayKey();
      for (let i = 0; i < 70 && out.length < n; i++) {
        if (M.Schedule.isOpenDay(key)) out.push(key);
        key = M.addDaysKey(key, 1);
      }
      try { await M.BookingAPI.refreshBusy(); } catch (e) { /* sin agenda: se muestran todos */ }
      const res = [];
      for (const k of out) { const slots = await M.BookingAPI.availabilityFor(a, k); res.push({ key: k, free: slots.length }); }
      return res;
    },
    slots(a, key) { return M.BookingAPI.availabilityFor(a, key); },
    async save(a, date, time) {
      const r = await M.BookingAPI.reschedule(a.id, M.Appointments.auth(a), date, time);
      const ap = r.appointment;
      M.Appointments.update(a.id, { date: ap.date, time: ap.time, start: ap.start, end: ap.end, changes: ap.changes, status: ap.status, payment: ap.payment });
      M.BookingAPI.refreshBusy(true).catch(() => {});
      return ap;
    },
  };
})(window.MJB);
