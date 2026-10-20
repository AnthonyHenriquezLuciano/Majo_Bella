/* Inicio: bienvenida, próxima cita, promociones, servicios, Conoce a Majo, resultados, opiniones y visítanos */
import { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { CONFIG, colors, firstName, fmtPrice, fonts, space, whatsappUrl } from '@majobella/core';
import { Badge, Button, Card, Icon, IconButton, Row, Section, Screen, Stars, T } from '@majobella/ui';
import { useApp } from '@/lib/app-state';
import { AppointmentCard } from '@/components/appointment-card';
import { ServiceCard } from '@/components/service-card';
import { CartBar } from '@/components/cart-bar';

const longDate = (key: string) => {
  const m = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const [, mm] = key.split('-').map(Number);
  return `${m[mm - 1]} ${key.slice(0, 4)}`;
};
const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const h12 = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return `${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'a. m.' : 'p. m.'}`; };

export default function Inicio() {
  const app = useApp();
  const { studio, session, client, appointments, loyalty, catalogReady } = app;
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [refreshing, setRefreshing] = useState(false);
  const cat = studio.catalog;
  const site = (cat && cat.site) || {};
  const name = firstName((session && session.name) || (client && client.name) || '');
  const next = appointments.find((a) => ['confirmada', 'por-confirmar', 'retenida'].includes(a.status) && new Date(a.end).getTime() > Date.now());
  const promo = studio.promos[0];
  const ann = site.announcement && site.announcement.active !== false && site.announcement.text ? site.announcement.text : '';
  const majo = site.majo;
  const reviews = (cat && cat.reviews) || [];
  const google = site.google;
  const gallery = (cat && cat.gallery) || [];
  const giftOn = !!(cat && cat.giftShop && cat.giftShop.enabled);
  const packs = (cat && cat.packages) || [];

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([app.refreshCatalog(), app.refreshAppointments()]);
    setRefreshing(false);
  };

  return (
    <View style={{ flex: 1 }}>
      <Screen refreshing={refreshing} onRefresh={refresh} bottom={app.cart.length ? 80 : 0} testID="inicio">
        {/* Encabezado */}
        <Row style={{ justifyContent: 'space-between', marginBottom: space.lg }}>
          <Image source={require('@/assets/images/logo.png')} style={{ width: 132, height: 52 }} contentFit="contain" accessibilityLabel="MAJOBELLA" />
          <IconButton name="whatsapp" label="Escribir por WhatsApp" onPress={() => Linking.openURL(whatsappUrl(CONFIG.whatsapp.greeting))} />
        </Row>

        {/* Bienvenida */}
        <T v="kicker">{name ? `Hola, ${name}` : 'Estética y belleza'}</T>
        <T v="display" style={{ marginTop: 10 }} accessibilityRole="header">{'Más yo,\nmás bella.'}</T>
        <T v="body" style={{ marginTop: 12, color: colors.muted }}>
          Cejas, pestañas, faciales y micropigmentación pensados para tu rostro. Realzamos lo que ya es tuyo.
        </T>
        <Row style={{ marginTop: space.lg }} gap={10}>
          <Button testID="home-book" title="Reservar" icon="calendar" style={{ flex: 1 }} onPress={() => router.navigate('/reservar')} />
          <Button title="Ver servicios" kind="outline" style={{ flex: 1 }} onPress={() => router.navigate('/servicios')} />
        </Row>

        {/* Anuncio o promoción */}
        {ann || promo ? (
          <Card dark style={{ marginTop: space.xl, padding: 18 }} onPress={() => router.navigate('/servicios')}>
            <Row style={{ alignItems: 'flex-start' }} gap={12}>
              <Icon name="sparkle" color={colors.paper} />
              <View style={{ flex: 1 }}>
                <T v="kicker" style={{ color: 'rgba(255,255,255,0.7)' }}>{promo ? 'Promoción' : 'Aviso'}</T>
                <T v="body" style={{ color: colors.paper, marginTop: 4 }}>
                  {ann || `${promo.name}: ${promo.kind === 'monto' ? `${fmtPrice(promo.value)}` : `${promo.value}%`} de descuento${promo.until ? ` hasta el ${promo.until.slice(8)}/${promo.until.slice(5, 7)}` : ''}.`}
                </T>
              </View>
            </Row>
          </Card>
        ) : null}

        {/* Próxima cita */}
        {next ? (
          <Section kicker="Tu próxima cita" style={{ marginTop: space.xl }}>
            <AppointmentCard a={next} dark />
          </Section>
        ) : null}

        {/* Premio por visitas */}
        {loyalty && loyalty.enabled ? (
          <Card style={{ marginTop: next ? 0 : space.xl }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <T v="label">Tu premio por visitas</T>
              <T v="muted">{`${loyalty.visits} de ${loyalty.every}`}</T>
            </Row>
            <View style={S.progress}><View style={[S.progressFill, { width: `${Math.min(100, (loyalty.visits / Math.max(1, loyalty.every)) * 100)}%` }]} /></View>
            <T v="muted">{loyalty.eligible ? `¡Ya tienes tu premio! ${loyalty.kind === 'monto' ? fmtPrice(loyalty.value) : `${loyalty.value}%`} de descuento en tu próxima cita.` : `Te faltan ${loyalty.every - loyalty.visits} visitas para ${loyalty.kind === 'monto' ? fmtPrice(loyalty.value) : `${loyalty.value}%`} de descuento.`}</T>
          </Card>
        ) : null}

        {/* Servicios */}
        <Section kicker="Servicios" title="Lo que hacemos" right={<Button kind="link" small full={false} title="Ver todos" onPress={() => router.navigate('/servicios')} />}>
          {studio.services.slice(0, 3).map((s) => <ServiceCard key={s.id} s={s} compact />)}
          {!catalogReady ? <T v="muted">Actualizando precios…</T> : null}
        </Section>

        {/* Conoce a Majo */}
        <Section kicker="Conoce a Majo" title={(majo && majo.title) || 'Conoce a Majo'}>
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {majo && majo.photo
              ? <Image source={{ uri: majo.photo }} style={{ width: '100%', aspectRatio: 4 / 3, backgroundColor: colors.sand }} contentFit="cover" accessibilityLabel="Majo, fundadora de MAJOBELLA" />
              : <View style={{ backgroundColor: colors.sand, alignItems: 'center', justifyContent: 'center', paddingVertical: 34 }}><Image source={require('@/assets/images/monograma.png')} style={{ width: 96, height: 80, opacity: 0.85 }} contentFit="contain" /></View>}
            <View style={{ padding: 18, gap: 10 }}>
              {(majo && majo.text ? majo.text.split(/\n\s*\n/) : ['Soy Majo, fundadora de MAJOBELLA. Trabajo cada servicio con calma y a tu medida, para que salgas sintiéndote tú, pero más bella.'])
                .slice(0, 3).map((p, i) => <T key={i} v="body">{p.trim()}</T>)}
              {majo && majo.certs && majo.certs.length ? (
                <View style={{ marginTop: 4, gap: 6 }}>
                  {majo.certs.slice(0, 5).map((c) => <Row key={c} gap={8}><Icon name="check" size={16} /><T v="small" style={{ flex: 1 }}>{c}</T></Row>)}
                </View>
              ) : null}
            </View>
          </Card>
        </Section>

        {/* Por qué elegirnos */}
        <Section kicker="Por qué elegirnos" title="Tu tiempo en MAJOBELLA">
          {[
            ['edit', 'Diseño a tu medida', 'Nada de plantillas. Cada forma se adapta a tus facciones.'],
            ['sparkle', 'Resultados naturales', 'Buscamos que te veas como tú, con más definición y frescura.'],
            ['clock', 'Atención sin prisa', 'Una cita a la vez, con tiempo para resolver tus dudas.'],
            ['heart', 'Seguimiento', 'Te acompañamos después del servicio con indicaciones de cuidado.'],
          ].map(([ic, t, d]) => (
            <Row key={t} style={{ alignItems: 'flex-start', marginBottom: space.md }} gap={14}>
              <View style={S.why}><Icon name={ic as any} size={20} /></View>
              <View style={{ flex: 1 }}><T v="h3">{t}</T><T v="muted" style={{ marginTop: 2 }}>{d}</T></View>
            </Row>
          ))}
        </Section>

        {/* Resultados */}
        {gallery.length ? (
          <Section kicker="Resultados" title="Antes y después">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingRight: 20 }} style={{ marginHorizontal: -20, paddingLeft: 20 }}>
              {gallery.slice(0, 10).map((g) => <BeforeAfter key={g.id} g={g} width={Math.min(300, width * 0.74)} />)}
            </ScrollView>
          </Section>
        ) : null}

        {/* Opiniones */}
        {reviews.length || (google && google.rating) ? (
          <Section kicker="Opiniones" title="Lo que dicen nuestras clientas">
            {google && google.rating ? (
              <Row style={{ marginBottom: space.md }} gap={12}>
                <T v="display">{google.rating.toFixed(1)}</T>
                <View><Stars n={google.rating} size={16} /><T v="muted">{google.count ? `${google.count} reseñas en Google` : 'en Google'}</T></View>
              </Row>
            ) : null}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingRight: 20 }} style={{ marginHorizontal: -20, paddingLeft: 20 }}>
              {reviews.slice(0, 10).map((r) => (
                <Card key={r.id} style={{ width: Math.min(300, width * 0.78), padding: 18 }}>
                  <Stars n={r.stars} />
                  <T v="body" style={{ marginTop: 10 }} numberOfLines={7}>{`“${r.text}”`}</T>
                  <T v="muted" style={{ marginTop: 10 }}>{r.author}{r.date ? ` · ${longDate(r.date)}` : ''}</T>
                </Card>
              ))}
            </ScrollView>
            {google && google.reviewUrl ? <Button kind="link" full={false} title="Deja tu reseña en Google" onPress={() => Linking.openURL(google.reviewUrl)} style={{ marginTop: 8, alignSelf: 'flex-start' }} /> : null}
          </Section>
        ) : null}

        {/* Regalos y paquetes */}
        {giftOn || packs.length ? (
          <Section kicker="Regalos" title="Regala belleza">
            <Row gap={12} style={{ alignItems: 'stretch' }}>
              {giftOn ? (
                <Card style={{ flex: 1 }} onPress={() => router.push('/regalo')}>
                  <Icon name="gift" size={26} />
                  <T v="h3" style={{ marginTop: 10 }}>Tarjeta de regalo</T>
                  <T v="muted" style={{ marginTop: 4 }}>Para cualquier servicio. Llega al instante.</T>
                </Card>
              ) : null}
              {packs.length ? (
                <Card style={{ flex: 1 }} onPress={() => router.push('/paquetes')}>
                  <Icon name="ticket" size={26} />
                  <T v="h3" style={{ marginTop: 10 }}>Paquetes</T>
                  <T v="muted" style={{ marginTop: 4 }}>Varias sesiones con descuento.</T>
                </Card>
              ) : null}
            </Row>
          </Section>
        ) : null}

        {/* Visítanos */}
        <Section kicker="Visítanos" title="MAJOBELLA Beauty Studio">
          <Card>
            <Row gap={10} style={{ alignItems: 'flex-start' }}><Icon name="map" size={20} /><T v="body" style={{ flex: 1 }}>{(site.business && site.business.address) || CONFIG.contact.address}</T></Row>
            <View style={{ marginTop: 14, gap: 4 }}>
              {[0, 1, 2, 3, 4, 5, 6].map((d) => (d + 2) % 7).map((d) => {
                const h = studio.schedule.hours[String(d)];
                return (
                  <Row key={d} style={{ justifyContent: 'space-between' }}>
                    <T v="small">{DAYS[d]}</T>
                    <T v="small" style={{ color: h ? colors.ink : colors.faint }}>{h ? `${h12(h.open)} – ${h12(h.close)}` : 'Cerrado'}</T>
                  </Row>
                );
              })}
            </View>
            <Row gap={10} style={{ marginTop: space.md }}>
              <Button small title="Cómo llegar" icon="map" kind="outline" style={{ flex: 1 }} onPress={() => Linking.openURL(CONFIG.contact.mapsUrl)} />
              <Button small title="WhatsApp" icon="whatsapp" kind="outline" style={{ flex: 1 }} onPress={() => Linking.openURL(whatsappUrl(CONFIG.whatsapp.greeting))} />
            </Row>
          </Card>
        </Section>

        <View style={{ alignItems: 'center', marginTop: space.xl }}>
          <Badge label={CONFIG.brand.slogan} tone="soft" />
        </View>
      </Screen>
      <CartBar />
    </View>
  );
}

function BeforeAfter({ g, width }: { g: { id: string; service: string; before: string; after: string; text: string }; width: number }) {
  const [after, setAfter] = useState(true);
  return (
    <View style={{ width }}>
      <Pressable onPress={() => setAfter((x) => !x)} accessibilityRole="button" accessibilityLabel={`${after ? 'Después' : 'Antes'}${g.service ? ` · ${g.service}` : ''}. Toca para ver ${after ? 'el antes' : 'el después'}`}>
        <Image source={{ uri: after ? g.after : g.before }} style={{ width, height: width * 1.15, backgroundColor: colors.sand }} contentFit="cover" transition={180} />
        <View style={S.baTag}><T v="kicker" style={{ color: colors.paper, letterSpacing: 1.6 }}>{after ? 'Después' : 'Antes'}</T></View>
      </Pressable>
      {g.service ? <T v="label" style={{ marginTop: 8 }}>{g.service}</T> : null}
      {g.text ? <T v="muted" numberOfLines={2}>{g.text}</T> : null}
    </View>
  );
}

const S = StyleSheet.create({
  progress: { height: 6, backgroundColor: colors.sand, marginVertical: 10 },
  progressFill: { height: 6, backgroundColor: colors.ink },
  why: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  baTag: { position: 'absolute', left: 10, top: 10, backgroundColor: 'rgba(0,0,0,0.72)', paddingHorizontal: 9, paddingVertical: 5 },
});
void fonts;
