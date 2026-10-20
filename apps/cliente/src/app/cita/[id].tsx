/* Detalle de una cita: estado, pagos, cómo prepararse y acciones (calendario, cambiar, cancelar, pagar saldo, comprobante) */
import { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  CONFIG, colors, fmtDuration, fmtPrice, fmtTime12, space, whatsappUrl, whenText,
} from '@majobella/core';
import { Badge, Button, Card, Divider, Empty, Header, Icon, KV, ListRow, Notice, Row, Screen, Section, T, confirm, inform } from '@majobella/ui';
import { api, useApp } from '@/lib/app-state';
import { addToCalendar } from '@/lib/calendar';
import { payWithPayPal } from '@/lib/paypal';
import { statusLabel, statusTone } from '@/components/appointment-card';
import { DayStrip, TimeSlots } from '@/components/day-time';
import { TransferPanel } from '@/components/transfer-panel';

export default function Cita() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const app = useApp();
  const { studio } = app;
  const a = app.appointments.find((x) => x.id === id);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [mode, setMode] = useState<'' | 'move' | 'proof'>('');
  const [day, setDay] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/citas'));

  useEffect(() => { if (mode === 'move') app.refreshBusy(true); }, [mode]);

  if (!a) {
    return <Screen><Header title="Cita" onBack={back} />{app.loadingAppointments ? <T v="muted">Cargando…</T> : <Empty icon="calendar" title="No encontramos esta cita" text="Puede que se haya reservado con otra cuenta." />}</Screen>;
  }
  const auth = app.authFor(a);
  const start = new Date(a.start).getTime();
  const hoursLeft = (start - Date.now()) / 3600000;
  const future = start > Date.now();
  const active = a.status === 'confirmada' || a.status === 'por-confirmar';
  const changeH = studio.payments.cancelHours || CONFIG.policies.changeHours;
  const canMove = active && future && a.changes.used < a.changes.max && hoursLeft >= changeH;
  const canCancel = active && future;
  const needsProof = a.status === 'retenida' && a.payment.transfer && !a.payment.transfer.proof;
  const balanceDue = (a.status === 'confirmada' || a.status === 'completada') && a.payment.balanceStatus !== 'pagado' && a.payment.balanceRD > 0 && start <= Date.now() + 15 * 60000;
  const svcInfo = a.services.map((s) => studio.byId[s.id]).filter(Boolean);
  const prep = [...new Set(svcInfo.flatMap((s) => s.prep || []))];
  const after = [...new Set(svcInfo.flatMap((s) => s.aftercare || []))];

  async function run(label: string, fn: () => Promise<string | void>) {
    setBusy(label); setMsg(null);
    try { const t = await fn(); if (t) setMsg({ kind: 'ok', text: t }); }
    catch (e: any) { setMsg({ kind: 'error', text: e.message }); }
    finally { setBusy(''); }
  }

  const cancel = async () => {
    const late = hoursLeft < changeH;
    const ok = await confirm('¿Cancelar tu cita?', late
      ? `Faltan menos de ${changeH} horas: según la política de cancelación, el depósito no se devuelve.`
      : a.payment.depositPaid ? 'Te devolveremos el depósito en PayPal en unos días.' : 'Tu horario quedará libre para otra persona.', 'Cancelar cita', 'Volver', true);
    if (!ok) return;
    run('cancel', async () => {
      const r = await api.cancel(a.id, auth);
      if (r.appointment) app.upsertAppointment(r.appointment);
      app.refreshBusy(true);
      return r.refunded ? 'Cita cancelada. Te devolvimos el depósito en PayPal.' : r.refundManual ? 'Cita cancelada. Te devolveremos el depósito en unos días.' : 'Cita cancelada.';
    });
  };

  const move = () => run('move', async () => {
    if (!day || !time) throw new Error('Elige el nuevo día y la hora.');
    const r = await api.reschedule(a.id, auth, day, time);
    app.upsertAppointment(r.appointment);
    app.refreshBusy(true);
    setMode(''); setDay(null); setTime(null);
    return `Listo: tu cita ahora es el ${whenText(r.appointment.date, r.appointment.time)}.`;
  });

  const payBalance = () => run('balance', async () => {
    const o = await api.balanceOrder(a.id, auth);
    const res = await payWithPayPal(o.approveUrl);
    if (res === 'cancel') return 'Pago cancelado. No se te cobró.';
    try {
      const c = await api.balanceCapture(a.id, o.orderId, auth);
      app.upsertAppointment(c.appointment);
      return '¡Gracias! Recibimos el pago del saldo.';
    } catch (e: any) {
      if (res === 'dismiss') return 'No se completó el pago. No se te cobró.';
      throw e;
    }
  });

  if (mode === 'proof' && studio.catalog) {
    return <TransferPanel
      h={{ id: a.id, manageToken: a.token, accounts: studio.catalog.transfer.accounts || [], depositRD: a.payment.depositRD, expiresAt: a.payment.transfer ? a.payment.transfer.deadline : '' }}
      auth={auth}
      laterLabel="Volver a la cita"
      onDone={(x) => { app.upsertAppointment(x); setMode(''); setMsg({ kind: 'ok', text: 'Recibimos tu comprobante. Te avisaremos al confirmarlo.' }); }}
      onLater={() => setMode('')}
    />;
  }

  return (
    <Screen testID="cita">
      <Header title={whenText(a.date)} kicker={`Reserva ${a.id}`} onBack={back} />
      <Row gap={10} style={{ marginTop: -10, marginBottom: space.lg }}>
        <Badge label={statusLabel(a)} tone={statusTone(a)} />
        <T v="muted">{`${fmtTime12(a.time)} · ${fmtDuration(a.durationMinutes)}`}</T>
      </Row>
      {msg ? <Notice kind={msg.kind} style={{ marginBottom: space.md }}>{msg.text}</Notice> : null}

      {needsProof ? (
        <Notice kind="warn" title="Falta tu comprobante" style={{ marginBottom: space.md }}>
          <T v="small">{`Envía la foto de la transferencia de ${fmtPrice(a.payment.depositRD)} para confirmar tu cita.`}</T>
          <Button small title="Enviar comprobante" icon="upload" style={{ marginTop: 10 }} onPress={() => setMode('proof')} />
        </Notice>
      ) : null}
      {a.status === 'por-confirmar' ? <Notice style={{ marginBottom: space.md }}>Recibimos tu comprobante. Te avisaremos en cuanto confirmemos el pago.</Notice> : null}
      {a.consent && a.consent.needed && !a.consent.signed && a.consent.url && active ? (
        <Notice kind="warn" title="Firma tu consentimiento" style={{ marginBottom: space.md }}>
          <T v="small">Este servicio necesita tu consentimiento firmado antes de la cita.</T>
          <Button small kind="outline" title="Firmar ahora" style={{ marginTop: 10 }} onPress={() => Linking.openURL(a.consent.url)} />
        </Notice>
      ) : null}

      <Card>
        <T v="kicker">Servicios</T>
        {a.services.map((s) => <KV key={s.id} k={s.name} v={fmtPrice(s.price)} />)}
        <Divider style={{ marginVertical: 10 }} />
        {a.payment.discountRD > 0 ? <KV k="Descuento" v={`−${fmtPrice(a.payment.discountRD)}`} /> : null}
        {a.payment.giftRD > 0 ? <KV k="Tarjeta de regalo" v={`−${fmtPrice(a.payment.giftRD)}`} /> : null}
        {a.bono ? <KV k={`Paquete ${a.bono.code}`} v={`−${fmtPrice(a.bono.amountRD)}`} /> : null}
        <KV k="Total" v={fmtPrice(a.totalPrice)} strong />
        <KV k="Depósito" v={a.payment.depositRD > 0 ? `${fmtPrice(a.payment.depositRD)} · ${a.payment.depositPaid ? 'pagado' : 'pendiente'}` : '—'} />
        <KV k="Saldo" v={a.payment.balanceStatus === 'pagado' ? 'Pagado' : `${fmtPrice(a.payment.balanceRD)} al terminar`} />
        {a.payment.refund ? <KV k="Devolución" v={a.payment.refund === 'reembolsado' ? 'Devuelto en PayPal' : a.payment.refund === 'pendiente' ? 'En proceso' : 'No aplica'} /> : null}
      </Card>

      {balanceDue ? <Button testID="pay-balance" title={`Pagar saldo ${fmtPrice(a.payment.balanceRD)} con PayPal`} icon="card" loading={busy === 'balance'} style={{ marginTop: space.md }} onPress={payBalance} /> : null}

      {active && future ? (
        <Section kicker="Tu cita" style={{ marginTop: space.lg }}>
          <ListRow icon="calendar" title="Añadir a mi calendario" onPress={() => addToCalendar(a).then(() => setMsg({ kind: 'ok', text: 'Añadida a tu calendario.' })).catch((e) => inform('Calendario', e.message))} />
          <ListRow icon="map" title="Cómo llegar" sub={CONFIG.contact.address} onPress={() => Linking.openURL(CONFIG.contact.mapsUrl)} />
          <ListRow icon="whatsapp" title="Escribir por WhatsApp" onPress={() => Linking.openURL(whatsappUrl(`Hola, tengo una pregunta sobre mi cita ${a.id} (${whenText(a.date, a.time)}).`))} />
          {canMove ? <ListRow testID="move" icon="edit" title="Cambiar día u hora" sub={a.changes.max - a.changes.used === 1 ? 'Puedes cambiarla 1 vez' : `Te quedan ${a.changes.max - a.changes.used} cambios`} onPress={() => setMode(mode === 'move' ? '' : 'move')} /> : null}
          {active && future && !canMove ? <ListRow icon="info" title="Cambiar la cita" sub={hoursLeft < changeH ? `Faltan menos de ${changeH} horas: escríbenos por WhatsApp.` : 'Ya usaste tus cambios: escríbenos por WhatsApp.'} /> : null}
          {canCancel ? <ListRow testID="cancel" icon="close" title="Cancelar cita" danger onPress={cancel} right={busy === 'cancel' ? <T v="muted">…</T> : undefined} /> : null}
        </Section>
      ) : null}

      {mode === 'move' ? (
        <Card style={{ marginTop: space.md }}>
          <T v="h3" style={{ marginBottom: 10 }}>Elige el nuevo día</T>
          <DayStrip studio={studio} minutes={a.durationMinutes} value={day} onChange={(k) => { setDay(k); setTime(null); }} />
          {day ? (
            <View style={{ marginTop: space.md }}>
              <TimeSlots studio={studio} dateKey={day} minutes={a.durationMinutes} value={time} onChange={setTime} slots={studio.slotsFor(a, day).map((t) => ({ time: t, busy: false }))} />
            </View>
          ) : null}
          <Row gap={10} style={{ marginTop: space.md }}>
            <Button kind="ghost" title="Cerrar" style={{ flex: 1 }} onPress={() => setMode('')} />
            <Button title="Cambiar cita" style={{ flex: 1 }} disabled={!day || !time} loading={busy === 'move'} onPress={move} />
          </Row>
        </Card>
      ) : null}

      {future && prep.length && active ? (
        <Section kicker="Antes de tu cita">
          {prep.map((x) => <Row key={x} gap={10} style={{ alignItems: 'flex-start', marginBottom: 8 }}><Icon name="check" size={16} /><T v="body" style={{ flex: 1 }}>{x}</T></Row>)}
          <T v="muted">{`Llega ${CONFIG.policies.arriveEarlyMinutes} minutos antes.`}</T>
        </Section>
      ) : null}
      {!future && after.length && a.status === 'completada' ? (
        <Section kicker="Cuidados después">
          {after.map((x) => <Row key={x} gap={10} style={{ alignItems: 'flex-start', marginBottom: 8 }}><Icon name="heart" size={16} /><T v="body" style={{ flex: 1 }}>{x}</T></Row>)}
        </Section>
      ) : null}

      {needsProof && a.token ? (
        <ListRow icon="close" title="Liberar el horario" sub="Si ya no vas a transferir, deja el horario libre para otra persona." danger onPress={async () => {
          if (!(await confirm('¿Liberar el horario?', 'Tu reserva se cancela y el horario queda libre.', 'Liberar', 'Volver', true))) return;
          run('release', async () => { await api.release(a.id, a.token || ''); await app.refreshAppointments(); app.refreshBusy(true); return 'Listo, el horario quedó libre.'; });
        }} />
      ) : null}

      {!future || ['cancelada', 'expirada', 'completada', 'no-asistio'].includes(a.status) ? (
        <Button kind="outline" title="Reservar de nuevo" icon="calendar" style={{ marginTop: space.xl }} onPress={() => { app.setCart(a.services.map((s) => s.id).filter((x) => studio.byId[x])); router.navigate('/reservar'); }} />
      ) : null}
      <T v="muted" style={{ marginTop: space.lg, fontSize: 13, color: colors.faint }}>{`Puedes cambiar o cancelar hasta ${changeH} horas antes.`}</T>
    </Screen>
  );
}
