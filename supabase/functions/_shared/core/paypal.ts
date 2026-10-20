/* MAJOBELLA · PayPal (API REST v2). La clave secreta vive solo en los secretos de Supabase. */
import { cx, env_ } from './ctx.ts';
import { cacheGet, cachePut } from './db.ts';
import { msg_ } from './util.ts';

export function paypalEnv_() { return (env_('PAYPAL_ENV') || 'sandbox').toLowerCase() === 'live' ? 'live' : 'sandbox'; }
function paypalBase_() { return paypalEnv_() === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com'; }
export function paypalConfigured_() { return !!(env_('PAYPAL_CLIENT_ID') && env_('PAYPAL_SECRET')); }

async function paypalToken_() {
  const key = 'pp_token_' + paypalEnv_();
  const hit = cacheGet(key);
  if (hit) return hit;
  const id = env_('PAYPAL_CLIENT_ID'), secret = env_('PAYPAL_SECRET');
  if (!id || !secret) throw new Error('Los pagos con PayPal aún no están configurados.');
  const res = await cx().deps.fetch(paypalBase_() + '/v1/oauth2/token', {
    method: 'POST',
    headers: { Authorization: 'Basic ' + btoa(id + ':' + secret), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  if (res.status !== 200) throw new Error('No se pudo conectar con PayPal. Revisa las llaves.');
  const data = await res.json();
  cachePut(key, data.access_token, Math.max(60, Math.min(21600, Number(data.expires_in || 3600) - 120)));
  return data.access_token as string;
}

export async function paypal_(method: string, path: string, body: any, requestId?: string): Promise<any> {
  const headers: Record<string, string> = { Authorization: 'Bearer ' + (await paypalToken_()), 'Content-Type': 'application/json', Prefer: 'return=representation' };
  if (requestId) headers['PayPal-Request-Id'] = requestId;
  const res = await cx().deps.fetch(paypalBase_() + path, { method: method.toUpperCase(), headers, body: body == null ? undefined : JSON.stringify(body) });
  const code = res.status;
  const text = await res.text();
  let data: any = {};
  try { data = text ? JSON.parse(text) : {}; } catch (e) { data = {}; }
  if (code >= 300) {
    const issue = data.details && data.details[0] && data.details[0].issue;
    if (issue === 'INSTRUMENT_DECLINED') throw new Error('PayPal rechazó el método de pago. Prueba con otra tarjeta o cuenta.');
    if (issue === 'ORDER_ALREADY_CAPTURED') return getOrder_(path);
    throw new Error('PayPal: ' + (data.message || issue || ('error ' + code)));
  }
  // Se anota cada cobro hecho en esta petición: si algo falla al guardar, se avisa al estudio
  const cap = firstCapture_(data);
  if (cap && cap.id && /\/capture$/.test(path)) cx().captures.push(cap.id + ' (' + (cap.amount ? cap.amount.value + ' ' + cap.amount.currency_code : '') + ')');
  return data;
}

async function getOrder_(capturePath: string) {
  return paypal_('get', capturePath.replace(/\/capture$/, ''), null);
}

export function firstCapture_(order: any) {
  const pu = order && order.purchase_units && order.purchase_units[0];
  return pu && pu.payments && pu.payments.captures && pu.payments.captures[0];
}

export async function tryRefund_(captureId: string, requestId: string) {
  try {
    const r = await paypal_('post', '/v2/payments/captures/' + encodeURIComponent(captureId) + '/refund', {}, requestId);
    return 'reembolsado ' + (r.id || '') + ' (' + (r.status || '') + ')';
  } catch (err) {
    return 'reembolso pendiente: ' + msg_(err);
  }
}

/* Orden de cobro en dólares (depósito, saldo, tarjeta o paquete) */
export function orderBody(ref: string, invoice: string, description: string, usd: number) {
  return {
    intent: 'CAPTURE',
    purchase_units: [{ reference_id: ref, custom_id: ref, invoice_id: invoice, description: description.slice(0, 127), amount: { currency_code: 'USD', value: usd.toFixed(2) } }],
    application_context: { brand_name: 'MAJOBELLA', shipping_preference: 'NO_SHIPPING', user_action: 'PAY_NOW' },
  };
}
