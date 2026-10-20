/* Cita (estudio): contacto, pagos, comprobante y acciones (completar, cobrar, mover, cancelar, recordar) */
import { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { colors, fmtDuration, fmtPrice, fmtTime12, fmtUSD, space, timeAt, whatsappUrl, whenText } from '@majobella/core';
import { Badge, Button, Card, Check, Chip, Divider, Empty, Field, Header, KV, ListRow, Notice, Row, Screen, Section, T, confirm } from '@majobella/ui';
import { adminSlots, api, isPendingTransfer, useStudio } from '@/lib/studio-state';
import { label, tone } from '@/components/item-row';

export default function CitaEstudio() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data, act } = useStudio();
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ k: 'ok' | 'error' | 'warn'; t: string; retry?: () => void } | null>(null);
  const [proof, setProof] = useState<{ uri: string; pdf: boolean } | null>(null);
  const [mode, setMode] = useState<'' | 'move' | 'cancel' | 'reject' | 'note'>('');
  const [day, setDay] = useState('');
  const [time, setTime] = useState('');
  const [notify, setNotify] = useState(true);
  const [refund, setRefund] = useState(true);
  const [reason, setReason] = useState('No recibimos la transferencia.');
  const [note, setNote] = useState('');
  const a = data ? data.items.find((x) => x.id === id) : null;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  useEffect(() => {
    if (!a || !a.proofId) return;
    api.post<{ mime: string; data: string }>({ action: 'adminFile', id: a.proofId }, 'No se pudo abrir el comprobante.')
      .then((f) => setProof({ uri: `data:${f.mime};base64,${f.data}`, pdf: f.mime === 'application/pdf' }))
      .catch(() => setProof(null));
  }, [a && a.proofId]);
  useEffect(() => { if (a) { setDay(a.date); setNote(a.internalNote || ''); } }, [a && a.id]);

  if (!data) return <Screen><Header title="Cita" onBack={back} /></Screen>;
  if (!a) return <Screen><Header title="Cita" onBack={back} /><Empty icon="calendar" title="No encontramos esta cita" /></Screen>;

  async function run(key: string, action: string, body: Record<string, any>, ok: string, onConflict?: () => void) {
    setBusy(key); setMsg(null);
    try { await act(action, { id: a!.id, ...body }); setMsg({ k: 'ok', t: ok }); setMode(''); }
    catch (e: any) {
      if (e.data && e.data.conflict && onConflict) setMsg({ k: 'warn', t: e.message, retry: onConflict });
      else setMsg({ k: 'error', t: e.message });
    } finally { setBusy(''); }
  }
  const op = (o: string, ok: string, extra: Record<string, any> = {}) => run(o, 'adminUpdate', { op: o, ...extra }, ok);

  const pendingTransfer = isPendingTransfer(a) || (a.status === 'retenida' && a.payment.depositMethod === 'transferencia');
  const active = ['confirmada', 'por-confirmar', 'retenida'].includes(a.status);
  const balanceDue = a.payment.balanceStatus !== 'pagado' && a.payment.balanceRD > 0 && ['confirmada', 'completada', 'no-asistio'].includes(a.status);
  const phone = (a.client.phone || '').replace(/\D/g, '');
  const wa = phone.length === 10 ? `1${phone}` : phone;
  const first = (a.client.name || '').split(' ')[0];
  const slots = mode === 'move' && day ? adminSlots(data, day, a.durationMinutes, a.id) : null;

  return (
    <Screen testID="cita-estudio">
      <Header title={a.client.name || 'Cita'} kicker={a.id} onBack={back} />
      <Row gap={8} style={{ marginTop: -10, marginBottom: space.md, flexWrap: 'wrap' }}>
        <Badge label={label(a)} tone={tone(a)} />
        {a.createdBy === 'estudio' ? <Badge label="Creada por el estudio" tone="soft" /> : <Badge label={a.channel === 'app' ? 'Reservó en la app' : 'Reservó en la web'} tone="soft" />}
      </Row>
      <T v="h2">{whenText(a.date, a.time)}</T>
      <T v="muted" style={{ marginTop: 2 }}>{`Hasta las ${fmtTime12(timeAt(a.end))} · ${fmtDuration(a.durationMinutes)}`}</T>
      {msg ? (
        <Notice kind={msg.k === 'warn' ? 'warn' : msg.k} style={{ marginTop: space.md }}>
          <T v="small">{msg.t}</T>
          {msg.retry ? <Button small kind="outline" title="Guardar igual" style={{ marginTop: 10 }} onPress={msg.retry} /> : null}
        </Notice>
      ) : null}

      {/* Contacto */}
      <Row gap={10} style={{ marginTop: space.md }}>
        {wa ? <Button small kind="outline" icon="whatsapp" title="WhatsApp" style={{ flex: 1 }} onPress={() => Linking.openURL(whatsappUrl(`Hola ${first}, te escribimos de MAJOBELLA sobre tu cita del ${whenText(a.date, a.time)}.`, wa))} /> : null}
        {phone ? <Button small kind="outline" icon="phone" title="Llamar" style={{ flex: 1 }} onPress={() => Linking.openURL(`tel:${a.client.phone.replace(/[^\d+]/g, '')}`)} /> : null}
      </Row>

      <Card style={{ marginTop: space.md }}>
        {a.services.map((s) => <KV key={s.id} k={s.name} v={fmtPrice(s.price)} />)}
        <Divider style={{ marginVertical: 8 }} />
        {a.payment.discountRD > 0 ? <KV k={a.code ? `Descuento (${a.code})` : 'Descuento'} v={`−${fmtPrice(a.payment.discountRD)}`} /> : null}
        {a.payment.giftRD > 0 ? <KV k={`Tarjeta ${a.giftCode}`} v={`−${fmtPrice(a.payment.giftRD)}`} /> : null}
        <KV k="Total" v={fmtPrice(a.totalPrice)} strong />
        <KV k="Depósito" v={a.payment.depositRD > 0 ? `${fmtPrice(a.payment.depositRD)} · ${a.payment.depositPaid ? (a.payment.depositMethod || 'pagado') : 'pendiente'}${a.payment.depositMethod === 'paypal' && a.payment.depositUSD ? ` (${fmtUSD(a.payment.depositUSD)})` : ''}` : '—'} />
        <KV k="Saldo" v={a.payment.balanceStatus === 'pagado' ? `Pagado${a.payment.balanceMethod ? ` · ${a.payment.balanceMethod}` : ''}` : fmtPrice(a.payment.balanceRD)} strong={balanceDue} />
        {a.payment.refundDetail ? <KV k="Reembolso" v={a.payment.refundDetail} /> : null}
      </Card>

      <Card style={{ marginTop: space.md }}>
        {a.client.phone ? <KV k="Teléfono" v={a.client.phone} /> : null}
        {a.client.email ? <KV k="Correo" v={a.client.email} /> : null}
        {a.origin ? <KV k="Nos conoció por" v={a.origin} /> : null}
        {a.consent && a.consent.needed ? <KV k="Consentimiento" v={a.consent.signed ? 'Firmado' : 'Sin firmar'} /> : null}
        {a.rescheduledFrom ? <KV k="Antes era" v={a.rescheduledFrom} /> : null}
        {a.client.notes ? <T v="small" style={{ marginTop: 8 }}>{`Nota de la clienta: ${a.client.notes}`}</T> : null}
        {a.internalNote ? <T v="small" style={{ marginTop: 8, color: colors.muted }}>{`Nota interna: ${a.internalNote}`}</T> : null}
      </Card>

      {/* Transferencia por revisar */}
      {pendingTransfer ? (
        <Section kicker="Transferencia">
          <Card>
            {proof ? (proof.pdf ? <T v="small">El comprobante es un PDF: ábrelo en el panel web.</T> : <Image source={{ uri: proof.uri }} style={{ width: '100%', aspectRatio: 3 / 4, backgroundColor: colors.sand }} contentFit="contain" accessibilityLabel="Comprobante de la transferencia" />)
              : <T v="muted">{a.proofId ? 'Cargando el comprobante…' : 'La clienta aún no envió el comprobante.'}</T>}
            {a.transferRef ? <KV k="Referencia" v={a.transferRef} style={{ marginTop: 8 }} /> : null}
            {a.payment.transfer && a.payment.transfer.account ? <KV k="Cuenta" v={(data.accounts.find((x) => x.id === a.payment.transfer!.account) || { banco: a.payment.transfer.account }).banco} /> : null}
          </Card>
          <Row gap={10} style={{ marginTop: space.md }}>
            <Button testID="reject" kind="outline" title="Rechazar" style={{ flex: 1 }} onPress={() => setMode(mode === 'reject' ? '' : 'reject')} />
            <Button testID="approve" title="Confirmar pago" icon="check" style={{ flex: 1.4 }} loading={busy === 'tconf'} onPress={() => {
              const go = (force?: boolean) => run('tconf', 'adminTransferReview', { decision: 'confirmar', force: !!force }, 'Pago confirmado. Le avisamos a la clienta.', () => go(true));
              go();
            }} />
          </Row>
          {mode === 'reject' ? (
            <Card style={{ marginTop: space.md }}>
              <T v="label" style={{ marginBottom: 8 }}>Motivo (se lo enviamos a la clienta)</T>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                {['No recibimos la transferencia.', 'El monto no coincide.', 'El comprobante no se ve bien.'].map((r) => <Chip key={r} label={r} selected={reason === r} onPress={() => setReason(r)} />)}
              </View>
              <Button kind="danger" title="Rechazar y liberar el horario" loading={busy === 'trej'} onPress={() => run('trej', 'adminTransferReview', { decision: 'rechazar', reason }, 'Transferencia rechazada. El horario quedó libre.')} />
            </Card>
          ) : null}
        </Section>
      ) : null}

      {/* Acciones */}
      <Section kicker="Acciones">
        {a.status === 'confirmada' ? <ListRow testID="complete" icon="check" title="Marcar como completada" onPress={() => op('completar', 'Cita completada.')} /> : null}
        {balanceDue ? <ListRow testID="cash" icon="card" title={`Cobré el saldo en efectivo (${fmtPrice(a.payment.balanceRD)})`} onPress={() => op('saldoEfectivo', 'Saldo cobrado en efectivo.')} /> : null}
        {balanceDue ? <ListRow icon="bank" title="Cobré el saldo por transferencia" onPress={() => op('saldoTransferencia', 'Saldo cobrado por transferencia.')} /> : null}
        {a.status === 'confirmada' && new Date(a.start).getTime() < Date.now() ? <ListRow icon="close" title="No asistió" onPress={() => op('noAsistio', 'Marcada como no asistió.')} /> : null}
        {['completada', 'no-asistio'].includes(a.status) ? <ListRow icon="refresh" title="Volver a confirmada" onPress={() => op('reabrir', 'La cita volvió a confirmada.')} /> : null}
        {a.payment.balanceStatus === 'pagado' && a.payment.balanceMethod && a.payment.balanceMethod !== 'paypal' ? <ListRow icon="refresh" title="Marcar saldo como pendiente" onPress={() => op('saldoPendiente', 'Saldo marcado como pendiente.')} /> : null}
        {a.payment.refund === 'pendiente' ? <ListRow icon="check" title="Ya devolví el depósito" onPress={() => op('reembolsoHecho', 'Reembolso anotado.')} /> : null}
        {a.status === 'confirmada' && a.client.email && new Date(a.start).getTime() > Date.now() ? <ListRow icon="mail" title="Enviar recordatorio por correo" sub={a.reminderAt ? `Último: ${String(a.reminderAt).slice(0, 10)}` : undefined} onPress={() => run('rem', 'adminSendReminder', {}, 'Recordatorio enviado.')} /> : null}
        {active ? <ListRow testID="move" icon="edit" title="Mover a otro día u hora" onPress={() => setMode(mode === 'move' ? '' : 'move')} /> : null}
        <ListRow icon="edit" title="Nota interna" sub={a.internalNote || 'Solo la ve el estudio'} onPress={() => setMode(mode === 'note' ? '' : 'note')} />
        {a.status !== 'cancelada' && a.status !== 'expirada' ? <ListRow testID="cancel" icon="trash" title="Cancelar cita" danger onPress={() => setMode(mode === 'cancel' ? '' : 'cancel')} /> : null}
      </Section>

      {mode === 'move' ? (
        <Card style={{ marginTop: space.md }}>
          <Field label="Nuevo día (AAAA-MM-DD)" value={day} onChangeText={(v) => { setDay(v.trim()); setTime(''); }} autoCapitalize="none" placeholder="2026-10-25" />
          {slots && /^\d{4}-\d{2}-\d{2}$/.test(day) ? (
            <>
              {slots.closed ? <T v="muted" style={{ marginBottom: 8 }}>Ese día el estudio está cerrado; puedes moverla igual.</T> : null}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {slots.slots.map((s) => <Chip key={s.time} label={fmtTime12(s.time)} selected={time === s.time} sub={s.busy ? 'ocupado' : undefined} onPress={() => setTime(s.time)} style={s.busy ? { opacity: 0.6 } : undefined} />)}
              </View>
            </>
          ) : null}
          <Check checked={notify} onChange={setNotify}>Avisar a la clienta por correo</Check>
          <Button title="Mover cita" style={{ marginTop: 10 }} disabled={!time} loading={busy === 'move'} onPress={() => {
            const go = (force?: boolean) => run('move', 'adminReschedule', { date: day, time, notify, force: !!force }, `Cita movida al ${whenText(day, time)}.`, () => go(true));
            go();
          }} />
        </Card>
      ) : null}

      {mode === 'note' ? (
        <Card style={{ marginTop: space.md }}>
          <Field label="Nota interna" value={note} onChangeText={setNote} multiline maxLength={500} />
          <Button title="Guardar nota" loading={busy === 'nota'} onPress={() => run('nota', 'adminUpdate', { op: 'nota', note }, 'Nota guardada.')} />
        </Card>
      ) : null}

      {mode === 'cancel' ? (
        <Card style={{ marginTop: space.md }}>
          <T v="body">¿Cancelar esta cita? El horario queda libre.</T>
          {a.payment.depositPaid ? <Check checked={refund} onChange={setRefund}>{a.payment.depositMethod === 'paypal' ? 'Devolver el depósito en PayPal ahora' : 'Devolver el depósito (lo anotamos como pendiente)'}</Check> : null}
          <Check checked={notify} onChange={setNotify}>Avisar a la clienta por correo</Check>
          <Button kind="danger" title="Cancelar cita" style={{ marginTop: 10 }} loading={busy === 'cancelar'} onPress={async () => {
            if (!(await confirm('¿Cancelar la cita?', `${a.client.name} · ${whenText(a.date, a.time)}`, 'Cancelar cita', 'Volver', true))) return;
            op('cancelar', 'Cita cancelada.', { refund, notify });
          }} />
        </Card>
      ) : null}
      <View style={{ height: space.xl }} />
    </Screen>
  );
}
