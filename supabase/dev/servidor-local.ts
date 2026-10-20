/* MAJOBELLA · API local para probar las apps sin Supabase
   Levanta la misma API (functions/_shared/core) sobre una base PostgreSQL local con datos de ejemplo
   y servicios externos simulados (PayPal, correo, Storage). Nada sale a internet.
   Uso: PGHOST=/tmp PGPORT=54329 npx tsx dev/servidor-local.ts [puerto]
   En la app: EXPO_PUBLIC_API_URL=http://<tu-ip>:8787 npx expo start */
import { createServer } from 'node:http';
import { harness } from '../tests/harness.ts';
import { handle } from '../functions/_shared/core/api.ts';

const port = Number(process.argv[2] || 8787);
const g = await harness();
const sql = g.sql;
const today = new Date(Date.now() - 4 * 3600000).toISOString().slice(0, 10);
const inDays = (n: number) => new Date(Date.now() - 4 * 3600000 + n * 86400000).toISOString().slice(0, 10);

// Ajustes y contenido de ejemplo
await g.get({ action: 'catalog' });   // crea los ajustes y servicios iniciales
for (const [k, v] of Object.entries({
  transferenciaActiva: 'si', esperaActiva: 'si', fidelidadActiva: 'si', googleRating: '4,9', googleResenas: '87',
  googleResenaUrl: 'https://g.page/r/majobella/review',
  majoTexto: 'Soy Majo, especialista en cejas, pestañas y cuidado de la piel. Cada servicio lo hago con calma y a tu medida.\n\nMi meta es que salgas sintiéndote tú, pero más bella.',
  majoCerts: 'Certificación en microblading\nLifting de pestañas profesional\nCosmetología facial',
})) await g.setSetting(k, v);
await sql`insert into public.cuentas (id, banco, tipo, numero, titular, documento, activa, orden) values
  ('CTA-1', 'Banco Popular', 'Ahorros', '812345678', 'María José Pérez', '001-1234567-8', true, 1),
  ('CTA-2', 'Banreservas', 'Corriente', '9600123456', 'María José Pérez', '001-1234567-8', true, 2)`;
await sql`insert into public.resenas (id, autora, estrellas, texto, fecha, visible, orden) values
  ('R1', 'Laura M.', 5, 'Mis cejas quedaron perfectas y naturales. Majo te explica todo con paciencia.', ${inDays(-20)}, true, 1),
  ('R2', 'Paola G.', 5, 'El facial fue una maravilla, salí con la piel radiante. ¡Volveré!', ${inDays(-45)}, true, 2),
  ('R3', 'Camila R.', 5, 'Puntual, limpia y muy profesional. El lifting me encantó.', ${inDays(-60)}, true, 3)`;
await sql`insert into public.promociones (id, nombre, tipo, servicios, descuento_tipo, valor, desde, hasta, activo) values
  ('P1', 'Mes de la piel', 'auto', 'faciales', 'porcentaje', 15, ${today}, ${inDays(25)}, true)`;
await sql`insert into public.paquetes (id, nombre, servicio, sesiones, precio_rd, vence_dias, descripcion, en_web, activo) values
  ('K1', 'Cejas perfectas', 'cejas', 4, 3200, 180, 'Cuatro diseños de cejas para mantener tu forma todo el año.', true, true)`;

const server = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization, x-cron-key');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  try {
    const url = new URL(req.url || '/', 'http://local');
    let data: any = Object.fromEntries(url.searchParams);
    if (req.method === 'POST') {
      let body = '';
      for await (const chunk of req) body += chunk;
      data = JSON.parse(body || '{}');
    }
    const out = await handle(g.deps, req.method || 'GET', data, Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, String(v)])));
    if (out.after) await out.after;
    // PayPal simulado: la orden queda aprobada al pedirla (para probar el flujo completo)
    if (out.body && out.body.orderId && g.pp.orders[out.body.orderId]) g.pp.orders[out.body.orderId].status = 'APPROVED';
    res.writeHead(out.status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(out.body));
    console.log(req.method, data.action, out.body && out.body.ok === false ? '✘ ' + out.body.error : '✓');
  } catch (e: any) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: e.message }));
  }
});
server.listen(port, () => console.log(`API local de MAJOBELLA en http://localhost:${port} (correos enviados: ver consola)`));
process.on('SIGINT', async () => { server.close(); await g.close(); process.exit(0); });
