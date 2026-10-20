/* Contenido de la web: galería, reseñas, textos, foto de Majo y tarjetas de regalo compradas en la web */
import { harness, assert, okf } from './harness.ts';

export default async function () {
  const g = await harness();
  const { ok, fail } = okf('web');
  const A = 'admin-token';
  try {
    let cat = await g.get({ action: 'catalog' });
    assert.deepEqual(cat.gallery, []); assert.deepEqual(cat.reviews, []);
    assert.equal(cat.site.announcement.active, true); assert.equal(cat.site.majo.title, 'Conoce a Majo');
    assert.equal(cat.giftShop.enabled, true); assert.equal(cat.giftShop.min, 500);
    console.log('✓ catalog site content');

    // Galería
    const png = Buffer.from('fakepng').toString('base64');
    const a = ok(await g.post({ action: 'adminUpload', idToken: A, clave: 'e:ana@example.com', tipo: 'antes', mime: 'image/jpeg', data: png }), 'upload antes').file;
    const b = ok(await g.post({ action: 'adminUpload', idToken: A, clave: 'e:ana@example.com', tipo: 'despues', mime: 'image/jpeg', data: png }), 'upload despues').file;
    const pdf = ok(await g.post({ action: 'adminUpload', idToken: A, clave: 'e:ana@example.com', tipo: 'consentimiento', mime: 'application/pdf', data: png }), 'upload pdf').file;
    fail(await g.post({ action: 'adminPublishGallery', idToken: A, antesId: a.id, despuesId: b.id, servicio: 'Cejas' }), 'publish needs permission');
    fail(await g.post({ action: 'adminPublishGallery', idToken: A, antesId: a.id, despuesId: pdf.id, servicio: 'Cejas', permiso: true }), 'publish no pdf');
    fail(await g.post({ action: 'adminPublishGallery', idToken: 'client-token', antesId: a.id, despuesId: b.id, permiso: true }), 'publish needs admin');
    const it = ok(await g.post({ action: 'adminPublishGallery', idToken: A, antesId: a.id, despuesId: b.id, servicio: 'Cejas', texto: 'Microblading, 1 sesión', permiso: true }), 'publish').item;
    assert.match(it.antesUrl, /\/storage\/v1\/object\/public\/publico\/galeria\//, 'url pública');
        assert.ok(g.files.has('publico/' + it.antesId), 'copia en la carpeta pública'); assert.ok(g.files.has('fichas/' + a.driveId), 'el original sigue en la carpeta privada');
    cat = await g.get({ action: 'catalog' });
    assert.equal(cat.gallery.length, 1); assert.equal(cat.gallery[0].service, 'Cejas'); assert.equal(cat.gallery[0].text, 'Microblading, 1 sesión');
    ok(await g.post({ action: 'adminSaveGallery', idToken: A, id: it.id, visible: false }), 'hide gallery');
    assert.equal((await g.get({ action: 'catalog' })).gallery.length, 0);
    ok(await g.post({ action: 'adminSaveGallery', idToken: A, id: it.id, visible: true, texto: 'Nuevo' }), 'show gallery');
    assert.equal((await g.get({ action: 'catalog' })).gallery[0].text, 'Nuevo');
    let data = ok(await g.post({ action: 'adminData', idToken: A }), 'adminData');
    assert.equal(data.gallery.length, 1);
    ok(await g.post({ action: 'adminDeleteGallery', idToken: A, id: it.id }), 'delete gallery');
    assert.ok(!g.files.has('publico/' + it.antesId), 'public copy deleted'); assert.ok(g.files.has('fichas/' + a.driveId), 'private original kept');

    // Reseñas
    fail(await g.post({ action: 'adminSaveReview', idToken: A, review: { autora: '', texto: 'x' } }), 'review needs author');
    const r1 = ok(await g.post({ action: 'adminSaveReview', idToken: A, review: { autora: 'Carla M.', estrellas: 5, texto: 'Me encantaron mis cejas', fecha: '2026-09-02' } }), 'review 1').review;
    ok(await g.post({ action: 'adminSaveReview', idToken: A, review: { autora: 'Paola', estrellas: 9, texto: 'Excelente', orden: -1 } }), 'review 2');
    cat = await g.get({ action: 'catalog' });
    assert.equal(cat.reviews.length, 2); assert.equal(cat.reviews[0].author, 'Paola'); assert.equal(cat.reviews[0].stars, 5);
    ok(await g.post({ action: 'adminSaveReview', idToken: A, review: Object.assign({}, r1, { visible: false }) }), 'hide review');
    assert.equal((await g.get({ action: 'catalog' })).reviews.length, 1);
    ok(await g.post({ action: 'adminDeleteReview', idToken: A, id: r1.id }), 'delete review');
    assert.equal((await g.post({ action: 'adminData', idToken: A })).reviews.length, 1);

    // Ajustes de la web, con saltos de línea
    ok(await g.post({ action: 'adminSaveSettings', idToken: A, settings: { majoTexto: 'Hola, soy Majo.\n\nMe formé en...', majoCerts: 'Microblading\nLifting', anuncioTexto: '20% en cejas', googleRating: '4,9', googleResenas: '37' } }), 'save web settings');
    cat = await g.get({ action: 'catalog' });
    assert.equal(cat.site.majo.text, 'Hola, soy Majo.\n\nMe formé en...'); assert.deepEqual(cat.site.majo.certs, ['Microblading', 'Lifting']);
    assert.equal(cat.site.google.rating, 4.9); assert.equal(cat.site.google.count, 37); assert.equal(cat.site.announcement.text, '20% en cejas');

    // Foto de Majo
    fail(await g.post({ action: 'adminUploadPublic', idToken: A, mime: 'application/pdf', data: png }), 'majo photo pdf');
    const u1 = ok(await g.post({ action: 'adminUploadPublic', idToken: A, mime: 'image/jpeg', data: png }), 'majo photo').url;
    const id1 = 'publico/' + decodeURIComponent(u1.split('/object/public/publico/')[1]); assert.ok(g.files.has(id1), 'foto pública guardada');
    const u2 = ok(await g.post({ action: 'adminUploadPublic', idToken: A, mime: 'image/jpeg', data: png }), 'majo photo replace').url;
    assert.ok(!g.files.has(id1), 'old photo deleted'); assert.equal((await g.get({ action: 'catalog' })).site.majo.photo, u2);

    // Tarjeta comprada en la web
    fail(await g.post({ action: 'giftOrder', montoRD: 100, correo: 'p@example.com' }), 'gift min');
    fail(await g.post({ action: 'giftOrder', montoRD: 3000, correo: 'nope' }), 'gift email');
    const go = ok(await g.post({ action: 'giftOrder', montoRD: 3000, correo: 'Pedro@Example.com', correoPara: 'laura@example.com', de: 'Pedro', para: 'Laura', mensaje: 'Feliz cumple' }), 'gift order');
    assert.equal(go.montoUSD, (Math.ceil(3000 / 63 * 100) / 100).toFixed(2));
    data = await g.post({ action: 'adminData', idToken: A });
    assert.equal(data.gifts.length, 0, 'pending gift hidden');
    fail(await g.post({ action: 'giftCapture', id: go.id, orderId: 'OTHER' }), 'gift capture wrong order');
    g.pp.failCapture = true;
    fail(await g.post({ action: 'giftCapture', id: go.id, orderId: go.orderId }), 'gift capture declined');
    g.pp.failCapture = false;
    const mailsBefore = g.mails.length;
    const gc = ok(await g.post({ action: 'giftCapture', id: go.id, orderId: go.orderId }), 'gift capture').gift;
    assert.ok(/^MJB-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(gc.codigo)); assert.equal(gc.montoRD, 3000); assert.equal(gc.para, 'Laura');
    const to = g.mails.slice(mailsBefore).map((m) => m.to);
    assert.ok(to.includes('pedro@example.com') && to.includes('laura@example.com'), 'mails ' + to);
    assert.ok(g.mails.slice(mailsBefore)[0].htmlBody.includes(gc.codigo));
    // Repetir la captura no crea otra tarjeta ni cobra de nuevo
    const gc2 = ok(await g.post({ action: 'giftCapture', id: go.id, orderId: go.orderId }), 'gift capture idempotent').gift;
    assert.equal(gc2.codigo, gc.codigo);
    data = await g.post({ action: 'adminData', idToken: A });
    assert.equal(data.gifts.length, 1); assert.equal(data.gifts[0].saldoRD, '3000'); assert.equal(data.gifts[0].metodoPago, 'paypal');
    const cc = ok(await g.post({ action: 'checkCode', services: ['cejas'], giftCode: gc.codigo }), 'web gift usable');
    assert.ok(cc.pricing.giftAppliedRD > 0);
    // Una pendiente no se puede usar
    const go2 = ok(await g.post({ action: 'giftOrder', montoRD: 1000, correo: 'x@example.com' }), 'gift order 2');
    ok(await g.post({ action: 'adminSaveSettings', idToken: A, settings: { tarjetasEnLinea: 'no' } }), 'pause gift shop');
    assert.equal((await g.get({ action: 'catalog' })).giftShop.enabled, false);
    fail(await g.post({ action: 'giftOrder', montoRD: 1000, correo: 'x@example.com' }), 'gift shop paused');
  } finally { await g.close(); }
}
