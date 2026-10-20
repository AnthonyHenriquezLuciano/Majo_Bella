/* Por revisar: transferencias con comprobante, reservas esperando pago, reembolsos pendientes y avisos del sistema */
import { useState } from 'react';
import { View } from 'react-native';
import { colors, space } from '@majobella/core';
import { Button, Card, Empty, Header, Notice, Row, Screen, Section, T } from '@majobella/ui';
import { isPendingTransfer, isRefundPending, useStudio } from '@/lib/studio-state';
import { ItemRow } from '@/components/item-row';

export default function Revisar() {
  const { data, loading, refresh, act } = useStudio();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  if (!data) return <Screen><T v="muted">Cargando…</T></Screen>;
  const now = Date.now();
  const proofs = data.items.filter(isPendingTransfer).sort((a, b) => a.start.localeCompare(b.start));
  const waiting = data.items.filter((a) => a.status === 'retenida' && a.payment.depositMethod === 'transferencia' && !(a.payment.transfer && a.payment.transfer.proof) && new Date(a.holdUntil || 0).getTime() > now);
  const refunds = data.items.filter(isRefundPending);
  const errors = data.errors.filter((e) => !e.resuelto);
  const nothing = !proofs.length && !waiting.length && !refunds.length && !errors.length;
  return (
    <Screen refreshing={loading} onRefresh={refresh} testID="revisar">
      <Header kicker="Pendientes" title="Por revisar" />
      {msg ? <Notice kind="ok" style={{ marginBottom: space.md }}>{msg}</Notice> : null}
      {nothing ? <Empty icon="check" title="Todo al día" text="Aquí aparecen las transferencias por confirmar, los reembolsos pendientes y los avisos del sistema." /> : null}
      {proofs.length ? <Section kicker="Transferencias por confirmar" style={{ marginTop: 0 }}>{proofs.map((a) => <ItemRow key={a.id} a={a} showDate />)}</Section> : null}
      {refunds.length ? <Section kicker="Reembolsos por devolver">{refunds.map((a) => <ItemRow key={a.id} a={a} showDate />)}</Section> : null}
      {waiting.length ? <Section kicker="Esperando la transferencia">{waiting.map((a) => <ItemRow key={a.id} a={a} showDate />)}</Section> : null}
      {errors.length ? (
        <Section kicker="Avisos del sistema" right={<Button small full={false} kind="link" title="Marcar todos resueltos" loading={busy} onPress={async () => {
          setBusy(true);
          try { await act('adminResolveErrors', { all: true }); await refresh(); setMsg('Avisos marcados como resueltos.'); } catch (e: any) { setMsg(e.message); } finally { setBusy(false); }
        }} />}>
          {errors.slice(0, 30).map((e) => (
            <Card key={e.row} style={{ marginBottom: 10, padding: 14, borderLeftWidth: 3, borderLeftColor: e.tipo === 'pago' ? colors.error : colors.ink }}>
              <Row style={{ justifyContent: 'space-between' }}><T v="kicker">{e.tipo}</T><T v="muted" style={{ fontSize: 12 }}>{String(e.fecha).slice(0, 10)}</T></Row>
              <T v="small" style={{ marginTop: 6 }}>{e.mensaje}</T>
              {e.ref ? <T v="muted" style={{ fontSize: 12.5, marginTop: 4 }}>{e.ref}</T> : null}
            </Card>
          ))}
        </Section>
      ) : null}
      <View style={{ height: space.lg }} />
    </Screen>
  );
}
