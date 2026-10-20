/* MAJOBELLA · Sesión, permisos, robots y límites de intentos
   Las verificaciones que necesitan internet (sesión de Supabase o Google, Cloudflare Turnstile) se hacen
   al empezar la petición (prepareRequest); la lógica luego solo consulta el resultado. */
import { cx, env_ } from './ctx.ts';
import { cacheGet, cachePut, sysGet, sysSet } from './db.ts';
import { GOOGLE_CLIENT_ID } from './constants.ts';
import { clean_, hash_, msg_, num_, safeJson_ } from './util.ts';
import { logError_ } from './errors.ts';
import { paypalEnv_ } from './paypal.ts';

/* ---- Sesión ---- */
function jwtPayload(token: string): any {
  const p = String(token || '').split('.');
  if (p.length !== 3) return null;
  try { return JSON.parse(atob(p[1].replace(/-/g, '+').replace(/_/g, '/'))); } catch (e) { return null; }
}

/* Comprueba el token de inicio de sesión: de Supabase Auth (app y web nuevas) o de Google (web anterior) */
export async function resolveUser(token: string): Promise<{ email: string; name: string } | null> {
  if (!token) return null;
  const key = 'idt_' + hash_(token).slice(0, 40);
  const hit = cacheGet(key);
  if (hit) return safeJson_(hit, null);
  const c = cx();
  const claims = jwtPayload(token) || {};
  let user: { email: string; name: string } | null = null;
  try {
    if (/accounts\.google\.com/.test(String(claims.iss || ''))) {
      const res = await c.deps.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(token));
      if (res.status === 200) {
        const info = await res.json();
        const aud = env_('GOOGLE_CLIENT_ID') || GOOGLE_CLIENT_ID;
        if (info.aud === aud && String(info.email_verified) === 'true' && Number(info.exp) * 1000 > Date.now()) user = { email: String(info.email).toLowerCase(), name: info.name || '' };
      }
    } else {
      const base = env_('SUPABASE_URL');
      if (base) {
        const res = await c.deps.fetch(base.replace(/\/$/, '') + '/auth/v1/user', { headers: { Authorization: 'Bearer ' + token, apikey: env_('SUPABASE_ANON_KEY') || env_('SUPABASE_SERVICE_ROLE_KEY') } });
        if (res.status === 200) {
          const u = await res.json();
          const verified = !!(u.email_confirmed_at || u.confirmed_at || (u.app_metadata && u.app_metadata.provider === 'google'));
          if (u.email && verified) user = { email: String(u.email).toLowerCase(), name: (u.user_metadata && (u.user_metadata.full_name || u.user_metadata.name)) || '' };
        }
      }
    }
  } catch (e) { logError_('sistema', 'No se pudo verificar la sesión: ' + msg_(e), '', ''); }
  if (user) cachePut(key, JSON.stringify(user), 600);
  return user;
}

export function verifyIdToken_(idToken: any) {
  const c = cx();
  if (!idToken || idToken !== c.userToken) return null;
  return c.user;
}
export function adminEmails_() {
  return env_('ADMIN_EMAILS').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
}
export function admin_(idToken: any) {
  const u = verifyIdToken_(idToken);
  if (!u) return null;
  return adminEmails_().indexOf(u.email) >= 0 ? u : null;
}
export function needAdmin_(d: any) {
  const u = verifyIdToken_(d.idToken);
  if (!u) throw new Error('Tu sesión expiró. Vuelve a iniciar sesión.');
  if (!admin_(d.idToken)) throw new Error('Esta cuenta no tiene acceso al dashboard.');
  noteAccess_(u, d);
  return u;
}
export function authorized_(r: any, d: any) {
  if (d.token && r.tokenHash && hash_(d.token) === r.tokenHash) return true;
  if (d.idToken) { const u = verifyIdToken_(d.idToken); if (u && u.email === r.correo) return true; }
  return false;
}

/* ---- Robots (Cloudflare Turnstile) ---- */
export function turnstileOn_(s: Record<string, string>) { return !!(String(s.turnstileSiteKey || '').trim() && env_('TURNSTILE_SECRET')); }
export async function resolveCaptcha(d: any, s: Record<string, string>) {
  if (!turnstileOn_(s) || !d.captcha) return null;
  try {
    const body = new URLSearchParams({ secret: env_('TURNSTILE_SECRET'), response: String(d.captcha) });
    const res = await cx().deps.fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
    return (await res.json()).success === true;
  } catch (e) { logError_('sistema', 'No se pudo verificar Turnstile: ' + msg_(e), '', ''); return true; }
}
export function human_(d: any, s: Record<string, string>) {
  if (!turnstileOn_(s)) return true;
  if (!d.captcha) return false;
  return cx().captcha !== false;
}

/* ---- Límite de códigos equivocados: por dispositivo (8 cada 15 min) y en total (150 cada 10 min) ---- */
function rlKeys_(d: any) {
  return { dev: d.device ? 'rl_d_' + hash_(String(d.device)).slice(0, 24) : '', glob: 'rl_g_' + Math.floor(Date.now() / 600000) };
}
export function limited_(d: any) {
  const k = rlKeys_(d);
  if (k.dev && Number(cacheGet(k.dev) || 0) >= 8) return true;
  return Number(cacheGet(k.glob) || 0) >= 150;
}
export function noteFail_(d: any) {
  const k = rlKeys_(d);
  if (k.dev) cachePut(k.dev, String(Number(cacheGet(k.dev) || 0) + 1), 900);
  cachePut(k.glob, String(Number(cacheGet(k.glob) || 0) + 1), 700);
}

/* Últimos accesos al panel */
export function noteAccess_(u: any, d: any) {
  try {
    const key = 'acc_' + hash_(String(d.idToken)).slice(0, 30);
    if (cacheGet(key)) return;
    cachePut(key, '1', 21600);
    const list = safeJson_(sysGet('ADMIN_ACCESS'), []) || [];
    list.unshift({ email: u.email, at: new Date().toISOString(), device: clean_(d.device_label, 80) });
    sysSet('ADMIN_ACCESS', JSON.stringify(list.slice(0, 15)));
  } catch (e) { /* nada */ }
}

/* Revisa que la carpeta de fichas de Storage sea privada (se consulta antes de armar los datos del panel) */
export async function storagePrivacy(): Promise<any> {
  const base = env_('SUPABASE_URL'), key = env_('SUPABASE_SERVICE_ROLE_KEY');
  if (!base || !key) return null;
  try {
    const res = await cx().deps.fetch(base.replace(/\/$/, '') + '/storage/v1/bucket/fichas', { headers: { Authorization: 'Bearer ' + key, apikey: key } });
    if (res.status !== 200) return null;
    const b = await res.json();
    return { access: b.public ? 'ANYONE_WITH_LINK' : 'PRIVATE', editors: [], viewers: [] };
  } catch (e) { return null; }
}

export function securityStatus_(s: Record<string, string>, folder: any) {
  return {
    admins: adminEmails_(),
    turnstile: { siteKey: !!String(s.turnstileSiteKey || '').trim(), secret: !!env_('TURNSTILE_SECRET') },
    paypalEnv: paypalEnv_(),
    database: { provider: 'supabase', rls: true },
    sheet: null,
    folder,
    accesses: safeJson_(sysGet('ADMIN_ACCESS'), []) || [],
    inactivityMinutes: num_(s.adminInactividadMin, 30),
  };
}
