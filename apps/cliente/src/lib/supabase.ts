/* Supabase Auth: correo y Google OAuth (cliente). */
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import { AUTH_ENABLED, SUPABASE_ANON_KEY, SUPABASE_URL } from './env';

export const supabase: SupabaseClient | null = AUTH_ENABLED
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: Platform.OS === 'web',
      flowType: 'pkce',
    },
  })
  : null;

/* La URL profunda, el navegador OAuth y el listener de Linking pueden recibir el
   MISMO código PKCE casi a la vez. El código de un solo uso solo se canjea UNA vez. */
const oauthCodeRequests = new Map<string, Promise<void>>();

export function finishOAuthCode(code: string): Promise<void> {
  const value = String(code || '').trim();
  if (!supabase || !value) return Promise.reject(new Error('No se recibió un código válido de inicio de sesión.'));
  const pending = oauthCodeRequests.get(value);
  if (pending) return pending;
  const request = supabase.auth.exchangeCodeForSession(value).then(({ error }) => {
    if (error) throw new Error('El enlace de inicio de sesión venció o ya fue utilizado. Inicia sesión otra vez.');
  });
  // No registrar, mostrar ni persistir el código OAuth.
  oauthCodeRequests.set(value, request);
  if (oauthCodeRequests.size > 12) oauthCodeRequests.delete(oauthCodeRequests.keys().next().value!);
  return request;
}
