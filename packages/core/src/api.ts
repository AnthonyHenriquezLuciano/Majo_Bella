/* MAJOBELLA · Cliente de la API (el mismo contrato que usa la web: GET ?action=… y POST { action, … }).
   Funciona igual con el backend de Supabase (functions/v1/api) y con el anterior de Apps Script. */
import type { Appointment, Catalog, ClientData, ConsentSubmission, HoldResult, Loyalty, Pricing, WalletItem } from './types';

export interface ApiOptions {
  url: string;
  /* 'cliente' | 'estudio': con esto PayPal vuelve a la app al terminar el pago */
  app: 'cliente' | 'estudio';
  /* Identificador anónimo del celular (para limitar intentos con códigos equivocados) */
  deviceId?: () => string | Promise<string>;
  /* Sesión: token de Supabase Auth (o de Google) de la cuenta que inició sesión */
  idToken?: () => string | null | Promise<string | null>;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export class ApiError extends Error {
  data: any;
  constructor(message: string, data?: any) { super(message); this.data = data; }
}

/* Para citas reservadas sin cuenta: id + clave de la cita */
export type Auth = { token: string } | { idToken: string };

export function createApi(opts: ApiOptions) {
  const doFetch = opts.fetch || fetch;
  const timeout = opts.timeoutMs || 30000;

  async function request(init: RequestInit, url: string) {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), timeout) : null;
    let res: Response;
    try { res = await doFetch(url, { ...init, signal: ctrl ? ctrl.signal : undefined }); }
    catch (e) { throw new ApiError('Sin conexión. Revisa tu internet e intenta de nuevo.'); }
    finally { if (timer) clearTimeout(timer); }
    const data = await res.json().catch(() => ({ ok: false, error: 'Respuesta no válida del servidor.' }));
    return { res, data };
  }

  const api = {
    enabled: () => !!(opts.url && opts.url.trim()),
    url: opts.url,

    async get<T = any>(params: Record<string, string>): Promise<T> {
      const u = `${opts.url}${opts.url.includes('?') ? '&' : '?'}${new URLSearchParams(params)}`;
      const { res, data } = await request({ method: 'GET', headers: { Accept: 'application/json' } }, u);
      if (!res.ok || data.ok === false) throw new ApiError(data.error || `Error ${res.status}`, data);
      return data as T;
    },

    /* POST con la sesión y el identificador del celular. withSession: añade idToken si hay sesión. */
    async post<T = any>(body: Record<string, any>, fallbackError = 'No se pudo completar. Inténtalo de nuevo.', withSession = true): Promise<T> {
      if (!api.enabled()) throw new ApiError('No hay backend configurado.');
      const extra: Record<string, any> = { app: opts.app };
      if (opts.deviceId) extra.device = await opts.deviceId();
      if (withSession && opts.idToken && body.idToken === undefined && body.token === undefined) {
        const t = await opts.idToken();
        if (t) extra.idToken = t;
      }
      const { res, data } = await request({
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8', Accept: 'application/json' },
        body: JSON.stringify({ ...extra, ...body }),
      }, opts.url);
      if (!res.ok || !data.ok) throw new ApiError(data.error || fallbackError, data);
      return data as T;
    },

    /* ---- Catálogo y agenda ---- */
    catalog: () => api.get<Catalog>({ action: 'catalog' }),
    busy: (from: string, to: string) => api.get<{ busy: { start: string; end: string }[] }>({ action: 'busy', from, to }),

    /* ---- Reserva ---- */
    checkCode: (services: string[], code: string, giftCode: string, client?: Partial<ClientData> | null) =>
      api.post<{ pricing: Pricing }>({ action: 'checkCode', services, code: code || '', giftCode: giftCode || '', client: client || null }, 'No se pudo revisar el código.'),
    hold: (d: {
      services: string[]; date: string; time: string; client: ClientData; code?: string; giftCode?: string;
      origen?: string; canal?: string; method: 'paypal' | 'transferencia'; captcha?: string; consents?: ConsentSubmission[];
    }) => api.post<HoldResult>({ action: 'hold', ...d, birthday: d.client.birthday || '', code: d.code || '', giftCode: d.giftCode || '', origen: d.origen || '', canal: d.canal || 'app' }, 'No se pudo apartar el horario.'),
    capture: (id: string, orderId: string) => api.post<{ appointment: Appointment }>({ action: 'capture', id, orderId }, 'No se pudo confirmar el pago.'),
    release: (id: string, token: string) => api.post({ action: 'release', id, token }, '').catch(() => null),
    transferProof: (id: string, auth: Auth, file: { mime: string; data: string }, accountId?: string, ref?: string) =>
      api.post<{ appointment?: Appointment }>({ action: 'transferProof', id, ...auth, mime: file.mime, data: file.data, accountId: accountId || '', ref: ref || '' }, 'No se pudo enviar el comprobante.'),
    waitlistJoin: (d: { date: string; franja: string; services: string[]; client: ClientData }) =>
      api.post({ action: 'waitlistJoin', ...d }, 'No se pudo guardar tu lugar en la lista.'),
    loyalty: (client: Partial<ClientData>) => api.post<{ loyalty: Loyalty | null }>({ action: 'loyalty', client }, 'No se pudo revisar tu premio.'),

    /* ---- Mis citas ---- */
    myAppointments: (idToken?: string) => api.post<{ items: Appointment[]; loyalty: Loyalty | null }>(idToken ? { action: 'myAppointments', idToken } : { action: 'myAppointments' }, 'No se pudieron cargar tus citas.'),
    lookup: async (items: { id: string; token: string }[]) => (items.length ? (await api.post<{ items: Appointment[] }>({ action: 'lookup', items }, 'No se pudieron actualizar tus citas.', false)).items : []),
    cancel: (id: string, auth: Auth) => api.post<{ refunded?: boolean; refundManual?: boolean; appointment?: Appointment }>({ action: 'cancel', id, ...auth }, 'No se pudo cancelar la cita.'),
    reschedule: (id: string, auth: Auth, date: string, time: string) => api.post<{ appointment: Appointment }>({ action: 'reschedule', id, ...auth, date, time }, 'No se pudo cambiar la cita.'),
    balanceOrder: (id: string, auth: Auth) => api.post<{ orderId: string; approveUrl: string; balanceUSD: string; balanceRD: number }>({ action: 'balanceOrder', id, ...auth }, 'No se pudo preparar el pago.'),
    balanceCapture: (id: string, orderId: string, auth: Auth) => api.post<{ appointment: Appointment }>({ action: 'balanceCapture', id, orderId, ...auth }, 'No se pudo confirmar el pago.'),

    /* ---- Regalos, paquetes y billetera ---- */
    giftOrder: (d: { montoRD: number; para: string; de: string; mensaje: string; correo: string; correoPara: string }) =>
      api.post<{ id: string; orderId: string; approveUrl: string; montoUSD: string }>({ action: 'giftOrder', ...d }, 'No se pudo preparar el pago de la tarjeta.'),
    giftCapture: (id: string, orderId: string) => api.post<{ gift: { codigo: string; montoRD: number; para: string; de: string; mensaje: string; vence: string } }>({ action: 'giftCapture', id, orderId }, 'No se pudo confirmar el pago de la tarjeta.'),
    bonoOrder: (d: { paqueteId: string; client: ClientData }) => api.post<{ id: string; orderId: string; approveUrl: string; montoUSD: string }>({ action: 'bonoOrder', ...d }, 'No se pudo preparar el pago del paquete.'),
    bonoCapture: (id: string, orderId: string) => api.post<{ bono: { codigo: string; nombre: string; sesiones: number; servicio: string; serviceName: string; vence: string } }>({ action: 'bonoCapture', id, orderId }, 'No se pudo confirmar el pago del paquete.'),
    myWallet: () => api.post<{ items: WalletItem[] }>({ action: 'myWallet' }, 'No se pudo cargar tu billetera.'),
    walletLookup: (codes: string[]) => api.post<{ items: WalletItem[] }>({ action: 'walletLookup', codes }, 'No se pudo revisar el código.', false),

    /* ---- Avisos en el celular ---- */
    pushRegister: (token: string, platform: string) => api.post({ action: 'pushRegister', token, platform }, 'No se pudieron activar los avisos.'),
    pushUnregister: (token: string) => api.post({ action: 'pushUnregister', token }, '', false).catch(() => null),
  };
  return api;
}
export type Api = ReturnType<typeof createApi>;
