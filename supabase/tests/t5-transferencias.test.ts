/* Depósito por transferencia, cuentas, cambio de fecha, billetera, límites de intentos, Turnstile y avisos del sistema */
import { harness, assert, okf } from './harness.ts';

export default async function () {
  const g = await harness();
  const { ok } = okf('tanda1');
  const fail = (r: any, label: string, re?: RegExp) => { if (r.ok) throw new Error('OK INESPERADO ' + label + ': ' + JSON.stringify(r).slice(0, 200)); if (re && !re.test(r.error)) throw new Error('ERROR DISTINTO ' + label + ': ' + r.error); console.log('  ✓', label, '→', r.error); return r; };
  const A = 'admin-token';
  try {
    const local = (ms) => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santo_Domingo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(ms)).map((x) => [x.type, x.value])); return `${p.year}-${p.month}-${p.day}`; };
    const day = (n) => local(Date.now() + n * 86400000);
    const workday = (n) => { for (let i = n; i < n + 8; i++) { const k = day(i); const dow = new Date(k + 'T12:00:00Z').getUTCDay(); if (dow >= 2 && dow <= 6) return k; } };
    let cat = await g.get({ action: 'catalog' });
    assert.equal(cat.transfer.enabled, false); assert.equal(cat.reschedule.max, 1); assert.equal(cat.security.turnstileSiteKey, ''); assert.equal(cat.site.business.name, 'MAJOBELLA Beauty Studio');
    console.log('✓ catalog: transfer off without accounts');
    const ana = { name: 'Ana Transferencia', phone: '809 555 1212', email: 'ana@example.com' };
    const D = workday(6), D2 = workday(13);
    fail(await g.post({ action: 'hold', services: ['cejas'], date: D, time: '10:00', client: ana, method: 'transferencia' }), 'hold transfer disabled', /transferencia no está disponible/);
    // ---- Cuentas
    fail(await g.post({ action: 'adminSaveAccount', idToken: A, account: { banco: 'Popular' } }), 'account incomplete');
    const acc1 = ok(await g.post({ action: 'adminSaveAccount', idToken: A, account: { banco: 'Banco Popular', tipo: 'Ahorros', numero: '812345678', titular: 'María José Bella', documento: '001-0000000-1' } }), 'save account 1').account;
    const acc2 = ok(await g.post({ action: 'adminSaveAccount', idToken: A, account: { banco: 'Banreservas', tipo: 'Corriente', numero: '960000111', titular: 'MAJOBELLA SRL' } }), 'save account 2').account;
    const acc3 = ok(await g.post({ action: 'adminSaveAccount', idToken: A, account: { banco: 'BHD', numero: '1', titular: 'X', activa: 'no' } }), 'save inactive account').account;
    cat = await g.get({ action: 'catalog' });
    assert.equal(cat.transfer.enabled, true); assert.equal(cat.transfer.minutes, 60); assert.deepEqual(cat.transfer.accounts.map((a) => a.bank), ['Banco Popular', 'Banreservas']);
    ok(await g.post({ action: 'adminSaveAccount', idToken: A, account: { ...acc2, id: acc2.id, banco: 'Banreservas', nota: 'Solo transferencias' } }), 'edit account');
    assert.equal((await g.get({ action: 'catalog' })).transfer.accounts[1].note, 'Solo transferencias');
    ok(await g.post({ action: 'adminDeleteAccount', idToken: A, id: acc3.id }), 'delete account');
    assert.equal((await g.rows('Cuentas')).length, 2);
    // ---- Reserva por transferencia
    const h = ok(await g.post({ action: 'hold', services: ['cejas'], date: D, time: '10:00', client: ana, method: 'transferencia' }), 'hold transfer');
    assert.equal(h.transfer, true); assert.equal(h.accounts.length, 2); assert.ok(!h.orderId); assert.equal(h.depositRD, 450);
    const mins = (new Date(h.expiresAt).getTime() - Date.now()) / 60000; assert.ok(mins > 55 && mins <= 60, String(mins));
    assert.equal((await g.row('Reservas', h.id)).metodoDeposito, 'transferencia');
    let busy = (await g.get({ action: 'busy', from: D, to: D })).busy; assert.equal(busy.length, 1);
    const img = Buffer.from('fake-jpeg').toString('base64');
    fail(await g.post({ action: 'transferProof', id: h.id, token: 'nope', mime: 'image/jpeg', data: img }), 'proof wrong token');
    fail(await g.post({ action: 'transferProof', id: h.id, token: h.manageToken, mime: 'text/plain', data: img }), 'proof bad mime');
    const mailsBefore = g.mails.length;
    const pr = ok(await g.post({ action: 'transferProof', id: h.id, token: h.manageToken, mime: 'image/jpeg', data: img, accountId: acc2.id, ref: '12345' }), 'upload proof');
    assert.equal(pr.appointment.status, 'por-confirmar'); assert.equal(pr.appointment.payment.transfer.proof, true); assert.equal(pr.appointment.payment.transfer.account, acc2.id);
    const newMails = g.mails.slice(mailsBefore);
    assert.equal(newMails.length, 2); assert.equal(newMails[0].to, 'ana@example.com'); assert.ok(/comprobante/i.test(newMails[0].subject));
    assert.ok(/Transferencia por revisar/.test(newMails[1].subject)); assert.equal(newMails[1].attachments.length, 1); assert.ok(newMails[1].htmlBody.includes('960000111'));
    const arc = (await g.rows('Archivos')).find((x) => x.citaId === h.id); assert.equal(arc.tipo, 'comprobante');
    await g.set('Reservas', h.id, { retenidaHasta: new Date(Date.now() - 3600000).toISOString() }); // aunque sea viejo, por-confirmar no vence
    assert.equal((await g.get({ action: 'busy', from: D, to: D })).busy.length, 1);
    fail(await g.post({ action: 'hold', services: ['cejas'], date: D, time: '10:00', client: { ...ana, email: 'otra@example.com' } }), 'slot held while por-confirmar');
    const mine = ok(await g.post({ action: 'myAppointments', idToken: 'client-token' }), 'myAppointments');
    assert.ok(mine.items.some((x) => x.id === h.id && x.status === 'por-confirmar'));
    let ad = ok(await g.post({ action: 'adminData', idToken: A }), 'adminData');
    let item = ad.items.find((x) => x.id === h.id); assert.equal(item.proofId, arc.id); assert.equal(item.transferRef, '12345');
    assert.equal(ad.accounts.length, 2); assert.equal(ad.security.folder.access, 'PRIVATE'); assert.equal(ad.security.database.rls, true); assert.equal(ad.security.accesses[0].email, 'majo@example.com');
    ok(await g.post({ action: 'adminFile', idToken: A, id: arc.id }), 'admin can open proof');
    // confirmar
    const ev0 = Object.keys(g.events).length;
    const cf = ok(await g.post({ action: 'adminTransferReview', idToken: A, id: h.id, decision: 'confirmar' }), 'confirm transfer');
    assert.equal(cf.item.status, 'confirmada'); assert.ok(cf.item.payment.depositPaid); assert.equal(Object.keys(g.events).length, ev0 + 1);
    assert.ok(/confirmada/.test(g.mails.at(-1).subject)); assert.equal(g.mails.at(-1).to, 'ana@example.com');
    fail(await g.post({ action: 'adminTransferReview', idToken: A, id: h.id, decision: 'confirmar' }), 'cannot review twice');
    // cliente cancela con >24h → reembolso pendiente a mano
    const cc = ok(await g.post({ action: 'cancel', id: h.id, token: h.manageToken }), 'client cancels transfer booking');
    assert.equal(cc.refundManual, true); assert.ok(/por transferencia en los próximos días/.test(g.mails.find((m) => m.to === 'ana@example.com' && /cancelada/.test(m.subject)).htmlBody));
    ad = await g.post({ action: 'adminData', idToken: A }); item = ad.items.find((x) => x.id === h.id);
    assert.equal(item.refundPending, true); assert.equal(item.payment.refund, 'pendiente');
    ok(await g.post({ action: 'adminUpdate', idToken: A, id: h.id, op: 'reembolsoHecho', note: 'Transferido al Popular' }), 'refund done');
    fail(await g.post({ action: 'adminUpdate', idToken: A, id: h.id, op: 'reembolsoHecho' }), 'refund done twice');
    assert.ok(/^reembolsado a mano/.test((await g.row('Reservas', h.id)).reembolso));
    // rechazar
    const h2 = ok(await g.post({ action: 'hold', services: ['faciales'], date: D, time: '13:00', client: ana, method: 'transferencia' }), 'hold transfer 2');
    ok(await g.post({ action: 'transferProof', id: h2.id, token: h2.manageToken, mime: 'application/pdf', data: img }), 'proof pdf (single account auto?)');
    const rj = ok(await g.post({ action: 'adminTransferReview', idToken: A, id: h2.id, decision: 'rechazar', reason: 'El monto no coincide.' }), 'reject transfer');
    assert.equal(rj.item.status, 'cancelada'); assert.ok(g.mails.at(-1).htmlBody.includes('El monto no coincide.'));
    assert.equal((await g.get({ action: 'busy', from: D, to: D })).busy.length, 0);
    // comprobante tarde: horario libre → se acepta; ocupado → error
    const h3 = ok(await g.post({ action: 'hold', services: ['cejas'], date: D, time: '15:00', client: ana, method: 'transferencia' }), 'hold transfer 3');
    await g.set('Reservas', h3.id, { retenidaHasta: new Date(Date.now() - 60000).toISOString() });
    ok(await g.post({ action: 'transferProof', id: h3.id, token: h3.manageToken, mime: 'image/png', data: img }), 'late proof accepted when slot free');
    const h4 = ok(await g.post({ action: 'hold', services: ['cejas'], date: D, time: '16:00', client: ana, method: 'transferencia' }), 'hold transfer 4');
    await g.set('Reservas', h4.id, { retenidaHasta: new Date(Date.now() - 60000).toISOString() });
    const other = ok(await g.post({ action: 'hold', services: ['cejas'], date: D, time: '16:00', client: { name: 'Bea Santos', phone: '809 555 7777', email: 'bea@example.com' } }), 'someone takes the slot');
    ok(await g.post({ action: 'capture', id: other.id, orderId: other.orderId }), 'capture other');
    fail(await g.post({ action: 'transferProof', id: h4.id, token: h4.manageToken, mime: 'image/png', data: img }), 'late proof refused when slot taken', /se ocupó/);
    // ---- Cambiar fecha
    const b = ok(await g.post({ action: 'hold', services: ['pestanas'], date: D2, time: '10:00', client: ana }), 'hold paypal for reschedule');
    ok(await g.post({ action: 'capture', id: b.id, orderId: b.orderId }), 'capture');
    fail(await g.post({ action: 'reschedule', id: b.id, token: 'x', date: D2, time: '11:00' }), 'reschedule unauthorized');
    fail(await g.post({ action: 'reschedule', id: b.id, token: b.manageToken, date: D2, time: '07:00' }), 'reschedule outside hours', /fuera del horario/);
    fail(await g.post({ action: 'reschedule', id: b.id, token: b.manageToken, date: D, time: '16:00' }), 'reschedule into busy slot', /ocuparse/);
    const m0 = g.mails.length;
    const rs = ok(await g.post({ action: 'reschedule', id: b.id, token: b.manageToken, date: D2, time: '14:00' }), 'reschedule');
    assert.equal(rs.appointment.time, '14:00'); assert.deepEqual(rs.appointment.changes, { used: 1, max: 1 });
    assert.equal(g.mails.length, m0 + 2); assert.ok(/cambió/.test(g.mails[m0].subject)); assert.ok(/La clienta cambió su cita/.test(g.mails[m0 + 1].subject));
    fail(await g.post({ action: 'reschedule', id: b.id, token: b.manageToken, date: D2, time: '15:00' }), 'second reschedule blocked', /Ya cambiaste/);
    ok(await g.post({ action: 'adminSaveSettings', idToken: A, settings: { cambiosMax: '2' } }), 'allow 2 changes');
    ok(await g.post({ action: 'reschedule', id: b.id, idToken: 'client-token', date: D2, time: '15:00' }), 'second reschedule with google login');
    ok(await g.post({ action: 'adminSaveSettings', idToken: A, settings: { cambiosMax: '0' } }), 'disable changes');
    assert.equal((await g.get({ action: 'catalog' })).reschedule.max, 0);
    fail(await g.post({ action: 'reschedule', id: b.id, token: b.manageToken, date: D2, time: '16:00' }), 'reschedule disabled', /WhatsApp/);
    ok(await g.post({ action: 'adminSaveSettings', idToken: A, settings: { cambiosMax: '1' } }), 'back to 1');
    // <24h
    const soon = ok(await g.post({ action: 'adminCreate', idToken: A, services: ['cejas'], date: day(0), time: '20:00', client: ana, force: true }), 'appointment soon').item;
    // adminCreate rows have random token; use google login
    fail(await g.post({ action: 'reschedule', id: soon.id, idToken: 'client-token', date: D2, time: '16:00' }), 'reschedule <24h', /menos de 24 horas/);
    // ---- Billetera unida
    const go = ok(await g.post({ action: 'giftOrder', montoRD: 2500, de: 'Ana', para: 'Laura', correo: 'ana@example.com', correoPara: 'laura@example.com' }), 'gift order');
    const gc = ok(await g.post({ action: 'giftCapture', id: go.id, orderId: go.orderId }), 'gift capture');
    const pk = ok(await g.post({ action: 'adminSavePackage', idToken: A, pkg: { nombre: '4 cejas', servicio: 'cejas', sesiones: 4, precioRD: 3000, enWeb: 'si' } }), 'pkg').pkg;
    const bo = ok(await g.post({ action: 'bonoOrder', paqueteId: pk.id, client: ana }), 'bono order');
    const bc = ok(await g.post({ action: 'bonoCapture', id: bo.id, orderId: bo.orderId }), 'bono capture');
    const w = ok(await g.post({ action: 'myWallet', idToken: 'client-token' }), 'myWallet');
    assert.deepEqual(w.items.map((x) => x.code).sort(), [gc.gift.codigo, bc.bono.codigo].sort());
    fail(await g.post({ action: 'myWallet', idToken: 'bad' }), 'myWallet needs login');
    const wm = g.mails.length;
    const we = ok(await g.post({ action: 'walletEmail', email: 'ANA@example.com' }), 'wallet email');
    assert.equal(g.mails.length, wm + 1); assert.ok(g.mails.at(-1).htmlBody.includes(gc.gift.codigo) && g.mails.at(-1).htmlBody.includes(bc.bono.codigo));
    ok(await g.post({ action: 'walletEmail', email: 'ana@example.com' }), 'wallet email again (throttled)'); assert.equal(g.mails.length, wm + 1);
    const we2 = ok(await g.post({ action: 'walletEmail', email: 'laura@example.com' }), 'wallet email recipient'); assert.equal(g.mails.length, wm + 2); assert.ok(g.mails.at(-1).htmlBody.includes(gc.gift.codigo));
    ok(await g.post({ action: 'walletEmail', email: 'nadie@example.com' }), 'wallet email unknown → same answer, no mail'); assert.equal(g.mails.length, wm + 2);
    assert.equal(we.message, we2.message);
    // ---- Límite de intentos
    for (let i = 0; i < 8; i++) await await g.post({ action: 'checkCode', services: ['cejas'], giftCode: 'MJB-NOPE-000' + i, device: 'DEV1' });
    fail(await g.post({ action: 'checkCode', services: ['cejas'], giftCode: gc.gift.codigo, device: 'DEV1' }), 'device rate limited', /Demasiados intentos/);
    fail(await g.post({ action: 'walletLookup', codes: [gc.gift.codigo], device: 'DEV1' }), 'wallet lookup rate limited');
    ok(await g.post({ action: 'checkCode', services: ['cejas'], giftCode: gc.gift.codigo, device: 'DEV2' }), 'other device fine');
    // ---- Turnstile
    ok(await g.post({ action: 'adminSaveSettings', idToken: A, settings: { turnstileSiteKey: '0xSITEKEY' } }), 'site key');
    assert.equal((await g.get({ action: 'catalog' })).security.turnstileSiteKey, '', 'no key published without secret');
    ok(await g.post({ action: 'hold', services: ['cejas'], date: D2, time: '11:00', client: ana }), 'hold without secret works');
    g.env.TURNSTILE_SECRET = 'secret';
    assert.equal((await g.get({ action: 'catalog' })).security.turnstileSiteKey, '0xSITEKEY');
    fail(await g.post({ action: 'hold', services: ['cejas'], date: D2, time: '12:00', client: ana }), 'hold without captcha', /robot/);
    fail(await g.post({ action: 'hold', services: ['cejas'], date: D2, time: '12:00', client: ana, captcha: 'bad' }), 'hold bad captcha');
    ok(await g.post({ action: 'hold', services: ['cejas'], date: D2, time: '12:00', client: ana, captcha: 'ok-123' }), 'hold with captcha');
    fail(await g.post({ action: 'giftOrder', montoRD: 1000, correo: 'a@b.co' }), 'gift order needs captcha');
    fail(await g.post({ action: 'walletEmail', email: 'ana@example.com' }), 'wallet email needs captcha');
    delete g.env.TURNSTILE_SECRET;
    // ---- Errores y avisos: se cobró pero no se pudo guardar (la base rechaza la escritura)
    await g.sql.unsafe(`create function public._falla() returns trigger language plpgsql as $$ begin if new.clienta = 'Falla Prueba' and new.paypal_captura is not null then raise exception 'disco lleno'; end if; return new; end $$; create trigger _falla before update on public.reservas for each row execute function public._falla();`);
    const before = (await g.rows('Errores')).length;
    const hx = ok(await g.post({ action: 'hold', services: ['cejas'], date: D2, time: '16:00', client: { name: 'Falla Prueba', phone: '809 555 1313', email: 'falla@example.com' } }), 'hold before failing capture');
    const mx = g.mails.length;
    const capx = await g.post({ action: 'capture', id: hx.id, orderId: hx.orderId });
    fail(capx, 'paid but failed', /Recibimos tu pago/);
    let errs = await g.rows('Errores'); assert.equal(errs.length, before + 1); assert.equal(errs.at(-1).tipo, 'pago'); assert.ok(errs.at(-1).avisado); assert.ok(/CAP/.test(errs.at(-1).mensaje), 'el aviso incluye el id del cobro');
    assert.equal(g.mails.length, mx + 1, 'solo el aviso urgente, no la confirmación'); assert.ok(/Un cobro necesita revisión/.test(g.mails[mx].subject));
    await g.sql`drop trigger _falla on public.reservas`;
    // Al reintentar, PayPal dice que ya se cobró y la cita se confirma con ese cobro
    const again = ok(await g.post({ action: 'capture', id: hx.id, orderId: hx.orderId }), 'retry after failure confirms');
    assert.equal(again.appointment.status, 'confirmada'); assert.ok((await g.row('Reservas', hx.id)).paypalCaptura, 'capture id saved');
    // heartbeat
    await g.sql`insert into public.sistema (clave, valor) values ('LAST_AUTO', ${JSON.stringify({ at: new Date(Date.now() - 5 * 3600000).toISOString(), out: {} })}) on conflict (clave) do update set valor = excluded.valor`;
    await g.get({ action: 'catalog' }); await g.get({ action: 'catalog' });
    errs = await g.rows('Errores'); assert.equal(errs.filter((e) => e.tipo === 'automatizacion').length, 1);
    console.log('  ✓ heartbeat logged once');
    // error de correo
    g.state.failMail = true;
    ok(await g.post({ action: 'adminEmailTest', idToken: A, tipo: 'recordatorio' }), 'email test queued');
    g.state.failMail = false;
    assert.ok((await g.rows('Errores')).some((e) => e.tipo === 'correo'), 'mail failure logged');
    console.log('  ✓ mail failure logged');
    ad = await g.post({ action: 'adminData', idToken: A });
    assert.ok(ad.errors.length >= 2 && ad.errors[0].row);
    const res = ok(await g.post({ action: 'adminResolveErrors', idToken: A, all: true }), 'resolve errors');
    assert.ok(res.errors.every((e) => e.resuelto));
    // vista previa de correos nuevos
    for (const t of ['transferencia', 'transferenciaRechazada', 'cambio', 'billetera']) ok(await g.post({ action: 'adminEmailPreview', idToken: A, tipo: t }), 'preview ' + t);
  } finally { await g.close(); }
}
