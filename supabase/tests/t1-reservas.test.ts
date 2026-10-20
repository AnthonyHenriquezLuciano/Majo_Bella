/* Reservas, pagos con PayPal, cancelación, saldo, panel y bloqueos */
import { harness, assert, okf, nextTuesday } from './harness.ts';

export default async function () {
  const g = await harness();
  const { ok, fail } = okf('reservas');
  try {
    const date = nextTuesday();
    const cat = ok(await g.get({ action: 'catalog' }), 'catalog');
    assert.equal(cat.services.length, 5); assert.equal(cat.payments.usdRate, 63); assert.equal(cat.schedule.hours[1], null);

    const client = { name: 'Ana Pérez', phone: '809 555 1234', email: 'Ana@Example.com', notes: '=HYPERLINK("x")' };
    const h = ok(await g.post({ action: 'hold', services: ['cejas', 'pestanas'], date, time: '10:00', client }), 'hold');
    assert.equal(h.totalRD, 2700); assert.equal(h.depositRD, 1350); assert.equal(h.depositUSD, '21.43'); assert.equal(h.balanceRD, 1350);

    let busy = ok(await g.get({ action: 'busy', from: date, to: date }), 'busy with hold');
    assert.equal(busy.busy.length, 1);
    fail(await g.post({ action: 'hold', services: ['cejas'], date, time: '11:00', client }), 'overlap rejected');
    fail(await g.post({ action: 'hold', services: ['cejas'], date, time: '09:00', client }), 'before opening rejected');
    fail(await g.post({ action: 'hold', services: ['nope'], date, time: '14:00', client }), 'bad service');
    const mon = new Date(date + 'T12:00:00Z'); mon.setUTCDate(mon.getUTCDate() - 1);
    fail(await g.post({ action: 'hold', services: ['cejas'], date: mon.toISOString().slice(0, 10), time: '11:00', client }), 'monday closed');

    fail(await g.post({ action: 'capture', id: h.id, orderId: 'ORDER999' }), 'wrong order');
    const c = ok(await g.post({ action: 'capture', id: h.id, orderId: h.orderId }), 'capture');
    assert.equal(c.appointment.status, 'confirmada'); assert.equal(c.appointment.payment.depositPaid, true);
    ok(await g.post({ action: 'capture', id: h.id, orderId: h.orderId }), 'capture idempotent');
    assert.equal(g.mails.length, 2, 'correos de confirmación'); assert.equal(Object.keys(g.events).length, 1, 'evento de calendario');
    assert.ok((await g.row('Reservas', h.id)).eventoId, 'el id del evento queda guardado');

    const lk = ok(await g.post({ action: 'lookup', items: [{ id: h.id, token: h.manageToken }, { id: h.id, token: 'bad' }] }), 'lookup');
    assert.equal(lk.items.length, 1);
    assert.ok(String((await g.row('Reservas', h.id)).nota).startsWith('=HYPERLINK'), 'la nota se guarda tal cual, como texto');
    const mine = ok(await g.post({ action: 'myAppointments', idToken: 'client-token' }), 'myAppointments');
    assert.equal(mine.items.length, 1);

    fail(await g.post({ action: 'balanceOrder', id: h.id, token: 'bad' }), 'balance unauthorized');
    fail(await g.post({ action: 'balanceOrder', id: h.id, token: h.manageToken }), 'balance before appointment');
    await g.set('Reservas', h.id, { inicio: new Date(Date.now() - 3600000).toISOString() });
    const bo = ok(await g.post({ action: 'balanceOrder', id: h.id, token: h.manageToken }), 'balanceOrder');
    assert.equal(bo.balanceUSD, '21.43');
    const bc = ok(await g.post({ action: 'balanceCapture', id: h.id, orderId: bo.orderId, token: h.manageToken }), 'balanceCapture');
    assert.equal(bc.appointment.payment.balanceStatus, 'pagado');

    const h2 = ok(await g.post({ action: 'hold', services: ['faciales'], date, time: '14:00', client }), 'hold 2');
    ok(await g.post({ action: 'release', id: h2.id, token: h2.manageToken }), 'release');
    busy = await g.get({ action: 'busy', from: date, to: date }); assert.equal(busy.busy.length, 1);

    const h3 = ok(await g.post({ action: 'hold', services: ['faciales'], date, time: '14:00', client }), 'hold 3');
    ok(await g.post({ action: 'capture', id: h3.id, orderId: h3.orderId }), 'capture 3');
    const cn = ok(await g.post({ action: 'cancel', id: h3.id, token: h3.manageToken }), 'cancel with refund');
    assert.equal(cn.refunded, true); assert.equal(g.pp.refunds.length, 1);
    fail(await g.post({ action: 'cancel', id: h3.id, token: h3.manageToken }), 'double cancel');

    const h4 = ok(await g.post({ action: 'hold', services: ['faciales'], date, time: '15:00', client }), 'hold 4');
    await g.set('Reservas', h4.id, { retenidaHasta: new Date(Date.now() - 1000).toISOString() });
    const h5 = ok(await g.post({ action: 'hold', services: ['cejas'], date, time: '15:00', client: { ...client, email: 'otra@example.com' } }), 'hold 5 takes slot');
    ok(await g.post({ action: 'capture', id: h5.id, orderId: h5.orderId }), 'capture 5');
    fail(await g.post({ action: 'capture', id: h4.id, orderId: h4.orderId }), 'late capture refunded');
    assert.equal(g.pp.refunds.length, 2);
    assert.equal((await g.row('Reservas', h4.id)).estado, 'cancelada', 'la cita tardía queda cancelada (y guardada)');

    g.pp.failCapture = true;
    const h6 = ok(await g.post({ action: 'hold', services: ['cejas'], date, time: '16:00', client }), 'hold 6');
    fail(await g.post({ action: 'capture', id: h6.id, orderId: h6.orderId }), 'declined');
    g.pp.failCapture = false;

    fail(await g.post({ action: 'adminList', idToken: 'client-token' }), 'admin denied for client');
    const al = ok(await g.post({ action: 'adminData', idToken: 'admin-token' }), 'adminData');
    assert.ok(al.items.length >= 6 && al.security && al.security.folder.access === 'PRIVATE', 'datos del panel');
    ok(await g.post({ action: 'adminUpdate', idToken: 'admin-token', id: h5.id, op: 'saldoEfectivo' }), 'cash balance');
    ok(await g.post({ action: 'adminUpdate', idToken: 'admin-token', id: h5.id, op: 'completar' }), 'complete');
    const blk = ok(await g.post({ action: 'adminBlock', idToken: 'admin-token', date, from: '16:00', to: '17:00', reason: 'Vacaciones' }), 'block');
    fail(await g.post({ action: 'hold', services: ['cejas'], date, time: '16:00', client }), 'blocked slot rejected');
    ok(await g.post({ action: 'adminDeleteBlock', idToken: 'admin-token', id: blk.block.id }), 'unblock');
    ok(await g.post({ action: 'release', id: h6.id, token: h6.manageToken }), 'release 6');
    ok(await g.post({ action: 'hold', services: ['cejas'], date, time: '16:00', client }), 'slot free after unblock');

    // Dos reservas al mismo tiempo para el mismo horario: solo una gana
    const d2 = new Date(date + 'T12:00:00Z'); d2.setUTCDate(d2.getUTCDate() + 1); const wed = d2.toISOString().slice(0, 10);
    const both = await Promise.all([1, 2, 3].map((i) => g.post({ action: 'hold', services: ['cejas'], date: wed, time: '11:00', client: { ...client, email: `c${i}@example.com` } })));
    assert.equal(both.filter((x: any) => x.ok).length, 1, 'el candado deja pasar solo una');
  } finally { await g.close(); }
}
