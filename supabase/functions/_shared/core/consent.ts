/* MAJOBELLA · Consentimiento digital: la clienta lo firma desde el enlace de su correo */
import { appendRow_ } from './db.ts';
import { findRow_, servicesMap_, settings_, settingsCached_, updateRow_ } from './data.ts';
import { CONSENT_QUESTIONS, DEFAULT_CONSENT, TZ } from './constants.ts';
import { mailConsentCopy_, mailUrl_, safeMail_ } from './mail.ts';
import { htmlToPdf_ } from './google.ts';
import { PRIVATE_BUCKET, filePath, putFile } from './storage.ts';
import { b64ToBytes, clean_, clientKey_, esc_, fmtDate, safeJson_, uuid, whenText_ } from './util.ts';

export function consentText_(s) { return String(s.consentimientoTexto || '').trim() || DEFAULT_CONSENT; }

export function consentState_(r): any {
  const svcs = servicesMap_();
  const needed = safeJson_(r.serviciosJson, []).some(function (x) { return svcs[x.id] && svcs[x.id].consent; });
  const url = needed && r.firmaToken ? mailUrl_(settingsCached_(), 'consentimiento.html?c=' + encodeURIComponent(r.id + '.' + r.firmaToken)) : '';
  return { needed: needed, signed: !!r.consentimiento, signedAt: r.consentimiento || '', url: url };
}

export function consentRow_(c) {
  const parts = String(c || '').split('.');
  if (parts.length !== 2) return null;
  const found = findRow_(parts[0]);
  if (!found || !found.row.firmaToken || found.row.firmaToken !== parts[1]) return null;
  return found;
}

export function consentInfo_(d) {
  const found = consentRow_(d.c);
  if (!found) return { ok: false, error: 'Este enlace no es válido. Pídenos uno nuevo por WhatsApp.' };
  const r = found.row;
  if (['confirmada', 'completada'].indexOf(r.estado) < 0) return { ok: false, error: 'Esta cita no está activa.' };
  const s = settings_();
  return {
    ok: true, id: r.id, name: r.clienta, services: r.servicios, when: whenText_(r), signed: !!r.consentimiento, signedAt: r.consentimiento || '',
    text: consentText_(s), questions: CONSENT_QUESTIONS, studio: s.direccion || '',
  };
}

export async function consentSign_(d) {
  const found = consentRow_(d.c);
  if (!found) return { ok: false, error: 'Este enlace no es válido. Pídenos uno nuevo por WhatsApp.' };
  const r = found.row;
  if (['confirmada', 'completada'].indexOf(r.estado) < 0) return { ok: false, error: 'Esta cita no está activa.' };
  if (r.consentimiento) return { ok: false, error: 'Ya firmaste el consentimiento de esta cita.' };
  const name = clean_(d.name, 100);
  if (name.length < 3) return { ok: false, error: 'Escribe tu nombre completo.' };
  if (!d.accept) return { ok: false, error: 'Debes aceptar el consentimiento para firmarlo.' };
  const sig = String(d.signature || '');
  if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(sig) || sig.length < 1500 || sig.length > 1500000) return { ok: false, error: 'Dibuja tu firma en el recuadro.' };
  const answers = d.answers || {};
  const missing = CONSENT_QUESTIONS.filter(function (q) { return ['si', 'no'].indexOf((answers[q.id] || {}).value) < 0; });
  if (missing.length) return { ok: false, error: 'Responde todas las preguntas de salud.' };
  const s = settings_();
  const when = new Date();
  const fotos = d.photos === 'si' ? 'si' : 'no';
  const html = consentPdfHtml_(r, s, name, answers, clean_(d.extra, 600), fotos, sig, when);
  // PDF con el conector de Google; si no está, se guarda la página HTML firmada
  const pdf = await htmlToPdf_(html, 'consentimiento');
  const isPdf = !!pdf;
  const fname = 'Consentimiento ' + r.fecha + ' · ' + r.clienta + (isPdf ? '.pdf' : '.html');
  const mime = isPdf ? 'application/pdf' : 'text/html';
  const bytes = isPdf ? b64ToBytes(pdf) : new TextEncoder().encode(html);
  const key = clientKey_(r.correo, r.telefono, r.clienta);
  const path = await putFile(PRIVATE_BUCKET, filePath(key, 'consentimiento-' + r.id + (isPdf ? '.pdf' : '.html')), bytes, mime);
  const arc: any = {
    id: 'ARC-' + uuid().slice(0, 8).toUpperCase(), clave: key, tipo: 'consentimiento', nombre: fname, mime: mime,
    driveId: path, citaId: r.id, fecha: r.fecha, nota: 'Firmado en la web', creada: when.toISOString(),
  };
  appendRow_('Archivos', arc);
  updateRow_(found.index, { consentimiento: when.toISOString(), consentimientoArchivo: arc.id, permisoFotos: fotos });
  r.consentimiento = when.toISOString();
  if (r.correo) { const m = mailConsentCopy_(r, s); safeMail_(r.correo, m.subject, m.html, { tipo: 'consentimiento', ref: r.id, attachments: isPdf ? [{ name: fname, mime: mime, data: pdf }] : null }); }
  return { ok: true, signedAt: r.consentimiento };
}

export function consentPdfHtml_(r, s, name, answers, extra, fotos, sig, when) {
  const F = "Georgia,'Times New Roman',serif";
  const qs = CONSENT_QUESTIONS.map(function (q) {
    const a = answers[q.id] || {};
    return '<tr><td style="padding:7px 8px 7px 0;border-bottom:1px solid #ddd">' + esc_(q.text) + '</td><td style="padding:7px 0;border-bottom:1px solid #ddd;width:34%"><b>' + (a.value === 'si' ? 'Sí' : 'No') + '</b>' +
      (a.value === 'si' && a.detail ? ' · ' + esc_(clean_(a.detail, 300)) : '') + '</td></tr>';
  }).join('');
  const text = consentText_(s).split(/\n\s*\n/).map(function (p) { return '<p style="margin:0 0 10px">' + esc_(p.trim()) + '</p>'; }).join('');
  const stamp = fmtDate(when, TZ, "d/M/yyyy, h:mm a");
  return '<html><head><meta charset="utf-8"></head><body style="font-family:' + F + ';color:#111;font-size:12px;line-height:1.5;margin:28px">' +
    '<p style="margin:0;font-size:22px;letter-spacing:6px">MAJOBELLA</p><p style="margin:0 0 18px;font-size:10px;letter-spacing:4px;color:#666">BEAUTY STUDIO</p>' +
    '<h1 style="font-weight:normal;font-size:20px;margin:0 0 12px;border-top:1px solid #111;padding-top:12px">Consentimiento informado</h1>' +
    '<table style="width:100%;border-collapse:collapse;margin-bottom:14px">' +
    '<tr><td style="color:#666;width:30%">Clienta</td><td>' + esc_(name) + '</td></tr>' +
    '<tr><td style="color:#666">Teléfono · correo</td><td>' + esc_(r.telefono || '—') + ' · ' + esc_(r.correo || '—') + '</td></tr>' +
    '<tr><td style="color:#666">Servicio</td><td>' + esc_(r.servicios) + '</td></tr>' +
    '<tr><td style="color:#666">Cita</td><td>' + esc_(whenText_(r)) + ' · ' + esc_(r.id) + '</td></tr></table>' +
    '<h2 style="font-weight:normal;font-size:15px;margin:14px 0 6px">Cuestionario de salud</h2><table style="width:100%;border-collapse:collapse">' + qs + '</table>' +
    (extra ? '<p style="margin:8px 0 0"><span style="color:#666">Otros datos:</span> ' + esc_(extra) + '</p>' : '') +
    '<h2 style="font-weight:normal;font-size:15px;margin:16px 0 6px">Consentimiento</h2>' + text +
    '<p style="margin:6px 0 0"><span style="color:#666">Publicar mis fotos de antes y después en la web y redes, sin mi nombre:</span> <b>' + (fotos === 'si' ? 'Sí autorizo' : 'No autorizo') + '</b></p>' +
    '<div style="margin-top:18px;border-top:1px solid #111;padding-top:10px"><img src="' + sig + '" style="height:90px"><p style="margin:4px 0 0">' + esc_(name) + '</p>' +
    '<p style="margin:2px 0 0;color:#666;font-size:10px">Firmado electrónicamente en la web de MAJOBELLA el ' + esc_(stamp) + ' (hora de Santo Domingo).</p></div>' +
    '</body></html>';
}
