/* Paquetes, fidelidad, consentimiento, recordatorios y tareas automáticas, lista de espera, vistas previas de correos */
import { harness, assert, okf } from './harness.ts';

export default async function () {
  const g = await harness();
  const { ok, fail } = okf('extras');
  const A = 'admin-token';
  try {
    const local = (ms) => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santo_Domingo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ms)).map((x) => [x.type, x.value])); return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` }; };
    const nowL = local(Date.now());
    const hour = Number(nowL.time.slice(0, 2));
    console.log('local now', nowL, '(las tareas de día corren de 8 a 21 h)');
    const day = (n) => local(Date.now() + n * 86400000).date;
    let cat = await g.get({ action: 'catalog' });
    assert.equal(cat.loyalty.enabled, true); assert.equal(cat.loyalty.every, 5); assert.equal(cat.waitlist.enabled, true); assert.deepEqual(cat.packages, []);
    console.log('✓ catalog loyalty/waitlist/packages');

    // ---------- Paquetes
    fail(await g.post({ action: 'adminSavePackage', idToken: A, pkg: { nombre: 'X', servicio: 'nope', sesiones: 4, precioRD: 3000 } }), 'package bad service');
    const pkg = ok(await g.post({ action: 'adminSavePackage', idToken: A, pkg: { nombre: '4 sesiones de cejas', servicio: 'cejas', sesiones: 4, precioRD: 3000, venceDias: 180, enWeb: 'si' } }), 'save package').pkg;
    cat = await g.get({ action: 'catalog' });
    assert.equal(cat.packages.length, 1); assert.equal(cat.packages[0].regular, 3600); assert.equal(cat.packages[0].savings, 600);
    const bono = ok(await g.post({ action: 'adminSellBono', idToken: A, paqueteId: pkg.id, client: { name: 'Lucía Bono', phone: '809 555 3333', email: 'lucia@example.com' }, metodoPago: 'efectivo', notify: true }), 'sell bono').bono;
    assert.ok(/^PAQ-/.test(bono.codigo)); assert.equal(g.mails.at(-1).to, 'lucia@example.com'); assert.ok(g.mails.at(-1).htmlBody.includes(bono.codigo));
    let cc = ok(await g.post({ action: 'checkCode', services: ['cejas', 'pestanas'], giftCode: bono.codigo }), 'checkCode bono');
    assert.equal(cc.pricing.giftKind, 'bono'); assert.equal(cc.pricing.giftAppliedRD, 900); assert.equal(cc.pricing.totalRD, 2700); assert.equal(cc.pricing.depositRD, 900); assert.equal(cc.pricing.bonoLeft, 4);
    cc = ok(await g.post({ action: 'checkCode', services: ['faciales'], giftCode: bono.codigo }), 'checkCode bono other service');
    assert.equal(cc.pricing.giftStatus, 'notApplicable');
    const bonoClient = { name: 'Lucía Bono', phone: '809 555 3333', email: 'lucia@example.com' };
    fail(await g.post({ action: 'hold', services: ['faciales'], date: day(10), time: '10:00', client: bonoClient, giftCode: bono.codigo }), 'hold bono wrong service');
    const findTue = (n) => { for (let i = n; i < n + 8; i++) { const k = day(i); const dow = new Date(k + 'T12:00:00Z').getUTCDay(); if (dow >= 2 && dow <= 6) return k; } };
    const D1 = findTue(10);
    const hb = ok(await g.post({ action: 'hold', services: ['cejas'], date: D1, time: '10:00', client: bonoClient, giftCode: bono.codigo }), 'hold paid by bono');
    assert.equal(hb.confirmed, true); assert.equal((await g.row('Bonos', bono.id)).usadas, 1);
    assert.equal(hb.appointment.bono.code, bono.codigo);
    ok(await g.post({ action: 'cancel', id: hb.id, token: hb.manageToken }), 'cancel bono booking');
    assert.equal((await g.row('Bonos', bono.id)).usadas, 0);
    ok(await g.post({ action: 'adminSaveBono', idToken: A, id: bono.id, usadas: 4 }), 'adjust bono');
    assert.equal((await g.row('Bonos', bono.id)).estado, 'agotado');
    cc = await g.post({ action: 'checkCode', services: ['cejas'], giftCode: bono.codigo }); assert.equal(cc.pricing.giftStatus, 'invalid');
    console.log('✓ exhausted bono invalid');
    // Compra en la web
    fail(await g.post({ action: 'bonoOrder', paqueteId: pkg.id, client: { name: 'X' } }), 'bono order bad client');
    const bo = ok(await g.post({ action: 'bonoOrder', paqueteId: pkg.id, client: { name: 'Web Compra', phone: '809 555 4444', email: 'web@example.com' } }), 'bono order');
    assert.equal(bo.montoUSD, (Math.ceil(3000 / 63 * 100) / 100).toFixed(2));
    let data = ok(await g.post({ action: 'adminData', idToken: A }), 'adminData');
    assert.equal(data.bonos.length, 1, 'pending hidden');
    const bc = ok(await g.post({ action: 'bonoCapture', id: bo.id, orderId: bo.orderId }), 'bono capture');
    assert.ok(/^PAQ-/.test(bc.bono.codigo)); assert.equal(bc.bono.sesiones, 4);
    assert.ok(g.mails.some((m) => m.to === 'web@example.com' && m.htmlBody.includes(bc.bono.codigo)));
    assert.equal(ok(await g.post({ action: 'bonoCapture', id: bo.id, orderId: bo.orderId }), 'bono capture idempotent').bono.codigo, bc.bono.codigo);

    // ---------- Fidelidad
    const loyal = { name: 'Fiel Clienta', phone: '809 555 5555', email: 'fiel@example.com' };
    let lo = ok(await g.post({ action: 'loyalty', client: loyal }), 'loyalty none'); assert.equal(lo.eligible, false);
    for (let i = 0; i < 5; i++) {
      const r = ok(await g.post({ action: 'adminCreate', idToken: A, services: ['cejas'], date: day(-30 + i), time: '10:00', client: loyal, force: true }), 'past visit ' + i).item;
      ok(await g.post({ action: 'adminUpdate', idToken: A, id: r.id, op: 'completar' }), 'complete ' + i);
    }
    lo = ok(await g.post({ action: 'loyalty', client: { email: 'FIEL@example.com' } }), 'loyalty eligible'); assert.equal(lo.eligible, true); assert.equal(lo.value, 20);
    cc = ok(await g.post({ action: 'checkCode', services: ['faciales'], client: loyal }), 'checkCode loyalty');
    assert.equal(cc.pricing.discountRD, 500); assert.equal(cc.pricing.promoName, 'Premio de fidelidad'); assert.equal(cc.pricing.loyaltyApplied, true);
    const D2 = findTue(12);
    const hl = ok(await g.post({ action: 'hold', services: ['faciales'], date: D2, time: '10:00', client: loyal }), 'hold with loyalty');
    assert.equal(hl.totalRD, 2000);
    ok(await g.post({ action: 'capture', id: hl.id, orderId: hl.orderId }), 'capture loyalty');
    lo = await g.post({ action: 'loyalty', client: loyal }); assert.equal(lo.eligible, false);
    console.log('✓ loyalty consumed');
    ok(await g.post({ action: 'adminSaveSettings', idToken: A, settings: { fidelidadActiva: 'no' } }), 'loyalty off');
    assert.equal((await g.post({ action: 'loyalty', client: loyal })).enabled, false);

    // ---------- Consentimiento
    const cl = { name: 'Carla Firma', phone: '809 555 6666', email: 'carla@example.com' };
    const D3 = findTue(19);
    const hc = ok(await g.post({ action: 'hold', services: ['micropigmentacion'], date: D3, time: '10:00', client: cl, birthday: '' }), 'hold micro');
    const cap = ok(await g.post({ action: 'capture', id: hc.id, orderId: hc.orderId }), 'capture micro');
    assert.equal(cap.appointment.consent.needed, true); assert.equal(cap.appointment.consent.signed, false);
    const conf = g.mails.find((m) => m.to === 'carla@example.com' && /confirmada/.test(m.subject));
    assert.ok(conf.htmlBody.includes('consentimiento.html?c=') && conf.htmlBody.includes('MÁS YO, MÁS BELLA.') && conf.htmlBody.includes('assets/logo-majobella.png'));
    assert.ok(conf.body && conf.body.includes('Te esperamos'));
    const c = decodeURIComponent(cap.appointment.consent.url.split('?c=')[1]);
    fail(await g.post({ action: 'consentInfo', c: hc.id + '.mal' }), 'consent bad token');
    const info = ok(await g.post({ action: 'consentInfo', c }), 'consent info');
    assert.equal(info.questions.length, 8); assert.ok(info.text.length > 100); assert.equal(info.signed, false);
    const sig = 'data:image/png;base64,' + 'A'.repeat(3000);
    const answers = Object.fromEntries(info.questions.map((q) => [q.id, { value: q.id === 'alergias' ? 'si' : 'no', detail: q.id === 'alergias' ? 'Látex' : '' }]));
    fail(await g.post({ action: 'consentSign', c, name: 'Carla Firma', accept: true, signature: sig, answers: {} }), 'consent missing answers');
    fail(await g.post({ action: 'consentSign', c, name: 'Carla Firma', accept: false, signature: sig, answers }), 'consent not accepted');
    fail(await g.post({ action: 'consentSign', c, name: 'Carla Firma', accept: true, signature: 'x', answers }), 'consent no signature');
    ok(await g.post({ action: 'consentSign', c, name: 'Carla Firma', accept: true, signature: sig, answers, photos: 'si', extra: 'Nada más' }), 'consent sign');
    fail(await g.post({ action: 'consentSign', c, name: 'Carla Firma', accept: true, signature: sig, answers }), 'consent twice');
    data = await g.post({ action: 'adminData', idToken: A });
    const file = data.files.find((f) => f.citaId === hc.id);
    assert.equal(file.tipo, 'consentimiento'); assert.equal(file.mime, 'application/pdf');
    const pdfHtml = Buffer.from(g.files.get('fichas/' + file.driveId).bytes).toString();
    assert.ok(pdfHtml.includes('Látex') && pdfHtml.includes('Sí autorizo') && pdfHtml.includes('Carla Firma'));
    const appt = data.items.find((x) => x.id === hc.id);
    assert.equal(appt.consent.signed, true); assert.equal(appt.photoPermission, 'si');
    const copy = g.mails.find((m) => m.to === 'carla@example.com' && /consentimiento/.test(m.subject));
    assert.equal(copy.attachments.length, 1);
    console.log('✓ consent pdf + copy');

    // ---------- Recordatorio manual y automático
    const rem = ok(await g.post({ action: 'adminSendReminder', idToken: A, id: hc.id }), 'manual reminder');
    assert.ok(rem.item.reminderAt); assert.ok(/se acerca|mañana|hoy/.test(g.mails.at(-1).subject));
    const soon = local(Date.now() + 20 * 3600000);
    const tomorrow = ok(await g.post({ action: 'adminCreate', idToken: A, services: ['cejas'], date: soon.date, time: soon.time, client: { name: 'Mañana Clienta', phone: '809 555 7777', email: 'manana@example.com' }, force: true }), 'appt tomorrow').item;
    await g.set('Reservas', tomorrow.id, { creada: new Date(Date.now() - 3 * 86400000).toISOString() });
    // ---------- Reseña: cita realizada hace 6 h
    ok(await g.post({ action: 'adminSaveSettings', idToken: A, settings: { googleResenaUrl: 'https://g.page/r/test/review' } }), 'set review url');
    const past = local(Date.now() - 6 * 3600000);
    const rv = ok(await g.post({ action: 'adminCreate', idToken: A, services: ['cejas'], date: past.date, time: past.time, client: { name: 'Reseña Clienta', phone: '809 555 8888', email: 'resena@example.com' }, force: true }), 'appt 6h ago').item;
    ok(await g.post({ action: 'adminUpdate', idToken: A, id: rv.id, op: 'completar' }), 'complete review appt');
    // ---------- Retoque: micropigmentación hace 40 días
    const rt = ok(await g.post({ action: 'adminCreate', idToken: A, services: ['micropigmentacion'], date: day(-40), time: '10:00', client: { name: 'Retoque Clienta', phone: '809 555 9999', email: 'retoque@example.com' }, force: true }), 'micro 40 days ago').item;
    ok(await g.post({ action: 'adminUpdate', idToken: A, id: rt.id, op: 'completar' }), 'complete micro');
    // ---------- Cumpleaños hoy
    ok(await g.post({ action: 'adminSaveClient', idToken: A, clave: 'e:cumple@example.com', nombre: 'Cumple Clienta', correo: 'cumple@example.com', cumpleanos: nowL.date.slice(5) }), 'birthday today');
    // ---------- Lista de espera: día bloqueado
    const D5 = findTue(20);
    const blk = ok(await g.post({ action: 'adminBlock', idToken: A, tipo: 'unico', fechaDesde: D5, horaDesde: '00:00', horaHasta: '23:59', motivo: 'Lleno' }), 'block day').block;
    fail(await g.post({ action: 'waitlistJoin', date: D5, services: ['cejas'], client: { name: 'E' } }), 'waitlist bad client');
    const wl = ok(await g.post({ action: 'waitlistJoin', date: D5, franja: 'tarde', services: ['cejas'], client: { name: 'Espera Clienta', phone: '809 555 1212', email: 'espera@example.com' } }), 'waitlist join');
    assert.deepEqual(wl.available, []);
    assert.equal(ok(await g.post({ action: 'waitlistJoin', date: D5, franja: 'tarde', services: ['cejas'], client: { name: 'Espera Clienta', phone: '809 555 1212', email: 'espera@example.com' } }), 'waitlist dup').already, true);
    ok(await g.post({ action: 'adminDeleteBlock', idToken: A, id: blk.id }), 'unblock');

    const before = g.mails.length;
    const out = (await g.cron()).result;
    console.log('cron result', out);
    const sent = g.mails.slice(before);
    const to = (e) => sent.find((m) => m.to === e);
    assert.ok(to('manana@example.com') && /(mañana|hoy)/.test(to('manana@example.com').subject), 'reminder');
    assert.equal(out.espera, 1); assert.ok(to('espera@example.com') && to('espera@example.com').htmlBody.includes('p. m.'));
    if (hour >= 8 && hour < 21) {
      assert.ok(to('resena@example.com') && to('resena@example.com').htmlBody.includes('g.page/r/test/review'), 'review');
      assert.ok(to('retoque@example.com') && to('retoque@example.com').htmlBody.includes('servicio=micropigmentacion'), 'retouch');
      const bd = to('cumple@example.com'); assert.ok(bd, 'birthday');
      const code = bd.htmlBody.match(/CUMPLE-[A-Z0-9]{5}/)[0];
      cc = ok(await g.post({ action: 'checkCode', services: ['faciales'], code }), 'birthday code');
      assert.equal(cc.pricing.discountRD, 375);
    } else console.log('(fuera de 8–21 h: reseña, retoque y cumpleaños no se prueban ahora)');
    const again = (await g.cron()).result;
    assert.deepEqual([again.recordatorios, again.espera, again.cumpleanos], [0, 0, 0]);
    console.log('✓ cron does not repeat');
    data = await g.post({ action: 'adminData', idToken: A });
    assert.equal(data.waitlist[0].estado, 'avisada'); assert.ok(data.emails.length > 5); assert.equal(data.automation.trigger, true); assert.ok(data.automation.lastRun.at);
    assert.ok(data.emails.every((e) => e.estado === 'enviado'));
    ok(await g.post({ action: 'adminWaitlist', idToken: A, id: wl.id, op: 'eliminar' }), 'waitlist remove');

    // ---------- Vista previa y prueba
    for (const t of ['confirmacion', 'recordatorio', 'resena', 'retoque', 'cumpleanos', 'espera', 'paquete', 'cancelacion', 'consentimiento']) {
      const pv = ok(await g.post({ action: 'adminEmailPreview', idToken: A, tipo: t }), 'preview ' + t);
      assert.ok(pv.html.includes('MÁS YO, MÁS BELLA.') && pv.subject);
    }
    const test = ok(await g.post({ action: 'adminEmailTest', idToken: A, tipo: 'recordatorio' }), 'email test');
    assert.equal(test.to, 'majo@example.com'); assert.ok(/^\[Prueba\]/.test(g.mails.at(-1).subject));
    fail(await g.post({ action: 'adminEmailPreview', idToken: 'client-token', tipo: 'resena' }), 'preview needs admin');
    ok(await g.post({ action: 'adminRunAutomations', idToken: A }), 'run automations');

    // ---------- Cumpleaños en la reserva
    const bk = ok(await g.post({ action: 'hold', services: ['cejas'], date: findTue(16), time: '11:00', client: { name: 'Nueva Cumple', phone: '809 555 2323', email: 'nueva@example.com', birthday: '03-15' } }), 'hold with birthday');
    ok(await g.post({ action: 'capture', id: bk.id, orderId: bk.orderId }), 'capture birthday');
    data = await g.post({ action: 'adminData', idToken: A });
    assert.equal(data.clients.find((x) => x.clave === 'e:nueva@example.com').cumpleanos, '03-15');
    ok(await g.post({ action: 'adminSaveClient', idToken: A, clave: 'e:nueva@example.com', nombre: 'Nueva Cumple', cumpleanos: '1990-07-04' }), 'birthday full date');
    assert.equal((await g.post({ action: 'adminData', idToken: A })).clients.find((x) => x.clave === 'e:nueva@example.com').cumpleanos, '07-04');

    // ---------- Servicios: retoque y consentimiento editables
    data = ok(await g.post({ action: 'adminSaveSettings', idToken: A, services: [{ id: 'cejas', nombre: 'Cejas', duracionMin: 45, precioRD: 900, precioDesde: 'no', activo: 'si', volverDias: 28, depositoPct: 50, retoqueDias: 30, consentimiento: 'si' }] }), 'save service extras');
    const cj = data.services.find((x) => x.id === 'cejas'); assert.equal(cj.retoqueDias, 30); assert.equal(cj.consentimiento, 'si');
    // Correo que falla queda anotado
    g.state.failMail = true;
    ok(await g.post({ action: 'adminEmailTest', idToken: A, tipo: 'resena' }), 'email queued');
    assert.equal((await g.post({ action: 'adminData', idToken: A })).emails[0].estado, 'error');
  } finally { await g.close(); }
}
