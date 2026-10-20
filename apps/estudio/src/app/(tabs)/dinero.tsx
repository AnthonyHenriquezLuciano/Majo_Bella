/* Dinero: lo cobrado (depósitos y saldos), los gastos y la ganancia del periodo */
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { addDaysKey, colors, fmtPrice, keyAt, space, todayKey } from '@majobella/core';
import { Button, Card, Chip, Field, Header, KV, Notice, Row, Screen, Section, T } from '@majobella/ui';
import { useStudio } from '@/lib/studio-state';

type Range = 'hoy' | 'semana' | 'mes';
function rangeOf(r: Range): [string, string] {
  const t = todayKey();
  if (r === 'hoy') return [t, t];
  if (r === 'semana') { const dow = new Date(`${t}T12:00:00Z`).getUTCDay(); const from = addDaysKey(t, -((dow + 6) % 7)); return [from, addDaysKey(from, 6)]; }
  return [`${t.slice(0, 7)}-01`, `${t.slice(0, 7)}-31`];
}

export default function Dinero() {
  const { data, loading, refresh, act } = useStudio();
  const [r, setR] = useState<Range>('semana');
  const [g, setG] = useState({ concepto: '', monto: '', categoria: 'Materiales' });
  const [msg, setMsg] = useState<{ k: 'ok' | 'error'; t: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const sum = useMemo(() => {
    if (!data) return null;
    const [from, to] = rangeOf(r);
    const inR = (iso?: string) => { if (!iso) return false; const k = keyAt(new Date(iso)); return k >= from && k <= to; };
    let deposits = 0, balances = 0, byMethod: Record<string, number> = {};
    const add = (m: string, v: number) => { byMethod[m || 'otro'] = (byMethod[m || 'otro'] || 0) + v; };
    data.items.forEach((a) => {
      if (a.payment.depositRD > 0 && inR(a.payment.depositPaidAt) && !/^reembolsado/.test(a.payment.refundDetail || '')) { deposits += a.payment.depositRD; add(a.payment.depositMethod, a.payment.depositRD); }
      if (a.payment.balanceStatus === 'pagado' && a.payment.balanceRD > 0 && inR(a.payment.balancePaidAt)) { balances += a.payment.balanceRD; add(a.payment.balanceMethod, a.payment.balanceRD); }
    });
    const exp = data.expenses.filter((e) => e.fecha >= from && e.fecha <= to);
    const spent = exp.reduce((t, e) => t + (Number(e.montoRD) || 0), 0);
    const done = data.items.filter((a) => a.date >= from && a.date <= to && a.status === 'completada').length;
    const pending = data.items.filter((a) => a.date >= from && a.date <= to && ['confirmada', 'completada'].includes(a.status) && a.payment.balanceStatus !== 'pagado').reduce((t, a) => t + (a.payment.balanceRD || 0), 0);
    return { from, to, deposits, balances, total: deposits + balances, spent, profit: deposits + balances - spent, byMethod, exp, done, pending };
  }, [data, r]);
  if (!data || !sum) return <Screen><T v="muted">Cargando…</T></Screen>;
  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      await act('adminSaveExpense', { expense: { concepto: g.concepto, montoRD: Number(g.monto), categoria: g.categoria, fecha: todayKey() } });
      await refresh(); setG({ concepto: '', monto: '', categoria: g.categoria }); setMsg({ k: 'ok', t: 'Gasto guardado.' });
    } catch (e: any) { setMsg({ k: 'error', t: e.message }); } finally { setBusy(false); }
  };
  return (
    <Screen refreshing={loading} onRefresh={refresh} testID="dinero">
      <Header kicker="Finanzas" title="Dinero" />
      <Row gap={8} style={{ marginBottom: space.lg }}>
        {(['hoy', 'semana', 'mes'] as Range[]).map((x) => <Chip key={x} label={x === 'hoy' ? 'Hoy' : x === 'semana' ? 'Esta semana' : 'Este mes'} selected={r === x} onPress={() => setR(x)} />)}
      </Row>
      <Card dark style={{ padding: 20 }}>
        <T v="kicker" style={{ color: 'rgba(255,255,255,0.7)' }}>Cobrado</T>
        <T v="display" style={{ color: colors.paper, marginTop: 6 }}>{fmtPrice(sum.total)}</T>
        <T v="small" style={{ color: 'rgba(255,255,255,0.75)' }}>{`Ganancia: ${fmtPrice(sum.profit)} · ${sum.done} ${sum.done === 1 ? 'cita completada' : 'citas completadas'}`}</T>
      </Card>
      <Card style={{ marginTop: space.md }}>
        <KV k="Depósitos" v={fmtPrice(sum.deposits)} />
        <KV k="Saldos" v={fmtPrice(sum.balances)} />
        <KV k="Gastos" v={`−${fmtPrice(sum.spent)}`} />
        <KV k="Por cobrar (saldos)" v={fmtPrice(sum.pending)} strong />
      </Card>
      {Object.keys(sum.byMethod).length ? (
        <Section kicker="Por forma de pago">
          <Card>{Object.entries(sum.byMethod).sort((a, b) => b[1] - a[1]).map(([m, v]) => <KV key={m} k={({ paypal: 'PayPal', efectivo: 'Efectivo', transferencia: 'Transferencia' } as Record<string, string>)[m] || m.charAt(0).toUpperCase() + m.slice(1)} v={fmtPrice(v)} />)}</Card>
        </Section>
      ) : null}
      <Section kicker="Anotar un gasto">
        {msg ? <Notice kind={msg.k} style={{ marginBottom: space.md }}>{msg.t}</Notice> : null}
        <Field label="Concepto" value={g.concepto} onChangeText={(v) => setG({ ...g, concepto: v })} placeholder="Pigmentos, alquiler, luz…" maxLength={120} />
        <Field label="Monto (RD$)" value={g.monto} onChangeText={(v) => setG({ ...g, monto: v.replace(/\D/g, '') })} keyboardType="number-pad" />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: space.md }}>
          {['Materiales', 'Local', 'Servicios', 'Publicidad', 'Otros'].map((c) => <Chip key={c} label={c} selected={g.categoria === c} onPress={() => setG({ ...g, categoria: c })} />)}
        </View>
        <Button title="Guardar gasto" icon="plus" loading={busy} disabled={!g.concepto.trim() || !Number(g.monto)} onPress={save} />
      </Section>
      {sum.exp.length ? (
        <Section kicker="Gastos del periodo">
          <Card>{sum.exp.map((e) => <KV key={e.id} k={`${e.fecha.slice(8)}/${e.fecha.slice(5, 7)} · ${e.concepto}`} v={fmtPrice(Number(e.montoRD) || 0)} />)}</Card>
        </Section>
      ) : null}
      <View style={{ height: space.lg }} />
    </Screen>
  );
}
