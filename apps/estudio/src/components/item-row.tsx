/* Cita en la agenda del estudio */
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { STATUS_LABEL, colors, fmtPrice, fmtTime12, space, timeAt } from '@majobella/core';
import { Badge, Card, Row, T } from '@majobella/ui';
import type { AdminItem } from '@/lib/studio-state';

export function tone(a: AdminItem): 'ok' | 'warn' | 'error' | 'soft' | 'ink' {
  if (a.status === 'confirmada') return 'ok';
  if (a.status === 'por-confirmar' || a.status === 'retenida') return 'warn';
  if (a.status === 'cancelada' || a.status === 'no-asistio' || a.status === 'expirada') return 'error';
  return 'soft';
}
export function label(a: AdminItem) {
  if (a.status === 'retenida' && a.payment.depositMethod === 'transferencia') return a.payment.transfer && a.payment.transfer.proof ? 'Comprobante' : 'Esperando pago';
  if (a.status === 'retenida') return 'Pagando';
  return STATUS_LABEL[a.status] || a.status;
}

export function ItemRow({ a, showDate }: { a: AdminItem; showDate?: boolean }) {
  const router = useRouter();
  const dim = ['cancelada', 'expirada'].includes(a.status);
  const sure = ['confirmada', 'completada'].includes(a.status);
  const due = sure && a.payment.balanceStatus !== 'pagado' && a.payment.balanceRD > 0;
  return (
    <Card testID={`item-${a.id}`} style={{ marginBottom: 10, padding: 14, opacity: dim ? 0.55 : 1 }} onPress={() => router.push({ pathname: '/cita/[id]', params: { id: a.id } })}>
      <Row style={{ alignItems: 'flex-start' }} gap={14}>
        <View style={{ width: 66 }}>
          <T v="label">{fmtTime12(a.time)}</T>
          <T v="muted" style={{ fontSize: 12.5 }}>{fmtTime12(timeAt(a.end))}</T>
          {showDate ? <T v="muted" style={{ fontSize: 12.5 }}>{a.date.slice(8)}/{a.date.slice(5, 7)}</T> : null}
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <T v="h3" numberOfLines={1}>{a.client.name || 'Sin nombre'}</T>
          <T v="small" numberOfLines={2} style={{ color: colors.muted }}>{a.services.map((s) => s.name).join(' + ')}</T>
          <Row gap={6} style={{ marginTop: 4, flexWrap: 'wrap' }}>
            <Badge label={label(a)} tone={tone(a)} />
            {due ? <Badge label={`Cobrar ${fmtPrice(a.payment.balanceRD)}`} tone="soft" /> : null}
            {a.consent && a.consent.needed && !a.consent.signed && sure ? <Badge label="Sin consentimiento" tone="warn" /> : null}
          </Row>
        </View>
      </Row>
    </Card>
  );
}
