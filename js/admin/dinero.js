/* MAJOBELLA · Dashboard: Dinero
   Cierre de caja del día, ganancia estimada del mes (ingresos − reembolsos − comisiones de PayPal − gastos)
   y reporte mensual en PDF con el estilo de la marca. */
(function (M) {
  const A = M.Admin;
  const { $, esc } = A;
  const st = { day: M.todayKey(), month: M.todayKey().slice(0, 8) + '01' };
  const METHOD = { efectivo: 'Efectivo', transferencia: 'Transferencia', paypal: 'PayPal', 'tarjeta de regalo': 'Tarjeta de regalo', paquete: 'Paquete', cortesia: 'Cortesía' };
  const CATS = ['Insumos', 'Alquiler', 'Servicios (luz, agua, internet)', 'Publicidad', 'Equipos', 'Sueldos', 'Comisiones', 'Otros'];
  const expenseCategory = (text) => {
    const t=String(text||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    if (/alquiler|renta|local/.test(t)) return 'Alquiler';
    if (/luz|electric|agua|internet|wifi|telefono/.test(t)) return 'Servicios (luz, agua, internet)';
    if (/meta ads|facebook|instagram|publicidad|anuncio|google ads/.test(t)) return 'Publicidad';
    if (/sueld|nomina|salario|emplead/.test(t)) return 'Sueldos';
    if (/maquina|equipo|lampara|camilla/.test(t)) return 'Equipos';
    if (/comision|tarifa|bancari/.test(t)) return 'Comisiones';
    if (/pigmento|insumo|cera|pestana|algodon|guante|producto/.test(t)) return 'Insumos';
    return null;
  };
  const paidExpenses = (xs) => xs.filter(e => e.metodo !== 'pendiente');

  /* ---------- Movimientos de dinero ---------- */
  A.movements = () => {
    const out = [];
    A.data.items.forEach((a) => {
      if (a.status === 'bloqueo') return;
      const p = a.payment || {};
      const who = a.client && a.client.name;
      const depMethod = p.depositMethod || (p.paypalCapture ? 'paypal' : '');
      if (p.depositRD > 0 && p.depositPaid && depMethod !== 'tarjeta de regalo' && depMethod !== 'paquete') {
        const at = p.depositPaidAt || a.createdAt || a.start;
        out.push({ at, date: A.dayOf(at), kind: 'Depósito', method: depMethod || 'paypal', amount: Number(p.depositRD), who, appt: a });
      }
      if (p.balanceStatus === 'pagado' && p.balanceRD > 0 && a.status !== 'cancelada') {
        const at = p.balancePaidAt || a.end;
        out.push({ at, date: A.dayOf(at), kind: 'Saldo', method: p.balanceMethod || 'efectivo', amount: Number(p.balanceRD), who, appt: a });
      }
      const detail = String(p.refundDetail || '');
      if (a.status === 'cancelada' && p.depositRD > 0 && p.depositPaid && (p.refund === 'reembolsado' || /devolver a mano/.test(detail))) {
        const at = a.cancelledAt || a.start;
        out.push({ at, date: A.dayOf(at), kind: 'Reembolso', method: depMethod || 'paypal', amount: -Number(p.depositRD), who, appt: a });
      }
      if (/saldo: reembolsado/.test(detail)) {
        const at = a.cancelledAt || a.start;
        out.push({ at, date: A.dayOf(at), kind: 'Reembolso de saldo', method: 'paypal', amount: -Number(p.balanceRD), who, appt: a });
      }
    });
    (A.data.gifts || []).forEach((g) => {
      if (g.metodoPago === 'cortesia') return;
      out.push({ at: g.creada || g.vendida, date: g.vendida, kind: 'Tarjeta de regalo', method: g.metodoPago || 'efectivo', amount: Number(g.montoRD) || 0, who: g.comprador || g.para || g.codigo });
    });
    (A.data.bonos || []).forEach((b) => {
      if (b.metodoPago === 'cortesia' || b.estado === 'pendiente' || !(Number(b.montoRD) > 0)) return;
      out.push({ at: b.creada || b.vendida, date: b.vendida, kind: 'Paquete', method: b.metodoPago || 'efectivo', amount: Number(b.montoRD) || 0, who: b.clienta || b.codigo });
    });
    // Reembolsos completados de tarjetas y paquetes: restan solo una vez de los ingresos.
    (A.data.paypalRefunds || []).filter(p=>p.estado==='completado'&&['tarjeta','paquete'].includes(p.tipo)).forEach(p=>{
      const at=p.actualizado||p.creado;
      if(!at)return;
      out.push({at,date:A.dayOf(at),kind:'Reembolso · '+(p.tipo==='tarjeta'?'tarjeta de regalo':'paquete'),
        method:'paypal',amount:-Number(p.montoRD||0),who:p.referencia});
    });
    return out.sort((a, b) => String(a.at).localeCompare(String(b.at)));
  };

  /* Comisión estimada de PayPal de un cobro (en RD$) */
  A.paypalFee = (amountRD) => {
    const pct = A.setting('comisionPaypalPct', 5.4), conv = A.setting('conversionPct', 3.5);
    const fixed = A.setting('comisionPaypalFijoUSD', 0.3), rate = A.setting('tasaUSD', 63);
    return amountRD * (pct + conv) / 100 + fixed * rate;
  };

  /* Resumen de un rango de fechas */
  A.moneySummary = (from, to) => {
    const mv = A.movements().filter((m) => m.date >= from && m.date <= to);
    const income = mv.filter((m) => m.amount > 0);
    const refunds = mv.filter((m) => m.amount < 0);
    const fees = A.sum(income.filter((m) => m.method === 'paypal'), (m) => A.paypalFee(m.amount));
    const expenses = paidExpenses((A.data.expenses || []).filter((e) => e.fecha >= from && e.fecha <= to));
    const gross = A.sum(income, (m) => m.amount);
    const ref = A.sum(refunds, (m) => m.amount);
    const exp = A.sum(expenses, (e) => e.montoRD);
    const appts = A.data.items.filter((a) => a.date >= from && a.date <= to && a.status !== 'bloqueo' && a.status !== 'expirada');
    const due = A.sum(appts.filter((a) => ['confirmada', 'completada'].includes(a.status) && a.payment.balanceStatus !== 'pagado'), (a) => a.payment.balanceRD);
    const byMethod = {};
    mv.forEach((m) => { byMethod[m.method] = (byMethod[m.method] || 0) + m.amount; });
    return { mv, income, refunds, fees: Math.round(fees), expenses, gross, ref, exp, profit: Math.round(gross + ref - fees - exp), due, byMethod, appts };
  };

  /* ---------- Cierre de caja ---------- */
  function renderDay() {
    const d = st.day;
    $('mn-day-title').textContent = A.dayTitle(d);
    const s = A.moneySummary(d, d);
    const cashIn = A.sum(s.mv.filter((m) => m.method === 'efectivo'), (m) => m.amount);
    const cashOut = A.sum(s.expenses.filter((e) => e.metodo === 'efectivo'), (e) => e.montoRD);
    const k = (l, v, sub) => `<div class="kpi"><p class="kpi-l">${l}</p><p class="kpi-v">${v}</p><p class="kpi-s">${sub}</p></div>`;
    $('mn-day-kpis').innerHTML = [
      k('Entró hoy', A.money(s.gross + s.ref), `${A.plural(s.income.length, 'cobro')}${s.refunds.length ? ` · ${A.plural(s.refunds.length, 'reembolso')}` : ''}`),
      k('Efectivo en caja', A.money(cashIn - cashOut), cashOut ? `${A.money(cashIn)} entró − ${A.money(cashOut)} de gastos` : 'cobrado en efectivo'),
      k('Transferencias', A.money(s.byMethod.transferencia || 0), 'revisa tu banco'),
      k('PayPal', A.money(s.byMethod.paypal || 0), s.byMethod.paypal ? `≈ ${A.money(A.sum(s.income.filter((m) => m.method === 'paypal'), (m) => A.paypalFee(m.amount)))} de comisión` : 'sin cobros'),
    ].join('');
    $('mn-day-list').innerHTML = s.mv.length || s.expenses.length ? `
      <table class="tbl">
        <thead><tr><th>Hora</th><th>Concepto</th><th>Método</th><th class="num">Monto</th></tr></thead>
        <tbody>${s.mv.map((m) => `<tr><td>${String(m.at).includes('T') ? M.fmtTime12(A.hhmm(m.at)) : '—'}</td><td>${esc(m.kind)} · ${esc(m.who || '')}${m.appt ? `<span class="t-sub">${esc(m.appt.servicesText)}</span>` : ''}</td><td>${esc(METHOD[m.method] || m.method)}</td><td class="num${m.amount < 0 ? ' neg' : ''}">${A.money(m.amount)}</td></tr>`).join('')}
        ${s.expenses.map((e) => `<tr><td>—</td><td>Gasto · ${esc(e.concepto)}<span class="t-sub">${esc(e.categoria)}</span></td><td>${esc(METHOD[e.metodo] || e.metodo)}</td><td class="num neg">${A.money(-e.montoRD)}</td></tr>`).join('')}</tbody>
      </table>` : '<p class="empty">No hubo movimientos este día.</p>';
    // Saldos pendientes de las citas del día
    const pending = A.data.items.filter((a) => a.date === d && ['confirmada', 'completada'].includes(a.status) && a.payment.balanceStatus !== 'pagado' && a.payment.balanceRD > 0)
      .sort((a, b) => a.start.localeCompare(b.start));
    $('mn-day-pending').innerHTML = pending.length ? pending.map((a) => `
      <li><div><p class="t-name">${esc(a.client.name)} · ${M.fmtTime12(a.time)}</p><p class="t-sub">${esc(a.servicesText)} · saldo ${A.money(a.payment.balanceRD)}</p></div>
      <div class="due-actions"><button type="button" class="act" data-pay="saldoEfectivo" data-id="${esc(a.id)}">Efectivo</button><button type="button" class="act" data-pay="saldoTransferencia" data-id="${esc(a.id)}">Transferencia</button></div></li>`).join('')
      : '<li class="empty">No quedan saldos por cobrar este día.</li>';
  }

  /* ---------- Mes ---------- */
  function renderMonth() {
    const r = A.monthRange(st.month);
    const prev = A.monthRange(A.shiftMonth(st.month, -1));
    const s = A.moneySummary(r.from, r.to);
    const p = A.moneySummary(prev.from, prev.to);
    $('mn-month-title').textContent = A.monthName(st.month);
    const delta = (now, before) => {
      if (!before) return 'sin datos del mes anterior';
      const pct = Math.round(((now - before) / Math.abs(before)) * 100);
      return `${pct >= 0 ? '+' : ''}${pct}% vs. mes anterior`;
    };
    const k = (l, v, sub, cls = '') => `<div class="kpi ${cls}"><p class="kpi-l">${l}</p><p class="kpi-v">${v}</p><p class="kpi-s">${sub}</p></div>`;
    $('mn-month-kpis').innerHTML = [
      k('Ingresos', A.money(s.gross), delta(s.gross, p.gross)),
      k('Reembolsos y comisiones', A.money(-(s.ref) + s.fees), `${A.money(-s.ref)} devuelto · ≈ ${A.money(s.fees)} PayPal`),
      k('Gastos', A.money(s.exp), A.plural(s.expenses.length, 'gasto')),
      k('Ganancia estimada', A.money(s.profit), delta(s.profit, p.profit), 'kpi-strong'),
    ].join('');
    const done = s.appts.filter((a) => a.status === 'completada');
    const ticket = done.length ? A.sum(done, (a) => a.totalPrice) / done.length : 0;
    $('mn-month-extra').innerHTML = `
      <div><dt>Por cobrar</dt><dd>${A.money(s.due)}</dd></div>
      <div><dt>Citas realizadas</dt><dd>${done.length}</dd></div>
      <div><dt>Ticket promedio</dt><dd>${A.money(ticket)}</dd></div>
      <div><dt>Canceladas / no asistió</dt><dd>${s.appts.filter((a) => a.status === 'cancelada').length} / ${s.appts.filter((a) => a.status === 'no-asistio').length}</dd></div>`;

    // Ingresos por día
    A.barChart($('mn-chart'), A.daysIn(r).map((key) => {
      const v = Math.max(0, A.sum(s.mv.filter((m) => m.date === key), (m) => m.amount));
      return { label: String(M.parseKey(key).d), value: Math.round(v), tip: `${M.dayMonth(key)} · ${A.money(v)}` };
    }), { label: 'Ingresos por día', money: true, maxLabels: 8, empty: 'Sin ingresos este mes.' });

    // Por método y por categoría de gasto
    const methods = Object.entries(s.byMethod).sort((a, b) => b[1] - a[1]);
    $('mn-methods').innerHTML = A.hbars(methods.map(([m, v]) => ({ label: METHOD[m] || m, value: Math.max(0, v), text: A.money(v) })), 'Sin ingresos este mes.');
    const cats = {};
    s.expenses.forEach((e) => { cats[e.categoria] = (cats[e.categoria] || 0) + Number(e.montoRD); });
    $('mn-cats').innerHTML = A.hbars(Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([c, v]) => ({ label: c, value: v, text: A.money(v) })), 'Sin gastos registrados este mes.');

    // Gastos
    let templates=[];
    try {const v=JSON.parse(String(A.settingsMap().gastosRecurrentes||'[]'));if(Array.isArray(v))templates=v;}catch(e){}
    $('mn-exp-recurrent').innerHTML=templates.some(t=>t.activo)?'<p class="mn-recurr-head">GASTOS PROGRAMADOS · AUTOMÁTICOS</p>'+templates.filter(t=>t.activo).map(t=>
      `<div class="mn-recurring-row"><span><b>${esc(t.concepto)}</b><small>Día ${Number(t.dia)} de cada mes · ${A.money(t.montoRD)} · solo se descuenta tras confirmar</small></span><button type="button" data-rec-stop="${esc(t.id)}">Desactivar</button></div>`).join(''):'';
    const pendingExpenses = (A.data.expenses || []).filter(e => e.fecha >= r.from && e.fecha <= r.to && e.metodo === 'pendiente');
    $('mn-exp-list').innerHTML = (s.expenses.length || pendingExpenses.length) ? `
      <table class="tbl"><thead><tr><th>Fecha</th><th>Concepto</th><th>Método</th><th class="num">Monto</th><th></th></tr></thead>
      <tbody>${[...s.expenses,...pendingExpenses].sort((a, b) => b.fecha.localeCompare(a.fecha)).map((e) => `<tr><td>${A.shortDate(e.fecha)}</td><td>${esc(e.concepto)}<span class="t-sub">${esc(e.categoria)}</span></td><td>${e.metodo==='pendiente'?'Pendiente de confirmar':esc(METHOD[e.metodo] || e.metodo)}</td><td class="num">${A.money(e.montoRD)}</td><td class="num">${e.metodo==='pendiente' ? `<button type="button" class="link" data-exp-confirm="${esc(e.id)}">Marcar pagado</button> ` : ''}<button type="button" class="link" data-exp-del="${esc(e.id)}">Borrar</button></td></tr>`).join('')}</tbody></table>`
      : '<p class="empty">Aún no registras gastos este mes.</p>';
    $('mn-fee-note').textContent = `Comisiones y conversión estimadas con ${A.setting('comisionPaypalPct', 5.4)}% + US$ ${A.setting('comisionPaypalFijoUSD', 0.3)} por cobro y ${A.setting('conversionPct', 3.5)}% de conversión a pesos (se cambian en Ajustes).`;
  }

  function render() { renderDay(); renderMonth(); A.PayPalOps?.render(); }

  /* ---------- Reporte PDF ---------- */
  function loadScript(src) {
    return new Promise((res, rej) => {
      if (document.querySelector(`script[src="${src}"]`)) { res(); return; }
      const s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = () => rej(new Error('No se pudo cargar el generador de PDF. Revisa tu conexión.'));
      document.head.appendChild(s);
    });
  }
  function imageData(src) {
    return new Promise((res) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        c.getContext('2d').drawImage(img, 0, 0);
        res({ data: c.toDataURL('image/png'), w: img.naturalWidth, h: img.naturalHeight });
      };
      img.onerror = () => res(null);
      img.src = src;
    });
  }

  async function downloadPdf(btn) {
    await A.busy(btn, async () => {
      try {
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js');
        const logo = await imageData('assets/logo-majobella.png');
        buildPdf(logo);
      } catch (err) { A.toast(err.message); }
    });
  }

  function buildPdf(logo) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'letter' });
    const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
    const X = 54;
    const r = A.monthRange(st.month);
    const s = A.moneySummary(r.from, r.to);
    const prev = A.monthRange(A.shiftMonth(st.month, -1));
    const p = A.moneySummary(prev.from, prev.to);
    const rd = (n) => `RD$ ${Math.round(Number(n) || 0).toLocaleString('es-DO')}`;
    const month = A.monthName(st.month);
    const ink = [17, 17, 17], muted = [110, 110, 110], line = [215, 215, 215];

    // Encabezado
    let y = 54;
    if (logo) { const h = 34, w = (logo.w / logo.h) * h; doc.addImage(logo.data, 'PNG', X, y - 6, w, h); }
    doc.setFont('times', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...muted);
    doc.text('REPORTE MENSUAL', W - X, y + 6, { align: 'right', charSpace: 1.6 });
    doc.setFontSize(20); doc.setTextColor(...ink);
    doc.text(month, W - X, y + 28, { align: 'right' });
    y += 52;
    doc.setDrawColor(...ink); doc.setLineWidth(0.8); doc.line(X, y, W - X, y);
    y += 26;

    // Indicadores
    const kpis = [
      ['INGRESOS', rd(s.gross)],
      ['REEMBOLSOS', rd(-s.ref)],
      ['COMISIONES PAYPAL', rd(s.fees)],
      ['GASTOS', rd(s.exp)],
    ];
    const bw = (W - 2 * X) / 4;
    kpis.forEach(([l, v], i) => {
      const x = X + i * bw;
      doc.setFontSize(7.5); doc.setTextColor(...muted); doc.text(l, x, y, { charSpace: 1.2 });
      doc.setFontSize(15); doc.setTextColor(...ink); doc.text(v, x, y + 20);
    });
    y += 44;
    doc.setFillColor(17, 17, 17); doc.rect(X, y, W - 2 * X, 54, 'F');
    doc.setTextColor(255, 255, 255); doc.setFontSize(7.5); doc.text('GANANCIA REAL DEL MES', X + 16, y + 20, { charSpace: 1.4 });
    doc.setFontSize(22); doc.text(rd(s.profit), X + 16, y + 43);
    const pct = p.profit ? Math.round(((s.profit - p.profit) / Math.abs(p.profit)) * 100) : null;
    doc.setFontSize(9.5);
    doc.text(pct === null ? 'Sin datos del mes anterior' : `${pct >= 0 ? '+' : ''}${pct}% vs. ${A.monthName(prev.from).toLowerCase()}`, W - X - 16, y + 43, { align: 'right' });
    y += 76;

    const done = s.appts.filter((a) => a.status === 'completada');
    const clients = A.clients();
    const fresh = clients.filter((c) => { const k = A.dayOf(c.firstCreated); return k >= r.from && k <= r.to; });
    doc.setTextColor(...ink); doc.setFontSize(10);
    const facts = [
      ['Citas realizadas', String(done.length)],
      ['Ticket promedio', rd(done.length ? A.sum(done, (a) => a.totalPrice) / done.length : 0)],
      ['Canceladas / no asistió', `${s.appts.filter((a) => a.status === 'cancelada').length} / ${s.appts.filter((a) => a.status === 'no-asistio').length}`],
      ['Clientas nuevas', String(fresh.length)],
      ['Saldos por cobrar', rd(s.due)],
    ];
    const tableStyle = {
      theme: 'plain', margin: { left: X, right: X },
      styles: { font: 'times', fontSize: 9.5, textColor: ink, cellPadding: { top: 5, bottom: 5, left: 0, right: 6 }, lineColor: line, lineWidth: { bottom: 0.5 } },
      headStyles: { font: 'times', fontStyle: 'normal', fontSize: 7.5, textColor: muted, cellPadding: { top: 4, bottom: 6, left: 0, right: 6 }, lineColor: ink, lineWidth: { bottom: 0.8 } },
    };
    const section = (title) => {
      if (y > H - 140) { doc.addPage(); y = 64; }
      doc.setFontSize(8); doc.setTextColor(...muted); doc.text(title.toUpperCase(), X, y, { charSpace: 1.4 });
      y += 8;
    };
    const table = (head, body, right = []) => {
      doc.autoTable({
        ...tableStyle, startY: y, head: [head], body,
        columnStyles: Object.fromEntries(right.map((i) => [i, { halign: 'right' }])),
        didParseCell: (data) => { if (data.section === 'head' && right.includes(data.column.index)) data.cell.styles.halign = 'right'; },
      });
      y = doc.lastAutoTable.finalY + 26;
    };

    section('Resumen');
    table(['INDICADOR', 'VALOR'], facts, [1]);

    section('Ingresos por método de pago');
    const methods = Object.entries(s.byMethod).sort((a, b) => b[1] - a[1]);
    table(['MÉTODO', 'MONTO'], methods.length ? methods.map(([m, v]) => [METHOD[m] || m, rd(v)]) : [['Sin ingresos', '—']], [1]);

    section('Servicios realizados');
    const svc = {};
    done.forEach((a) => (a.services || []).forEach((x) => { svc[x.name] = svc[x.name] || [0, 0]; svc[x.name][0]++; svc[x.name][1] += x.price || 0; }));
    const svcRows = Object.entries(svc).sort((a, b) => b[1][1] - a[1][1]);
    table(['SERVICIO', 'CANTIDAD', 'VALOR'], svcRows.length ? svcRows.map(([n, v]) => [n, String(v[0]), rd(v[1])]) : [['Sin servicios realizados', '', '']], [1, 2]);

    section('Gastos por categoría');
    const cats = {};
    s.expenses.forEach((e) => { cats[e.categoria] = (cats[e.categoria] || 0) + Number(e.montoRD); });
    const catRows = Object.entries(cats).sort((a, b) => b[1] - a[1]);
    table(['CATEGORÍA', 'MONTO'], catRows.length ? catRows.map(([c, v]) => [c, rd(v)]) : [['Sin gastos registrados', '—']], [1]);

    section('De dónde llegaron las clientas nuevas');
    const org = {};
    fresh.forEach((c) => { const k = c.origin || 'Sin dato'; org[k] = (org[k] || 0) + 1; });
    const orgRows = Object.entries(org).sort((a, b) => b[1] - a[1]);
    table(['ORIGEN', 'CLIENTAS'], orgRows.length ? orgRows.map(([k, n]) => [k, String(n)]) : [['Sin clientas nuevas', '—']], [1]);

    section('Movimientos del mes');
    table(['FECHA', 'CONCEPTO', 'MÉTODO', 'MONTO'], s.mv.length ? s.mv.map((m) => [A.shortDate(m.date), `${m.kind} · ${m.who || ''}`, METHOD[m.method] || m.method, rd(m.amount)]) : [['—', 'Sin movimientos', '', '']], [3]);

    if (s.expenses.length) {
      section('Detalle de gastos');
      table(['FECHA', 'CONCEPTO', 'CATEGORÍA', 'MONTO'], s.expenses.sort((a, b) => a.fecha.localeCompare(b.fecha)).map((e) => [A.shortDate(e.fecha), e.concepto, e.categoria, rd(e.montoRD)]), [3]);
    }

    if (y > H - 110) { doc.addPage(); y = 64; }
    doc.setFontSize(8.5); doc.setTextColor(...muted);
    doc.text(doc.splitTextToSize(`Las comisiones de PayPal son estimadas (${A.setting('comisionPaypalPct', 5.4)}% + US$ ${A.setting('comisionPaypalFijoUSD', 0.3)} por cobro y ${A.setting('conversionPct', 3.5)}% de conversión, tasa RD$ ${A.setting('tasaUSD', 63)}). Ganancia real = ingresos − reembolsos − comisiones − gastos.`, W - 2 * X), X, y);

    // Pie de página
    const pages = doc.getNumberOfPages();
    const stamp = new Date().toLocaleDateString('es-DO', { timeZone: M.config.schedule.timeZone, day: 'numeric', month: 'long', year: 'numeric' });
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setDrawColor(...line); doc.setLineWidth(0.5); doc.line(X, H - 46, W - X, H - 46);
      doc.setFontSize(8); doc.setTextColor(...muted);
      doc.text('MAJOBELLA Beauty Studio · Más yo, más bella.', X, H - 30);
      doc.text(`Generado el ${stamp} · ${i} de ${pages}`, W - X, H - 30, { align: 'right' });
    }
    const slug = st.month.slice(0, 7);
    doc.save(`MAJOBELLA-reporte-${slug}.pdf`);
    A.toast('Reporte descargado.');
  }

  /* ---------- Inicio ---------- */
  A.sections.dinero = {
    render,
    init() {
      A.PayPalOps?.init();
      $('mn-day-prev').addEventListener('click', () => { st.day = A.addDays(st.day, -1); renderDay(); });
      $('mn-day-next').addEventListener('click', () => { st.day = A.addDays(st.day, 1); renderDay(); });
      $('mn-day-today').addEventListener('click', () => { st.day = M.todayKey(); renderDay(); });
      $('mn-month-prev').addEventListener('click', () => { st.month = A.shiftMonth(st.month, -1); renderMonth(); });
      $('mn-month-next').addEventListener('click', () => { st.month = A.shiftMonth(st.month, 1); renderMonth(); });
      $('mn-pdf').addEventListener('click', (e) => downloadPdf(e.currentTarget));
      const f = $('mn-exp-form');
      f.categoria.innerHTML = CATS.map((c) => `<option>${c}</option>`).join('');
      f.fecha.value = M.todayKey();
      $('mn-exp-presets').addEventListener('click',ev=>{
        const b=ev.target.closest('[data-exp-preset]');if(!b)return;
        f.concepto.value=b.dataset.expPreset;
        f.categoria.value=expenseCategory(f.concepto.value)||'Otros';
        f.concepto.focus();
      });
      f.concepto.addEventListener('input',()=>{const cat=expenseCategory(f.concepto.value);if(cat)f.categoria.value=cat;});
      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        await A.busy(f.querySelector('button[type=submit]'), async () => {
          try {
            const exact=(A.data.expenses||[]).some(x=>x.fecha===f.fecha.value&&
              String(x.concepto).trim().toLowerCase()===f.concepto.value.trim().toLowerCase()&&
              Number(x.montoRD)===Number(f.montoRD.value)&&x.metodo!=='pendiente');
            if(exact&&!confirm('Ya existe un gasto con el mismo concepto, importe y fecha. ¿Registrar otra operación igualmente?'))return;
            const res = await A.call('adminSaveExpense', { expense: { fecha: f.fecha.value, concepto: f.concepto.value.trim(), categoria: f.categoria.value, montoRD: f.montoRD.value, metodo: f.metodo.value, repetirMensual:f.repetirMensual.checked } });
            A.data.expenses.push(res.expense);
            const repeated=f.repetirMensual.checked;
            f.concepto.value = ''; f.montoRD.value = ''; f.repetirMensual.checked=false;
            if(repeated)await A.load();
            render(); A.toast('Gasto guardado.');
          } catch (err) { A.toast(err.message); }
        });
      });
      document.addEventListener('click', async (e) => {
        const stop = e.target.closest('[data-rec-stop]');
        if(stop) {
          if(!confirm('¿Desactivar este gasto fijo? Se conservarán los gastos anteriores.'))return;
          await A.busy(stop,async()=>{try{await A.call('adminPauseRecurringExpense',{id:stop.dataset.recStop});await A.load();render();A.toast('Programación desactivada.');}
          catch(err){A.toast(err.message);}});
          return;
        }
        const confirmExpense = e.target.closest('[data-exp-confirm]');
        if (confirmExpense) {
          const expense=(A.data.expenses||[]).find(x=>x.id===confirmExpense.dataset.expConfirm);
          if(!expense)return;
          const method=prompt('¿Con qué se pagó este gasto? efectivo, transferencia, tarjeta o paypal','transferencia');
          if(method===null)return;
          if(!['efectivo','transferencia','tarjeta','paypal'].includes(method.trim().toLowerCase())){A.toast('Selecciona un método válido.');return;}
          if(!confirm('¿Confirmas que ya pagaste '+expense.concepto+' por '+A.money(expense.montoRD)+'?'))return;
          await A.busy(confirmExpense,async()=>{try{
            const res=await A.call('adminSaveExpense',{expense:{...expense,metodo:method.trim().toLowerCase()}});
            A.upsert('expenses',res.expense);render();A.toast('Gasto confirmado y contabilizado.');
          }catch(err){A.toast(err.message);}});
          return;
        }
        const del = e.target.closest('[data-exp-del]');
        const pay = e.target.closest('[data-pay]');
        if (del) {
          await A.busy(del, async () => {
            try { await A.call('adminDeleteExpense', { id: del.dataset.expDel }); A.remove('expenses', del.dataset.expDel); render(); A.toast('Gasto borrado.'); }
            catch (err) { A.toast(err.message); }
          });
        }
        if (pay) {
          await A.busy(pay, async () => {
            try { const res = await A.call('adminUpdate', { id: pay.dataset.id, op: pay.dataset.pay }); A.upsert('items', res.item); render(); A.toast('Saldo cobrado.'); }
            catch (err) { A.toast(err.message); }
          });
        }
      });
    },
  };
})(window.MJB);
