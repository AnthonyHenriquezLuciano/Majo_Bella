/* Tarjeta de servicio: nombre, descripción, duración, precio (con promoción) y botón para añadir */
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, fmtDurationShort, fmtPrice, fmtServicePrice, space, type ServiceInfo } from '@majobella/core';
import { Badge, Button, Card, Icon, Row, T } from '@majobella/ui';
import { useApp } from '@/lib/app-state';

export function ServiceCard({ s, compact }: { s: ServiceInfo; compact?: boolean }) {
  const { studio, cart, toggleCart } = useApp();
  const router = useRouter();
  const promo = studio.promoFor(s.id);
  const inCart = cart.includes(s.id);
  return (
    <Card testID={`svc-${s.id}`} style={{ marginBottom: space.md, padding: 18 }} onPress={() => router.push({ pathname: '/servicio/[id]', params: { id: s.id } })}>
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          {promo ? <View style={{ marginBottom: 8 }}><Badge label={promo.kind === 'monto' ? `−${fmtPrice(promo.value)}` : `−${promo.value}%`} /></View> : null}
          <T v="h2">{s.name}</T>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          {promo ? <T v="muted" style={{ textDecorationLine: 'line-through', fontSize: 13 }}>{fmtPrice(s.price)}</T> : null}
          <T v="price">{promo ? `${s.priceFrom ? 'Desde ' : ''}${fmtPrice(s.price - promo.discount)}` : fmtServicePrice(s)}</T>
        </View>
      </Row>
      {!compact && s.description ? <T v="muted" style={{ marginTop: 8 }} numberOfLines={3}>{s.description}</T> : null}
      <Row style={{ marginTop: 14, justifyContent: 'space-between' }}>
        <Row gap={6}><Icon name="clock" size={16} color={colors.muted} /><T v="muted">{fmtDurationShort(s.durationMinutes)}</T></Row>
        <Button
          testID={`add-${s.id}`}
          small full={false}
          kind={inCart ? 'solid' : 'outline'}
          icon={inCart ? 'check' : 'plus'}
          title={inCart ? 'Añadido' : 'Añadir'}
          accessibilityLabel={inCart ? `Quitar ${s.name}` : `Añadir ${s.name}`}
          onPress={() => toggleCart(s.id)}
        />
      </Row>
    </Card>
  );
}
