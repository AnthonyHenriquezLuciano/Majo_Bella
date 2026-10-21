/* MAJOBELLA · Conexión con el backend
   Se configura con variables públicas (las mismas que puede ver cualquiera en la web; ningún secreto):
     EXPO_PUBLIC_SUPABASE_URL       https://<referencia>.supabase.co
     EXPO_PUBLIC_SUPABASE_ANON_KEY  clave pública de Supabase (para iniciar sesión)
     EXPO_PUBLIC_API_URL            opcional; por defecto <SUPABASE_URL>/functions/v1/api
     EXPO_PUBLIC_EAS_PROJECT_ID     ID independiente del proyecto Expo de ESTA aplicación; se asigna por app en GitHub Actions
   La app usa Supabase para todas las reservas. No hay conexión con Google Sheets ni Apps Script. */
import Constants from 'expo-constants';
import { CONFIG } from '@majobella/core';

const extra: any = (Constants.expoConfig && Constants.expoConfig.extra) || {};
const clean = (s: unknown) => String(s || '').trim().replace(/\/$/, '');
// La clave publishable es pública por diseño: no equivale a un secreto service_role.
// GitHub Actions puede sustituirla por una clave pública rotada sin modificar el código.
const PUBLIC_SUPABASE_KEY = 'sb_publishable_-bZf2oHHFFEBGNFV_xJH7w_QBbLymqI';

export const SUPABASE_URL = clean(process.env.EXPO_PUBLIC_SUPABASE_URL || extra.supabaseUrl || 'https://thpjpsogcmqkemlxajcm.supabase.co');
export const SUPABASE_ANON_KEY = String(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || extra.supabaseAnonKey || PUBLIC_SUPABASE_KEY).trim();
export const API_URL = clean(process.env.EXPO_PUBLIC_API_URL || extra.apiUrl) || (SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/api` : CONFIG.apiUrl);
export const EAS_PROJECT_ID = String(process.env.EXPO_PUBLIC_EAS_PROJECT_ID || (extra.eas && extra.eas.projectId) || (Constants.easConfig && Constants.easConfig.projectId) || '').trim();
export const WEB_URL = CONFIG.webUrl;
export const AUTH_ENABLED = !!(SUPABASE_URL && SUPABASE_ANON_KEY);
export const SCHEME = 'majobella';
