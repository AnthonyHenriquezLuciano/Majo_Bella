/* MAJOBELLA · App de clientas */
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { Stack } from 'expo-router/stack';
import { useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors } from '@majobella/core';
import { useBrandFonts } from '@majobella/ui';
import { AppProvider, api, useApp } from '@/lib/app-state';
import { pushToken, syncReminders } from '@/lib/notify';
import { KEYS, store } from '@/lib/storage';

SplashScreen.preventAutoHideAsync().catch(() => {});

export const unstable_settings = { anchor: '(tabs)' };

/* Tareas de fondo: recordatorios, avisos push y abrir la cita al tocar un aviso */
function Background() {
  const { appointments, session } = useApp();
  const router = useRouter();
  useEffect(() => { syncReminders(appointments).catch(() => {}); }, [appointments]);
  useEffect(() => {
    if (!session) return;
    (async () => {
      const t = await pushToken();
      if (!t) return;
      const saved = await store.get<string>(KEYS.pushToken, '');
      if (saved === `${session.email}|${t}`) return;
      try { await api.pushRegister(t, Platform.OS); await store.set(KEYS.pushToken, `${session.email}|${t}`); } catch (e) { /* se reintenta al abrir */ }
    })();
  }, [session]);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const open = (r: Notifications.NotificationResponse | null) => {
      const d: any = r && r.notification.request.content.data;
      if (d && /^MJB-/.test(String(d.ref || ''))) router.push({ pathname: '/cita/[id]', params: { id: String(d.ref) } });
      else if (d && d.tipo) router.push('/citas');
    };
    Notifications.getLastNotificationResponseAsync().then(open).catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, [router]);
  return null;
}

export default function RootLayout() {
  const [loaded, error] = useBrandFonts();
  useEffect(() => { if (loaded || error) SplashScreen.hideAsync().catch(() => {}); }, [loaded, error]);
  if (!loaded && !error) return null;
  return (
    <SafeAreaProvider>
      <AppProvider>
        <StatusBar style="dark" />
        <Background />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.paper }, animation: 'slide_from_right' }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="servicio/[id]" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="entrar" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="cita/[id]" />
          <Stack.Screen name="billetera" />
          <Stack.Screen name="regalo" />
          <Stack.Screen name="paquetes" />
          <Stack.Screen name="datos" />
          <Stack.Screen name="pago" />
        </Stack>
      </AppProvider>
    </SafeAreaProvider>
  );
}
