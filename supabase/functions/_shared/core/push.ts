/* MAJOBELLA · Avisos en el celular (apps de clientas y del estudio)
   Cada app registra su celular con la cuenta que inició sesión. Después, cada correo que se envía a esa
   cuenta también llega como aviso push (Expo Push), así la clienta ve su confirmación y el estudio ve
   las reservas nuevas sin abrir el correo. Los avisos salen después de guardar, junto con los correos. */
import { cx, env_ } from './ctx.ts';
import { appendRow_, readOpt_, updateTable_, deleteRow_ } from './db.ts';
import { admin_, verifyIdToken_ } from './security.ts';
import { clean_, msg_ } from './util.ts';

const TOKEN = /^Expo(nent)?PushToken\[[\w-]{10,}\]$/;

export function pushRegister_(d: any) {
  const u = verifyIdToken_(d.idToken);
  if (!u) return { ok: false, error: 'Tu sesión expiró. Vuelve a iniciar sesión.' };
  const token = clean_(d.token, 200);
  if (!TOKEN.test(token)) return { ok: false, error: 'Aviso no válido.' };
  const app = d.app === 'estudio' ? 'estudio' : 'cliente';
  if (app === 'estudio' && !admin_(d.idToken)) return { ok: false, error: 'Esta cuenta no tiene acceso al dashboard.' };
  const now = new Date().toISOString();
  const plataforma = /^(ios|android|web)$/.test(String(d.platform || '')) ? String(d.platform) : '';
  const row = readOpt_('Dispositivos').filter((x) => x.token === token)[0];
  if (row) updateTable_('Dispositivos', row._row, { correo: u.email, app, plataforma, visto: now });
  else appendRow_('Dispositivos', { token, correo: u.email, app, plataforma, creado: now, visto: now });
  return { ok: true };
}

/* Al cerrar sesión: el celular deja de recibir avisos de esa cuenta */
export function pushUnregister_(d: any) {
  const token = clean_(d.token, 200);
  const row = readOpt_('Dispositivos').filter((x) => x.token === token)[0];
  if (row) deleteRow_('Dispositivos', row._row);
  return { ok: true };
}

export interface PushMsg { emails: string[]; title: string; body: string; data: Record<string, string>; studio: boolean }

/* Envía los avisos (Expo Push). Devuelve los tokens que ya no existen para borrarlos. */
export async function sendPush(sql: any, list: PushMsg[]): Promise<string[]> {
  if (!list.length || /^no$/i.test(env_('PUSH_ACTIVO'))) return [];
  const emails = [...new Set(list.flatMap((m) => m.emails))];
  if (!emails.length) return [];
  let devices: { token: string; correo: string; app: string }[] = [];
  try { devices = await sql`select token, correo, app from public.dispositivos where lower(correo) = any(${emails})`; }
  catch (e) { return []; }   // la tabla aún no existe
  if (!devices.length) return [];
  const msgs: any[] = [];
  for (const m of list) {
    for (const dv of devices) {
      if (!m.emails.includes(String(dv.correo).toLowerCase())) continue;
      // Avisos del estudio solo a la app del estudio; los de clientas, a la app de clientas
      if ((dv.app === 'estudio') !== m.studio) continue;
      msgs.push({ to: dv.token, title: m.title, body: m.body, data: m.data, sound: 'default', channelId: 'avisos', priority: 'high' });
    }
  }
  const gone: string[] = [];
  for (let i = 0; i < msgs.length; i += 100) {
    const chunk = msgs.slice(i, i + 100);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
      if (env_('EXPO_ACCESS_TOKEN')) headers.Authorization = 'Bearer ' + env_('EXPO_ACCESS_TOKEN');
      const res = await cx().deps.fetch('https://exp.host/--/api/v2/push/send', { method: 'POST', headers, body: JSON.stringify(chunk) });
      const out = await res.json().catch(() => ({}));
      (out.data || []).forEach((t: any, k: number) => {
        if (t && t.status === 'error' && t.details && t.details.error === 'DeviceNotRegistered') gone.push(chunk[k].to);
      });
    } catch (e) { console.error('Avisos push:', msg_(e)); }
  }
  return gone;
}
