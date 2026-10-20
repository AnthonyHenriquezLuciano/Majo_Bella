/* Guardado local en el celular (datos de la clienta, citas sin cuenta, catálogo) */
import AsyncStorage from '@react-native-async-storage/async-storage';

export const store = {
  async get<T>(key: string, fallback: T): Promise<T> {
    try { const v = await AsyncStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback; } catch (e) { return fallback; }
  },
  async set(key: string, value: unknown) { try { await AsyncStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* sin espacio */ } },
  async remove(key: string) { try { await AsyncStorage.removeItem(key); } catch (e) { /* nada */ } },
};

export const KEYS = {
  catalog: 'mjb.catalog.v2',
  client: 'mjb.client.v1',
  guest: 'mjb.guest.v1',       // citas reservadas sin cuenta: [{ id, token }]
  device: 'mjb.device.v1',
  codes: 'mjb.codes.v1',       // tarjetas y paquetes guardados
  reminders: 'mjb.reminders.v1',
  pushToken: 'mjb.push.v1',
  onboarded: 'mjb.onboarded.v1',
};

export async function deviceId() {
  let id = await store.get<string>(KEYS.device, '');
  if (!id) { id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`; await store.set(KEYS.device, id); }
  return id;
}
