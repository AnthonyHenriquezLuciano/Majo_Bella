/* MAJOBELLA Estudio · App de administración (agenda, transferencias, clientas y dinero) */
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { Stack } from 'expo-router/stack';
import { useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors } from '@majobella/core';
import { useBrandFonts } from '@majobella/ui';
import { StudioProvider, api, useStudio } from '@/lib/studio-state';
import { EAS_PROJECT_ID } from '@/lib/env';
import { KEYS, store } from '@/lib/storage';

SplashScreen.preventAutoHideAsync().catch(() => {});
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldPlaySound: true, shouldSetBadge: true, shouldShowBanner: true, shouldShowList: true }) });
}

/* Avisos push de reservas nuevas, comprobantes y cancelaciones */
function Push() {
  const { email, data, refresh } = useStudio();
  const router = useRouter();
  useEffect(() => {
    if (!email || !data || Platform.OS === 'web' || !Device.isDevice || !EAS_PROJECT_ID) return;
    (async () => {
      if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('avisos', { name: 'Reservas y pagos', importance: Notifications.AndroidImportance.HIGH });
      let st = await Notifications.getPermissionsAsync();
      if (!st.granted && st.canAskAgain) st = await Notifications.requestPermissionsAsync();
      if (!st.granted) return;
      const t = (await Notifications.getExpoPushTokenAsync({ projectId: EAS_PROJECT_ID })).data;
      if ((await store.get<string>(KEYS.pushToken, '')) === `${email}|${t}`) return;
      await api.pushRegister(t, Platform.OS);
      await store.set(KEYS.pushToken, `${email}|${t}`);
    })().catch(() => {});
  }, [email, !!data]);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const r = Notifications.addNotificationReceivedListener(() => refresh());
    const open = Notifications.addNotificationResponseReceivedListener((res) => {
      const d: any = res.notification.request.content.data;
      refresh();
      if (d && /^MJB-/.test(String(d.ref || ''))) router.push({ pathname: '/cita/[id]', params: { id: String(d.ref) } });
    });
    return () => { r.remove(); open.remove(); };
  }, [refresh, router]);
  return null;
}

function Nav() {
  const { email, ready } = useStudio();
  if (!ready) return null;
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.paper }, animation: 'slide_from_right' }}>
      <Stack.Protected guard={!!email}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="cita/[id]" />
        <Stack.Screen name="clienta/[clave]" />
        <Stack.Screen name="nueva" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="bloquear" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
      </Stack.Protected>
      <Stack.Protected guard={!email}>
        <Stack.Screen name="entrar" />
      </Stack.Protected>
      {/* Ruta pública de retorno OAuth y enlaces de correo. No es un área administrativa. */}
      <Stack.Screen name="auth" options={{ animation: 'none' }} />
    </Stack>
  );
}

export default function Root() {
  const [loaded, error] = useBrandFonts();
  useEffect(() => { if (loaded || error) SplashScreen.hideAsync().catch(() => {}); }, [loaded, error]);
  if (!loaded && !error) return null;
  return (
    <SafeAreaProvider>
      <StudioProvider>
        <StatusBar style="dark" />
        <Push />
        <Nav />
      </StudioProvider>
    </SafeAreaProvider>
  );
}
