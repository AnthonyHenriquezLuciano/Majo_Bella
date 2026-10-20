/* MAJOBELLA · Conexión con el backend
   Se configura con variables públicas (las mismas que puede ver cualquiera en la web; ningún secreto):
     EXPO_PUBLIC_SUPABASE_URL       https://<referencia>.supabase.co
     EXPO_PUBLIC_SUPABASE_ANON_KEY  llave pública "anon" del proyecto (para iniciar sesión)
     EXPO_PUBLIC_API_URL            opcional; por defecto <SUPABASE_URL>/functions/v1/api
     EXPO_PUBLIC_EAS_PROJECT_ID     opcional; para los avisos push (proyecto de Expo)
   La app del estudio necesita Supabase (inicio de sesión con la cuenta del estudio). */
import Constants from 'expo-constants';
import { CONFIG } from '@majobella/core';

const extra: any = (Constants.expoConfig && Constants.expoConfig.extra) || {};
const clean = (s: unknown) => String(s || '').trim().replace(/\/$/, '');

export const SUPABASE_URL = clean(process.env.EXPO_PUBLIC_SUPABASE_URL || extra.supabaseUrl);
export const SUPABASE_ANON_KEY = String(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || extra.supabaseAnonKey || '').trim();
export const API_URL = clean(process.env.EXPO_PUBLIC_API_URL || extra.apiUrl) || (SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/api` : CONFIG.apiUrl);
export const EAS_PROJECT_ID = String(process.env.EXPO_PUBLIC_EAS_PROJECT_ID || (extra.eas && extra.eas.projectId) || '').trim();
export const WEB_URL = CONFIG.webUrl;
export const AUTH_ENABLED = !!(SUPABASE_URL && SUPABASE_ANON_KEY);
export const SCHEME = 'majobella-estudio';
