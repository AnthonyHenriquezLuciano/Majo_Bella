/* Avisos en el celular
   - Recordatorio local antes de cada cita confirmada (funciona sin internet y sin cuenta).
   - Avisos push del estudio (confirmaciones, cambios, comprobantes): necesitan sesión y el proyecto de Expo. */
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { relativeDay, fmtTime12, type Appointment } from '@majobella/core';
import { EAS_PROJECT_ID } from './env';
import { KEYS, store } from './storage';

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldPlaySound: true, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true }),
  });
}

async function ensureChannel() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('avisos', {
      name: 'Citas y avisos', importance: Notifications.AndroidImportance.HIGH, lightColor: '#111111', vibrationPattern: [0, 200, 120, 200],
    });
  }
}

export async function notificationsAllowed(ask: boolean) {
  if (Platform.OS === 'web') return false;
  await ensureChannel();
  const cur = await Notifications.getPermissionsAsync();
  if (cur.granted) return true;
  if (!ask || !cur.canAskAgain) return false;
  const res = await Notifications.requestPermissionsAsync();
  return res.granted;
}

/* Programa (o rehace) los recordatorios: 24 horas y 2 horas antes de cada cita confirmada */
export async function syncReminders(list: Appointment[]) {
  if (Platform.OS === 'web') return;
  if (!(await notificationsAllowed(false))) return;
  const prev = await store.get<Record<string, string[]>>(KEYS.reminders, {});
  for (const ids of Object.values(prev)) for (const id of ids) { try { await Notifications.cancelScheduledNotificationAsync(id); } catch (e) { /* ya pasó */ } }
  const next: Record<string, string[]> = {};
  const now = Date.now();
  for (const a of list) {
    if (a.status !== 'confirmada') continue;
    const start = new Date(a.start).getTime();
    const what = a.services.map((s) => s.name).join(' + ');
    const ids: string[] = [];
    for (const [hours, text] of [[24, `Mañana a las ${fmtTime12(a.time)}: ${what}.`], [2, `Hoy a las ${fmtTime12(a.time)}: ${what}. Te esperamos.`]] as const) {
      const at = start - hours * 3600000;
      if (at <= now + 60000) continue;
      ids.push(await Notifications.scheduleNotificationAsync({
        content: { title: hours === 24 ? 'Tu cita es mañana' : 'Tu cita es hoy', body: text, data: { tipo: 'recordatorio', ref: a.id }, sound: 'default' },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(at), channelId: 'avisos' },
      }));
    }
    if (ids.length) next[a.id] = ids;
  }
  await store.set(KEYS.reminders, next);
}

/* Token del celular para los avisos push del estudio */
export async function pushToken(): Promise<string> {
  if (Platform.OS === 'web' || !Device.isDevice || !EAS_PROJECT_ID) return '';
  if (!(await notificationsAllowed(false))) return '';
  try { return (await Notifications.getExpoPushTokenAsync({ projectId: EAS_PROJECT_ID })).data; } catch (e) { return ''; }
}

export { relativeDay };
