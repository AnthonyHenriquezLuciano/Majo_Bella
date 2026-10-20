/* Promociones, tarjetas de regalo, citas a mano, bloqueos, ajustes, fichas, gastos y depósito por servicio
   (+ importar datos de la hoja anterior) */
import { harness, assert, okf } from './harness.ts';

export default async function () {
  const g = await harness();
  const { ok, fail } = okf('negocio');
  const A = 'admin-token';
  try {
    // --- Datos de la hoja anterior: una cita vieja con columnas antiguas y servicios sin columnas nuevas
    const imp = ok(await g.post({ action: 'adminImport', key: 'import-key', tables: {
      Servicios: [['faciales','Faciales',60,2500,'no','si'],['cejas','Cejas',45,900,'no','si'],['pestanas','Pestañas',60,1800,'no','si'],['micropigmentacion','Micropigmentación',150,12000,'no','si'],['depilacion','Depilación',30,500,'si','si']]
        .map((r) => ({ id: r[0], nombre: r[1], duracionMin: r[2], precioRD: r[3], precioDesde: r[4], activo: r[5] })),
      Reservas: [{ id: 'MJB-OLD-1', estado: 'completada', fecha: '2026-09-15', hora: '10:00', inicio: '2026-09-15T14:00:00.000Z', fin: '2026-09-15T15:00:00.000Z', duracionMin: '60', servicios: 'Pestañas', serviciosJson: JSON.stringify([{ id: 'pestanas', name: 'Pestañas', price: 1800 }]), totalRD: '1800', depositoRD: '900', saldoRD: '900', clienta: 'Ana Pérez', telefono: '809 555 1234', correo: 'ana@example.com', depositoPagado: '2026-09-10T10:00:00.000Z', saldoEstado: 'pagado', saldoMetodo: 'efectivo', saldoPagado: '2026-09-15T15:00:00.000Z' }],
    } }), 'importar datos de la hoja');
    assert.equal(imp.result.Reservas.nuevas, 1);
    fail(await g.post({ action: 'adminImport', key: 'mala', tables: {} }), 'importar sin clave');
    let data = ok(await g.post({ action: 'adminData', idToken: A }), 'adminData after migration');
    assert.equal(data.items[0].id, 'MJB-OLD-1'); assert.equal(data.items[0].status, 'completada');
    assert.equal(data.services.find((s) => s.id === 'pestanas').volverDias, '21');
    assert.ok(data.settings.find((s) => s.key === 'comisionPaypalPct'));
    // Repetir la importación no duplica
    const imp2 = ok(await g.post({ action: 'adminImport', key: 'import-key', tables: { Reservas: [{ id: 'MJB-OLD-1', estado: 'completada', clienta: 'Ana Pérez' }] } }), 'importar otra vez');
    assert.equal(imp2.result.Reservas.actualizadas, 1);

    // fechas
    const d = new Date(); d.setUTCDate(d.getUTCDate() + ((9 - d.getUTCDay()) % 7 || 7)); if (d.getTime() - Date.now() < 2 * 86400000) d.setUTCDate(d.getUTCDate() + 7);
    const tue = d.toISOString().slice(0, 10);
    const wedD = new Date(d); wedD.setUTCDate(wedD.getUTCDate() + 1); const wed = wedD.toISOString().slice(0, 10);
    const t2 = new Date(d); t2.setUTCDate(t2.getUTCDate() + 7); const tue2 = t2.toISOString().slice(0, 10);
    const client = { name: 'Laura Gómez', phone: '809 555 2222', email: 'laura@example.com' };

    // --- Promociones
    ok(await g.post({ action: 'adminSavePromo', idToken: A, promo: { nombre: 'Octubre de cejas', tipo: 'auto', servicios: ['cejas'], descuentoTipo: 'porcentaje', valor: 20 } }), 'auto promo');
    ok(await g.post({ action: 'adminSavePromo', idToken: A, promo: { nombre: 'Bienvenida', tipo: 'codigo', codigo: 'hola10', servicios: 'todos', descuentoTipo: 'porcentaje', valor: 10, usosMax: 1 } }), 'code promo');
    fail(await g.post({ action: 'adminSavePromo', idToken: A, promo: { nombre: 'Dup', tipo: 'codigo', codigo: 'HOLA10', valor: 5 } }), 'duplicate code');
    fail(await g.post({ action: 'adminSavePromo', idToken: 'client-token', promo: { nombre: 'x', valor: 5 } }), 'promo needs admin');
    const cat = await g.get({ action: 'catalog' });
    assert.equal(cat.promos.length, 1); assert.equal(cat.promos[0].name, 'Octubre de cejas');
    let cc = ok(await g.post({ action: 'checkCode', services: ['cejas', 'pestanas'], code: 'hola10' }), 'checkCode');
    // auto: 20% de 900 = 180; código: 10% de 2700 = 270 → gana el código
    assert.equal(cc.pricing.discountRD, 270); assert.equal(cc.pricing.codeStatus, 'ok'); assert.equal(cc.pricing.totalRD, 2430);
    cc = ok(await g.post({ action: 'checkCode', services: ['cejas'], code: 'hola10' }), 'checkCode not better');
    assert.equal(cc.pricing.discountRD, 180); assert.equal(cc.pricing.codeStatus, 'notBetter');
    cc = ok(await g.post({ action: 'checkCode', services: ['cejas'], code: 'nope' }), 'checkCode invalid'); assert.equal(cc.pricing.codeStatus, 'invalid');

    // --- Tarjeta de regalo
    const gift = ok(await g.post({ action: 'adminSaveGift', idToken: A, gift: { montoRD: 3000, comprador: 'Pedro', para: 'Laura', metodoPago: 'efectivo' } }), 'gift create').gift;
    assert.ok(/^MJB-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(gift.codigo));
    cc = ok(await g.post({ action: 'checkCode', services: ['faciales'], giftCode: gift.codigo.toLowerCase() }), 'gift check');
    assert.equal(cc.pricing.giftAppliedRD, 2500); assert.equal(cc.pricing.depositRD, 0);
    // Reserva pagada totalmente con la tarjeta: se confirma sin PayPal
    const hg = ok(await g.post({ action: 'hold', services: ['faciales'], date: tue2, time: '10:00', client, giftCode: gift.codigo, origen: 'Instagram', canal: 'instagram.com' }), 'hold paid by gift');
    assert.equal(hg.confirmed, true); assert.equal(hg.appointment.status, 'confirmada');
    data = await g.post({ action: 'adminData', idToken: A });
    assert.equal(data.gifts[0].saldoRD, '500');
    // Cancelar con aviso devuelve el saldo a la tarjeta
    ok(await g.post({ action: 'cancel', id: hg.id, token: hg.manageToken }), 'cancel gift booking');
    data = await g.post({ action: 'adminData', idToken: A });
    assert.equal(data.gifts[0].saldoRD, '3000');

    // Reserva con código + PayPal
    const h = ok(await g.post({ action: 'hold', services: ['cejas', 'pestanas'], date: tue, time: '11:00', client, code: 'HOLA10', origen: 'Google' }), 'hold with code');
    assert.equal(h.totalRD, 2430); assert.equal(h.depositRD, 1215);
    ok(await g.post({ action: 'capture', id: h.id, orderId: h.orderId }), 'capture with code');
    data = await g.post({ action: 'adminData', idToken: A });
    assert.equal(data.promos.find((p) => p.codigo === 'HOLA10').usos, '1');
    cc = await g.post({ action: 'checkCode', services: ['cejas', 'pestanas'], code: 'HOLA10' }); assert.equal(cc.pricing.codeStatus, 'invalid'); // usos agotados
    fail(await g.post({ action: 'hold', services: ['cejas'], date: tue, time: '15:00', client, code: 'HOLA10' }), 'used-up code rejected');

    // --- Cita a mano y reprogramar
    const m = ok(await g.post({ action: 'adminCreate', idToken: A, services: ['micropigmentacion'], date: wed, time: '10:00', client: { name: 'Carla Peña', phone: '829 555 3333' }, depositRD: 3000, depositMethod: 'transferencia', origen: 'WhatsApp' }), 'manual create');
    assert.equal(m.item.payment.depositRD, 3000); assert.equal(m.item.payment.balanceRD, 9000); assert.equal(m.item.clientKey, 't:8295553333');
    fail(await g.post({ action: 'adminCreate', idToken: A, services: ['cejas'], date: wed, time: '11:00', client: { name: 'Otra' } }), 'manual conflict');
    ok(await g.post({ action: 'adminCreate', idToken: A, services: ['cejas'], date: wed, time: '11:00', client: { name: 'Otra' }, force: true }), 'manual forced');
    const rs = ok(await g.post({ action: 'adminReschedule', idToken: A, id: m.item.id, date: wed, time: '14:00' }), 'reschedule');
    assert.equal(rs.item.time, '14:00'); assert.equal(rs.item.rescheduledFrom, wed + ' 10:00');
    fail(await g.post({ action: 'adminReschedule', idToken: A, id: h.id, date: wed, time: '15:00' }), 'reschedule conflict');

    // --- Bloqueos que se repiten
    const bw = ok(await g.post({ action: 'adminBlock', idToken: A, tipo: 'semanal', dias: '2,3', horaDesde: '13:00', horaHasta: '14:00', fechaDesde: tue, motivo: 'Almuerzo' }), 'weekly block');
    let busy = (await g.get({ action: 'busy', from: tue, to: wed })).busy;
    assert.ok(busy.some((b) => b.start === new Date(tue + 'T13:00:00-04:00').toISOString()), 'weekly block busy on tue');
    fail(await g.post({ action: 'hold', services: ['cejas'], date: tue, time: '12:30', client }), 'weekly block blocks hold');
    const br = ok(await g.post({ action: 'adminBlock', idToken: A, tipo: 'rango', fechaDesde: '2026-12-24', fechaHasta: '2026-12-26', motivo: 'Navidad' }), 'range block');
    assert.equal((await g.get({ action: 'busy', from: '2026-12-23', to: '2026-12-27' })).busy.length, 4); // 3 de Navidad + almuerzo del miércoles 23
    fail(await g.post({ action: 'adminBlock', idToken: A, tipo: 'semanal', fechaDesde: tue }), 'weekly needs days');
    ok(await g.post({ action: 'adminDeleteBlock', idToken: A, id: br.block.id }), 'delete block');

    // --- Ajustes y servicios
    const saved = ok(await g.post({ action: 'adminSaveSettings', idToken: A, settings: { tasaUSD: '61', horario_lunes: '10:00-14:00', hackeo: 'x' }, services: [{ id: 'cejas', nombre: 'Cejas', duracionMin: 50, precioRD: 950, precioDesde: 'no', activo: 'si', volverDias: 25 }, { nombre: 'Lifting de pestañas', duracionMin: 60, precioRD: 2200, activo: 'si', volverDias: 45 }] }), 'save settings');
    assert.equal(saved.settings.find((s) => s.key === 'tasaUSD').value, '61');
    assert.ok(!saved.settings.find((s) => s.key === 'hackeo'));
    assert.ok(saved.services.find((s) => s.id === 'lifting-de-pestanas'));
    const cat2 = await g.get({ action: 'catalog' });
    assert.equal(cat2.payments.usdRate, 61); assert.ok(cat2.schedule.hours[1]); assert.equal(cat2.services.find((s) => s.id === 'cejas').price, 950);

    // --- Fichas y archivos
    ok(await g.post({ action: 'adminSaveClient', idToken: A, clave: 'e:laura@example.com', nombre: 'Laura Gómez', notas: 'Piel sensible. Pigmento: Brown 02.' }), 'save client');
    const png = Buffer.from('89504E470D0A1A0A0000000D49484452', 'hex').toString('base64');
    const up = ok(await g.post({ action: 'adminUpload', idToken: A, clave: 'e:laura@example.com', tipo: 'antes', mime: 'image/png', nombre: 'antes.png', data: png }), 'upload');
    fail(await g.post({ action: 'adminUpload', idToken: A, clave: 'e:laura@example.com', tipo: 'antes', mime: 'text/html', data: png }), 'bad mime');
    const fl = ok(await g.post({ action: 'adminFile', idToken: A, id: up.file.id }), 'get file');
    assert.equal(fl.data, png);
    ok(await g.post({ action: 'adminDeleteFile', idToken: A, id: up.file.id }), 'delete file');
    assert.equal(g.files.size, 0, 'el archivo se borró de Storage');

    // --- Gastos
    const ex = ok(await g.post({ action: 'adminSaveExpense', idToken: A, expense: { fecha: tue, concepto: 'Pigmentos', categoria: 'Insumos', montoRD: 4500 } }), 'expense');
    ok(await g.post({ action: 'adminDeleteExpense', idToken: A, id: ex.expense.id }), 'delete expense');

    // --- Pagos sin completar
    const ab = ok(await g.post({ action: 'hold', services: ['faciales'], date: tue, time: '16:00', client: { name: 'Sofía Reyes', phone: '809 555 4444', email: 'sofia@example.com' }, origen: 'TikTok' }), 'hold abandoned');
    ok(await g.post({ action: 'release', id: ab.id, token: ab.manageToken }), 'release abandoned');
    data = await g.post({ action: 'adminData', idToken: A });
    assert.equal(data.items.find((x) => x.id === ab.id).status, 'expirada');
    assert.equal(data.items.find((x) => x.id === ab.id).origin, 'TikTok');
    // --- Depósito por servicio
    ok(await g.post({ action: 'adminSaveSettings', idToken: A, services: [
      { id: 'micropigmentacion', nombre: 'Micropigmentación', duracionMin: 150, precioRD: 12000, activo: 'si', volverDias: 365, depositoPct: 30 },
      { id: 'depilacion', nombre: 'Depilación', duracionMin: 30, precioRD: 500, precioDesde: 'si', activo: 'si', volverDias: 30, depositoPct: 0 } ] }), 'per-service deposit');
    const catD = await g.get({ action: 'catalog' });
    assert.equal(catD.services.find((x) => x.id === 'depilacion').depositPercent, 0);
    const t3 = new Date(d); t3.setUTCDate(t3.getUTCDate() + 14); const tue3 = t3.toISOString().slice(0, 10);
    const hm = ok(await g.post({ action: 'hold', services: ['micropigmentacion'], date: tue3, time: '10:00', client }), 'hold 30%');
    assert.equal(hm.depositRD, 3600);
    const hd = ok(await g.post({ action: 'hold', services: ['depilacion'], date: tue3, time: '14:00', client }), 'hold 0% confirms');
    assert.equal(hd.confirmed, true); assert.equal(hd.appointment.payment.depositRD, 0); assert.equal(hd.appointment.payment.balanceRD, 500);
    const mix = ok(await g.post({ action: 'checkCode', services: ['depilacion', 'faciales'] }), 'mixed ratio');
    assert.equal(mix.pricing.depositRD, Math.round(3000 * (2500 * 50) / 3000 / 100));
    console.log('  correos enviados:', g.mails.length);
  } finally { await g.close(); }
}
