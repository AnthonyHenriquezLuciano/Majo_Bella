/* Paquetes: varias sesiones de un servicio con descuento, pagados con PayPal */
import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { Validate, colors, fmtPrice, fmtUSD, longDate, space, type PackageInfo } from '@majobella/core';
import { Badge, Button, Card, Empty, Field, Header, Notice, Row, Screen, T } from '@majobella/ui';
import { api, useApp } from '@/lib/app-state';
import { payWithPayPal } from '@/lib/paypal';
import { KEYS, store } from '@/lib/storage';

export default function Paquetes() {
  const { studio, client, session, setCart } = useApp();
  const router = useRouter();
  const packs = (studio.catalog && studio.catalog.packages) || [];
  const [sel, setSel] = useState<PackageInfo | null>(null);
  const [f, setF] = useState({ name: (client && client.name) || (session && session.name) || '', phone: (client && client.phone) || '', email: (client && client.email) || (session && session.email) || '' });
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [sold, setSold] = useState<{ codigo: string; nombre: string; sesiones: number; servicio: string; serviceName: string; vence: string } | null>(null);
  const back = () => (sel && !sold ? setSel(null) : router.canGoBack() ? router.back() : router.replace('/cuenta'));

  const buy = async () => {
    if (!sel) return;
    const n = Validate.splitName(f.name);
    if (Validate.namePart(n.first, 'nombre') || Validate.namePart(n.last, 'apellido')) { setErr('Escribe tu nombre y apellido.'); return; }
    if (!Validate.phone(f.phone).ok) { setErr(Validate.phoneError); return; }
    if (!Validate.email(f.email)) { setErr(Validate.emailError); return; }
    setErr(''); setBusy('Preparando el pago…');
    try {
      const o = await api.bonoOrder({ paqueteId: sel.id, client: { name: Validate.properName(f.name), phone: Validate.phone(f.phone).value, email: f.email.trim().toLowerCase() } });
      const r = await payWithPayPal(o.approveUrl);
      if (r === 'cancel') { setErr('Pago cancelado. No se te cobró.'); return; }
      setBusy('Confirmando tu pago…');
      try {
        const c = await api.bonoCapture(o.id, o.orderId);
        setSold(c.bono);
        const saved = await store.get<string[]>(KEYS.codes, []);
        await store.set(KEYS.codes, [...new Set([...saved, c.bono.codigo])]);
      } catch (e: any) { setErr(r === 'dismiss' ? 'No se completó el pago. No se te cobró.' : `${e.message} Si se te cobró, escríbenos por WhatsApp.`); }
    } catch (e: any) { setErr(e.message); } finally { setBusy(''); }
  };

  if (sold) {
    return (
      <Screen>
        <Header title="¡Tu paquete está listo!" onBack={back} />
        <Card dark style={{ padding: 22 }}>
          <T v="kicker" style={{ color: 'rgba(255,255,255,0.7)' }}>Paquete</T>
          <T v="title" style={{ color: colors.paper, marginTop: 8 }}>{sold.nombre}</T>
          <T v="small" style={{ color: 'rgba(255,255,255,0.8)' }}>{`${sold.sesiones} sesiones de ${sold.serviceName}`}</T>
          <T v="label" style={{ color: colors.paper, letterSpacing: 2, marginTop: 16 }}>{sold.codigo}</T>
        </Card>
        <T v="body" style={{ marginTop: space.lg }}>{`Te enviamos el código a tu correo. Úsalo al reservar cada sesión.${sold.vence ? ` Válido hasta el ${longDate(sold.vence)}.` : ''}`}</T>
        <View style={{ gap: 10, marginTop: space.lg }}>
          <Button title="Reservar la primera sesión" icon="calendar" onPress={() => { if (studio.byId[sold.servicio]) setCart([sold.servicio]); router.navigate({ pathname: '/reservar', params: { codigo: sold.codigo } }); }} />
          <Button kind="ghost" title="Copiar código" icon="copy" onPress={() => Clipboard.setStringAsync(sold.codigo)} />
        </View>
      </Screen>
    );
  }

  if (sel) {
    const usd = Math.ceil((sel.price / studio.payments.usdRate) * 100) / 100;
    return (
      <Screen footer={<View style={{ padding: 16, paddingBottom: 24, borderTopWidth: 1, borderTopColor: colors.line }}><Button title={`Pagar ${fmtUSD(usd)} con PayPal`} icon="card" loading={!!busy} onPress={buy} />{busy ? <T v="muted" style={{ textAlign: 'center', marginTop: 6 }}>{busy}</T> : null}</View>}>
        <Header title={sel.name} kicker="Paquete" onBack={back} />
        <Card>
          <KVLine k={`${sel.sessions} sesiones de ${sel.serviceName}`} v={fmtPrice(sel.price)} />
          {sel.savings ? <KVLine k="Ahorras" v={fmtPrice(sel.savings)} /> : null}
          {sel.validDays ? <KVLine k="Válido" v={`${sel.validDays} días`} /> : null}
        </Card>
        <T v="label" style={{ marginTop: space.lg, marginBottom: 10 }}>Tus datos</T>
        <Field label="Nombre y apellido" value={f.name} onChangeText={(v) => setF({ ...f, name: v })} autoCapitalize="words" />
        <Field label="Celular" value={f.phone} onChangeText={(v) => setF((x) => ({ ...x, phone: Validate.phoneTyping(v, x.phone) }))} keyboardType="phone-pad" />
        <Field label="Correo" value={f.email} onChangeText={(v) => setF({ ...f, email: v })} keyboardType="email-address" autoCapitalize="none" hint="Aquí te llega el código del paquete." />
        {err ? <Notice kind="error">{err}</Notice> : null}
      </Screen>
    );
  }

  return (
    <Screen>
      <Header title="Paquetes" kicker="Ahorra" onBack={back} />
      {!packs.length ? <Empty icon="ticket" title="No hay paquetes por ahora" text="Pronto tendremos paquetes de sesiones con descuento." /> : null}
      {packs.map((k) => (
        <Card key={k.id} style={{ marginBottom: space.md, padding: 18 }} onPress={() => setSel(k)}>
          <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <T v="h2">{k.name}</T>
              <T v="muted" style={{ marginTop: 4 }}>{`${k.sessions} sesiones de ${k.serviceName}`}</T>
            </View>
            <T v="price">{fmtPrice(k.price)}</T>
          </Row>
          {k.description ? <T v="small" style={{ marginTop: 10 }}>{String(k.description)}</T> : null}
          {k.savings ? <View style={{ marginTop: 10 }}><Badge label={`Ahorras ${fmtPrice(k.savings)}`} /></View> : null}
        </Card>
      ))}
    </Screen>
  );
}

const KVLine = ({ k, v }: { k: string; v: string }) => <Row style={{ justifyContent: 'space-between', paddingVertical: 4 }}><T v="small" style={{ flex: 1 }}>{k}</T><T v="price">{v}</T></Row>;
