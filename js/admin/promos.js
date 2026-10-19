/* MAJOBELLA · Dashboard: Promociones, códigos de descuento y tarjetas de regalo
   - Promoción automática: se aplica sola a los servicios elegidos y se anuncia en la web.
   - Código: la clienta lo escribe al reservar (no se publica).
   - Tarjeta de regalo: saldo en RD$ que se descuenta al reservar con su código. */
(function (M) {
  const A = M.Admin;
  const { $, esc } = A;
  const METHOD = { efectivo: 'Efectivo', transferencia: 'Transferencia', paypal: 'PayPal', cortesia: 'Cortesía' };
  let editing = null;

  const discText = (p) => (p.descuentoTipo === 'monto' ? `${A.money(p.valor)} de descuento` : `${Number(p.valor)}% de descuento`);
  const svcText = (p) => {
    const ids = String(p.servicios || 'todos').split(',').map((x) => x.trim()).filter(Boolean);
    return ids.includes('todos') ? 'Todos los servicios' : ids.map(A.serviceName).join(', ');
  };
  function promoState(p) {
    const today = M.todayKey();
    if (/^no$/i.test(p.activo)) return ['Pausada', 'st-cancelada'];
    if (p.desde && today < p.desde) return ['Programada', ''];
    if (p.hasta && today > p.hasta) return ['Terminada', 'st-cancelada'];
    if (Number(p.usosMax) && Number(p.usos) >= Number(p.usosMax)) return ['Agotada', 'st-cancelada'];
    return ['Activa', 'st-confirmada'];
  }

  /* ---------- Render ---------- */
  function render() {
    const promos = (A.data.promos || []).slice().sort((a, b) => (b.creada || '').localeCompare(a.creada || ''));
    $('pr-list').innerHTML = promos.length ? promos.map((p) => {
      const [label, cls] = promoState(p);
      const used = A.data.items.filter((a) => a.status !== 'expirada' && a.status !== 'cancelada' && ((p.codigo && a.code === p.codigo) || (!p.codigo && a.payment && a.payment.discountRD > 0 && a.promoId === p.id)));
      return `<li class="promo">
        <div class="pr-main">
          <div class="pr-top"><p class="t-name">${esc(p.nombre)}</p><span class="pill ${cls}">${label}</span></div>
          <p class="pr-kind">${p.tipo === 'codigo' ? `Código <code>${esc(p.codigo)}</code>` : 'Automática · se anuncia en la web'}</p>
          <p class="t-sub">${esc(discText(p))} · ${esc(svcText(p))}</p>
          <p class="t-sub">${p.desde || p.hasta ? `${p.desde ? `Desde ${A.shortDate(p.desde)}` : ''}${p.desde && p.hasta ? ' · ' : ''}${p.hasta ? `hasta ${A.shortDate(p.hasta)}` : ''}` : 'Sin fecha límite'} · ${Number(p.usos) || 0}${Number(p.usosMax) ? ` de ${p.usosMax}` : ''} usos${used.length ? ` · ${A.money(A.sum(used, (a) => a.payment.discountRD))} descontados` : ''}</p>
        </div>
        <div class="due-actions">
          <button type="button" class="act" data-promo-edit="${esc(p.id)}">Editar</button>
          <button type="button" class="act" data-promo-toggle="${esc(p.id)}">${/^no$/i.test(p.activo) ? 'Activar' : 'Pausar'}</button>
          <button type="button" class="act act-ghost" data-promo-del="${esc(p.id)}">Borrar</button>
        </div></li>`;
    }).join('') : '<li class="empty">Aún no tienes promociones. Crea una automática (se anuncia en la web) o un código para compartir.</li>';

    const gifts = (A.data.gifts || []).slice().sort((a, b) => (b.creada || '').localeCompare(a.creada || ''));
    const active = gifts.filter((g) => g.estado === 'activa');
    $('gf-summary').textContent = `${A.plural(active.length, 'tarjeta activa', 'tarjetas activas')} · ${A.money(A.sum(active, (g) => g.saldoRD))} de saldo por usar`;
    $('gf-list').innerHTML = gifts.length ? gifts.map((g) => {
      const uses = A.data.items.filter((a) => a.giftCode === g.codigo && a.status !== 'expirada');
      const cls = g.estado === 'activa' ? 'st-confirmada' : 'st-cancelada';
      return `<li class="promo">
        <div class="pr-main">
          <div class="pr-top"><p class="t-name"><code>${esc(g.codigo)}</code></p><span class="pill ${cls}">${esc(A.cap(g.estado))}</span></div>
          <p class="t-sub">${g.para ? `Para ${esc(g.para)}` : ''}${g.para && g.comprador ? ' · ' : ''}${g.comprador ? `de ${esc(g.comprador)}` : ''}</p>
          <p class="t-sub">Valor ${A.money(g.montoRD)} · saldo <strong>${A.money(g.saldoRD)}</strong> · ${esc(METHOD[g.metodoPago] || g.metodoPago)} · vendida ${A.shortDate(g.vendida)}${g.vence ? ` · vence ${A.shortDate(g.vence)}` : ''}${uses.length ? ` · ${A.plural(uses.length, 'uso')}` : ''}</p>
        </div>
        <div class="due-actions">
          <button type="button" class="act" data-gift-img="${esc(g.id)}">Descargar tarjeta</button>
          <button type="button" class="act" data-gift-copy="${esc(g.codigo)}">Copiar código</button>
          <button type="button" class="act act-ghost" data-gift-toggle="${esc(g.id)}">${g.estado === 'anulada' ? 'Reactivar' : 'Anular'}</button>
        </div></li>`;
    }).join('') : '<li class="empty">Aún no has vendido tarjetas de regalo.</li>';
  }

  /* ---------- Formulario de promoción ---------- */
  function openPromo(id) {
    editing = id ? A.data.promos.find((p) => p.id === id) : null;
    const f = $('pr-form');
    f.reset();
    $('pr-msg').textContent = '';
    $('pr-dlg-title').textContent = editing ? 'Editar promoción' : 'Nueva promoción';
    $('pr-services').innerHTML = `<label class="chk"><input type="checkbox" name="svc" value="todos"><span>Todos los servicios</span></label>` +
      A.services().map((s) => `<label class="chk"><input type="checkbox" name="svc" value="${esc(s.id)}"><span>${esc(s.name)}</span></label>`).join('');
    const p = editing || { tipo: 'auto', descuentoTipo: 'porcentaje', servicios: 'todos', activo: 'si' };
    f.nombre.value = p.nombre || '';
    f.tipo.value = p.tipo || 'auto';
    f.codigo.value = p.codigo || '';
    f.descuentoTipo.value = p.descuentoTipo || 'porcentaje';
    f.valor.value = p.valor || '';
    f.desde.value = p.desde || '';
    f.hasta.value = p.hasta || '';
    f.usosMax.value = Number(p.usosMax) || '';
    f.activo.checked = !/^no$/i.test(p.activo || 'si');
    const ids = String(p.servicios || 'todos').split(',');
    f.querySelectorAll('[name=svc]').forEach((i) => { i.checked = ids.includes(i.value); });
    syncPromo();
    A.open('dlg-promo');
  }
  function syncPromo() {
    const f = $('pr-form');
    $('pr-code-wrap').hidden = f.tipo.value !== 'codigo';
    $('pr-unit').textContent = f.descuentoTipo.value === 'monto' ? 'RD$' : '%';
    const all = f.querySelector('[name=svc][value=todos]');
    f.querySelectorAll('[name=svc]:not([value=todos])').forEach((i) => { i.disabled = all.checked; });
    const v = Number(f.valor.value) || 0;
    const svcs = all.checked ? 'todos los servicios' : [...f.querySelectorAll('[name=svc]:checked')].map((i) => i.nextElementSibling.textContent).join(', ') || '—';
    $('pr-preview').textContent = v ? `${f.descuentoTipo.value === 'monto' ? A.money(v) : `${v}%`} de descuento en ${svcs}${f.hasta.value ? `, hasta el ${A.shortDate(f.hasta.value)}` : ''}${f.tipo.value === 'codigo' && f.codigo.value ? ` con el código ${f.codigo.value.toUpperCase()}` : ''}.` : '';
  }
  async function savePromo(e) {
    e.preventDefault();
    const f = $('pr-form');
    const all = f.querySelector('[name=svc][value=todos]').checked;
    const servicios = all ? ['todos'] : [...f.querySelectorAll('[name=svc]:checked')].map((i) => i.value);
    if (!servicios.length) { $('pr-msg').textContent = 'Elige al menos un servicio.'; return; }
    const promo = {
      id: editing ? editing.id : '', nombre: f.nombre.value.trim(), tipo: f.tipo.value, codigo: f.codigo.value.trim(),
      servicios, descuentoTipo: f.descuentoTipo.value, valor: f.valor.value, desde: f.desde.value, hasta: f.hasta.value,
      usosMax: f.usosMax.value, activo: f.activo.checked ? 'si' : 'no',
    };
    await A.busy($('pr-save'), async () => {
      try {
        const res = await A.call('adminSavePromo', { promo });
        A.upsert('promos', Object.assign({}, editing || {}, res.promo));
        A.close('dlg-promo'); render();
        A.toast(promo.tipo === 'auto' ? 'Promoción guardada. Ya se anuncia en la web.' : 'Código guardado.');
      } catch (err) { $('pr-msg').textContent = err.message; }
    });
  }

  /* ---------- Tarjetas de regalo ---------- */
  function openGift() {
    const f = $('gf-form');
    f.reset();
    f.vendida.value = M.todayKey();
    f.vence.value = A.addDays(M.todayKey(), 365);
    $('gf-msg').textContent = '';
    A.open('dlg-gift');
  }
  async function saveGift(e) {
    e.preventDefault();
    const f = $('gf-form');
    const gift = { montoRD: f.montoRD.value, comprador: f.comprador.value.trim(), para: f.para.value.trim(), mensaje: f.mensaje.value.trim(), metodoPago: f.metodoPago.value, vendida: f.vendida.value, vence: f.vence.value, codigo: f.codigo.value.trim() };
    await A.busy($('gf-save'), async () => {
      try {
        const res = await A.call('adminSaveGift', { gift });
        A.data.gifts.push(res.gift);
        A.close('dlg-gift'); render();
        A.toast(`Tarjeta creada: ${res.gift.codigo}`);
        giftImage(res.gift);
      } catch (err) { $('gf-msg').textContent = err.message; }
    });
  }

  /* Imagen de la tarjeta para enviar por WhatsApp o imprimir */
  function giftImage(g) {
    const logo = new Image();
    logo.onload = draw; logo.onerror = draw;
    logo.src = 'assets/logo-majobella.png';
    function draw() {
      const W = 1200, H = 720;
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      const x = c.getContext('2d');
      x.fillStyle = '#ffffff'; x.fillRect(0, 0, W, H);
      x.strokeStyle = '#111111'; x.lineWidth = 2; x.strokeRect(36, 36, W - 72, H - 72);
      x.lineWidth = 0.8; x.strokeRect(50, 50, W - 100, H - 100);
      if (logo.naturalWidth) { const h = 92, w = (logo.naturalWidth / logo.naturalHeight) * h; x.drawImage(logo, (W - w) / 2, 96, w, h); }
      x.fillStyle = '#575757'; x.textAlign = 'center';
      x.font = '600 20px Georgia, serif';
      spaced(x, 'TARJETA DE REGALO', W / 2, 250, 6);
      x.fillStyle = '#000'; x.font = '400 96px Georgia, serif';
      x.fillText(A.money(g.montoRD), W / 2, 360);
      x.font = 'italic 30px Georgia, serif'; x.fillStyle = '#111';
      const who = [g.para ? `Para ${g.para}` : '', g.comprador ? `de ${g.comprador}` : ''].filter(Boolean).join(' · ');
      if (who) x.fillText(who, W / 2, 420);
      if (g.mensaje) { x.font = '24px Georgia, serif'; x.fillStyle = '#575757'; wrap(x, `“${g.mensaje}”`, W / 2, 468, 860, 32); }
      x.fillStyle = '#111'; x.fillRect(W / 2 - 230, 540, 460, 74);
      x.fillStyle = '#fff'; x.font = '600 34px ui-monospace, Menlo, monospace';
      spaced(x, g.codigo, W / 2, 589, 4);
      x.fillStyle = '#575757'; x.font = '19px Georgia, serif';
      const web = (A.settingsMap().webUrl || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
      x.fillText(`Escribe el código al reservar${web ? ` en ${web}` : ''}${g.vence ? ` · válida hasta ${A.shortDate(g.vence)}` : ''}`, W / 2, 648);
      const a = document.createElement('a');
      a.href = c.toDataURL('image/png');
      a.download = `MAJOBELLA-tarjeta-${g.codigo}.png`;
      document.body.appendChild(a); a.click(); a.remove();
    }
    function spaced(ctx, text, cx, y, gap) {
      const chars = [...text];
      const widths = chars.map((ch) => ctx.measureText(ch).width);
      const total = widths.reduce((t, w) => t + w, 0) + gap * (chars.length - 1);
      let px = cx - total / 2;
      ctx.textAlign = 'left';
      chars.forEach((ch, i) => { ctx.fillText(ch, px, y); px += widths[i] + gap; });
      ctx.textAlign = 'center';
    }
    function wrap(ctx, text, cx, y, max, lh) {
      const words = text.split(' ');
      let line = '';
      words.forEach((w) => {
        const t = line ? `${line} ${w}` : w;
        if (ctx.measureText(t).width > max) { ctx.fillText(line, cx, y); y += lh; line = w; } else line = t;
      });
      if (line) ctx.fillText(line, cx, y);
    }
  }

  /* ---------- Inicio ---------- */
  A.sections.promos = {
    render,
    init() {
      $('pr-new').addEventListener('click', () => openPromo(null));
      $('gf-new').addEventListener('click', openGift);
      const f = $('pr-form');
      f.addEventListener('input', syncPromo);
      f.addEventListener('change', syncPromo);
      f.addEventListener('submit', savePromo);
      $('pr-gen').addEventListener('click', () => {
        const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let s = '';
        for (let i = 0; i < 6; i++) s += a[Math.floor(Math.random() * a.length)];
        f.codigo.value = s; syncPromo();
      });
      $('gf-form').addEventListener('submit', saveGift);
      document.addEventListener('click', async (e) => {
        const ed = e.target.closest('[data-promo-edit]');
        if (ed) { openPromo(ed.dataset.promoEdit); return; }
        const tg = e.target.closest('[data-promo-toggle]');
        if (tg) {
          const p = A.data.promos.find((x) => x.id === tg.dataset.promoToggle);
          await A.busy(tg, async () => {
            try {
              const res = await A.call('adminSavePromo', { promo: { ...p, servicios: p.servicios, activo: /^no$/i.test(p.activo) ? 'si' : 'no' } });
              A.upsert('promos', Object.assign({}, p, res.promo)); render();
            } catch (err) { A.toast(err.message); }
          });
          return;
        }
        const dl = e.target.closest('[data-promo-del]');
        if (dl) {
          if (dl.dataset.confirm !== '1') { dl.dataset.confirm = '1'; dl.textContent = '¿Borrar?'; setTimeout(() => { dl.dataset.confirm = ''; dl.textContent = 'Borrar'; }, 4000); return; }
          await A.busy(dl, async () => {
            try { await A.call('adminDeletePromo', { id: dl.dataset.promoDel }); A.remove('promos', dl.dataset.promoDel); render(); A.toast('Promoción borrada.'); }
            catch (err) { A.toast(err.message); }
          });
          return;
        }
        const img = e.target.closest('[data-gift-img]');
        if (img) { giftImage(A.data.gifts.find((g) => g.id === img.dataset.giftImg)); return; }
        const cp = e.target.closest('[data-gift-copy]');
        if (cp) { try { await navigator.clipboard.writeText(cp.dataset.giftCopy); A.toast('Código copiado.'); } catch (err) { A.toast(cp.dataset.giftCopy); } return; }
        const gt = e.target.closest('[data-gift-toggle]');
        if (gt) {
          const g = A.data.gifts.find((x) => x.id === gt.dataset.giftToggle);
          await A.busy(gt, async () => {
            try { const res = await A.call('adminSaveGift', { gift: { ...g, estado: g.estado === 'anulada' ? 'activa' : 'anulada' } }); A.upsert('gifts', res.gift); render(); }
            catch (err) { A.toast(err.message); }
          });
        }
      });
    },
  };
})(window.MJB);
