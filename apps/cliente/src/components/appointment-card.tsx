/* Cita en la lista: día, hora, servicios y estado */
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, dayMonthShort, fmtTime12, relativeDay, space, STATUS_LABEL, weekdayShort, type Appointment } from '@majobella/core';
import { Badge, Card, Icon, Row, T } from '@majobella/ui';

export function statusTone(a: Appointment): 'ink' | 'soft' | 'ok' | 'warn' | 'error' {
  if (a.status === 'confirmada') return 'ok';
  if (a.status === 'por-confirmar' || a.status === 'retenida') return 'warn';
  if (a.status === 'cancelada' || a.status === 'expirada' || a.status === 'no-asistio') return 'error';
  return 'soft';
}
export function statusLabel(a: Appointment) {
  if (a.status === 'retenida' && a.payment.transfer) return a.payment.transfer.proof ? 'Comprobante enviado' : 'Falta el comprobante';
  if (a.status === 'por-confirmar') return 'Revisando pago';
  return STATUS_LABEL[a.status] || a.status;
}

/* "Faltan 3 días", "Es mañana", "Es hoy en 2 h" */
export function countdown(startIso: string) {
  const ms = new Date(startIso).getTime() - Date.now();
  if (ms <= 0) return 'Es ahora';
  const h = Math.floor(ms / 3600000);
  if (h < 1) return `Empieza en ${Math.max(1, Math.round(ms / 60000))} min`;
  if (h < 24) return `Faltan ${h} ${h === 1 ? 'hora' : 'horas'}`;
  const d = Math.round(h / 24);
  return `Faltan ${d} ${d === 1 ? 'día' : 'días'}`;
}

export function AppointmentCard({ a, dark }: { a: Appointment; dark?: boolean }) {
  const router = useRouter();
  const ink = dark ? colors.paper : colors.ink;
  const sub = dark ? 'rgba(255,255,255,0.7)' : colors.muted;
  return (
    <Card testID={`cita-${a.id}`} dark={dark} style={{ marginBottom: space.md, padding: 0 }} onPress={() => router.push({ pathname: '/cita/[id]', params: { id: a.id } })}>
      <Row gap={0} style={{ alignItems: 'stretch' }}>
        <View style={{ width: 74, alignItems: 'center', justifyContent: 'center', paddingVertical: 16, borderRightWidth: 1, borderRightColor: dark ? 'rgba(255,255,255,0.18)' : colors.line }}>
          <T v="kicker" style={{ color: sub, letterSpacing: 1.5 }}>{weekdayShort(a.date)}</T>
          <T v="title" style={{ color: ink, marginVertical: 2 }}>{a.date.slice(8, 10).replace(/^0/, '')}</T>
          <T v="muted" style={{ color: sub, fontSize: 12.5 }}>{dayMonthShort(a.date).split(' ')[1]}</T>
        </View>
        <View style={{ flex: 1, padding: 16, gap: 6 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <T v="label" style={{ color: ink }}>{`${relativeDay(a.date)} · ${fmtTime12(a.time)}`}</T>
            <Icon name="chevron-right" size={16} color={sub} />
          </Row>
          <T v="body" style={{ color: ink }} numberOfLines={2}>{a.services.map((s) => s.name).join(' + ')}</T>
          {dark ? <T v="small" style={{ color: sub }}>{countdown(a.start)}</T> : <Badge label={statusLabel(a)} tone={statusTone(a)} />}
        </View>
      </Row>
    </Card>
  );
}
