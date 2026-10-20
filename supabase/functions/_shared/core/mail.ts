/* MAJOBELLA · Correos con el diseño de la marca (blanco y negro, logo, serif)
   Los constructores devuelven { subject, html } (los usan los envíos y la vista previa del panel).
   Los envíos se ponen en cola y salen al terminar la petición, después de guardar los cambios. */
import { cx, env_ } from './ctx.ts';
import { appendRowRef_ } from './db.ts';
import { servicesMap_ } from './data.ts';
import { consentState_ } from './consent.ts';
import { addDaysKey_, esc_, firstName_, longDate_, money_, num_, plainText_, time12_, todayKey_, whenText_, safeJson_ } from './util.ts';

export function depositText_(r) {
  const dep = Number(r.depositoRD) || 0;
  if (!dep) return Number(r.giftRD) > 0 ? 'Pagado con tarjeta de regalo' : 'Sin depósito';
  if (r.metodoDeposito === 'paypal' || r.paypalCaptura) return 'RD$ ' + money_(dep) + ' (US$ ' + r.depositoUSD + ' por PayPal)';
  return 'RD$ ' + money_(dep) + (r.metodoDeposito ? ' (' + r.metodoDeposito + ')' : '');
}

export function describe_(r, s) {
  return [
    'Reserva: ' + r.id,
    'Servicio: ' + r.servicios,
    'Duración: ' + r.duracionMin + ' min',
    Number(r.descuentoRD) > 0 ? 'Precio: RD$ ' + money_(r.subtotalRD) + ' − descuento RD$ ' + money_(r.descuentoRD) : '',
    'Total: RD$ ' + money_(r.totalRD),
    Number(r.giftRD) > 0 ? 'Tarjeta de regalo: RD$ ' + money_(r.giftRD) + ' (' + r.giftCodigo + ')' : '',
    'Depósito: ' + depositText_(r),
    'Saldo: RD$ ' + money_(r.saldoRD) + ' al terminar',
    '',
    'Clienta: ' + r.clienta, 'Teléfono: ' + (r.telefono || '—'), 'Correo: ' + (r.correo || '—'),
    r.nota ? 'Nota: ' + r.nota : '',
    r.origen ? 'Nos conoció por: ' + r.origen : '',
  ].filter(function (x) { return x !== ''; }).join('\n');
}

export function mailUrl_(s, path?) {
  const base = String(s.webUrl || '').trim();
  return base ? base.replace(/\/?$/, '/') + (path || '') : '';
}
export function waUrl_(s, text?) {
  const n = String(s.whatsapp || '').replace(/\D/g, '');
  return n ? 'https://wa.me/' + n + (text ? '?text=' + encodeURIComponent(text) : '') : '';
}

/* Plantilla común. o = { preheader, kicker, title, intro, details: [[etiqueta, html]], body, cta: { text, url }, secondary: { text, url }, note } */
export function layout_(s, o) {
  const F = "Georgia,'Times New Roman',serif";
  const logo = mailUrl_(s, 'assets/logo-majobella.png');
  const button = function (b, dark) {
    if (!b || !b.url) return '';
    return '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 8px 0 0;display:inline-table"><tr><td style="' +
      (dark ? 'background:#111111;border:1px solid #111111' : 'background:#ffffff;border:1px solid #111111') + '">' +
      '<a href="' + esc_(b.url) + '" style="display:inline-block;padding:14px 26px;font-family:' + F + ';font-size:12px;letter-spacing:3px;text-transform:uppercase;text-decoration:none;color:' +
      (dark ? '#ffffff' : '#111111') + '">' + esc_(b.text) + '</a></td></tr></table>';
  };
  const details = (o.details || []).filter(function (x) { return x && x[1] !== '' && x[1] != null; }).map(function (x) {
    return '<tr><td style="padding:11px 12px 11px 0;border-top:1px solid #e6e6e6;font-family:' + F + ';font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#6b6b6b;width:36%;vertical-align:top">' + esc_(x[0]) + '</td>' +
      '<td style="padding:11px 0;border-top:1px solid #e6e6e6;font-family:' + F + ';font-size:15px;line-height:1.5;color:#111111;vertical-align:top">' + x[1] + '</td></tr>';
  }).join('');
  const maps = s.mapsUrl ? '<a href="' + esc_(s.mapsUrl) + '" style="color:#ffffff">Cómo llegar</a>' : '';
  const wa = waUrl_(s, 'Hola, tengo una pregunta sobre MAJOBELLA.');
  const web = mailUrl_(s, '');
  const links = [maps, wa ? '<a href="' + wa + '" style="color:#ffffff">WhatsApp</a>' : '', web ? '<a href="' + esc_(web) + '" style="color:#ffffff">Web</a>' : ''].filter(Boolean).join(' &nbsp;·&nbsp; ');
  return '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc_(o.title || 'MAJOBELLA') + '</title></head>' +
    '<body style="margin:0;padding:0;background:#f4f4f2">' +
    (o.preheader ? '<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f4f4f2">' + esc_(o.preheader) + '</div>' : '') +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f4f2"><tr><td align="center" style="padding:28px 12px">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border:1px solid #e6e6e6">' +
    '<tr><td align="center" style="padding:34px 32px 24px;border-bottom:1px solid #111111">' +
    (logo ? '<img src="' + esc_(logo) + '" width="170" alt="MAJOBELLA Beauty Studio" style="display:block;width:170px;max-width:60%;height:auto;border:0">'
      : '<p style="margin:0;font-family:' + F + ';font-size:22px;letter-spacing:6px">MAJOBELLA</p>') +
    '</td></tr>' +
    '<tr><td style="padding:34px 36px 10px;font-family:' + F + ';color:#111111">' +
    (o.kicker ? '<p style="margin:0 0 12px;font-size:11px;letter-spacing:4px;text-transform:uppercase;color:#6b6b6b">' + esc_(o.kicker) + '</p>' : '') +
    (o.title ? '<h1 style="margin:0 0 16px;font-family:' + F + ';font-weight:normal;font-size:28px;line-height:1.2;color:#000000">' + esc_(o.title) + '</h1>' : '') +
    (o.intro ? '<p style="margin:0 0 22px;font-size:16px;line-height:1.65;color:#333333">' + o.intro + '</p>' : '') +
    (details ? '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-bottom:1px solid #e6e6e6;margin:0 0 22px">' + details + '</table>' : '') +
    (o.body ? '<div style="font-size:15px;line-height:1.65;color:#333333">' + o.body + '</div>' : '') +
    (o.cta || o.secondary ? '<div style="margin:18px 0 8px">' + button(o.cta, true) + button(o.secondary, false) + '</div>' : '') +
    (o.note ? '<p style="margin:22px 0 0;font-size:13px;line-height:1.6;color:#6b6b6b">' + o.note + '</p>' : '') +
    '</td></tr><tr><td style="height:28px;line-height:28px">&nbsp;</td></tr>' +
    '<tr><td align="center" style="padding:24px 24px 26px;background:#111111;font-family:' + F + '">' +
    '<p style="margin:0 0 10px;font-size:12px;letter-spacing:5px;color:#ffffff">MÁS YO, MÁS BELLA.</p>' +
    '<p style="margin:0;font-size:12px;line-height:1.7;color:#bdbdbd">' + esc_(s.direccion || 'MAJOBELLA Beauty Studio') + (links ? '<br>' + links : '') + '</p>' +
    '</td></tr></table>' +
    '<p style="margin:14px 0 0;font-family:' + F + ';font-size:11px;color:#9a9a9a">' + esc_(o.footnote || 'Correo enviado por MAJOBELLA Beauty Studio.') + '</p>' +
    '</td></tr></table></body></html>';
}

export function codeBox_(code) {
  return '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 18px"><tr><td style="background:#111111;padding:14px 24px;font-family:\'Courier New\',monospace;font-size:22px;letter-spacing:4px;color:#ffffff">' + esc_(code) + '</td></tr></table>';
}


export function apptDetails_(r, extra?) {
  const dep = Number(r.depositoRD) || 0;
  const rows = [
    ['Servicio', esc_(r.servicios)],
    ['Fecha y hora', esc_(whenText_(r))],
    ['Duración', r.duracionMin ? esc_(r.duracionMin + ' minutos') : ''],
    ['Total', Number(r.descuentoRD) > 0 ? '<s style="color:#9a9a9a">RD$ ' + money_(r.subtotalRD) + '</s> RD$ ' + money_(r.totalRD) : 'RD$ ' + money_(r.totalRD)],
    Number(r.bonoRD) > 0 ? ['Paquete', 'RD$ ' + money_(r.bonoRD) + ' cubiertos con tu paquete'] : null,
    Number(r.giftRD) > 0 ? ['Tarjeta de regalo', 'RD$ ' + money_(r.giftRD)] : null,
    dep ? ['Depósito', esc_(depositText_(r))] : null,
    ['Al terminar', Number(r.saldoRD) > 0 ? 'RD$ ' + money_(r.saldoRD) + ' · efectivo, transferencia o PayPal' : 'Todo pagado'],
    ['Código', esc_(r.id)],
  ];
  return rows.concat(extra || []).filter(Boolean);
}

/* ---- Constructores: devuelven { subject, html } (los usan los envíos y la vista previa del dashboard) ---- */

export function mailConfirmed_(r, s, byStudio?) {
  const consent = consentState_(r);
  const dep = Number(r.depositoRD) || 0;
  return {
    subject: 'Tu cita en MAJOBELLA está confirmada · ' + whenText_(r),
    html: layout_(s, {
      preheader: 'Te esperamos el ' + whenText_(r) + '.',
      kicker: 'Cita confirmada',
      title: '¡Te esperamos, ' + firstName_(r.clienta) + '!',
      intro: 'Tu cita está confirmada. Guarda este correo: aquí tienes todos los detalles.',
      details: apptDetails_(r),
      body: consent.needed && !consent.signed ? '<p style="margin:0">Antes de tu cita, <b>firma el consentimiento</b> desde tu celular. Toma unos 2 minutos y nos ayuda a cuidarte.</p>' : '',
      cta: consent.needed && !consent.signed ? { text: 'Firmar consentimiento', url: consent.url } : { text: 'Ver mis citas', url: mailUrl_(s, 'citas.html') },
      secondary: s.mapsUrl ? { text: 'Cómo llegar', url: s.mapsUrl } : null,
      note: (dep && !byStudio ? 'Si cancelas con al menos ' + num_(s.horasCancelacion, 24) + ' horas de aviso te devolvemos el depósito. ' : '') + 'Te recomendamos llegar 10 minutos antes.',
    }),
  };
}

export function mailAdminNew_(r, s) {
  return {
    subject: 'Nueva reserva · ' + r.clienta + ' · ' + whenText_(r),
    html: layout_(s, {
      kicker: 'Nueva reserva', title: r.clienta,
      details: apptDetails_(r, [
        ['Teléfono', esc_(r.telefono || '—')], ['Correo', esc_(r.correo || '—')],
        r.nota ? ['Nota', esc_(r.nota)] : null, r.origen ? ['Nos conoció por', esc_(r.origen)] : null,
        r.fidelidad === 'si' ? ['Fidelidad', 'Usó su premio de fidelidad'] : null,
      ]),
      cta: { text: 'Abrir dashboard', url: mailUrl_(s, 'admin.html') },
    }),
  };
}

export function mailRescheduled_(r, s, before) {
  return {
    subject: 'Tu cita en MAJOBELLA cambió de horario · ' + whenText_(r),
    html: layout_(s, {
      kicker: 'Nuevo horario', title: 'Tu cita cambió de horario',
      intro: 'Antes: ' + esc_(before) + '<br><b>Ahora: ' + esc_(whenText_(r)) + '</b>',
      details: apptDetails_(r),
      body: '<p style="margin:0">Tu depósito sigue aplicado a la cita. Si el nuevo horario no te funciona, escríbenos.</p>',
      cta: waUrl_(s) ? { text: 'Escribir por WhatsApp', url: waUrl_(s, 'Hola, es sobre mi cita ' + r.id + '.') } : null,
      secondary: s.mapsUrl ? { text: 'Cómo llegar', url: s.mapsUrl } : null,
    }),
  };
}

export function mailCancelled_(r, s, refunded, byStudio?) {
  const dep = Number(r.depositoRD) || 0;
  return {
    subject: 'Tu cita en MAJOBELLA fue cancelada · ' + whenText_(r),
    html: layout_(s, {
      kicker: 'Cita cancelada', title: byStudio ? 'Cancelamos tu cita' : 'Cancelaste tu cita',
      intro: esc_(r.servicios) + ' · ' + esc_(whenText_(r)),
      body: dep ? '<p style="margin:0">' + (refunded === 'manual' ? 'Te devolveremos el depósito de RD$ ' + money_(dep) + ' por transferencia en los próximos días. Si necesitamos tus datos bancarios te escribiremos.'
        : refunded ? 'Te devolvimos el depósito en PayPal. Puede tardar unos días en reflejarse.' : (byStudio ? 'Te contactaremos para coordinar la devolución o una nueva cita.' : 'El depósito no es reembolsable para esta cancelación.')) + '</p>' : '',
      cta: { text: 'Reservar otra cita', url: mailUrl_(s, 'reservar.html') },
      note: 'Código de reserva: ' + esc_(r.id),
    }),
  };
}

export function mailAdminCancelled_(r, s, byStudio?) {
  return {
    subject: 'Cita cancelada · ' + r.clienta + ' · ' + whenText_(r),
    html: layout_(s, {
      kicker: 'Cita cancelada', title: r.clienta,
      intro: (byStudio ? 'Cancelada desde el dashboard.' : 'La clienta canceló.') + ' Reembolso: ' + esc_(r.reembolso || 'no'),
      details: apptDetails_(r, [['Teléfono', esc_(r.telefono || '—')]]),
      cta: { text: 'Abrir dashboard', url: mailUrl_(s, 'admin.html') },
    }),
  };
}

export function mailReminder_(r, s) {
  const consent = consentState_(r);
  const today = todayKey_();
  const tomorrow = addDaysKey_(today, 1);
  const title = r.fecha === today ? 'Tu cita es hoy' : (r.fecha === tomorrow ? 'Tu cita es mañana' : 'Tu cita se acerca');
  return {
    subject: title + ' · ' + whenText_(r) + ' · MAJOBELLA',
    html: layout_(s, {
      preheader: esc_(r.servicios) + ', ' + whenText_(r),
      kicker: 'Recordatorio', title: title + ', ' + firstName_(r.clienta),
      intro: 'Te esperamos el <b>' + esc_(whenText_(r)) + '</b>. Llega unos 10 minutos antes para empezar con calma.',
      details: [
        ['Servicio', esc_(r.servicios)],
        ['Dirección', esc_(s.direccion || '') + (s.mapsUrl ? '<br><a href="' + esc_(s.mapsUrl) + '" style="color:#111111">Abrir en Google Maps</a>' : '')],
        ['Al terminar', Number(r.saldoRD) > 0 ? 'RD$ ' + money_(r.saldoRD) + ' · efectivo, transferencia o PayPal' : 'Todo pagado'],
        consent.needed ? ['Consentimiento', consent.signed ? 'Firmado ✓' : 'Pendiente: fírmalo antes de llegar'] : null,
      ].filter(Boolean),
      cta: consent.needed && !consent.signed ? { text: 'Firmar consentimiento', url: consent.url } : { text: 'Ver o cancelar mi cita', url: mailUrl_(s, 'citas.html') },
      secondary: waUrl_(s) ? { text: 'Escribir por WhatsApp', url: waUrl_(s, 'Hola, es sobre mi cita del ' + whenText_(r) + '.') } : null,
      note: 'Si no puedes venir, avísanos cuanto antes. Con al menos ' + num_(s.horasCancelacion, 24) + ' horas de aviso te devolvemos el depósito.',
    }),
  };
}

export function mailReview_(r, s) {
  return {
    subject: '¿Cómo te fue en MAJOBELLA, ' + firstName_(r.clienta) + '?',
    html: layout_(s, {
      preheader: 'Tu opinión nos ayuda muchísimo.',
      kicker: 'Gracias por tu visita', title: '¿Cómo te sentiste, ' + firstName_(r.clienta) + '?',
      intro: 'Nos encantó atenderte. Si te gustó tu ' + esc_(String(r.servicios).toLowerCase()) + ', ¿nos dejarías una reseña en Google? Toma un minuto y ayuda a otras clientas a encontrarnos.',
      cta: { text: 'Dejar mi reseña', url: s.googleResenaUrl || mailUrl_(s, '') },
      secondary: { text: 'Reservar mi próxima cita', url: mailUrl_(s, 'reservar.html') },
      note: 'Si algo no salió como esperabas, respóndenos a este correo o escríbenos por WhatsApp: queremos saberlo.',
    }),
  };
}

export function mailRetouch_(r, s, svc, ideal) {
  return {
    subject: 'Es momento de tu retoque de ' + svc.name.toLowerCase() + ' · MAJOBELLA',
    html: layout_(s, {
      kicker: 'Tu retoque', title: 'Es momento de tu retoque',
      intro: 'Hola, ' + firstName_(r.clienta) + '. Para que tu ' + esc_(svc.name.toLowerCase()) + ' quede perfecta y dure más, el retoque se hace alrededor del <b>' + esc_(longDate_(ideal)) + '</b>.',
      details: [['Servicio', esc_(svc.name)], ['Tu sesión', esc_(longDate_(r.fecha))], ['Fecha ideal del retoque', esc_(longDate_(ideal))]],
      cta: { text: 'Reservar mi retoque', url: mailUrl_(s, 'reservar.html?servicio=' + encodeURIComponent(svc.id)) },
      secondary: waUrl_(s) ? { text: 'Preguntar por WhatsApp', url: waUrl_(s, 'Hola, quiero agendar mi retoque de ' + svc.name.toLowerCase() + '.') } : null,
    }),
  };
}

export function mailBirthday_(name, s, code, pct, until) {
  return {
    subject: '¡Feliz cumpleaños, ' + firstName_(name) + '! Un regalo de MAJOBELLA',
    html: layout_(s, {
      preheader: 'Te regalamos un ' + pct + '% para celebrarte.',
      kicker: 'Feliz cumpleaños', title: '¡Feliz cumpleaños, ' + firstName_(name) + '!',
      intro: 'Para celebrarte, te regalamos un <b>' + pct + '% de descuento</b> en tu próxima cita. Escribe este código al reservar:',
      body: codeBox_(code) + '<p style="margin:0">Válido hasta el ' + esc_(longDate_(until)) + ', en cualquier servicio, una vez.</p>',
      cta: { text: 'Reservar con mi regalo', url: mailUrl_(s, 'reservar.html') },
      note: 'Más yo, más bella. Que este año te veas y te sientas como quieres.',
    }),
  };
}

export function mailWaitlist_(w, s, slots) {
  const ids = safeJson_(w.serviciosJson, []).map(function (x) { return x.id; }).join(',');
  return {
    subject: 'Se liberó un horario el ' + longDate_(w.fecha) + ' · MAJOBELLA',
    html: layout_(s, {
      preheader: 'Hay horario disponible para ' + w.servicios + '.',
      kicker: 'Lista de espera', title: 'Se liberó un horario',
      intro: 'Hola, ' + firstName_(w.clienta) + '. El <b>' + esc_(longDate_(w.fecha)) + '</b> hay horario disponible para ' + esc_(w.servicios) + ':',
      body: '<p style="margin:0 0 6px;font-size:18px">' + slots.slice(0, 6).map(time12_).join(' &nbsp;·&nbsp; ') + '</p>',
      cta: { text: 'Reservar ahora', url: mailUrl_(s, 'reservar.html?servicio=' + encodeURIComponent(ids) + '&fecha=' + w.fecha) },
      note: 'Avisamos a todas las personas en la lista de ese día: el horario es de quien reserve primero.',
    }),
  };
}

export function mailBono_(b, s) {
  const svc = servicesMap_()[b.servicio];
  return {
    subject: 'Tu paquete ' + b.nombre + ' · MAJOBELLA',
    html: layout_(s, {
      kicker: 'Paquete listo', title: '¡Gracias, ' + firstName_(b.clienta) + '!',
      intro: 'Tu paquete está activo. Escribe este código al reservar cada sesión y se descuenta solo:',
      body: codeBox_(b.codigo),
      details: [['Paquete', esc_(b.nombre)], ['Servicio', esc_(svc ? svc.name : b.servicio)], ['Sesiones', esc_(b.sesiones)], b.vence ? ['Válido hasta', esc_(longDate_(b.vence))] : null].filter(Boolean),
      cta: { text: 'Reservar mi sesión', url: mailUrl_(s, 'reservar.html?servicio=' + encodeURIComponent(b.servicio)) },
    }),
  };
}

export function mailConsentCopy_(r, s) {
  return {
    subject: 'Tu consentimiento firmado · MAJOBELLA',
    html: layout_(s, {
      kicker: 'Consentimiento', title: 'Recibimos tu consentimiento',
      intro: 'Gracias, ' + firstName_(r.clienta) + '. Te enviamos una copia en PDF del consentimiento que firmaste para tu cita del ' + esc_(whenText_(r)) + '.',
      cta: { text: 'Ver mis citas', url: mailUrl_(s, 'citas.html') },
    }),
  };
}

export function giftCardHtml_(g, s?) {
  const F = "Georgia,'Times New Roman',serif";
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:2px solid #111111;margin:4px 0 18px"><tr><td align="center" style="padding:26px 18px;font-family:' + F + ';color:#111111">' +
    '<p style="margin:0 0 6px;font-size:11px;letter-spacing:4px;color:#6b6b6b">TARJETA DE REGALO</p>' +
    '<p style="margin:0;font-size:40px;line-height:1.1">RD$ ' + money_(g.montoRD) + '</p>' +
    (g.para ? '<p style="margin:10px 0 0;font-style:italic;font-size:17px">Para ' + esc_(g.para) + (g.comprador ? ' · de ' + esc_(g.comprador) : '') + '</p>' : '') +
    (g.mensaje ? '<p style="margin:10px 0 0;color:#555555">“' + esc_(g.mensaje) + '”</p>' : '') +
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:18px auto 0"><tr><td style="background:#111111;padding:12px 22px;font-family:\'Courier New\',monospace;font-size:20px;letter-spacing:4px;color:#ffffff">' + esc_(g.codigo) + '</td></tr></table>' +
    (g.vence ? '<p style="margin:10px 0 0;font-size:13px;color:#6b6b6b">Válida hasta el ' + esc_(longDate_(g.vence)) + '</p>' : '') +
    '</td></tr></table>';
}

export function mailWallet_(email, items, s) {
  const rows = items.map(function (x) {
    if (x.type === 'gift') return ['Tarjeta de regalo', '<b style="font-family:\'Courier New\',monospace;letter-spacing:2px">' + esc_(x.code) + '</b><br>Saldo RD$ ' + money_(x.balanceRD) + ' de RD$ ' + money_(x.amountRD) + (x.expires ? ' · vence el ' + esc_(longDate_(x.expires)) : '') + (x.status !== 'activa' ? ' · ' + esc_(x.status) : '')];
    return ['Paquete', '<b style="font-family:\'Courier New\',monospace;letter-spacing:2px">' + esc_(x.code) + '</b><br>' + esc_(x.name) + ' · ' + Math.max(0, x.sessions - x.used) + ' de ' + x.sessions + ' sesiones disponibles' + (x.expires ? ' · vence el ' + esc_(longDate_(x.expires)) : '')];
  });
  return {
    subject: 'Tus tarjetas y paquetes de MAJOBELLA',
    html: layout_(s, {
      kicker: 'Tu billetera', title: 'Tus códigos',
      intro: 'Estos son las tarjetas de regalo y paquetes asociados a ' + esc_(email) + '. Escribe el código al reservar o guárdalo en la app.',
      details: rows,
      cta: { text: 'Abrir la app', url: mailUrl_(s, 'aplicacion.html') },
      secondary: { text: 'Reservar', url: mailUrl_(s, 'reservar.html') },
      note: 'Si no pediste este correo, puedes ignorarlo: nadie más puede ver tus códigos.',
    }),
  };
}

/* ---- Correos de transferencias y cambios ---- */
export function mailTransferReceived_(r, s) {
  return {
    subject: 'Recibimos tu comprobante · MAJOBELLA',
    html: layout_(s, {
      preheader: 'Tu horario está apartado mientras confirmamos la transferencia.',
      kicker: 'Comprobante recibido', title: 'Gracias, ' + firstName_(r.clienta),
      intro: 'Recibimos el comprobante de tu transferencia. <b>Tu horario queda apartado</b> y te confirmamos la cita en cuanto veamos el depósito en la cuenta (normalmente el mismo día).',
      details: apptDetails_(r),
      cta: { text: 'Ver mis citas', url: mailUrl_(s, 'citas.html') },
      secondary: waUrl_(s) ? { text: 'Escribir por WhatsApp', url: waUrl_(s, 'Hola, envié el comprobante de mi cita ' + r.id + '.') } : null,
    }),
  };
}
export function mailAdminTransfer_(r, s, cuenta, replaced) {
  return {
    subject: (replaced ? 'Nuevo comprobante' : 'Transferencia por revisar') + ' · ' + r.clienta + ' · RD$ ' + money_(r.depositoRD),
    html: layout_(s, {
      kicker: replaced ? 'Comprobante reemplazado' : 'Transferencia por revisar', title: r.clienta,
      intro: 'Revisa que el depósito haya llegado a tu cuenta y confirma o rechaza la cita desde el dashboard. El comprobante va adjunto.',
      details: apptDetails_(r, [
        ['Depósito esperado', 'RD$ ' + money_(r.depositoRD)],
        cuenta ? ['Cuenta', esc_(cuenta.bank + ' · ' + cuenta.number)] : null,
        r.transferenciaRef ? ['Referencia', esc_(r.transferenciaRef)] : null,
        ['Teléfono', esc_(r.telefono || '—')], ['Correo', esc_(r.correo || '—')],
      ]),
      cta: { text: 'Revisar en el dashboard', url: mailUrl_(s, 'admin.html#agenda') },
    }),
  };
}
export function mailTransferRejected_(r, s, motivo) {
  return {
    subject: 'No pudimos confirmar tu transferencia · MAJOBELLA',
    html: layout_(s, {
      kicker: 'Transferencia', title: 'No pudimos confirmar tu cita',
      intro: 'Hola, ' + firstName_(r.clienta) + '. Revisamos tu comprobante para el ' + esc_(whenText_(r)) + ' y no pudimos confirmar el depósito.',
      body: '<p style="margin:0"><b>Motivo:</b> ' + esc_(motivo) + '</p><p style="margin:12px 0 0">Si ya hiciste la transferencia, escríbenos por WhatsApp con el comprobante y lo resolvemos enseguida.</p>',
      cta: waUrl_(s) ? { text: 'Escribir por WhatsApp', url: waUrl_(s, 'Hola, es sobre mi transferencia de la cita ' + r.id + '.') } : { text: 'Reservar de nuevo', url: mailUrl_(s, 'reservar.html') },
      secondary: { text: 'Reservar de nuevo', url: mailUrl_(s, 'reservar.html') },
      note: 'Código de reserva: ' + esc_(r.id),
    }),
  };
}
export function mailAdminRescheduled_(r, s, before) {
  return {
    subject: 'La clienta cambió su cita · ' + r.clienta + ' · ' + whenText_(r),
    html: layout_(s, {
      kicker: 'Cambio de fecha', title: r.clienta,
      intro: 'Antes: ' + esc_(before) + '<br><b>Ahora: ' + esc_(whenText_(r)) + '</b>',
      details: apptDetails_(r, [['Teléfono', esc_(r.telefono || '—')]]),
      cta: { text: 'Abrir dashboard', url: mailUrl_(s, 'admin.html#agenda') },
    }),
  };
}


/* ---- Envíos ---- */
export function notifyConfirmed_(r, s, byStudio?) {
  const m = mailConfirmed_(r, s, byStudio);
  safeMail_(r.correo, m.subject, m.html, { tipo: 'confirmacion', ref: r.id });
  if (!byStudio) { const a = mailAdminNew_(r, s); safeMail_(adminTo_(s), a.subject, a.html, { tipo: 'aviso', ref: r.id }); }
}
export function notifyRescheduled_(r, s, before) {
  const m = mailRescheduled_(r, s, before);
  safeMail_(r.correo, m.subject, m.html, { tipo: 'cambio', ref: r.id });
}
export function notifyCancelled_(r, s, refunded, byStudio?) {
  const m = mailCancelled_(r, s, refunded, byStudio);
  safeMail_(r.correo, m.subject, m.html, { tipo: 'cancelacion', ref: r.id });
  const a = mailAdminCancelled_(r, s, byStudio);
  safeMail_(adminTo_(s), a.subject, a.html, { tipo: 'aviso', ref: r.id });
}

/* Pone un correo en la cola y lo anota en el historial. meta = { tipo, ref, attachments: [{ name, mime, data (base64) }] } */
export function safeMail_(to: string, subject: string, html: string, meta?: any) {
  if (!to) return false;
  meta = meta || {};
  let log = null;
  try { log = appendRowRef_('Correos', { fecha: new Date().toISOString(), tipo: meta.tipo || 'otro', para: to, asunto: subject, ref: meta.ref || '', estado: 'pendiente' }); } catch (e) { /* nada */ }
  cx().out.push({ kind: 'mail', mail: { to, subject, html, text: plainText_(html), attachments: meta.attachments || undefined, log, ref: meta.ref || '' } });
  return true;
}

export function adminTo_(s) {
  return String((s && s.correoAvisos) || env_('ADMIN_EMAILS') || '').trim();
}
