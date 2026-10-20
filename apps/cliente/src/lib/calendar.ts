/* Añadir la cita al calendario del celular */
import * as Calendar from 'expo-calendar';
import { Platform } from 'react-native';
import { CONFIG, type Appointment } from '@majobella/core';

export async function addToCalendar(a: Appointment) {
  if (Platform.OS === 'web') throw new Error('Esta opción está en la app del celular.');
  const perm = await Calendar.requestCalendarPermissionsAsync();
  if (!perm.granted) throw new Error('Permite el acceso al calendario para añadir la cita.');
  const title = `MAJOBELLA · ${a.services.map((s) => s.name).join(' + ')}`;
  const details = {
    title,
    startDate: new Date(a.start),
    endDate: new Date(a.end),
    location: `MAJOBELLA Beauty Studio, ${CONFIG.contact.address}`,
    notes: `Reserva ${a.id}. Llega ${CONFIG.policies.arriveEarlyMinutes} minutos antes.`,
    alarms: [{ relativeOffset: -120 }],
    timeZone: CONFIG.schedule.timeZone,
  };
  if (Platform.OS === 'ios') {
    const def = await Calendar.getDefaultCalendarAsync();
    return Calendar.createEventAsync(def.id, details);
  }
  const cals = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const cal = cals.find((c) => c.isPrimary && c.allowsModifications) || cals.find((c) => c.allowsModifications);
  if (!cal) throw new Error('No encontramos un calendario en tu celular.');
  return Calendar.createEventAsync(cal.id, details);
}
