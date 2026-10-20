/* MAJOBELLA · Entrada de la API: recibe cada acción, prepara los datos, la ejecuta y guarda.
   Mismo contrato que el backend anterior de Apps Script: GET ?action=catalog|busy y POST { action, … },
   así la web, la app de clientas, la app del estudio y el panel hablan todos con la misma API. */
import { cx, env_, newCtx, runWith, type Deps } from './ctx.ts';
import { appendRow_, commit, loadTables, readTable_, updateTable_ } from './db.ts';
import { resetCaches_, settings_ } from './data.ts';
import { DEFAULT_SERVICES, DEFAULT_SETTINGS, ERROR_TITLES } from './constants.ts';
import { adminTo_, layout_ } from './mail.ts';
import { esc_, msg_, plainText_ } from './util.ts';
import { busy_, busyWithUntil_ } from './schedule.ts';
import { catalog_ } from './catalog.ts';
import { checkCode_, loyalty_ } from './pricing.ts';
import { adminEmails_, resolveCaptcha, resolveUser, storagePrivacy } from './security.ts';
import { heartbeat_, logError_ } from './errors.ts';
import { runOutbox } from './outbox.ts';
import {
  balanceCapture_, balanceOrder_, cancel_, capture_, hold_, lookup_, myAppointments_, release_, reschedule_, transferProof_,
} from './booking.ts';
import { consentInfo_, consentSign_ } from './consent.ts';
import { adminWaitlist_, waitlistJoin_ } from './waitlist.ts';
import {
  adminDeletePackage_, adminSaveBono_, adminSaveGift_, adminSavePackage_, adminSellBono_, bonoCapture_, bonoOrder_, giftCapture_, giftOrder_,
  myWallet_, walletEmail_, walletLookup_,
} from './gifts.ts';
import {
  adminBlock_, adminCreate_, adminData_, adminDeleteAccount_, adminDeleteBlock_, adminDeleteExpense_, adminDeleteFile_, adminDeleteGallery_,
  adminDeletePromo_, adminDeleteReview_, adminEmailPreview_, adminEmailTest_, adminFile_, adminPublishGallery_, adminReschedule_,
  adminResolveErrors_, adminSaveAccount_, adminSaveClient_, adminSaveExpense_, adminSaveGallery_, adminSavePromo_, adminSaveReview_,
  adminSaveSettings_, adminSendReminder_, adminTransferReview_, adminUpdate_, adminUpload_, adminUploadPublic_,
} from './admin.ts';
import { adminRunAutomations_, runAutomations_ } from './automations.ts';
import { importData_ } from './importer.ts';

type Fn = (d: any, extra?: any) => any;
/* L = se ejecuta con el candado (una a la vez: agenda, pagos, saldos); N = sin candado */
const ACTIONS: Record<string, { fn: Fn; lock: boolean }> = {};
const L = (name: string, fn: Fn) => { ACTIONS[name] = { fn, lock: true }; };
const N = (name: string, fn: Fn) => { ACTIONS[name] = { fn, lock: false }; };
// Clientas
N('checkCode', checkCode_); L('hold', hold_); L('capture', capture_); L('release', release_); L('cancel', cancel_);
N('balanceOrder', balanceOrder_); L('balanceCapture', balanceCapture_); N('myAppointments', myAppointments_); N('lookup', lookup_);
L('giftOrder', giftOrder_); L('giftCapture', giftCapture_); L('bonoOrder', bonoOrder_); L('bonoCapture', bonoCapture_);
N('loyalty', loyalty_); N('walletLookup', walletLookup_); L('waitlistJoin', waitlistJoin_); N('consentInfo', consentInfo_);
L('consentSign', consentSign_); L('transferProof', transferProof_); L('reschedule', reschedule_); N('myWallet', myWallet_); L('walletEmail', walletEmail_);
// Panel
N('adminData', adminData_); N('adminList', adminData_); L('adminUpdate', adminUpdate_); L('adminCreate', adminCreate_);
L('adminReschedule', adminReschedule_); L('adminBlock', adminBlock_); L('adminDeleteBlock', adminDeleteBlock_);
L('adminSaveSettings', adminSaveSettings_); L('adminSaveClient', adminSaveClient_); L('adminUpload', adminUpload_); N('adminFile', adminFile_);
L('adminDeleteFile', adminDeleteFile_); L('adminSavePromo', adminSavePromo_); L('adminDeletePromo', adminDeletePromo_);
L('adminSaveGift', adminSaveGift_); L('adminSaveExpense', adminSaveExpense_); L('adminDeleteExpense', adminDeleteExpense_);
L('adminPublishGallery', adminPublishGallery_); L('adminSaveGallery', adminSaveGallery_); L('adminDeleteGallery', adminDeleteGallery_);
L('adminSaveReview', adminSaveReview_); L('adminDeleteReview', adminDeleteReview_); L('adminUploadPublic', adminUploadPublic_);
L('adminSendReminder', adminSendReminder_); L('adminSavePackage', adminSavePackage_); L('adminDeletePackage', adminDeletePackage_);
L('adminSellBono', adminSellBono_); L('adminSaveBono', adminSaveBono_); L('adminWaitlist', adminWaitlist_);
N('adminEmailPreview', adminEmailPreview_); N('adminEmailTest', adminEmailTest_); L('adminRunAutomations', adminRunAutomations_);
L('adminSaveAccount', adminSaveAccount_); L('adminDeleteAccount', adminDeleteAccount_); L('adminTransferReview', adminTransferReview_);
L('adminResolveErrors', adminResolveErrors_); L('adminImport', importData_);

/* Acciones que devuelven los datos completos del panel (necesitan historiales y el estado del sistema) */
const PANEL = ['adminData', 'adminList', 'adminSaveSettings', 'adminRunAutomations', 'adminResolveErrors', 'adminImport'];
const LOCK_KEY = 7212026;

/* Ajustes y servicios iniciales (lo que hacía setup()): se completan solos si faltan */
function ensureSeed_() {
  const have = readTable_('Ajustes').map((r) => r.clave);
  DEFAULT_SETTINGS.filter((x) => have.indexOf(x[0]) < 0).forEach((x) => appendRow_('Ajustes', { clave: x[0], valor: x[1], 'qué es': x[2] }));
  const rows = readTable_('Servicios');
  if (!rows.length) {
    DEFAULT_SERVICES.forEach((x) => appendRow_('Servicios', { id: x[0], nombre: x[1], duracionMin: x[2], precioRD: x[3], precioDesde: x[4], activo: x[5], volverDias: x[6], depositoPct: x[7], retoqueDias: x[8], consentimiento: x[9] }));
  } else {
    rows.forEach((r) => {
      const def = DEFAULT_SERVICES.filter((x) => x[0] === r.id)[0];
      const patch: any = {};
      if (!r.volverDias) patch.volverDias = def ? def[6] : 30;
      if (r.retoqueDias === '') patch.retoqueDias = def ? def[8] : 0;
      if (r.consentimiento === '') patch.consentimiento = def ? def[9] : 'no';
      if (Object.keys(patch).length) updateTable_('Servicios', r._row, patch);
    });
  }
  resetCaches_();
}

/* Programa las tareas automáticas en pg_cron si aún no lo están (al abrir el panel) */
async function ensureCron_(tx: any) {
  const c = cx();
  // En un punto de guardado: si pg_cron no está (por ejemplo, en pruebas locales) no se pierde la transacción
  try { await tx.savepoint(async (sp: any) => { const r = await sp`select public.majobella_tareas_programadas() as on`; c.cronActive = !!r[0].on; }); }
  catch (e) { c.cronActive = null; return; }
  const key = env_('CRON_KEY'), base = env_('SUPABASE_URL');
  if (c.cronActive || !key || !base) return;
  try {
    await tx.savepoint(async (sp: any) => { await sp`select public.majobella_programar_tareas(${base.replace(/\/$/, '') + '/functions/v1/api'}, ${key})`; });
    c.cronActive = true;
  } catch (e) { logError_('automatizacion', 'No se pudieron programar las tareas automáticas: ' + msg_(e), '', ''); }
}

function urgentMail_(text: string, ref: string) {
  let s: any = {};
  try { s = settings_(); } catch (e) { s = {}; }
  const to = adminTo_(s);
  if (!to) return;
  const html = layout_(s, { kicker: 'Aviso del sistema', title: ERROR_TITLES.pago, intro: esc_(text), details: ref ? [['Referencia', esc_(ref)]] : [], note: 'Este aviso es importante: revísalo hoy.' });
  cx().out.push({ kind: 'mail', mail: { to, subject: '⚠ MAJOBELLA · ' + ERROR_TITLES.pago, html, text: plainText_(html), log: null, ref } });
}
function safeOutbox(sql: any) { return runOutbox(sql).catch((e) => console.error('Error al enviar:', msg_(e))); }

export interface ApiResult { status: number; body: any; after?: Promise<void> }

/* Ejecuta una acción. method: 'GET' | 'POST'; data: parámetros o cuerpo; headers: cabeceras (minúsculas) */
export async function handle(deps: Deps, method: string, data: any, headers: Record<string, string> = {}): Promise<ApiResult> {
  const c = newCtx(deps);
  return runWith(c, async () => {
    const sql = deps.sql;
    const action = String((data && data.action) || '');
    try {
      if (method === 'GET') {
        if (action === 'catalog') {
          const body = await sql.begin(async (tx: any) => {
            await loadTables(tx, { tables: ['Ajustes', 'Servicios', 'Promociones', 'Paquetes', 'Galeria', 'Resenas', 'Cuentas'] });
            ensureSeed_();
            heartbeat_();
            const out = catalog_();
            await commit(tx);
            return out;
          });
          return { status: 200, body, after: safeOutbox(sql) };
        }
        if (action === 'busy' || action === 'availability') {
          const from = data.from || data.date, to = data.to || data.date;
          const body = await sql.begin(async (tx: any) => {
            await loadTables(tx, { tables: ['Reservas', 'Bloqueos', 'Ajustes'], reservasRange: /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) ? { from, to } : undefined });
            return action === 'busy' ? busyWithUntil_(from, to) : busy_(from, to);
          });
          return { status: 200, body };
        }
        return { status: 200, body: { ok: false, error: 'Acción no válida.' } };
      }

      // Tareas automáticas (las llama pg_cron cada hora con su clave)
      if (action === 'cron') {
        const key = env_('CRON_KEY');
        if (!key || headers['x-cron-key'] !== key) return { status: 401, body: { ok: false, error: 'No autorizado.' } };
        const body = await sql.begin(async (tx: any) => {
          await tx`select pg_advisory_xact_lock(${LOCK_KEY})`;
          await tx`delete from public.cache where vence < now()`;
          await loadTables(tx);
          ensureSeed_();
          const out = runAutomations_();
          await commit(tx);
          return { ok: true, result: out };
        });
        return { status: 200, body, after: safeOutbox(sql) };
      }

      const entry = ACTIONS[action];
      if (!entry) return { status: 200, body: { ok: false, error: 'Acción no válida.' } };
      const panel = PANEL.includes(action);

      const body = await sql.begin(async (tx: any) => {
        if (entry.lock) await tx`select pg_advisory_xact_lock(${LOCK_KEY})`;
        await loadTables(tx, panel ? { tables: undefined } : {});
        if (panel) await loadTables(tx, { tables: ['Correos', 'Errores'] });
        ensureSeed_();
        // Verificaciones que necesitan internet, antes de la lógica
        if (data.idToken) { c.userToken = String(data.idToken); c.user = await resolveUser(c.userToken); }
        if (data.captcha) c.captcha = await resolveCaptcha(data, settings_());
        const extra: any = {};
        if (panel && c.user && adminEmails_().includes(c.user.email)) { extra.folder = await storagePrivacy(); await ensureCron_(tx); }
        const mark = c.ops.length, markOut = c.out.length;
        let out: any;
        try { out = await entry.fn(data, extra); }
        catch (err) {
          // Lo que la acción dejó a medias no se guarda; solo el aviso del error
          c.ops.length = mark; c.out.length = markOut;
          const m = msg_(err);
          if (!/sesión expiró|no tiene acceso/i.test(m)) logError_('sistema', m, data.id || '', 'acción: ' + action);
          out = { ok: false, error: m };
        }
        await commit(tx);
        return out;
      });
      return { status: 200, body, after: safeOutbox(sql) };
    } catch (err) {
      // No se pudo guardar. Si en esta petición se cobró algo, se avisa de inmediato para revisarlo a mano.
      const m = msg_(err);
      if (c.captures.length) {
        const text = 'Se cobró en PayPal (' + c.captures.join(', ') + ') pero no se pudo guardar: ' + m + '. Revisa la venta en PayPal y regístrala a mano.';
        try {
          await sql`insert into public.errores (fecha, tipo, mensaje, ref, detalle, avisado) values (now(), 'pago', ${text}, ${String(data.id || '').slice(0, 80)}, ${'acción: ' + action}, now())`;
        } catch (e) { /* nada */ }
        // Los correos de la acción no salen (no se guardó); solo el aviso urgente al estudio
        c.out = [];
        try { urgentMail_(text, String(data.id || '')); await runOutbox(sql); } catch (e) { /* nada */ }
        return { status: 200, body: { ok: false, error: 'Recibimos tu pago, pero hubo un problema al registrarlo. Ya nos llegó el aviso y te contactaremos. Guarda este código: ' + (data.id || '') } };
      }
      console.error('Error en', action, m);
      return { status: 200, body: { ok: false, error: /could not|connect|timeout|ECONN/i.test(m) ? 'El sistema está ocupado. Inténtalo de nuevo en un momento.' : m } };
    }
  });
}
