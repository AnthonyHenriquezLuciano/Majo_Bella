/* Billetera: tarjetas de regalo y paquetes (de la cuenta y los guardados con su código) */
import { useCallback, useEffect, useState } from 'react';
import { Share, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { colors, fmtPrice, longDate, space, type WalletItem } from '@majobella/core';
import { Badge, Button, Card, Empty, Field, Header, IconButton, Loading, Notice, Row, Screen, T } from '@majobella/ui';
import { api, useApp } from '@/lib/app-state';
import { KEYS, store } from '@/lib/storage';

export default function Billetera() {
  const { session, setCart, studio } = useApp();
  const router = useRouter();
  const [items, setItems] = useState<WalletItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [code, setCode] = useState('');
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const saved = await store.get<string[]>(KEYS.codes, []);
      const out: Record<string, WalletItem> = {};
      if (saved.length) (await api.walletLookup(saved)).items.forEach((x) => { if (x.type !== 'unknown') out[x.code] = x; });
      if (session) (await api.myWallet()).items.forEach((x) => { out[x.code] = x; });
      setItems(Object.values(out));
    } catch (e: any) { setErr(e.message); } finally { setLoading(false); }
  }, [session]);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    const c = code.trim().toUpperCase().replace(/\s+/g, '');
    if (!c) return;
    setAdding(true); setErr('');
    try {
      const r = await api.walletLookup([c]);
      if (!r.items.length || r.items[0].type === 'unknown') throw new Error('No encontramos ese código. Revísalo e inténtalo de nuevo.');
      const saved = await store.get<string[]>(KEYS.codes, []);
      await store.set(KEYS.codes, [...new Set([...saved, c])].slice(-30));
      setCode('');
      load();
    } catch (e: any) { setErr(e.message); } finally { setAdding(false); }
  };

  const use = (x: WalletItem) => {
    if (x.type === 'package' && studio.byId[x.service]) setCart([x.service]);
    router.navigate({ pathname: '/reservar', params: { codigo: x.code } });
  };

  return (
    <Screen refreshing={loading && items.length > 0} onRefresh={load}>
      <Header title="Billetera" onBack={() => (router.canGoBack() ? router.back() : router.replace('/cuenta'))} />
      <T v="muted" style={{ marginTop: -10, marginBottom: space.lg }}>{session ? 'Tus tarjetas de regalo y paquetes. Úsalos al reservar.' : 'Guarda aquí tus tarjetas y paquetes con su código. Inicia sesión para ver los que están a tu nombre.'}</T>
      <Row gap={8} style={{ alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}><Field label="Añadir un código" value={code} onChangeText={(v) => setCode(v.toUpperCase())} autoCapitalize="characters" autoCorrect={false} placeholder="MJB-XXXX-XXXX" onSubmitEditing={add} /></View>
        <Button full={false} kind="outline" title="Añadir" loading={adding} onPress={add} style={{ marginTop: 24 }} />
      </Row>
      {err ? <Notice kind="error" style={{ marginBottom: space.md }}>{err}</Notice> : null}
      {loading && !items.length ? <Loading /> : null}
      {!loading && !items.length ? <Empty icon="ticket" title="Tu billetera está vacía" text="Cuando compres o recibas una tarjeta de regalo o un paquete, aparecerá aquí." /> : null}
      {items.map((x) => (
        <Card key={x.code} dark={x.type === 'gift'} style={{ marginBottom: space.md, padding: 20 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <T v="kicker" style={x.type === 'gift' ? { color: 'rgba(255,255,255,0.7)' } : undefined}>{x.type === 'gift' ? 'Tarjeta de regalo' : 'Paquete'}</T>
            <Badge label={x.status} tone={/activ|vigente/.test(x.status) ? (x.type === 'gift' ? 'soft' : 'ok') : 'error'} />
          </Row>
          {x.type === 'gift' ? (
            <>
              <T v="display" style={{ color: colors.paper, marginTop: 10 }}>{fmtPrice(x.balanceRD)}</T>
              <T v="small" style={{ color: 'rgba(255,255,255,0.75)' }}>{`disponible de ${fmtPrice(x.amountRD)}${x.to ? ` · para ${x.to}` : ''}${x.from ? ` · de ${x.from}` : ''}`}</T>
            </>
          ) : x.type === 'package' ? (
            <>
              <T v="h2" style={{ marginTop: 10 }}>{x.name}</T>
              <T v="muted">{`${x.serviceName} · ${x.sessions - x.used} de ${x.sessions} sesiones disponibles`}</T>
            </>
          ) : null}
          <Row style={{ justifyContent: 'space-between', marginTop: 14 }}>
            <T v="label" style={x.type === 'gift' ? { color: colors.paper, letterSpacing: 1.5 } : { letterSpacing: 1.5 }}>{x.code}</T>
            <Row gap={0}>
              <IconButton name="copy" label="Copiar código" color={x.type === 'gift' ? colors.paper : colors.ink} onPress={() => Clipboard.setStringAsync(x.code)} />
              <IconButton name="external" label="Compartir" color={x.type === 'gift' ? colors.paper : colors.ink} onPress={() => Share.share({ message: `Mi código de MAJOBELLA: ${x.code}` })} />
            </Row>
          </Row>
          {'expires' in x && x.expires ? <T v="muted" style={x.type === 'gift' ? { color: 'rgba(255,255,255,0.6)', fontSize: 13 } : { fontSize: 13 }}>{`Vence el ${longDate(x.expires)}`}</T> : null}
          {/activ|vigente/.test(x.status) ? <Button small kind={x.type === 'gift' ? 'outline' : 'solid'} title="Usar al reservar" style={{ marginTop: 12 }} onPress={() => use(x)} /> : null}
        </Card>
      ))}
    </Screen>
  );
}
