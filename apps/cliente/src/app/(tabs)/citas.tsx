/* Mis citas: próximas y anteriores (de la cuenta y las reservadas en este celular) */
import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { space } from '@majobella/core';
import { Button, Chip, Empty, Header, Loading, Notice, Row, Screen, T } from '@majobella/ui';
import { useApp } from '@/lib/app-state';
import { AppointmentCard } from '@/components/appointment-card';
import { AUTH_ENABLED } from '@/lib/env';

export default function Citas() {
  const { appointments, loadingAppointments, appointmentsError, refreshAppointments, session } = useApp();
  const router = useRouter();
  const [tab, setTab] = useState<'proximas' | 'pasadas'>('proximas');
  const now = Date.now();
  const active = (s: string) => ['confirmada', 'por-confirmar', 'retenida'].includes(s);
  const upcoming = appointments.filter((a) => active(a.status) && new Date(a.end).getTime() > now);
  const past = appointments.filter((a) => !upcoming.includes(a) && a.status !== 'expirada').reverse();
  const list = tab === 'proximas' ? upcoming : past;
  return (
    <Screen refreshing={loadingAppointments && appointments.length > 0} onRefresh={refreshAppointments} testID="citas">
      <Header kicker="Tu agenda" title="Mis citas" />
      <Row gap={8} style={{ marginBottom: space.lg }}>
        <Chip label={`Próximas${upcoming.length ? ` (${upcoming.length})` : ''}`} selected={tab === 'proximas'} onPress={() => setTab('proximas')} />
        <Chip label="Anteriores" selected={tab === 'pasadas'} onPress={() => setTab('pasadas')} />
      </Row>
      {appointmentsError ? <Notice kind="error" style={{ marginBottom: space.md }}>{appointmentsError}</Notice> : null}
      {loadingAppointments && !appointments.length ? <Loading label="Buscando tus citas…" /> : null}
      {!loadingAppointments && !list.length ? (
        <Empty
          icon="calendar"
          title={tab === 'proximas' ? 'No tienes citas próximas' : 'Aún no hay citas anteriores'}
          text={session ? 'Cuando reserves, tus citas aparecerán aquí.' : 'Aquí aparecen las citas que reservas desde este celular. Inicia sesión para ver también las que reservaste en la web.'}
          action={
            <View style={{ gap: 10 }}>
              <Button title="Reservar cita" icon="calendar" onPress={() => router.navigate('/reservar')} />
              {!session && AUTH_ENABLED ? <Button kind="outline" title="Iniciar sesión" icon="user" onPress={() => router.push('/entrar')} /> : null}
            </View>
          }
        />
      ) : null}
      {list.map((a) => <AppointmentCard key={a.id} a={a} />)}
      {list.length && !session && AUTH_ENABLED ? <T v="muted" style={{ textAlign: 'center', marginTop: space.sm }}>¿Reservaste en la web? Inicia sesión con el mismo correo para verlas aquí.</T> : null}
    </Screen>
  );
}
