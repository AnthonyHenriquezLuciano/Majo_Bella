/* Cuenta: sesión, mis datos, billetera, regalos, avisos, contacto y documentos */
import { useEffect, useState } from 'react';
import { Linking, Platform, Switch, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Application from 'expo-application';
import { CONFIG, colors, space, whatsappUrl } from '@majobella/core';
import { Button, Card, Header, Icon, ListRow, Row, Screen, Section, T, confirm } from '@majobella/ui';
import { useApp } from '@/lib/app-state';
import { AUTH_ENABLED, WEB_URL } from '@/lib/env';
import { notificationsAllowed } from '@/lib/notify';

export default function Cuenta() {
  const { session, client, signOut, studio, saveClient } = useApp();
  const router = useRouter();
  const [notif, setNotif] = useState(false);
  useEffect(() => { notificationsAllowed(false).then(setNotif).catch(() => {}); }, []);
  const cat = studio.catalog;
  const giftOn = !!(cat && cat.giftShop && cat.giftShop.enabled);
  const packs = !!(cat && cat.packages && cat.packages.length);
  const ig = CONFIG.social.instagram, tt = CONFIG.social.tiktok;

  return (
    <Screen testID="cuenta">
      <Header kicker="MAJOBELLA" title="Cuenta" />
      {session ? (
        <Card dark>
          <Row gap={14}>
            <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center' }}>
              <T v="h2">{(session.name || session.email).charAt(0).toUpperCase()}</T>
            </View>
            <View style={{ flex: 1 }}>
              {session.name ? <T v="h3" style={{ color: colors.paper }}>{session.name}</T> : null}
              <T v="small" style={{ color: 'rgba(255,255,255,0.75)' }}>{session.email}</T>
            </View>
          </Row>
        </Card>
      ) : AUTH_ENABLED ? (
        <Card>
          <T v="h2">Inicia sesión</T>
          <T v="muted" style={{ marginTop: 6 }}>Ve tus citas, tarjetas y paquetes en cualquier celular, y recibe avisos de tus reservas.</T>
          <Button testID="login" title="Entrar con mi correo" icon="mail" style={{ marginTop: space.md }} onPress={() => router.push('/entrar')} />
        </Card>
      ) : (
        <Card>
          <T v="h3">Reserva sin cuenta</T>
          <T v="muted" style={{ marginTop: 6 }}>Tus citas quedan guardadas en este celular. Muy pronto podrás iniciar sesión para verlas en cualquier lugar.</T>
        </Card>
      )}

      <Section kicker="Lo mío">
        <ListRow icon="user" title="Mis datos" sub={client ? `${client.name} · ${client.phone}` : 'Guárdalos para reservar más rápido'} onPress={() => router.push('/datos')} />
        <ListRow icon="ticket" title="Billetera" sub="Tarjetas de regalo y paquetes" onPress={() => router.push('/billetera')} />
        {giftOn ? <ListRow icon="gift" title="Regalar una tarjeta" sub="Para cualquier servicio" onPress={() => router.push('/regalo')} /> : null}
        {packs ? <ListRow icon="bag" title="Paquetes de sesiones" sub="Ahorra reservando varias" onPress={() => router.push('/paquetes')} /> : null}
        {Platform.OS !== 'web' ? (
          <ListRow icon="bell" title="Avisos y recordatorios" sub={notif ? 'Te recordamos cada cita' : 'Actívalos para no olvidar tu cita'} right={
            <Switch value={notif} onValueChange={async (v) => { if (v) setNotif(await notificationsAllowed(true)); else Linking.openSettings(); }} trackColor={{ true: colors.ink, false: colors.beige }} thumbColor={colors.paper} accessibilityLabel="Avisos" />
          } />
        ) : null}
      </Section>

      <Section kicker="Contacto">
        <ListRow icon="whatsapp" title="WhatsApp" sub={CONFIG.whatsapp.display} onPress={() => Linking.openURL(whatsappUrl(CONFIG.whatsapp.greeting))} />
        <ListRow icon="map" title="Cómo llegar" sub={CONFIG.contact.address} onPress={() => Linking.openURL(CONFIG.contact.mapsUrl)} />
        {ig ? <ListRow icon="heart" title="Instagram" onPress={() => Linking.openURL(ig)} /> : null}
        {tt ? <ListRow icon="sparkle" title="TikTok" onPress={() => Linking.openURL(tt)} /> : null}
        <ListRow icon="external" title="Sitio web" onPress={() => Linking.openURL(WEB_URL)} />
      </Section>

      <Section kicker="Documentos">
        <ListRow icon="info" title="Términos" onPress={() => Linking.openURL(`${WEB_URL}terminos.html`)} />
        <ListRow icon="info" title="Política de cancelación" onPress={() => Linking.openURL(`${WEB_URL}cancelacion.html`)} />
        <ListRow icon="info" title="Privacidad" onPress={() => Linking.openURL(`${WEB_URL}privacidad.html`)} />
      </Section>

      {session ? (
        <Button kind="outline" title="Cerrar sesión" icon="logout" style={{ marginTop: space.xl }} onPress={async () => { if (await confirm('¿Cerrar sesión?', 'Tus citas reservadas en este celular seguirán aquí.', 'Cerrar sesión', 'Volver')) signOut(); }} />
      ) : client ? (
        <Button kind="ghost" title="Borrar mis datos de este celular" onPress={async () => { if (await confirm('¿Borrar tus datos?', 'Se borran tu nombre, teléfono y correo guardados en este celular.', 'Borrar', 'Volver', true)) saveClient(null); }} />
      ) : null}

      <Row style={{ justifyContent: 'center', marginTop: space.xl }} gap={8}>
        <Icon name="sparkle" size={14} color={colors.faint} />
        <T v="muted" style={{ fontSize: 12.5, color: colors.faint }}>{`MAJOBELLA ${Application.nativeApplicationVersion || '1.0.0'} · ${CONFIG.brand.slogan}`}</T>
      </Row>
    </Screen>
  );
}
