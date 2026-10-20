/* MAJOBELLA · API (Supabase Edge Function "api")
   Una sola dirección para la web, las apps y el panel:
     GET  https://<proyecto>.supabase.co/functions/v1/api?action=catalog
     POST https://<proyecto>.supabase.co/functions/v1/api   { "action": "hold", … }
   Se publica sin verificación de JWT de Supabase (config.toml): la propia API valida cada acción
   (sesión de la clienta, cuentas del estudio, clave de gestión de cada cita, clave de las tareas automáticas). */
import postgres from 'npm:postgres@3.4.5';
import { handle } from '../_shared/core/api.ts';

// Conexión por el pooler de Supabase (modo transacción: sin consultas preparadas)
const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 4, idle_timeout: 20, connect_timeout: 10, onnotice: () => {} });

const ALLOWED = (Deno.env.get('ALLOWED_ORIGINS') || '').split(',').map((x) => x.trim()).filter(Boolean);
function cors(origin: string | null) {
  // Las apps nativas no envían Origin; la web sí. Si hay lista de orígenes, solo esos.
  const allow = !ALLOWED.length ? '*' : origin && ALLOWED.includes(origin) ? origin : ALLOWED[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, authorization, apikey, x-client-info',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

const MAX_BODY = 16 * 1024 * 1024;

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const headers = { ...cors(origin), 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  let data: any = {};
  try {
    if (req.method === 'GET') data = Object.fromEntries(new URL(req.url).searchParams);
    else if (req.method === 'POST') {
      const len = Number(req.headers.get('content-length') || 0);
      if (len > MAX_BODY) return new Response(JSON.stringify({ ok: false, error: 'El archivo es demasiado grande.' }), { status: 413, headers });
      const text = await req.text();
      data = text ? JSON.parse(text) : {};
    } else return new Response(JSON.stringify({ ok: false, error: 'Método no permitido.' }), { status: 405, headers });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: 'Datos no válidos.' }), { status: 400, headers });
  }
  const hdrs: Record<string, string> = {};
  req.headers.forEach((v, k) => { hdrs[k.toLowerCase()] = v; });
  const res = await handle({ sql, fetch: (u: string, i?: any) => fetch(u, i), env: Deno.env.toObject() }, req.method, data, hdrs);
  // Correos y calendario salen después de responder (la clienta no espera)
  // deno-lint-ignore no-explicit-any
  if (res.after) (globalThis as any).EdgeRuntime?.waitUntil ? (globalThis as any).EdgeRuntime.waitUntil(res.after) : await res.after;
  return new Response(JSON.stringify(res.body), { status: res.status, headers });
});
