/* Migración: datos reales creados con el backend anterior (Apps Script + hoja) pasan a la base nueva
   con la misma lógica que migrarABaseDeDatos() y migrarArchivos(), y la API nueva los usa sin problemas. */
import { createRequire } from 'node:module';
import { harness, assert, okf, nextTuesday } from './harness.ts';

const require = createRequire(import.meta.url);
const { load } = require('./legacy/gas.cjs');
const CODE = new URL('../../backend/google-apps-script/Code.gs', import.meta.url).pathname;

export default async function () {
  // 1) Datos en la hoja anterior
  const old = load(CODE);
  old.setup();
  const date = nextTuesday();
  const ana = { name: 'ana PÉREZ', phone: '809 555 1234', email: 'Ana@Example.com' };
  const A = 'admin-token';
  const h = old.post({ action: 'hold', services: ['cejas', 'pestanas'], date, time: '10:00', client: ana });
  old.post({ action: 'capture', id: h.id, orderId: h.orderId });
  old.post({ action: 'adminSavePromo', idToken: A, promo: { nombre: 'Bienvenida', tipo: 'codigo', codigo: 'HOLA10', servicios: 'todos', descuentoTipo: 'porcentaje', valor: 10 } });
  const gift = old.post({ action: 'adminSaveGift', idToken: A, gift: { montoRD: 3000, comprador: 'Pedro', para: 'Laura', metodoPago: 'efectivo' } }).gift;
  const pkg = old.post({ action: 'adminSavePackage', idToken: A, pkg: { nombre: '4 cejas', servicio: 'cejas', sesiones: 4, precioRD: 3000, enWeb: 'si' } }).pkg;
  const bono = old.post({ action: 'adminSellBono', idToken: A, paqueteId: pkg.id, client: { name: 'Lucía Bono', phone: '809 555 3333', email: 'lucia@example.com' } }).bono;
  old.post({ action: 'adminBlock', idToken: A, tipo: 'semanal', dias: '3', horaDesde: '13:00', horaHasta: '14:00', fechaDesde: date, motivo: 'Almuerzo' });
  old.post({ action: 'adminSaveAccount', idToken: A, account: { banco: 'Banco Popular', numero: '812345678', titular: 'María José Bella' } });
  old.post({ action: 'adminSaveClient', idToken: A, clave: 'e:ana@example.com', nombre: 'Ana Pérez', notas: 'Piel sensible', cumpleanos: '03-15' });
  const img = Buffer.from('foto-antes').toString('base64');
  const up = old.post({ action: 'adminUpload', idToken: A, clave: 'e:ana@example.com', tipo: 'antes', mime: 'image/jpeg', data: img }).file;
  const up2 = old.post({ action: 'adminUpload', idToken: A, clave: 'e:ana@example.com', tipo: 'despues', mime: 'image/jpeg', data: img }).file;
  const gal = old.post({ action: 'adminPublishGallery', idToken: A, antesId: up.id, despuesId: up2.id, servicio: 'Cejas', permiso: true }).item;
  old.post({ action: 'adminSaveReview', idToken: A, review: { autora: 'Carla', estrellas: 5, texto: 'Excelente' } });
  old.post({ action: 'adminSaveSettings', idToken: A, settings: { tasaUSD: '61', majoTexto: 'Hola, soy Majo.\n\nMe formé en...' } });
  old.cron();

  // 2) Copia a la base nueva (misma lógica que migrarABaseDeDatos / migrarArchivos)
  const g = await harness();
  const { ok } = okf('migración');
  try {
    old.ctx.resetDb_();
    const order = ['Ajustes', 'Servicios', 'Cuentas', 'Bloqueos', 'Promociones', 'Paquetes', 'Clientas', 'Tarjetas', 'Bonos', 'Gastos', 'Galeria', 'Resenas', 'Archivos', 'Espera', 'Reservas', 'Correos', 'Errores'];
    for (const name of order) {
      const rows = old.ctx.readOpt_(name).map((r: any) => { const o = { ...r }; delete o._row; return o; });
      if (rows.length) ok(await g.post({ action: 'adminImport', key: 'import-key', tables: { [name]: rows } }), 'copiar ' + name + ' (' + rows.length + ')');
    }
    // archivos
    const files = old.ctx.readOpt_('Archivos');
    for (const f of files) {
      const bytes = Buffer.from(old.drive[f.driveId].bytes.map((b: number) => (b + 256) % 256)).toString('base64');
      ok(await g.post({ action: 'adminImport', key: 'import-key', file: { tipo: 'archivo', id: f.id, mime: f.mime, data: bytes } }), 'archivo ' + f.id);
    }
    for (const [lado, idKey] of [['antes', 'antesId'], ['despues', 'despuesId']]) {
      const bytes = Buffer.from(old.drive[gal[idKey]].bytes.map((b: number) => (b + 256) % 256)).toString('base64');
      ok(await g.post({ action: 'adminImport', key: 'import-key', file: { tipo: 'galeria', id: gal.id, lado, mime: 'image/jpeg', data: bytes } }), 'galería ' + lado);
    }

    // 3) La API nueva trabaja con los datos copiados
    const cat = ok(await g.get({ action: 'catalog' }), 'catálogo');
    assert.equal(cat.payments.usdRate, 61); assert.equal(cat.site.majo.text, 'Hola, soy Majo.\n\nMe formé en...');
    assert.equal(cat.gallery.length, 1); assert.match(cat.gallery[0].before, /\/storage\/v1\/object\/public\/publico\/galeria\//);
    assert.equal(cat.transfer.accounts[0].bank, 'Banco Popular'); assert.equal(cat.packages.length, 1); assert.equal(cat.reviews.length, 1);
    const busy = ok(await g.get({ action: 'busy', from: date, to: date }), 'horarios ocupados');
    assert.equal(busy.busy.length, 1);
    const ad = ok(await g.post({ action: 'adminData', idToken: A }), 'datos del panel');
    const cita = ad.items.find((x: any) => x.id === h.id);
    assert.equal(cita.status, 'confirmada'); assert.equal(cita.client.name, 'Ana Pérez'); assert.equal(cita.client.email, 'ana@example.com');
    assert.equal(cita.payment.depositRD, 1350); assert.equal(cita.services.length, 2); assert.ok(cita.payment.depositPaid);
    assert.equal(ad.clients[0].cumpleanos, '03-15'); assert.ok(ad.emails.length >= 2, 'historial de correos');
    const f = ok(await g.post({ action: 'adminFile', idToken: A, id: up.id }), 'abrir ficha copiada');
    assert.equal(Buffer.from(f.data, 'base64').toString(), 'foto-antes');
    // códigos copiados siguen funcionando
    const cc = ok(await g.post({ action: 'checkCode', services: ['cejas', 'pestanas'], code: 'hola10', giftCode: gift.codigo }), 'código y tarjeta copiados');
    assert.equal(cc.pricing.codeStatus, 'ok'); assert.equal(cc.pricing.giftStatus, 'ok');
    const cb = ok(await g.post({ action: 'checkCode', services: ['cejas'], giftCode: bono.codigo }), 'paquete copiado');
    assert.equal(cb.pricing.giftKind, 'bono');
    // la clienta gestiona su cita copiada con la misma clave
    const lk = ok(await g.post({ action: 'lookup', items: [{ id: h.id, token: h.manageToken }] }), 'la clienta ve su cita con su clave');
    assert.equal(lk.items.length, 1);
    const cn = ok(await g.post({ action: 'cancel', id: h.id, token: h.manageToken }), 'cancelar cita copiada (reembolso PayPal)');
    assert.ok(cn.appointment.status === 'cancelada');
    // repetir la migración no duplica
    const again = ok(await g.post({ action: 'adminImport', key: 'import-key', tables: { Reservas: old.ctx.readOpt_('Reservas').map((r: any) => { const o = { ...r }; delete o._row; return o; }) } }), 'repetir');
    assert.equal(again.result.Reservas.nuevas, 0);
  } finally { await g.close(); }
}
