/* MAJOBELLA · Contexto de cada petición
   La API atiende varias peticiones a la vez en el mismo proceso, así que nada se guarda en variables
   globales: cada petición tiene su propio contexto (datos cargados, cambios pendientes, correos por
   enviar, usuaria que inició sesión…), al que se llega con cx(). */
import { AsyncLocalStorage } from 'node:async_hooks';

export type Row = Record<string, any> & { _row?: any };

/* Lo que la API necesita del mundo exterior. En producción lo arma functions/api/index.ts;
   en las pruebas, tests/harness.ts con una base local y servicios simulados. */
export interface Deps {
  sql: any;                                   // cliente postgres.js conectado a la base
  fetch: (url: string, init?: any) => Promise<any>;
  env: Record<string, string | undefined>;    // secretos y ajustes del servidor (nunca llegan al navegador)
}

export type Op =
  | { kind: 'insert'; table: string; row: Row }
  | { kind: 'update'; table: string; row: Row; patch: Record<string, any> }
  | { kind: 'delete'; table: string; row: Row }
  | { kind: 'upsert'; table: string; row: Row };

export interface OutMail { to: string; subject: string; html: string; text: string; attachments?: { name: string; mime: string; data: string }[]; log: Row | null; ref: string; tipo?: string; studio?: boolean }
export type OutTask =
  | { kind: 'mail'; mail: OutMail }
  | { kind: 'calendar.create'; citaId: string; event: any }
  | { kind: 'calendar.move'; eventId: string; start: string; end: string }
  | { kind: 'calendar.cancel'; eventId: string }
  | { kind: 'storage.remove'; bucket: string; paths: string[] };

export interface Ctx {
  deps: Deps;
  tables: Record<string, Row[]>;      // filas cargadas (formato de la lógica: todo como texto)
  ops: Op[];                          // cambios por guardar al final, en una sola transacción
  out: OutTask[];                     // correos, calendario y archivos por borrar: después de guardar
  svc: any; settings: any;            // memorias de esta petición
  user: { email: string; name: string } | null;   // sesión verificada (Supabase Auth)
  userToken: string;
  captcha: boolean | null;            // resultado de Cloudflare Turnstile (null = no se envió)
  captures: string[];                 // cobros hechos en esta petición (para avisar si algo falla al guardar)
  cronActive: boolean | null;
  seq: number;
}

const store = new AsyncLocalStorage<Ctx>();

export function newCtx(deps: Deps): Ctx {
  return { deps, tables: {}, ops: [], out: [], svc: null, settings: null, user: null, userToken: '', captcha: null, captures: [], cronActive: null, seq: 0 };
}
export function runWith<T>(c: Ctx, fn: () => Promise<T>): Promise<T> { return store.run(c, fn); }
export function cx(): Ctx {
  const c = store.getStore();
  if (!c) throw new Error('Sin contexto de petición.');
  return c;
}
export function env_(k: string): string { return String(cx().deps.env[k] || '').trim(); }
