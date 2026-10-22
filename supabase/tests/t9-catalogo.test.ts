/* Catálogo de tres niveles: la tarifa pertenece exclusivamente al subservicio (hoja). */
import { harness, assert, okf, nextTuesday } from './harness.ts';

export default async function () {
  const g = await harness();
  const { ok, fail } = okf('catalogo-jerarquico');
  const A = 'admin-token';
  try {
    let cat = ok(await g.get({ action: 'catalog' }), 'catálogo original');
    assert.ok(cat.services.find((s: any) => s.id === 'cejas'), 'se conservan servicios existentes');
    assert.ok(cat.categories.find((c: any) => c.id === 'cejas'), 'la migración crea categorías');

    const saved = ok(await g.post({ action: 'adminSaveSettings', idToken: A,
      categories: [{ id: 'cejas', nombre: 'Cejas', orden: 1, activo: 'si' }],
      services: [
        { id: 'grupo-estilos', nombre: 'Estilos de cejas', categoriaId: 'cejas', tipo: 'grupo', activo: 'si', orden: 1 },
        { id: 'cejas-organicas', nombre: 'Cejas orgánicas', categoriaId: 'cejas', tipo: 'servicio',
          padreId: 'grupo-estilos', descripcion: 'Acabado natural', precioRD: 1200, duracionMin: 40,
          depositoPct: 25, activo: 'si', orden: 2 },
      ],
    }), 'crear grupo y subservicio');
    assert.ok(saved.services.find((s: any) => s.id === 'cejas-organicas'));
    cat = ok(await g.get({ action: 'catalog' }), 'catálogo anidado');
    assert.ok(cat.serviceGroups.some((g: any) => g.id === 'grupo-estilos'));
    assert.ok(!cat.services.some((s: any) => s.id === 'grupo-estilos'), 'el grupo no puede reservarse');
    const leaf = cat.services.find((s: any) => s.id === 'cejas-organicas');
    assert.equal(leaf.parentId, 'grupo-estilos');
    assert.equal(leaf.category, 'Cejas');
    assert.equal(leaf.price, 1200);
    assert.equal(leaf.durationMinutes, 40);
    assert.equal(leaf.description, 'Acabado natural');
    fail(await g.post({ action: 'hold', services: ['grupo-estilos'], date: nextTuesday(), time: '11:00',
      client: { name: 'Ana Pérez', phone: '8095551111', email: 'ana@example.com' } }), 'no reservar contenedor');
    const hold = ok(await g.post({ action: 'hold', services: ['cejas-organicas'], date: nextTuesday(), time: '11:00',
      client: { name: 'Ana Pérez', phone: '8095551111', email: 'ana@example.com' } }), 'reservar opción');
    assert.equal(hold.totalRD, 1200);
    assert.equal(hold.depositRD, 300);

    fail(await g.post({ action: 'adminSaveSettings', idToken: A, services: [
      { id: 'invalido', nombre: 'Servicio sin grupo válido', categoriaId: 'cejas',
        padreId: 'no-existe', activo: 'si' },
    ] }), 'rechazar padre inexistente');

    ok(await g.post({ action: 'adminSaveSettings', idToken: A, services: [
      { id: 'grupo-estilos', nombre: 'Estilos de cejas', categoriaId: 'cejas', tipo: 'grupo', activo: 'no' },
    ] }), 'ocultar grupo');
    cat = ok(await g.get({ action: 'catalog' }), 'catálogo oculto');
    assert.ok(!cat.services.some((s: any) => s.id === 'cejas-organicas'), 'la opción hija se oculta');
    assert.ok(cat.services.some((s: any) => s.id === 'cejas'), 'otro servicio de la categoría sigue visible');
    const data = ok(await g.post({ action: 'adminData', idToken: A }), 'citas anteriores intactas');
    assert.ok(data.items.some((a: any) => a.services.some((s: any) => s.id === 'cejas-organicas')));
  } finally { await g.close(); }
}
