/* Pruebas del código compartido de las apps (mismos resultados que la web)
   Uso: npx tsx packages/core/test/core.test.ts */
import assert from 'node:assert/strict';
import { Studio, Validate, addDaysKey, createApi, fmtDuration, fmtDurationShort, fmtPrice, fmtTime12, keyAt, studioDate, timeAt, whenText, type Catalog } from '../src/index';

let n = 0;
const t = (name: string, fn: () => void | Promise<void>) => Promise.resolve(fn()).then(() => { n++; console.log('  ✓', name); });

async function main() {
await t('formatos', () => {
  assert.equal(fmtPrice(2500), 'RD$ 2,500');
  assert.equal(fmtPrice(1234567.4), 'RD$ 1,234,567');
  assert.equal(fmtDuration(45), '45 minutos');
  assert.equal(fmtDuration(60), '1 hora');
  assert.equal(fmtDuration(150), '2 horas 30 min');
  assert.equal(fmtDurationShort(105), '1 h 45 min');
  assert.equal(fmtTime12('00:30'), '12:30 AM');
  assert.equal(fmtTime12('12:00'), '12:00 PM');
  assert.equal(fmtTime12('15:05'), '3:05 PM');
  assert.equal(whenText('2026-10-21', '10:00'), 'Miércoles 21 de octubre · 10:00 AM');
  assert.equal(addDaysKey('2026-12-31', 1), '2027-01-01');
  assert.equal(studioDate('2026-10-21', '10:00').toISOString(), '2026-10-21T14:00:00.000Z');
  assert.equal(keyAt(new Date('2026-10-21T03:00:00Z')), '2026-10-20');   // 11 PM en Santo Domingo
  assert.equal(timeAt('2026-10-21T14:30:00Z'), '10:30');
});

await t('validación (mismas reglas que la web y el backend)', () => {
  assert.equal(Validate.properName('maría JOSÉ de la cruz'), 'María José de la Cruz');
  assert.equal(Validate.namePart('A', 'nombre'), 'Tu nombre debe tener al menos 2 letras.');
  assert.equal(Validate.namePart('Ana3', 'nombre'), 'Tu nombre solo puede tener letras.');
  assert.deepEqual(Validate.phone('8095551234'), { ok: true, value: '809-555-1234' });
  assert.deepEqual(Validate.phone('+1 305 555 1234'), { ok: true, value: '+1 305-555-1234' });
  assert.equal(Validate.phone('555').ok, false);
  assert.equal(Validate.phoneTyping('8095551'), '809-555-1');
  assert.equal(Validate.email('ana@gmail.com'), true);
  assert.equal(Validate.email('ana@gmail'), false);
  assert.deepEqual(Validate.splitName('Ana María Pérez de la Cruz'), { first: 'Ana María', last: 'Pérez de la Cruz' });
});

await t('horario, horas libres y precios', () => {
  const s = new Studio();
  const cat = {
    ok: true,
    services: [{ id: 'cejas', name: 'Cejas', durationMinutes: 45, price: 900, priceFrom: false, depositPercent: null }, { id: 'faciales', name: 'Faciales', durationMinutes: 60, price: 2500, priceFrom: false, depositPercent: null }],
    payments: { usdRate: 63, depositPercent: 50, holdMinutes: 15, cancelHours: 24 },
    schedule: { hours: { 0: null, 1: null, 2: { open: '10:00', close: '17:00' }, 3: { open: '10:00', close: '17:00' }, 4: { open: '10:00', close: '17:00' }, 5: { open: '10:00', close: '17:00' }, 6: null } as any, blockedDates: [], minNoticeHours: 0, maxDaysAhead: 400, slotStepMinutes: 30 },
    promos: [{ id: 'P1', name: 'Piel', services: ['faciales'], kind: 'porcentaje', value: 15, until: '' }],
  } as unknown as Catalog;
  s.apply(cat);
  assert.equal(s.services.length, 2);
  assert.equal(s.byId.cejas.description.length > 10, true, 'conserva los textos de la web');
  // Un martes lejano: 10:00 a 17:00 con 45 min → última 16:00
  const tue = '2027-03-02';
  const base = s.baseSlots(tue, 45);
  assert.equal(base[0], '10:00'); assert.equal(base[base.length - 1], '16:00');
  assert.equal(s.isOpenDay('2027-03-01'), false, 'lunes cerrado');
  s.setBusy([{ start: studioDate(tue, '11:00').toISOString(), end: studioDate(tue, '12:00').toISOString() }]);
  const sl = s.slots(tue, 60);
  assert.equal(sl.find((x) => x.time === '10:00')!.busy, false);
  assert.equal(sl.find((x) => x.time === '10:30')!.busy, true);
  assert.equal(sl.find((x) => x.time === '12:00')!.busy, false);
  // Para mover una cita, su propio horario no cuenta como ocupado
  const own = { start: studioDate(tue, '11:00').toISOString(), end: studioDate(tue, '12:00').toISOString(), date: tue, time: '11:00', durationMinutes: 60 };
  assert.equal(s.slotsFor(own, tue).includes('10:30'), true);
  assert.equal(s.slotsFor(own, tue).includes('11:00'), false);
  // Promoción automática y depósito
  const p = s.pricing(['cejas', 'faciales']);
  assert.equal(p.subtotalRD, 3400); assert.equal(p.discountRD, 375); assert.equal(p.totalRD, 3025);
  assert.equal(p.depositRD, 1513); assert.equal(p.depositUSD, 24.02); assert.equal(p.balanceRD, 1512);
  assert.equal(s.monthGrid(2026, 9).length % 7, 0);
});

await t('cliente de la API: sesión, app y errores', async () => {
  const calls: any[] = [];
  const api = createApi({
    url: 'https://x.supabase.co/functions/v1/api', app: 'cliente', deviceId: () => 'dev1', idToken: () => 'tok',
    fetch: (async (url: string, init: any) => {
      calls.push({ url, init });
      const body = init.body ? JSON.parse(init.body) : null;
      if (body && body.action === 'cancel') return { ok: true, json: async () => ({ ok: false, error: 'Esa cita ya pasó.' }) };
      return { ok: true, json: async () => ({ ok: true, items: [], busy: [] }) };
    }) as any,
  });
  await api.busy('2026-10-20', '2026-12-20');
  assert.match(calls[0].url, /\?action=busy&from=2026-10-20&to=2026-12-20$/);
  await api.myAppointments();
  const b = JSON.parse(calls[1].init.body);
  assert.equal(b.app, 'cliente'); assert.equal(b.device, 'dev1'); assert.equal(b.idToken, 'tok');
  await api.lookup([{ id: 'MJB-1', token: 't' }]);
  assert.equal(JSON.parse(calls[2].init.body).idToken, undefined, 'lookup no manda la sesión');
  await assert.rejects(api.cancel('MJB-1', { token: 't' }), /ya pasó/);
  assert.equal(JSON.parse(calls[3].init.body).idToken, undefined, 'con la clave de la cita no se manda la sesión');
});

console.log(`\n${n} grupos de pruebas pasaron.`);
}
main().catch((e) => { console.error(e); process.exit(1); });
