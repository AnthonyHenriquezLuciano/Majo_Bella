/* Regalar una tarjeta de regalo: monto, para quién, mensaje y pago con PayPal; el código llega al instante */
import { useState } from 'react';
import { Linking, Share, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { Validate, colors, fmtPrice, fmtUSD, longDate, space } from '@majobella/core';
import { Button, Card, Check, Chip, Empty, Field, Header, Notice, Row, Screen, T } from '@majobella/ui';
import { api, useApp } from '@/lib/app-state';
import { payWithPayPal } from '@/lib/paypal';
import { KEYS, store } from '@/lib/storage';
import { WEB_URL } from '@/lib/env';

const AMOUNTS = [1000, 2000, 3000, 5000];

export default function Regalo() {
  const { studio, client, session } = useApp();
  const router = useRouter();
  const shop = studio.catalog && studio.catalog.giftShop;
  const [amt, setAmt] = useState<number | 'otro'>(2000);
  const [other, setOther] = useState('');
  const [f, setF] = useState({ para: '', de: (client && client.firstName) || '', mensaje: '', correo: (client && client.email) || (session && session.email) || '', correoPara: '' });
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [sold, setSold] = useState<{ codigo: string; montoRD: number; para: string; vence: string; mensaje: string } | null>(null);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/cuenta'));

  if (!shop || !shop.enabled) return <Screen><Header title="Tarjeta de regalo" onBack={back} /><Empty icon="gift" title="Pronto" text="La venta de tarjetas de regalo en la app estará disponible muy pronto. Escríbenos por WhatsApp para comprar una." /></Screen>;
  const monto = amt === 'otro' ? Math.round(Number(other) || 0) : amt;
  const usd = Math.ceil((monto / studio.payments.usdRate) * 100) / 100;

  const pay = async () => {
    if (monto < shop.min || monto > shop.max) { setErr(`El valor debe estar entre ${fmtPrice(shop.min)} y ${fmtPrice(shop.max)}.`); return; }
    if (!Validate.email(f.correo)) { setErr('Escribe tu correo para enviarte la tarjeta.'); return; }
    if (f.correoPara && !Validate.email(f.correoPara)) { setErr('Revisa el correo de quien recibe la tarjeta.'); return; }
    if (!terms) { setErr('Acepta las condiciones de las tarjetas de regalo para continuar.'); return; }
    setErr(''); setBusy('Preparando el pago…');
    try {
      const o = await api.giftOrder({ montoRD: monto, para: Validate.properName(f.para), de: Validate.properName(f.de), mensaje: f.mensaje.trim(), correo: f.correo.trim().toLowerCase(), correoPara: f.correoPara.trim().toLowerCase() });
      setBusy('Abriendo PayPal…');
      const r = await payWithPayPal(o.approveUrl);
      if (r === 'cancel') { setErr('Pago cancelado. No se te cobró.'); return; }
      setBusy('Confirmando tu pago…');
      try {
        const c = await api.giftCapture(o.id, o.orderId);
        setSold(c.gift);
        const saved = await store.get<string[]>(KEYS.codes, []);
        await store.set(KEYS.codes, [...new Set([...saved, c.gift.codigo])]);
      } catch (e: any) {
        setErr(r === 'dismiss' ? 'No se completó el pago. No se te cobró.' : `${e.message} Si se te cobró, escríbenos por WhatsApp con tu correo.`);
      }
    } catch (e: any) { setErr(e.message); } finally { setBusy(''); }
  };

  if (sold) {
    const text = `${sold.para ? `${sold.para}, ` : ''}te regalo una experiencia en MAJOBELLA Beauty Studio 🎁\nTarjeta de regalo: ${fmtPrice(sold.montoRD)}\nCódigo: ${sold.codigo}${sold.mensaje ? `\n“${sold.mensaje}”` : ''}\nReserva en ${WEB_URL}reservar.html o en la app MAJOBELLA y escribe el código al pagar.`;
    return (
      <Screen>
        <Header title="¡Lista tu tarjeta!" onBack={back} />
        <GiftCard monto={sold.montoRD} para={sold.para} de={f.de} mensaje={sold.mensaje} code={sold.codigo} />
        <T v="body" style={{ marginTop: space.lg }}>{`Te la enviamos a tu correo${f.correoPara ? ' y a quien la recibe' : ''}. Se usa escribiendo el código al reservar.${sold.vence ? ` Válida hasta el ${longDate(sold.vence)}.` : ''}`}</T>
        <View style={{ gap: 10, marginTop: space.lg }}>
          <Button title="Enviar por WhatsApp" icon="whatsapp" onPress={() => Linking.openURL(`https://wa.me/?text=${encodeURIComponent(text)}`)} />
          <Button kind="outline" title="Compartir" icon="external" onPress={() => Share.share({ message: text })} />
          <Button kind="ghost" title="Copiar código" icon="copy" onPress={() => Clipboard.setStringAsync(sold.codigo)} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen footer={
      <View style={{ padding: 16, paddingBottom: 24, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.paper }}>
        <Button testID="gift-pay" title={monto ? `Pagar ${fmtUSD(usd)} con PayPal` : 'Elige el monto'} icon="card" loading={!!busy} disabled={!monto} onPress={pay} />
        {busy ? <T v="muted" style={{ textAlign: 'center', marginTop: 6 }}>{busy}</T> : null}
      </View>
    }>
      <Header title="Tarjeta de regalo" kicker="Regala belleza" onBack={back} />
      <GiftCard monto={monto} para={f.para} de={f.de} mensaje={f.mensaje} />
      <T v="label" style={{ marginTop: space.lg, marginBottom: 8 }}>Valor</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {AMOUNTS.filter((x) => x >= shop.min && x <= shop.max).map((x) => <Chip key={x} label={fmtPrice(x)} selected={amt === x} onPress={() => setAmt(x)} />)}
        <Chip label="Otro" selected={amt === 'otro'} onPress={() => setAmt('otro')} />
      </View>
      {amt === 'otro' ? <View style={{ marginTop: space.md }}><Field label={`Monto (${fmtPrice(shop.min)} a ${fmtPrice(shop.max)})`} value={other} onChangeText={(v) => setOther(v.replace(/\D/g, ''))} keyboardType="number-pad" /></View> : null}
      <View style={{ marginTop: space.lg }}>
        <Row gap={12} style={{ alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}><Field label="Para" optional value={f.para} onChangeText={(v) => setF({ ...f, para: v })} autoCapitalize="words" maxLength={60} /></View>
          <View style={{ flex: 1 }}><Field label="De" optional value={f.de} onChangeText={(v) => setF({ ...f, de: v })} autoCapitalize="words" maxLength={60} /></View>
        </Row>
        <Field label="Mensaje" optional value={f.mensaje} onChangeText={(v) => setF({ ...f, mensaje: v })} multiline maxLength={160} />
        <Field label="Tu correo" value={f.correo} onChangeText={(v) => setF({ ...f, correo: v })} keyboardType="email-address" autoCapitalize="none" hint="Te enviamos la tarjeta y el recibo." />
        <Field label="Correo de quien la recibe" optional value={f.correoPara} onChangeText={(v) => setF({ ...f, correoPara: v })} keyboardType="email-address" autoCapitalize="none" hint="Si lo escribes, también se la enviamos." />
      </View>
      <T v="muted" style={{ marginBottom: 8 }}>{`Se cobra en dólares (tasa RD$ ${studio.payments.usdRate} por US$ 1). Válida ${shop.validDays >= 365 ? `${Math.round(shop.validDays / 365) === 1 ? '1 año' : `${Math.round(shop.validDays / 365)} años`}` : `${shop.validDays} días`} para cualquier servicio.`}</T>
      <Check checked={terms} onChange={setTerms}>
        <T v="small">{'Acepto las '}<T v="small" style={{ textDecorationLine: 'underline' }} onPress={() => Linking.openURL(`${WEB_URL}terminos.html`)}>condiciones de las tarjetas de regalo</T>.</T>
      </Check>
      {err ? <Notice kind="error" style={{ marginTop: space.md }}>{err}</Notice> : null}
    </Screen>
  );
}

function GiftCard({ monto, para, de, mensaje, code }: { monto: number; para: string; de: string; mensaje: string; code?: string }) {
  return (
    <Card dark style={{ padding: 22, minHeight: 190, justifyContent: 'space-between' }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <T v="kicker" style={{ color: 'rgba(255,255,255,0.7)' }}>Tarjeta de regalo</T>
        <T v="label" style={{ color: colors.paper, letterSpacing: 3 }}>MAJOBELLA</T>
      </Row>
      <View>
        <T v="display" style={{ color: colors.paper }}>{fmtPrice(monto || 0)}</T>
        <T v="small" style={{ color: 'rgba(255,255,255,0.8)' }}>{[para ? `Para ${para}` : '', de ? `de ${de}` : ''].filter(Boolean).join(' · ') || 'Para cualquier servicio'}</T>
        {mensaje ? <T v="script" style={{ color: colors.paper, fontSize: 17, marginTop: 6 }} numberOfLines={2}>{`“${mensaje}”`}</T> : null}
      </View>
      <T v="label" style={{ color: colors.paper, letterSpacing: 2 }}>{code || 'MJB-····-····'}</T>
    </Card>
  );
}
