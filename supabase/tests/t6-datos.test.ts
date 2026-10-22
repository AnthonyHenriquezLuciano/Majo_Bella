/* Validación de datos (nombres, teléfonos, correos), importación y cambios al instante */
import { harness, assert, okf } from './harness.ts';
import { normPhone_ as N, properName_ as P } from '../functions/_shared/core/util.ts';

export default async function () {
  const g = await harness();
  const { ok } = okf('datos');
  const fail = (r: any, label: string, re?: RegExp) => { if (r.ok) throw new Error('OK INESPERADO ' + label); if (re && !re.test(r.error)) throw new Error('ERROR DISTINTO ' + label + ': ' + r.error); console.log('  ✓', label, '→', r.error); return r; };
  const A = 'admin-token';
  try {
    assert.equal(P('maría JOSÉ de la cruz'), 'María José de la Cruz');
    assert.equal(P('  ana   pérez-gómez '), 'Ana Pérez-Gómez');
    assert.equal(P("o'neil del CARMEN"), "O'Neil del Carmen");
    assert.equal(P('DE LOS SANTOS'), 'De los Santos');
    console.log('✓ proper names');
    assert.deepEqual(N('8095551234'), { ok: true, value: '809-555-1234' });
    assert.deepEqual(N('(829) 555 12 34'), { ok: true, value: '829-555-1234' });
    assert.deepEqual(N('1-849-555-1234'), { ok: true, value: '849-555-1234' });
    assert.deepEqual(N('305 555 1234'), { ok: true, value: '+1 305-555-1234' });
    assert.deepEqual(N('+34 612 345 678'), { ok: true, value: '+34612345678' });
    assert.equal(N('555-1234').ok, false); assert.equal(N('80955512345').ok, false); assert.equal(N('+34 12').ok, false);
    console.log('✓ phones');
    const local = (ms) => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/Santo_Domingo' });
    const work = (n) => { for (let i = n; i < n + 8; i++) { const k = local(Date.now() + i * 86400000); const w = new Date(k + 'T12:00:00Z').getUTCDay(); if (w >= 2 && w <= 6) return k; } };
    const D = work(5);
    const base = { phone: '809 555 1234', email: 'Ana@Example.com' };
    fail(await g.post({ action: 'hold', services: ['cejas'], date: D, time: '10:00', client: { ...base, name: 'Ana' } }), 'no surname', /apellido/);
    fail(await g.post({ action: 'hold', services: ['cejas'], date: D, time: '10:00', client: { ...base, firstName: 'Ana', lastName: 'P' } }), 'surname too short', /apellido/);
    fail(await g.post({ action: 'hold', services: ['cejas'], date: D, time: '10:00', client: { ...base, firstName: 'Ana2', lastName: 'Pérez' } }), 'digits in name', /letras/);
    fail(await g.post({ action: 'hold', services: ['cejas'], date: D, time: '10:00', client: { ...base, firstName: 'Ana', lastName: 'Pérez', phone: '555 1234' } }), 'short phone', /10 dígitos/);
    fail(await g.post({ action: 'hold', services: ['cejas'], date: D, time: '10:00', client: { ...base, firstName: 'Ana', lastName: 'Pérez', email: 'ana@gmail' } }), 'bad email', /correo/);
    const h = ok(await g.post({ action: 'hold', services: ['cejas'], date: D, time: '10:00', client: { firstName: 'ana maría', lastName: 'PÉREZ DE LA ROSA', phone: '(809) 555-1234', email: ' Ana@Example.com ' } }), 'valid hold');
    const row = await g.row('Reservas', h.id);
    assert.equal(row.clienta, 'Ana María Pérez de la Rosa'); assert.equal(row.telefono, '809-555-1234'); assert.equal(row.correo, 'ana@example.com');
    console.log('✓ stored normalized');
    // Admin: nombre sin apellido permitido, teléfono inválido no
    ok(await g.post({ action: 'adminCreate', idToken: A, services: ['cejas'], date: work(9), time: '10:00', client: { name: 'LUISA' }, force: true }), 'admin first name only');
    fail(await g.post({ action: 'adminCreate', idToken: A, services: ['cejas'], date: work(9), time: '11:00', client: { name: 'Luisa', phone: '123' } }), 'admin bad phone', /teléfono/);
    ok(await g.post({ action: 'adminSaveClient', idToken: A, clave: 'e:x@x.com', nombre: 'carla  DÍAZ', telefono: '8295550000', correo: 'X@X.COM' }), 'admin save client');
    const cl = await g.row('Clientas', 'e:x@x.com'); assert.equal(cl.nombre, 'Carla Díaz'); assert.equal(cl.telefono, '829-555-0000'); assert.equal(cl.correo, 'x@x.com');
    // Datos de la hoja anterior: se ordenan al importar
    const imp = ok(await g.post({ action: 'adminImport', key: 'import-key', tables: { Reservas: [{ id: 'MJB-OLD-9', estado: 'completada', clienta: 'JUANA DE LA CRUZ', telefono: '8095557777', correo: 'JUANA@MAIL.COM' }] } }), 'import old row');
    const after = await g.row('Reservas', 'MJB-OLD-9');
    assert.equal(after.clienta, 'Juana de la Cruz'); assert.equal(after.telefono, '809-555-7777'); assert.equal(after.correo, 'juana@mail.com');
    console.log('  ✓ imported data normalized', JSON.stringify(imp.result));
    // Los cambios del panel se ven al instante en la web
    ok(await g.post({ action: 'adminSaveSettings', idToken: A, services: [{ id: 'cejas', nombre: 'Cejas', duracionMin: 45, precioRD: 950, activo: 'si' }] }), 'change price');
    assert.equal((await g.get({ action: 'catalog' })).services.find((x) => x.id === 'cejas').price, 950);
    ok(await g.post({ action: 'adminSaveSettings', idToken: A, services: [{ id: 'cejas', nombre: 'Cejas', duracionMin: 45, precioRD: 950, activo: 'no' }] }), 'deactivate service');
    assert.ok(!(await g.get({ action: 'catalog' })).services.find((x) => x.id === 'cejas'), 'servicio desactivado ya no sale');
    // El estado editorial es ahora la fuente de verdad para la publicación.
    await g.sql`update public.servicios set activo = true, estado = 'activo' where id = 'cejas'`;
    assert.ok((await g.get({ action: 'catalog' })).services.find((x) => x.id === 'cejas'), 'editar la base a mano también se ve al instante');
    // Horarios ocupados al día
    assert.equal((await g.get({ action: 'busy', from: D, to: D })).busy.length, 1);
    ok(await g.post({ action: 'hold', services: ['cejas'], date: D, time: '15:00', client: { name: 'Bea Santos', phone: '8095557777', email: 'bea@example.com' } }), 'second hold');
    assert.equal((await g.get({ action: 'busy', from: D, to: D })).busy.length, 2);
    // Rendimiento: tiempo de una reserva completa
    let t0 = Date.now();
    const h3 = await g.post({ action: 'hold', services: ['faciales'], date: work(12), time: '10:00', client: { name: 'Rita Gómez', phone: '8095550001', email: 'rita@example.com' } });
    const tHold = Date.now() - t0; t0 = Date.now();
    await g.post({ action: 'capture', id: h3.id, orderId: h3.orderId });
    const tCap = Date.now() - t0; t0 = Date.now();
    await g.post({ action: 'adminData', idToken: A });
    console.log('  ms · hold:', tHold, '· capture:', tCap, '· adminData:', Date.now() - t0);
  } finally { await g.close(); }
}
