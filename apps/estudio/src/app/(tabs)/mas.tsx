/* Más: bloquear horarios, enlaces útiles y la sesión */
import { Linking, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Application from 'expo-application';
import { CONFIG, colors, space } from '@majobella/core';
import { Button, Card, Header, ListRow, Screen, Section, T, confirm } from '@majobella/ui';
import { useStudio } from '@/lib/studio-state';
import { WEB_URL } from '@/lib/env';

export default function Mas() {
  const { email, signOut, data } = useStudio();
  const router = useRouter();
  const upcomingBlocks = data ? data.blocks.filter((b) => (b.fechaHasta || b.fechaDesde) >= new Date().toISOString().slice(0, 10) || b.tipo === 'semanal') : [];
  return (
    <Screen testID="mas">
      <Header kicker="MAJOBELLA Estudio" title="Más" />
      <Card dark><T v="small" style={{ color: 'rgba(255,255,255,0.7)' }}>Sesión iniciada como</T><T v="h3" style={{ color: colors.paper, marginTop: 2 }}>{email}</T></Card>
      <Section kicker="Agenda">
        <ListRow icon="close" title="Bloquear un horario" sub="Vacaciones, citas personales, días libres" onPress={() => router.push('/bloquear')} />
        <ListRow icon="plus" title="Nueva cita" sub="Reservas por teléfono o en persona" onPress={() => router.push('/nueva')} />
        {upcomingBlocks.length ? <ListRow icon="info" title={`${upcomingBlocks.length} ${upcomingBlocks.length === 1 ? 'bloqueo activo' : 'bloqueos activos'}`} sub="Se ven en la agenda de cada día" /> : null}
      </Section>
      <Section kicker="Panel completo">
        <ListRow icon="external" title="Abrir el panel web" sub="Servicios, precios, promociones, correos y ajustes" onPress={() => Linking.openURL(`${WEB_URL}admin.html`)} />
        <ListRow icon="external" title="Ver la web" onPress={() => Linking.openURL(WEB_URL)} />
        <ListRow icon="whatsapp" title="WhatsApp del estudio" sub={CONFIG.whatsapp.display} />
      </Section>
      <Button kind="outline" icon="logout" title="Cerrar sesión" style={{ marginTop: space.xl }} onPress={async () => { if (await confirm('¿Cerrar sesión?', 'Dejarás de recibir avisos en este celular.', 'Cerrar sesión', 'Volver')) signOut(); }} />
      <View style={{ alignItems: 'center', marginTop: space.lg }}><T v="muted" style={{ fontSize: 12.5, color: colors.faint }}>{`MAJOBELLA Estudio ${Application.nativeApplicationVersion || '1.0.0'}`}</T></View>
    </Screen>
  );
}
