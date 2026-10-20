/* Ficha de la clienta: contacto, notas y todas sus citas */
import { Linking, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { fmtPrice, space, whatsappUrl } from '@majobella/core';
import { Button, Card, Empty, Header, KV, Row, Screen, Section, T } from '@majobella/ui';
import { useStudio } from '@/lib/studio-state';
import { ItemRow } from '@/components/item-row';

export default function Clienta() {
  const { clave } = useLocalSearchParams<{ clave: string }>();
  const router = useRouter();
  const { data } = useStudio();
  const back = () => (router.canGoBack() ? router.back() : router.replace('/clientas'));
  if (!data) return <Screen><Header title="Clienta" onBack={back} /></Screen>;
  const items = data.items.filter((a) => a.clientKey === clave).sort((a, b) => b.start.localeCompare(a.start));
  const ficha = data.clients.find((c) => c.clave === clave);
  const first = items[0];
  const name = (ficha && ficha.nombre) || (first && first.client.name) || String(clave);
  const phone = (ficha && ficha.telefono) || (first && first.client.phone) || '';
  const email = (ficha && ficha.correo) || (first && first.client.email) || '';
  const done = items.filter((a) => a.status === 'completada');
  const spent = done.reduce((t, a) => t + a.totalPrice, 0);
  const wa = phone.replace(/\D/g, '');
  return (
    <Screen>
      <Header title={name} kicker="Clienta" onBack={back} />
      <Card>
        {phone ? <KV k="Teléfono" v={phone} /> : null}
        {email ? <KV k="Correo" v={email} /> : null}
        {ficha && ficha.cumpleanos ? <KV k="Cumpleaños" v={ficha.cumpleanos} /> : null}
        <KV k="Visitas" v={String(done.length)} />
        <KV k="Total gastado" v={fmtPrice(spent)} strong />
        {ficha && ficha.notas ? <T v="small" style={{ marginTop: 8 }}>{ficha.notas}</T> : null}
      </Card>
      <Row gap={10} style={{ marginTop: space.md }}>
        {wa ? <Button small kind="outline" icon="whatsapp" title="WhatsApp" style={{ flex: 1 }} onPress={() => Linking.openURL(whatsappUrl(`Hola ${name.split(' ')[0]}, te escribimos de MAJOBELLA.`, wa.length === 10 ? `1${wa}` : wa))} /> : null}
        {phone ? <Button small kind="outline" icon="phone" title="Llamar" style={{ flex: 1 }} onPress={() => Linking.openURL(`tel:${phone.replace(/[^\d+]/g, '')}`)} /> : null}
      </Row>
      <Button small icon="plus" title="Nueva cita para ella" style={{ marginTop: 10 }} onPress={() => router.push({ pathname: '/nueva', params: { clave: String(clave) } })} />
      <Section kicker="Citas">
        {!items.length ? <Empty icon="calendar" title="Sin citas" /> : items.map((a) => <ItemRow key={a.id} a={a} showDate />)}
      </Section>
      <View style={{ height: space.lg }} />
    </Screen>
  );
}
