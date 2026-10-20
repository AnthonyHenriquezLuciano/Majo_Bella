/* Apps: pagos con PayPal fuera del navegador (vuelven por pago.html) y avisos en el celular */
import { harness, assert, okf, nextTuesday } from './harness.ts';

export default async function () {
  const g = await harness();
  const { ok, fail } = okf('apps');
  try {
    const date = nextTuesday();
    const client = { name: 'Ana Pérez', phone: '809 555 1234', email: 'ana@example.com' };

    // En la web: sin páginas de regreso (los botones de PayPal se encargan)
    const w = ok(await g.post({ action: 'hold', services: ['cejas'], date, time: '10:00', client }), 'hold web');
    assert.ok(!g.pp.orders[w.orderId].context.return_url, 'la web no pide página de regreso');
    ok(await g.post({ action: 'release', id: w.id, token: w.manageToken }), 'release web');

    // En la app: PayPal vuelve a pago.html (que abre la app) y la API devuelve el enlace de aprobación
    const h = ok(await g.post({ action: 'hold', app: 'cliente', services: ['cejas'], date, time: '10:00', client, idToken: 'client-token' }), 'hold app');
    assert.match(h.approveUrl, /checkoutnow\?token=ORDER/, 'enlace de aprobación');
    const ctx = g.pp.orders[h.orderId].context;
    assert.match(ctx.return_url, /\/pago\.html\?r=ok$/, 'regreso al pagar');
    assert.match(ctx.cancel_url, /\/pago\.html\?r=cancel$/, 'regreso al cancelar');

    // Registro del celular
    fail(await g.post({ action: 'pushRegister', token: 'ExponentPushToken[abcdefghijklmnop]' }), 'sin sesión');
    fail(await g.post({ action: 'pushRegister', idToken: 'client-token', token: 'cualquier-cosa' }), 'token no válido');
    fail(await g.post({ action: 'pushRegister', idToken: 'client-token', app: 'estudio', token: 'ExponentPushToken[abcdefghijklmnop]' }), 'la app del estudio pide cuenta del estudio');
    ok(await g.post({ action: 'pushRegister', idToken: 'client-token', app: 'cliente', platform: 'android', token: 'ExponentPushToken[abcdefghijklmnop]' }), 'celular de la clienta');
    ok(await g.post({ action: 'pushRegister', idToken: 'client-token', app: 'cliente', platform: 'android', token: 'ExponentPushToken[abcdefghijklmnop]' }), 'registrar de nuevo no duplica');
    ok(await g.post({ action: 'pushRegister', idToken: 'client-token', app: 'cliente', platform: 'ios', token: 'ExponentPushToken[Viejoabcdefghij]' }), 'celular viejo');
    ok(await g.post({ action: 'pushRegister', idToken: 'admin-token', app: 'estudio', platform: 'ios', token: 'ExponentPushToken[estudio1234567890]' }), 'celular del estudio');
    assert.equal((await g.rows('Dispositivos')).length, 3);

    // Al confirmar: aviso a la clienta (app de clientas) y al estudio (app del estudio)
    ok(await g.post({ action: 'capture', id: h.id, orderId: h.orderId }), 'capture');
    const toClient = g.pushes.filter((p) => p.to === 'ExponentPushToken[abcdefghijklmnop]');
    const toStudio = g.pushes.filter((p) => p.to === 'ExponentPushToken[estudio1234567890]');
    assert.equal(toClient.length, 1, 'un aviso a la clienta'); assert.equal(toStudio.length, 1, 'un aviso al estudio');
    assert.equal(toClient[0].title, 'MAJOBELLA'); assert.equal(toStudio[0].title, 'MAJOBELLA · Estudio');
    assert.ok(!/MAJOBELLA$/.test(toClient[0].body), 'el texto no repite la marca');
    assert.equal(toClient[0].data.ref, h.id);
    // El celular que ya no existe se borra solo
    const left = (await g.rows('Dispositivos')).map((x: any) => x.token);
    assert.ok(!left.includes('ExponentPushToken[Viejoabcdefghij]'), 'token viejo borrado'); assert.equal(left.length, 2);

    // Saldo y tarjetas también con regreso a la app
    await g.set('Reservas', h.id, { inicio: new Date(Date.now() - 3600000).toISOString() });
    const bo = ok(await g.post({ action: 'balanceOrder', app: 'cliente', id: h.id, idToken: 'client-token' }), 'balanceOrder app');
    assert.ok(bo.approveUrl && g.pp.orders[bo.orderId].context.return_url, 'saldo con regreso');
    const go = ok(await g.post({ action: 'giftOrder', app: 'cliente', montoRD: 1000, para: 'Luisa', de: 'Ana', mensaje: '', correo: 'ana@example.com', correoPara: '' }), 'giftOrder app');
    assert.ok(go.approveUrl, 'tarjeta con enlace');

    // Cerrar sesión: deja de recibir avisos
    ok(await g.post({ action: 'pushUnregister', token: 'ExponentPushToken[abcdefghijklmnop]' }), 'pushUnregister');
    assert.equal((await g.rows('Dispositivos')).length, 1);
  } finally { await g.close(); }

  // Con Cloudflare Turnstile activo: la web necesita el cuadro; la app, haber iniciado sesión
  const g2 = await harness({ env: { TURNSTILE_SECRET: 'secreto' } });
  try {
    await g2.get({ action: 'catalog' });
    await g2.setSetting('turnstileSiteKey', 'clave-publica');
    const date = nextTuesday();
    const client = { name: 'Ana Pérez', phone: '809 555 1234', email: 'ana@example.com' };
    fail(await g2.post({ action: 'hold', services: ['cejas'], date, time: '10:00', client }), 'web sin cuadro');
    const r = fail(await g2.post({ action: 'hold', app: 'cliente', services: ['cejas'], date, time: '10:00', client }), 'app sin sesión');
    assert.match(r.error, /inicia sesión/);
    ok(await g2.post({ action: 'hold', app: 'cliente', idToken: 'client-token', services: ['cejas'], date, time: '10:00', client }), 'app con sesión');
    ok(await g2.post({ action: 'hold', captcha: 'ok-1', services: ['cejas'], date, time: '14:00', client }), 'web con cuadro');
  } finally { await g2.close(); }
}
