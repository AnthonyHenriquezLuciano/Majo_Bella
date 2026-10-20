/* MAJOBELLA · Banco de pruebas del backend
   Base PostgreSQL local de verdad (con la misma migración que Supabase) y servicios externos simulados:
   PayPal, sesión de Supabase, Cloudflare Turnstile, Storage y el conector de Google (correo, calendario, PDF). */
import postgres from 'postgres';
import { readFileSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { handle } from '../functions/_shared/core/api.ts';
import { newCtx, runWith } from '../functions/_shared/core/ctx.ts';
import { loadTables, readTable_, commit, updateTable_ } from '../functions/_shared/core/db.ts';
import { TABLE, COLS } from '../functions/_shared/core/schema.ts';

// Base local para pruebas (en GitHub Actions: el servicio postgres del flujo)
const PG = { host: process.env.PGHOST || '/tmp', port: Number(process.env.PGPORT || 54329), user: process.env.PGUSER || 'postgres' };
const ROOT = new URL('..', import.meta.url).pathname;

export interface Opts { failMail?: boolean; env?: Record<string, string> }

export async function harness(opts: Opts = {}) {
  const dbName = 'mjb_test_' + process.pid + '_' + Math.random().toString(36).slice(2, 7);
  const psql = (args: string) => execSync(`psql -h ${PG.host} -p ${PG.port} -U ${PG.user} -v ON_ERROR_STOP=1 -q ${args}`, { stdio: 'pipe' });
  psql(`-c "create database ${dbName}"`);
  psql(`-d ${dbName} -f ${ROOT}dev/local-shim.sql`);
  // Todas las migraciones menos la de pg_cron (en local se usa la versión simulada de local-shim.sql)
  for (const f of readdirSync(ROOT + 'migrations').filter((x) => x.endsWith('.sql') && !x.includes('_tareas')).sort()) psql(`-d ${dbName} -f ${ROOT}migrations/${f}`);
  const sql = postgres({ ...PG, database: dbName, max: 4, onnotice: () => {} });

  const env: Record<string, string> = {
    PAYPAL_CLIENT_ID: 'x', PAYPAL_SECRET: 'y', PAYPAL_ENV: 'sandbox', ADMIN_EMAILS: 'majo@example.com',
    SUPABASE_URL: 'https://proyecto.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service-key',
    GOOGLE_RELAY_URL: 'https://script.google.com/macros/s/relay/exec', GOOGLE_RELAY_KEY: 'relay-key',
    CRON_KEY: 'cron-key', IMPORT_KEY: 'import-key',
    ...(opts.env || {}),
  };
  const mails: any[] = [];
  const events: Record<string, any> = {};
  const files = new Map<string, { bytes: Uint8Array; mime: string }>();
  const pp = { n: 0, orders: {} as Record<string, any>, captures: {} as Record<string, any>, refunds: [] as string[], failCapture: false };
  const tokens: Record<string, string> = { 'admin-token': 'majo@example.com', 'client-token': 'ana@example.com' };
  const state = { failMail: !!opts.failMail, relayDown: false, calls: 0 };
  const pushes: any[] = [];

  const json = (status: number, body: any) => ({ status, json: async () => body, text: async () => JSON.stringify(body), arrayBuffer: async () => new ArrayBuffer(0) });
  async function fetchMock(url: string, init: any = {}): Promise<any> {
    state.calls++;
    const method = String(init.method || 'GET').toUpperCase();
    const body = typeof init.body === 'string' ? init.body : init.body;
    // Sesión de Supabase
    if (url.endsWith('/auth/v1/user')) {
      const t = String((init.headers || {}).Authorization || '').replace('Bearer ', '');
      return tokens[t] ? json(200, { email: tokens[t], email_confirmed_at: '2026-01-01T00:00:00Z', user_metadata: { full_name: 'Prueba' } }) : json(401, {});
    }
    if (url.includes('turnstile/v0/siteverify')) { const p = new URLSearchParams(String(body)); return json(200, { success: String(p.get('response')).startsWith('ok') }); }
    // Storage
    let m = url.match(/\/storage\/v1\/object\/(fichas|publico)\/(.+)$/);
    if (m && !url.includes('/object/public/')) {
      const key = m[1] + '/' + decodeURIComponent(m[2]);
      if (method === 'POST') { files.set(key, { bytes: new Uint8Array(body), mime: init.headers['Content-Type'] }); return json(200, { Key: key }); }
      const f = files.get(key);
      if (!f) return json(404, {});
      return { status: 200, arrayBuffer: async () => f.bytes.buffer.slice(f.bytes.byteOffset, f.bytes.byteOffset + f.bytes.byteLength), text: async () => '' };
    }
    m = url.match(/\/storage\/v1\/object\/(fichas|publico)$/);
    if (m && method === 'DELETE') { JSON.parse(body).prefixes.forEach((p: string) => files.delete(m![1] + '/' + p)); return json(200, []); }
    if (url.match(/\/storage\/v1\/bucket\/fichas$/)) return json(200, { id: 'fichas', public: false });
    // Conector de Google
    if (url === env.GOOGLE_RELAY_URL) {
      const req = JSON.parse(body);
      if (req.key !== env.GOOGLE_RELAY_KEY) return json(200, { ok: false, error: 'clave' });
      if (state.relayDown) return json(500, {});
      const results = req.ops.map((op: any) => {
        if (op.type === 'mail') {
          if (state.failMail) return { ok: false, error: 'quota' };
          mails.push({ to: op.to, subject: op.subject, htmlBody: op.html, body: op.text, attachments: op.attachments }); return { ok: true };
        }
        if (op.type === 'calendar.create') { const id = 'EV' + Object.keys(events).length; events[id] = op; return { ok: true, id }; }
        if (op.type === 'calendar.move') { if (events[op.eventId]) { events[op.eventId].start = op.start; events[op.eventId].end = op.end; } return { ok: true }; }
        if (op.type === 'calendar.cancel') { delete events[op.eventId]; return { ok: true }; }
        if (op.type === 'pdf') return { ok: true, data: Buffer.from('%PDF-1.4 ' + op.html).toString('base64') };
        return { ok: false, error: 'op' };
      });
      return json(200, { ok: true, results });
    }
    // Avisos push (Expo)
    if (url === 'https://exp.host/--/api/v2/push/send') {
      const list = JSON.parse(body);
      pushes.push(...list);
      return json(200, { data: list.map((x: any) => (String(x.to).includes('Viejo') ? { status: 'error', details: { error: 'DeviceNotRegistered' } } : { status: 'ok', id: 'T' + pushes.length })) });
    }
    // PayPal
    if (url.endsWith('/v1/oauth2/token')) return json(200, { access_token: 'AT', expires_in: 32000 });
    const b = body ? JSON.parse(body) : null;
    if (url.endsWith('/v2/checkout/orders') && method === 'POST') {
      const id = 'ORDER' + (++pp.n);
      pp.orders[id] = { id, status: 'CREATED', amount: b.purchase_units[0].amount, context: b.application_context };
      return json(201, { id, status: 'CREATED', links: [{ rel: 'self', href: 'https://api.sandbox.paypal.com/v2/checkout/orders/' + id }, { rel: 'approve', href: 'https://www.sandbox.paypal.com/checkoutnow?token=' + id }] });
    }
    if ((m = url.match(/orders\/([^/]+)\/capture$/))) {
      const o = pp.orders[m[1]];
      if (!o) return json(404, { message: 'not found' });
      if (pp.failCapture) return json(422, { details: [{ issue: 'INSTRUMENT_DECLINED' }] });
      if (o.status === 'COMPLETED') return json(422, { details: [{ issue: 'ORDER_ALREADY_CAPTURED' }] });
      o.status = 'COMPLETED'; o.capture = 'CAP' + pp.n + m[1];
      pp.captures[o.capture] = o;
      return json(201, { id: o.id, status: 'COMPLETED', purchase_units: [{ payments: { captures: [{ id: o.capture, status: 'COMPLETED', amount: o.amount }] } }] });
    }
    if ((m = url.match(/captures\/([^/]+)\/refund$/))) { pp.refunds.push(m[1]); return json(201, { id: 'REF' + pp.refunds.length, status: 'COMPLETED' }); }
    if ((m = url.match(/orders\/([^/]+)$/))) { const o = pp.orders[m[1]]; return json(200, { id: o.id, status: o.status, purchase_units: [{ payments: { captures: [{ id: o.capture, status: 'COMPLETED', amount: o.amount }] } }] }); }
    return json(404, { message: 'mock: ' + url });
  }

  const deps = { sql, fetch: fetchMock, env };
  async function call(method: string, data: any, headers: Record<string, string> = {}) {
    const res = await handle(deps, method, data, headers);
    if (res.after) await res.after;
    return res.body;
  }
  /* Filas de una tabla con el formato de la lógica (todo texto), como las ve la API */
  async function rows(name: string) {
    const c = newCtx(deps);
    return runWith(c, async () => sql.begin(async (tx: any) => { await loadTables(tx, { tables: [name] }); return readTable_(name); }));
  }
  async function row(name: string, id: string) { const pk = TABLE[name].pk || 'id'; return (await rows(name)).find((r: any) => r[pk] === id); }
  /* Cambia una fila directamente en la base (para simular el paso del tiempo, como editar la hoja a mano) */
  async function set(name: string, id: string, patch: Record<string, any>) {
    const c = newCtx(deps);
    await runWith(c, async () => sql.begin(async (tx: any) => {
      await loadTables(tx, { tables: [name] });
      const pk = TABLE[name].pk || 'id';
      const r = readTable_(name).find((x: any) => x[pk] === id);
      if (!r) throw new Error('no existe ' + id);
      updateTable_(name, r._row, patch);
      await commit(tx);
    }));
  }
  async function setSetting(k: string, v: string) {
    await sql`insert into public.ajustes (clave, valor) values (${k}, ${v}) on conflict (clave) do update set valor = excluded.valor`;
  }
  void COLS;

  return {
    sql, env, mails, events, files, pp, tokens, state, deps, pushes,
    get: (params: any) => call('GET', params),
    post: (body: any) => call('POST', body),
    cron: (key = env.CRON_KEY) => call('POST', { action: 'cron' }, { 'x-cron-key': key }),
    rows, row, set, setSetting,
    async close() { await sql.end({ timeout: 1 }); try { psql(`-c "drop database if exists ${dbName}"`); } catch (e) { /* nada */ } },
  };
}

export const assert = {
  equal(a: any, b: any, m?: string) { if (a != b) throw new Error((m ? m + ': ' : '') + 'esperaba ' + JSON.stringify(b) + ' y llegó ' + JSON.stringify(a)); },
  ok(v: any, m?: string) { if (!v) throw new Error('falló: ' + (m || 'condición')); },
  deepEqual(a: any, b: any, m?: string) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m ? m + ': ' : '') + JSON.stringify(a) + ' ≠ ' + JSON.stringify(b)); },
  match(s: any, re: RegExp, m?: string) { if (!re.test(String(s))) throw new Error((m ? m + ': ' : '') + JSON.stringify(s) + ' no coincide con ' + re); },
};
export function okf(label: string) {
  return {
    ok(r: any, l: string) { if (!r || !r.ok) { throw new Error(`FALLÓ ${label} › ${l}: ${JSON.stringify(r)}`); } console.log('  ✓', l); return r; },
    fail(r: any, l: string) { if (r && r.ok) { throw new Error(`OK INESPERADO ${label} › ${l}: ${JSON.stringify(r).slice(0, 300)}`); } console.log('  ✓', l, '→', r.error); return r; },
  };
}
/* Próximo martes (al menos a 2 días) */
export function nextTuesday(minDays = 2) {
  const d = new Date(); d.setUTCDate(d.getUTCDate() + ((9 - d.getUTCDay()) % 7 || 7));
  if (d.getTime() - Date.now() < minDays * 86400000) d.setUTCDate(d.getUTCDate() + 7);
  return d.toISOString().slice(0, 10);
}
void readFileSync;
