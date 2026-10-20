/* MAJOBELLA · Lista de espera: aviso cuando se libera un horario en el día que la clienta quería */
import { appendRow_, deleteRow_, readOpt_, updateTable_ } from './db.ts';
import { catalogItems_, settings_ } from './data.ts';
import { freeSlots_, schedule_ } from './schedule.ts';
import { mailWaitlist_, safeMail_ } from './mail.ts';
import { human_, needAdmin_ } from './security.ts';
import { NOT_HUMAN } from './constants.ts';
import { addDaysKey_, client_, isDateKey_, on_, strip_, todayKey_, uuid } from './util.ts';

export function waitlistJoin_(d) {
  const s = settings_();
  if (!on_(s.esperaActiva)) return { ok: false, error: 'La lista de espera no está disponible.' };
  if (!human_(d, s)) return { ok: false, error: NOT_HUMAN };
  const cv = client_(d.client, true);
  if (!cv.ok) return { ok: false, error: cv.error };
  const name = cv.name, phone = cv.phone, email = cv.email;
  const sch = schedule_(s);
  const today = todayKey_();
  if (!isDateKey_(d.date) || d.date < today || d.date > addDaysKey_(today, sch.maxDays)) return { ok: false, error: 'Elige un día dentro de la agenda.' };
  const ids = (d.services || []).map(function (x) { return typeof x === 'string' ? x : x && x.id; }).filter(Boolean);
  const items = catalogItems_(ids);
  if (!items.length || items.some(function (x) { return !x; })) return { ok: false, error: 'Elige primero tus servicios.' };
  const minutes = items.reduce(function (t, x) { return t + x.durationMinutes; }, 0);
  const franja = ['manana', 'tarde'].indexOf(d.franja) >= 0 ? d.franja : 'cualquiera';
  const free = freeSlots_(d.date, minutes, franja, s);
  const dup = readOpt_('Espera').filter(function (w) { return w.fecha === d.date && w.correo === email && w.estado === 'esperando'; })[0];
  if (dup) return { ok: true, id: dup.id, already: true, available: free };
  const row: any = {
    id: 'ESP-' + uuid().slice(0, 6).toUpperCase(), fecha: d.date, franja: franja,
    serviciosJson: JSON.stringify(items.map(function (x) { return { id: x.id, name: x.name }; })), servicios: items.map(function (x) { return x.name; }).join(' + '),
    duracionMin: minutes, clienta: name, telefono: phone, correo: email, estado: 'esperando', creada: new Date().toISOString(), avisada: '',
  };
  appendRow_('Espera', row);
  return { ok: true, id: row.id, available: free };
}

/* Avisa a quien espera un día cuando hay horario libre (date = null revisa todos) */
export function checkWaitlist_(s, date) {
  const today = todayKey_();
  let n = 0;
  readOpt_('Espera').forEach(function (w) {
    if (w.estado !== 'esperando') return;
    if (w.fecha < today) { updateTable_('Espera', w._row, { estado: 'vencida' }); return; }
    if (date && w.fecha !== date) return;
    const slots = freeSlots_(w.fecha, Number(w.duracionMin) || 30, w.franja, s);
    if (!slots.length) return;
    const m = mailWaitlist_(w, s, slots);
    if (safeMail_(w.correo, m.subject, m.html, { tipo: 'espera', ref: w.id })) { updateTable_('Espera', w._row, { estado: 'avisada', avisada: new Date().toISOString() }); n++; }
  });
  return n;
}

export function notifyWaitlist_(date) {
  try { const s = settings_(); if (on_(s.esperaActiva) && isDateKey_(date)) checkWaitlist_(s, date); } catch (e) { /* no debe romper la cancelación */ }
}

export function markWaitlistBooked_(r) {
  try {
    readOpt_('Espera').forEach(function (w) {
      if (w.fecha === r.fecha && w.correo && w.correo === r.correo && (w.estado === 'esperando' || w.estado === 'avisada')) updateTable_('Espera', w._row, { estado: 'reservo' });
    });
  } catch (e) { /* nada */ }
}

export function adminWaitlist_(d) {
  needAdmin_(d);
  const w = readOpt_('Espera').filter(function (x) { return x.id === d.id; })[0];
  if (!w) return { ok: false, error: 'No encontramos esa persona en la lista.' };
  if (d.op === 'eliminar') { deleteRow_('Espera', w._row); return { ok: true, removed: true }; }
  const estado = ['esperando', 'avisada', 'reservo', 'cancelada'].indexOf(d.estado) >= 0 ? d.estado : w.estado;
  updateTable_('Espera', w._row, { estado: estado });
  w.estado = estado;
  return { ok: true, item: strip_(w) };
}
