/* MAJOBELLA · Estado de la app: estudio (catálogo y horas ocupadas), sesión, datos guardados, carrito y citas */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { Studio, createApi, addDaysKey, todayKey, type Appointment, type Catalog, type ClientData, type Loyalty } from '@majobella/core';
import { API_URL, AUTH_ENABLED, SCHEME } from './env';
import { KEYS, deviceId, store } from './storage';
import { supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

export interface Session { email: string; name: string; token: string }
type Guest = { id: string; token: string };

const sessionRef: { current: Session | null } = { current: null };
export const api = createApi({
  url: API_URL,
  app: 'cliente',
  deviceId,
  idToken: async () => {
    if (!supabase) return null;
    const { data } = await supabase.auth.getSession();
    return data.session ? data.session.access_token : null;
  },
});

interface Ctx {
  studio: Studio;
  version: number;
  catalogReady: boolean;
  catalogError: string;
  refreshCatalog: () => Promise<void>;
  refreshBusy: (force?: boolean) => Promise<void>;
  busyError: string;

  session: Session | null;
  authReady: boolean;
  sendCode: (email: string) => Promise<void>;
  verifyCode: (email: string, code: string) => Promise<void>;
  signInGoogle: () => Promise<boolean>;
  signOut: () => Promise<void>;

  client: ClientData | null;
  saveClient: (c: ClientData | null) => Promise<void>;

  cart: string[];
  setCart: (ids: string[]) => void;
  toggleCart: (id: string) => void;

  appointments: Appointment[];
  loyalty: Loyalty | null;
  loadingAppointments: boolean;
  appointmentsError: string;
  refreshAppointments: () => Promise<void>;
  addGuest: (g: Guest, a?: Appointment) => Promise<void>;
  upsertAppointment: (a: Appointment) => void;
  authFor: (a: Appointment) => { token: string } | { idToken: string };
}

const AppCtx = createContext<Ctx | null>(null);
export function useApp() {
  const c = useContext(AppCtx);
  if (!c) throw new Error('useApp fuera de AppProvider');
  return c;
}

const BUSY_TTL = 90 * 1000;

export function AppProvider({ children }: { children: ReactNode }) {
  const studioRef = useRef(new Studio());
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);
  const [catalogReady, setCatalogReady] = useState(false);
  const [catalogError, setCatalogError] = useState('');
  const [busyError, setBusyError] = useState('');
  const busyPending = useRef<Promise<void> | null>(null);

  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(!AUTH_ENABLED);
  const [client, setClient] = useState<ClientData | null>(null);
  const [cart, setCartState] = useState<string[]>([]);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loyalty, setLoyalty] = useState<Loyalty | null>(null);
  const [loadingAppointments, setLoadingAppointments] = useState(false);
  const [appointmentsError, setAppointmentsError] = useState('');

  /* ---- Catálogo: la copia guardada se muestra al instante y se actualiza por detrás ---- */
  const refreshCatalog = useCallback(async () => {
    try {
      const data = await api.catalog();
      studioRef.current.apply(data);
      await store.set(KEYS.catalog, { at: Date.now(), data });
      setCatalogError('');
    } catch (e: any) {
      setCatalogError(e.message || 'Sin conexión.');
    } finally {
      setCatalogReady(true);
      bump();
    }
  }, [bump]);

  const refreshBusy = useCallback(async (force?: boolean) => {
    const st = studioRef.current;
    if (!force && st.busyAt && Date.now() - st.busyAt < BUSY_TTL) return;
    if (busyPending.current) return busyPending.current;
    const from = todayKey(), to = addDaysKey(from, st.schedule.maxDaysAhead + 1);
    busyPending.current = api.busy(from, to)
      .then((d) => { st.setBusy(d.busy || []); setBusyError(''); })
      .catch((e) => { setBusyError(e.message || 'Sin conexión.'); })
      .finally(() => { busyPending.current = null; bump(); });
    return busyPending.current;
  }, [bump]);

  useEffect(() => {
    (async () => {
      const saved = await store.get<{ at: number; data: Catalog } | null>(KEYS.catalog, null);
      if (saved && saved.data && Date.now() - saved.at < 7 * 86400000) {
        studioRef.current.apply(saved.data);
        setCatalogReady(true);
        bump();
      }
      setClient(await store.get<ClientData | null>(KEYS.client, null));
      setGuests(await store.get<Guest[]>(KEYS.guest, []));
      refreshCatalog();
    })();
    // Al volver a la app después de un rato, se revisa si el estudio cambió algo
    let last = Date.now();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active' && Date.now() - last > 120000) { last = Date.now(); refreshCatalog(); refreshBusy(true); }
      if (s !== 'active') last = Date.now();
    });
    return () => sub.remove();
  }, [refreshCatalog, refreshBusy, bump]);

  /* ---- Sesión ---- */
  useEffect(() => {
    if (!supabase) return;
    const toSession = (s: any): Session | null => (s && s.user && s.user.email
      ? { email: String(s.user.email).toLowerCase(), name: (s.user.user_metadata && (s.user.user_metadata.full_name || s.user.user_metadata.name)) || '', token: s.access_token }
      : null);
    supabase.auth.getSession().then(({ data }) => { const s = toSession(data.session); sessionRef.current = s; setSession(s); setAuthReady(true); });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => { const x = toSession(s); sessionRef.current = x; setSession(x); });
    return () => data.subscription.unsubscribe();
  }, []);

  // Enlace del correo (majobella://auth?code=…) cuando se abre en el mismo celular
  useEffect(() => {
    if (!supabase) return;
    const handle = async (url: string | null) => {
      if (!url || !/\/\/auth/.test(url)) return;
      const { queryParams } = Linking.parse(url);
      const code = queryParams && queryParams.code;
      if (typeof code === 'string') { try { await supabase!.auth.exchangeCodeForSession(code); } catch (e) { /* enlace vencido */ } }
    };
    Linking.getInitialURL().then(handle);
    const sub = Linking.addEventListener('url', (e) => handle(e.url));
    return () => sub.remove();
  }, []);

  const sendCode = useCallback(async (email: string) => {
    if (!supabase) throw new Error('El inicio de sesión aún no está disponible.');
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim().toLowerCase(), options: { shouldCreateUser: true, emailRedirectTo: `${SCHEME}://auth` } });
    if (error) throw new Error(/rate|seconds/i.test(error.message) ? 'Espera un minuto antes de pedir otro código.' : 'No se pudo enviar el código. Revisa el correo.');
  }, []);

  const verifyCode = useCallback(async (email: string, code: string) => {
    if (!supabase) throw new Error('El inicio de sesión aún no está disponible.');
    const { error } = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.trim(), type: 'email' });
    if (error) throw new Error('El código no es correcto o ya venció. Pide uno nuevo.');
  }, []);

  const signInGoogle = useCallback(async () => {
    if (!supabase) throw new Error('El inicio de sesión aún no está disponible.');
    const redirectTo = Linking.createURL('auth', { scheme: SCHEME });
    const { data, error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo, skipBrowserRedirect: true } });
    if (error || !data.url) throw new Error('No se pudo abrir Google.');
    const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (res.type !== 'success') return false;
    const { queryParams } = Linking.parse(res.url);
    const code = queryParams && queryParams.code;
    if (typeof code !== 'string') throw new Error('Google no completó el inicio de sesión.');
    const ex = await supabase.auth.exchangeCodeForSession(code);
    if (ex.error) throw new Error('No se pudo iniciar sesión con Google.');
    return true;
  }, []);

  const signOut = useCallback(async () => {
    const push = await store.get<string>(KEYS.pushToken, '');
    if (push) { await api.pushUnregister(push.split('|')[1] || ''); await store.remove(KEYS.pushToken); }
    if (supabase) await supabase.auth.signOut();
    setAppointments((list) => list.filter((a) => !!a.token));
    setLoyalty(null);
  }, []);

  /* ---- Datos guardados de la clienta ---- */
  const saveClient = useCallback(async (c: ClientData | null) => {
    setClient(c);
    if (c) await store.set(KEYS.client, c); else await store.remove(KEYS.client);
  }, []);

  /* ---- Carrito ---- */
  const setCart = useCallback((ids: string[]) => setCartState([...new Set(ids)]), []);
  const toggleCart = useCallback((id: string) => setCartState((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id])), []);

  /* ---- Citas: las de la cuenta y las reservadas sin cuenta en este celular ---- */
  const guestsRef = useRef(guests);
  guestsRef.current = guests;
  const refreshAppointments = useCallback(async () => {
    setLoadingAppointments(true);
    try {
      const out: Record<string, Appointment> = {};
      const g = guestsRef.current;
      if (g.length) (await api.lookup(g)).forEach((a) => { out[a.id] = { ...a, token: (g.find((x) => x.id === a.id) || { token: '' }).token }; });
      if (sessionRef.current) {
        const mine = await api.myAppointments();
        mine.items.forEach((a) => { out[a.id] = { ...a, token: out[a.id] ? out[a.id].token : undefined }; });
        setLoyalty(mine.loyalty || null);
      }
      setAppointments(Object.values(out).sort((a, b) => String(a.start).localeCompare(String(b.start))));
      setAppointmentsError('');
    } catch (e: any) {
      setAppointmentsError(e.message || 'No se pudieron cargar tus citas.');
    } finally { setLoadingAppointments(false); }
  }, []);

  useEffect(() => { if (authReady) refreshAppointments(); }, [authReady, session && session.email, guests.length, refreshAppointments]);

  const addGuest = useCallback(async (gst: Guest, a?: Appointment) => {
    const list = [...guestsRef.current.filter((x) => x.id !== gst.id), gst].slice(-40);
    guestsRef.current = list;
    setGuests(list);
    await store.set(KEYS.guest, list);
    if (a) setAppointments((l) => [...l.filter((x) => x.id !== a.id), { ...a, token: gst.token }].sort((x, y) => String(x.start).localeCompare(String(y.start))));
  }, []);

  const upsertAppointment = useCallback((a: Appointment) => {
    setAppointments((l) => {
      const prev = l.find((x) => x.id === a.id);
      return [...l.filter((x) => x.id !== a.id), { ...a, token: a.token || (prev && prev.token) }].sort((x, y) => String(x.start).localeCompare(String(y.start)));
    });
  }, []);

  const authFor = useCallback((a: Appointment) => {
    if (a.token) return { token: a.token };
    return { idToken: sessionRef.current ? sessionRef.current.token : '' };
  }, []);

  const value = useMemo<Ctx>(() => ({
    studio: studioRef.current, version, catalogReady, catalogError, refreshCatalog, refreshBusy, busyError,
    session, authReady, sendCode, verifyCode, signInGoogle, signOut,
    client, saveClient, cart, setCart, toggleCart,
    appointments, loyalty, loadingAppointments, appointmentsError, refreshAppointments, addGuest, upsertAppointment, authFor,
  }), [version, catalogReady, catalogError, refreshCatalog, refreshBusy, busyError, session, authReady, sendCode, verifyCode, signInGoogle, signOut,
    client, saveClient, cart, setCart, toggleCart, appointments, loyalty, loadingAppointments, appointmentsError, refreshAppointments, addGuest, upsertAppointment, authFor]);

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
