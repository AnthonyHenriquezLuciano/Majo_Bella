/* Mis datos guardados en este celular (para reservar más rápido) */
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Validate, space } from '@majobella/core';
import { Button, Field, Header, Notice, Row, Screen, T } from '@majobella/ui';
import { useApp } from '@/lib/app-state';

export default function Datos() {
  const { client, saveClient, session } = useApp();
  const router = useRouter();
  const [f, setF] = useState({ first: '', last: '', phone: '', email: '', bd: '', bm: '' });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [ok, setOk] = useState(false);
  useEffect(() => {
    const n = Validate.splitName((client && client.name) || (session && session.name) || '');
    const [bm, bd] = ((client && client.birthday) || '').split('-');
    setF({ first: (client && client.firstName) || n.first, last: (client && client.lastName) || n.last, phone: (client && client.phone) || '', email: (client && client.email) || (session && session.email) || '', bd: bd || '', bm: bm || '' });
  }, [client, session]);
  const save = async () => {
    const e: Record<string, string> = {};
    const a = Validate.namePart(f.first, 'nombre'); if (a) e.first = a;
    const b = Validate.namePart(f.last, 'apellido'); if (b) e.last = b;
    if (!Validate.phone(f.phone).ok) e.phone = Validate.phoneError;
    if (!Validate.email(f.email)) e.email = Validate.emailError;
    setErrs(e);
    if (Object.keys(e).length) return;
    await saveClient({
      name: Validate.fullName(f.first, f.last), firstName: Validate.properName(f.first), lastName: Validate.properName(f.last),
      phone: Validate.phone(f.phone).value, email: f.email.trim().toLowerCase(),
      birthday: f.bd && f.bm ? `${f.bm.padStart(2, '0')}-${f.bd.padStart(2, '0')}` : '',
    });
    setOk(true);
  };
  return (
    <Screen>
      <Header title="Mis datos" onBack={() => (router.canGoBack() ? router.back() : router.replace('/cuenta'))} />
      <T v="muted" style={{ marginTop: -10, marginBottom: space.lg }}>Se guardan solo en este celular y se completan solos al reservar.</T>
      {ok ? <Notice kind="ok" style={{ marginBottom: space.md }}>Datos guardados.</Notice> : null}
      <Row gap={12} style={{ alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}><Field label="Nombre" value={f.first} onChangeText={(v) => { setF({ ...f, first: v }); setOk(false); }} autoCapitalize="words" error={errs.first} /></View>
        <View style={{ flex: 1 }}><Field label="Apellido" value={f.last} onChangeText={(v) => { setF({ ...f, last: v }); setOk(false); }} autoCapitalize="words" error={errs.last} /></View>
      </Row>
      <Field label="Celular (WhatsApp)" value={f.phone} onChangeText={(v) => { setF((x) => ({ ...x, phone: Validate.phoneTyping(v, x.phone) })); setOk(false); }} keyboardType="phone-pad" error={errs.phone} />
      <Field label="Correo" value={f.email} onChangeText={(v) => { setF({ ...f, email: v }); setOk(false); }} keyboardType="email-address" autoCapitalize="none" error={errs.email} />
      <Row gap={12}>
        <View style={{ width: 90 }}><Field label="Día cumple" value={f.bd} onChangeText={(v) => setF({ ...f, bd: v.replace(/\D/g, '').slice(0, 2) })} keyboardType="number-pad" /></View>
        <View style={{ width: 90 }}><Field label="Mes" value={f.bm} onChangeText={(v) => setF({ ...f, bm: v.replace(/\D/g, '').slice(0, 2) })} keyboardType="number-pad" /></View>
      </Row>
      <Button title="Guardar" icon="check" onPress={save} style={{ marginTop: space.sm }} />
    </Screen>
  );
}
