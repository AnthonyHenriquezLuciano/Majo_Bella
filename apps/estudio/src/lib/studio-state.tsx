/* MAJOBELLA Estudio · Estado: sesión de la cuenta del estudio y datos del panel (agenda, clientas, pagos) */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { createApi, type Appointment } from '@majobella/core';
import { API_URL, SCHEME } from './env';
import { KEYS, deviceId, store } from './storage';
import { finishOAuthCode, supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

/* Solo para probar con la API local (supabase/dev/servidor-local.ts): una sesión de prueba sin Supabase.
   El backend la verifica igual que una real, así que en producción no abre nada. */
const DEV_TOKEN = !supabase ? String(process.env.EXPO_PUBLIC_DEV_ID_TOKEN || '') : '';

export const api = createApi({
  url: API_URL, app: 'estudio', deviceId,
  idToken: async () => { if (DEV_TOKEN) return DEV_TOKEN; if (!supabase) return null; const { data } = await supabase.auth.getSession(); return data.session ? data.session.access_token : null; },
});

export type AdminItem = Appointment & {
  client: { name: string; email: string; phone: string; notes: string };
  clientKey: string; servicesText: string; createdAt: string; createdBy: string; origin: string; channel: string;
  code: string; giftCode: string; internalNote: string; holdUntil: string; reminderAt: string; proofId: string; transferRef: string;
  cancelledBy?: string; rescheduledFrom?: string;
  payment: Appointment['payment'] & { depositPaidAt?: string; balancePaidAt?: string; refundDetail?: string };
};
export interface Block { id: string; tipo: string; dias: string; horaDesde: string; horaHasta: string; fechaDesde: string; fechaHasta: string; motivo: string }
export interface AdminData {
  user: string;
  items: AdminItem[];
  blocks: Block[];
  clients: { clave: string; nombre: string; telefono: string; correo: string; notas: string; cumpleanos: string }[];
  services: { id: string; nombre: string; duracionMin: string; precioRD: string; activo: string }[];
  expenses: { id: string; fecha: string; concepto: string; categoria: string; montoRD: string; metodo: string }[];
  errors: { fecha: string; tipo: string; mensaje: string; ref: string; resuelto: string; row: number }[];
  schedule: { hours: Record<string, { open: string; close: string } | null>; blocked: string[]; minNotice: number; maxDays: number; step: number };
  accounts: { id: string; banco: string; numero: string; titular: string }[];
  waitlist: any[];
}

interface Ctx {
  ready: boolean;
  email: string;
  sendCode: (email: string) => Promise<void>;
  verifyCode: (email: string, code: string) => Promise<void>;
  signInGoogle: () => Promise<boolean>;
  signOut: () => Promise<void>;
  data: AdminData | null;
  loading: boolean;
  error: string;
  denied: boolean;
  refresh: () => Promise<void>;
  /* Ejecuta una acción del panel y actualiza la cita que devuelve */
  act: <T = any>(action: string, body: Record<string, any>) => Promise<T>;
  upsert: (item: AdminItem) => void;
}

const C = createContext<Ctx | null>(null);
export const useStudio = () => { const c = useContext(C); if (!c) throw new Error('fuera de StudioProvider'); return c; };

export function StudioProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(!supabase);
  const [email, setEmail] = useState(DEV_TOKEN ? 'prueba@local' : '');
  const [data, setData] = useState<AdminData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [denied, setDenied] = useState(false);
  const emailRef = useRef(DEV_TOKEN ? 'prueba@local' : '');

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data: d }) => { const e = d.session && d.session.user.email ? d.session.user.email.toLowerCase() : ''; emailRef.current = e; setEmail(e); setReady(true); });
    const { data: sub } = supabase.auth.onAuthStateChange((_ev, s) => { const e = s && s.user.email ? s.user.email.toLowerCase() : ''; emailRef.current = e; setEmail(e); });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!supabase) return;
    const handle = async (url: string | null) => {
      if (!url || !/\/\/auth/.test(url)) return;
      const { queryParams } = Linking.parse(url);
      if (queryParams && typeof queryParams.code === 'string') await finishOAuthCode(queryParams.code).catch(() => { /* la ruta /auth muestra el error */ });
    };
    Linking.getInitialURL().then(handle);
    const s = Linking.addEventListener('url', (e) => handle(e.url));
    return () => s.remove();
  }, []);

  const refresh = useCallback(async () => {
    if (!emailRef.current) return;
    setLoading(true);
    try {
      const d = await api.post<AdminData>({ action: 'adminData' }, 'No se pudo cargar la agenda.');
      setData(d); setError(''); setDenied(false);
    } catch (e: any) {
      if (/no tiene acceso/i.test(e.message)) setDenied(true);
      setError(e.message);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (email) refresh(); else { setData(null); setDenied(false); } }, [email, refresh]);
  useEffect(() => {
    let last = Date.now();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active' && Date.now() - last > 60000) refresh(); if (s !== 'active') last = Date.now(); });
    return () => sub.remove();
  }, [refresh]);

  const upsert = useCallback((item: AdminItem) => {
    setData((d) => (d ? { ...d, items: [...d.items.filter((x) => x.id !== item.id), item] } : d));
  }, []);

  const act = useCallback(async <T,>(action: string, body: Record<string, any>) => {
    const r = await api.post<any>({ action, ...body }, 'No se pudo completar.');
    if (r.item) upsert(r.item);
    if (r.block) setData((d) => (d ? { ...d, blocks: [...d.blocks, r.block] } : d));
    return r as T;
  }, [upsert]);

  const sendCode = useCallback(async (e: string) => {
    if (!supabase) throw new Error('Falta conectar Supabase (ver INSTALAR.md).');
    const { error: err } = await supabase.auth.signInWithOtp({ email: e.trim().toLowerCase(), options: { shouldCreateUser: true, emailRedirectTo: `${SCHEME}://auth` } });
    if (err) throw new Error(/rate|seconds/i.test(err.message) ? 'Espera un minuto antes de pedir otro código.' : 'No se pudo enviar el código.');
  }, []);
  const verifyCode = useCallback(async (e: string, code: string) => {
    if (!supabase) throw new Error('Falta conectar Supabase.');
    const { error: err } = await supabase.auth.verifyOtp({ email: e.trim().toLowerCase(), token: code.trim(), type: 'email' });
    if (err) throw new Error('El código no es correcto o ya venció.');
  }, []);
  const signInGoogle = useCallback(async () => {
    if (!supabase) throw new Error('Falta conectar Supabase.');
    const redirectTo = Linking.createURL('auth', { scheme: SCHEME });
    const { data: d, error: err } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo, skipBrowserRedirect: true } });
    if (err || !d.url) throw new Error('No se pudo abrir Google.');
    const res = await WebBrowser.openAuthSessionAsync(d.url, redirectTo);
    if (res.type !== 'success') return false;
    const { queryParams } = Linking.parse(res.url);
    if (!queryParams || typeof queryParams.code !== 'string') throw new Error('Google no completó el inicio de sesión.');
    await finishOAuthCode(queryParams.code);
    return true;
  }, []);
  const signOut = useCallback(async () => {
    if (DEV_TOKEN) return;
    const saved = await store.get<string>(KEYS.pushToken, '');
    if (saved) { await api.pushUnregister(saved.split('|')[1] || ''); await store.remove(KEYS.pushToken); }
    if (supabase) await supabase.auth.signOut();
    setData(null);
  }, []);

  const value = useMemo(() => ({ ready, email, sendCode, verifyCode, signInGoogle, signOut, data, loading, error, denied, refresh, act, upsert }),
    [ready, email, sendCode, verifyCode, signInGoogle, signOut, data, loading, error, denied, refresh, act, upsert]);
  return <C.Provider value={value}>{children}</C.Provider>;
}

/* ---- Utilidades de la agenda ---- */
const OFF = '-04:00';
export function blocksOn(blocks: Block[], key: string) {
  const [y, m, d] = key.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return blocks.filter((b) => (b.tipo === 'semanal'
    ? String(b.dias).split(',').includes(String(dow)) && key >= b.fechaDesde && (!b.fechaHasta || key <= b.fechaHasta)
    : key >= b.fechaDesde && key <= (b.fechaHasta || b.fechaDesde)))
    .map((b) => ({ ...b, start: new Date(`${key}T${b.horaDesde || '00:00'}:00${OFF}`).getTime(), end: new Date(`${key}T${b.horaHasta || '23:59'}:00${OFF}`).getTime() }));
}
export const LIVE = ['confirmada', 'por-confirmar', 'retenida'];
export const isPendingTransfer = (a: AdminItem) => a.payment.depositMethod === 'transferencia' && (a.status === 'por-confirmar' || (a.status === 'retenida' && a.payment.transfer && a.payment.transfer.proof));
export const isRefundPending = (a: AdminItem) => a.payment.refund === 'pendiente';
export { Platform };

/* Horas del día para el estudio (ignora la antelación mínima): libres u ocupadas por citas o bloqueos */
export function adminSlots(data: AdminData, key: string, minutes: number, exceptId?: string) {
  const [y, m, d] = key.split('-').map(Number);
  const h = data.schedule.hours[String(new Date(Date.UTC(y, m - 1, d)).getUTCDay())];
  const open = h ? h.open : '09:00', close = h ? h.close : '18:00';
  const toMin = (x: string) => Number(x.slice(0, 2)) * 60 + Number(x.slice(3, 5));
  const step = data.schedule.step || 30;
  const now = Date.now();
  const busy: [number, number][] = data.items
    .filter((a) => a.id !== exceptId && (a.status === 'confirmada' || a.status === 'por-confirmar' || a.status === 'completada' || (a.status === 'retenida' && new Date(a.holdUntil || 0).getTime() > now)))
    .map((a) => [new Date(a.start).getTime(), new Date(a.end).getTime()]);
  blocksOn(data.blocks, key).forEach((b) => busy.push([b.start, b.end]));
  const out: { time: string; busy: boolean }[] = [];
  for (let t = toMin(open); t + minutes <= toMin(close); t += step) {
    const hh = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
    const s = new Date(`${key}T${hh}:00${OFF}`).getTime(), e = s + minutes * 60000;
    out.push({ time: hh, busy: busy.some(([bs, be]) => s < be && e > bs) });
  }
  return { slots: out, closed: !h };
}
