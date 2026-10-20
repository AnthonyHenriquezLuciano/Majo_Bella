/* Agenda del día: citas, bloqueos, lo que falta cobrar y accesos rápidos */
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { addDaysKey, colors, fmtPrice, fmtTime12, fonts, parseKey, relativeDay, space, todayKey, weekdayShort, whenText } from '@majobella/core';
import { Button, Card, Empty, Icon, IconButton, Notice, Row, Screen, T } from '@majobella/ui';
import { LIVE, blocksOn, useStudio } from '@/lib/studio-state';
import { ItemRow } from '@/components/item-row';

export default function Agenda() {
  const { data, loading, refresh, error, email, denied, signOut } = useStudio();
  const router = useRouter();
  const [day, setDay] = useState(todayKey());
  const week = useMemo(() => Array.from({ length: 14 }, (_, i) => addDaysKey(todayKey(), i - 1)), []);
  if (denied) return <Screen><Empty icon="user" title="Esta cuenta no tiene acceso" text={`${email} no es una cuenta del estudio. Entra con el correo del estudio.`} action={<Button kind="outline" title="Cerrar sesión" icon="logout" onPress={signOut} />} /></Screen>;
  if (!data) return <Screen>{error ? <><Notice kind="error">{error}</Notice><Button kind="outline" title="Reintentar" icon="refresh" style={{ marginTop: space.md }} onPress={refresh} /></> : <T v="muted">Cargando la agenda…</T>}</Screen>;

  const items = data.items.filter((a) => a.date === day && a.status !== 'bloqueo').sort((a, b) => a.time.localeCompare(b.time));
  const live = items.filter((a) => LIVE.includes(a.status) || a.status === 'completada' || a.status === 'no-asistio');
  const gone = items.filter((a) => !live.includes(a));
  const blocks = blocksOn(data.blocks, day);
  const count = (k: string) => data.items.filter((a) => a.date === k && LIVE.includes(a.status)).length;
  const expected = live.filter((a) => a.status !== 'no-asistio').reduce((t, a) => t + a.totalPrice, 0);
  const toCollect = live.filter((a) => ['confirmada', 'completada'].includes(a.status) && a.payment.balanceStatus !== 'pagado').reduce((t, a) => t + (a.payment.balanceRD || 0), 0);
  const hours = data.schedule.hours[String(new Date(`${day}T12:00:00Z`).getUTCDay())];

  return (
    <View style={{ flex: 1 }}>
      <Screen refreshing={loading} onRefresh={refresh} testID="agenda" bottom={70}>
        <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <T v="kicker">{relativeDay(day) === 'Hoy' ? 'Hoy' : relativeDay(day) === 'Mañana' ? 'Mañana' : 'Agenda'}</T>
            <T v="h2" style={{ marginTop: 4, fontSize: 24, lineHeight: 30 }}>{whenText(day)}</T>
          </View>
          <Row gap={0}>
            <IconButton name="chevron-left" label="Día anterior" onPress={() => setDay(addDaysKey(day, -1))} />
            <IconButton name="chevron-right" label="Día siguiente" onPress={() => setDay(addDaysKey(day, 1))} />
          </Row>
        </Row>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20, marginTop: space.md }} contentContainerStyle={{ gap: 6, paddingHorizontal: 20 }}>
          {week.map((k) => {
            const sel = k === day, n = count(k);
            return (
              <Pressable key={k} onPress={() => setDay(k)} accessibilityRole="button" accessibilityState={{ selected: sel }} style={[S.day, sel && S.daySel]}>
                <Text style={[S.dw, sel && { color: 'rgba(255,255,255,0.75)' }]}>{k === todayKey() ? 'Hoy' : weekdayShort(k)}</Text>
                <Text style={[S.dd, sel && { color: colors.paper }]}>{parseKey(k).d}</Text>
                <View style={[S.dots]}>{Array.from({ length: Math.min(n, 4) }).map((_, i) => <View key={i} style={[S.dot, sel && { backgroundColor: colors.paper }]} />)}</View>
              </Pressable>
            );
          })}
        </ScrollView>

        <Row gap={10} style={{ marginTop: space.lg }}>
          <Card style={{ flex: 1, padding: 14 }}><T v="kicker">Citas</T><T v="h3" style={{ marginTop: 6, fontSize: 18 }} numberOfLines={1} adjustsFontSizeToFit>{String(live.filter((a) => a.status !== 'no-asistio').length)}</T></Card>
          <Card style={{ flex: 1, padding: 14 }}><T v="kicker">Total</T><T v="h3" style={{ marginTop: 6, fontSize: 18 }} numberOfLines={1} adjustsFontSizeToFit>{fmtPrice(expected)}</T></Card>
          <Card style={{ flex: 1, padding: 14 }}><T v="kicker" numberOfLines={1}>Cobrar</T><T v="h3" style={{ marginTop: 6, fontSize: 18 }} numberOfLines={1} adjustsFontSizeToFit>{fmtPrice(toCollect)}</T></Card>
        </Row>

        <T v="muted" style={{ marginTop: space.md }}>{hours ? `Horario: ${fmtTime12(hours.open)} – ${fmtTime12(hours.close)}` : 'El estudio está cerrado este día.'}</T>

        <View style={{ marginTop: space.md }}>
          {blocks.map((b) => (
            <Card key={b.id + day} style={{ marginBottom: 10, padding: 14, backgroundColor: colors.sand, borderColor: colors.sand }}>
              <Row gap={12}><Icon name="close" size={18} /><View style={{ flex: 1 }}><T v="label">{b.horaDesde === '00:00' && b.horaHasta === '23:59' ? 'Todo el día' : `${fmtTime12(b.horaDesde)} – ${fmtTime12(b.horaHasta)}`}</T><T v="muted">{b.motivo || 'Bloqueado'}</T></View></Row>
            </Card>
          ))}
          {!live.length && !blocks.length ? <Empty icon="calendar" title="Sin citas este día" text="Las reservas de la web y de la app aparecen aquí al instante." /> : null}
          {live.map((a) => <ItemRow key={a.id} a={a} />)}
          {gone.length ? <T v="kicker" style={{ marginTop: space.md, marginBottom: 8 }}>Canceladas</T> : null}
          {gone.map((a) => <ItemRow key={a.id} a={a} />)}
        </View>
        <T v="muted" style={{ marginTop: space.lg, fontSize: 12.5, color: colors.faint, textAlign: 'center' }}>{`Sesión: ${email}`}</T>
      </Screen>
      <View style={S.fabs}>
        <Button small full={false} kind="outline" icon="close" title="Bloquear" onPress={() => router.push({ pathname: '/bloquear', params: { fecha: day } })} />
        <Button testID="new" small full={false} icon="plus" title="Nueva cita" onPress={() => router.push({ pathname: '/nueva', params: { fecha: day } })} />
      </View>
    </View>
  );
}

const S = StyleSheet.create({
  day: { width: 54, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: colors.line, gap: 2 },
  daySel: { backgroundColor: colors.ink, borderColor: colors.ink },
  dw: { fontFamily: fonts.serif, fontSize: 12, color: colors.muted },
  dd: { fontFamily: fonts.serif, fontSize: 20, color: colors.ink },
  dots: { flexDirection: 'row', gap: 3, height: 5 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.ink },
  fabs: { position: 'absolute', right: 16, bottom: 12, flexDirection: 'row', gap: 8, backgroundColor: 'transparent' },
});
