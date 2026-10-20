/* Detalle de un servicio: para quién es, qué incluye, resultados, cómo prepararte y cuidados */
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { colors, fmtDuration, fmtPrice, fmtServicePrice, space } from '@majobella/core';
import { Badge, Button, Divider, Empty, Icon, IconButton, Row, Screen, Section, T } from '@majobella/ui';
import { useApp } from '@/lib/app-state';

function Bullets({ items }: { items?: string[] }) {
  if (!items || !items.length) return null;
  return <View style={{ gap: 8 }}>{items.map((x) => <Row key={x} gap={10} style={{ alignItems: 'flex-start' }}><View style={{ width: 5, height: 5, backgroundColor: colors.ink, marginTop: 10 }} /><T v="body" style={{ flex: 1 }}>{x}</T></Row>)}</View>;
}

export default function Servicio() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { studio, cart, toggleCart, setCart } = useApp();
  const s = studio.byId[String(id)];
  const close = () => (router.canGoBack() ? router.back() : router.replace('/servicios'));
  if (!s) return <Screen><IconButton name="close" label="Cerrar" onPress={close} /><Empty title="Este servicio ya no está disponible" /></Screen>;
  const promo = studio.promoFor(s.id);
  const inCart = cart.includes(s.id);
  const dep = studio.depositPct(s);
  return (
    <Screen top={false} style={{ paddingTop: space.lg }} footer={
      <View style={{ padding: 16, paddingBottom: 28, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.paper, gap: 10 }}>
        <Button testID="detail-book" title="Reservar este servicio" icon="calendar" onPress={() => { setCart(inCart ? cart : [...cart, s.id]); router.dismissTo('/reservar'); }} />
        <Button kind="outline" title={inCart ? 'Quitar de mi cita' : 'Añadir a mi cita'} icon={inCart ? 'minus' : 'plus'} onPress={() => toggleCart(s.id)} />
      </View>
    }>
      <Row style={{ justifyContent: 'space-between' }}>
        <T v="kicker">{s.category}</T>
        <IconButton name="close" label="Cerrar" onPress={close} />
      </Row>
      <T v="title" style={{ marginTop: 4 }} accessibilityRole="header">{s.name}</T>
      <Row gap={14} style={{ marginTop: 12, flexWrap: 'wrap' }}>
        <Row gap={6}><Icon name="clock" size={17} color={colors.muted} /><T v="muted">{fmtDuration(s.durationMinutes)}</T></Row>
        <T v="price">{promo ? fmtPrice(s.price - promo.discount) : fmtServicePrice(s)}</T>
        {promo ? <T v="muted" style={{ textDecorationLine: 'line-through' }}>{fmtPrice(s.price)}</T> : null}
        {promo ? <Badge label={promo.name} /> : null}
      </Row>
      <T v="body" style={{ marginTop: space.md }}>{s.description}</T>
      <T v="muted" style={{ marginTop: 10, fontSize: 13.5 }}>{`Para apartar la cita se paga un depósito del ${dep}%; el resto, al terminar.`}</T>
      <Divider style={{ marginTop: space.lg }} />
      {s.idealFor ? <Section kicker="Ideal para" style={{ marginTop: space.sm }}><T v="body">{s.idealFor}</T></Section> : null}
      {s.includes && s.includes.length ? <Section kicker="Qué incluye"><Bullets items={s.includes} /></Section> : null}
      {s.results ? <Section kicker="Resultados"><T v="body">{s.results}</T></Section> : null}
      {s.prep && s.prep.length ? <Section kicker="Antes de tu cita"><Bullets items={s.prep} /></Section> : null}
      {s.aftercare && s.aftercare.length ? <Section kicker="Cuidados después"><Bullets items={s.aftercare} /></Section> : null}
    </Screen>
  );
}
