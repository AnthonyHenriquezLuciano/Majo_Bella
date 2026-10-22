/* Reservar: servicios → día y hora → tus datos → depósito (PayPal o transferencia) → listo */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, View, type ScrollViewInstance } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  CONFIG, Validate, colors, fmtDuration, fmtPrice, fmtServicePrice, fmtUSD, fonts, space, whenText,
  type Appointment, type ConsentSubmission, type HoldResult, type Pricing, type TransferAccount,
} from '@majobella/core';
import { Button, Card, Check, Chip, Divider, Field, Icon, KV, Notice, Row, Screen, T, inform } from '@majobella/ui';
import { api, useApp } from '@/lib/app-state';
import { payWithPayPal } from '@/lib/paypal';
import { addToCalendar } from '@/lib/calendar';
import { notificationsAllowed } from '@/lib/notify';
import { WEB_URL } from '@/lib/env';
import { DayStrip, FirstFree, MonthCalendar, TimeSlots } from '@/components/day-time';
import { TransferPanel } from '@/components/transfer-panel';
import { CatalogBrowser } from '@/components/catalog-browser';

type Step = 0 | 1 | 2 | 3 | 4;
const STEPS = ['Servicios', 'Día y hora', 'Tus datos', 'Depósito'];
const ORIGENES = ['Instagram', 'TikTok', 'Google', 'Recomendación de una amiga', 'Pasé por el estudio', 'Otro'];

export default function Reservar() {
  const app = useApp();
  const { studio, cart, setCart, toggleCart, client, session } = app;
  const router = useRouter();
  const params = useLocalSearchParams<{ servicio?: string; codigo?: string }>();
  const scroll = useRef<ScrollViewInstance>(null);
  const [step, setStep] = useState<Step>(0);
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [showCal, setShowCal] = useState(false);
  const [f, setF] = useState({ first: '', last: '', phone: '', email: '', notes: '', bd: '', bm: '', origen: '' });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [remember, setRemember] = useState(true);
  const [codeInput, setCodeInput] = useState('');
  const [codes, setCodes] = useState<{ code: string; gift: string }>({ code: '', gift: '' });
  const [codeMsg, setCodeMsg] = useState('');
  const [server, setServer] = useState<{ sig: string; pricing: Pricing } | null>(null);
  const [method, setMethod] = useState<'paypal' | 'transferencia'>('paypal');
  const [terms, setTerms] = useState(false);
  const [consentAnswers, setConsentAnswers] = useState<Record<string,Record<string,'si'|'no'>>>({});
  const [consentAccepted, setConsentAccepted] = useState<Record<string,boolean>>({});
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [transfer, setTransfer] = useState<(HoldResult & { accounts: TransferAccount[] }) | null>(null);
  const [done, setDone] = useState<Appointment | null>(null);
  const [waitFor, setWaitFor] = useState('');
  const [waitMsg, setWaitMsg] = useState('');

  const t = studio.totals(cart);
  const minutes = t.minutes || studio.schedule.slotStepMinutes;
  const sig = `${cart.join(',')}|${codes.code}|${codes.gift}`;
  const pricing: Pricing = server && server.sig === sig ? server.pricing : studio.pricing(cart);
  const cat = studio.catalog;
  const requiredConsentIds = [...new Set(t.items.map(s=>s.consentTemplateId).filter((v):v is string=>!!v))];
  const consentTemplates = requiredConsentIds.map(id=>cat?.consentTemplates?.find(x=>x.id===id));
  const consentMissing = consentTemplates.some(temp=>!temp);
  const blocked = consentTemplates.flatMap(temp=>temp?.preguntas.map(q=>({question:q,answer:consentAnswers[temp.id]?.[q.id]}))||[])
    .find(row=>row.question.stopOn && row.question.stopOn===row.answer);
  const consentValid = !consentMissing && !blocked && consentTemplates.every(temp=>temp &&
    consentAccepted[temp.id] && temp.preguntas.every(q=>['si','no'].includes(consentAnswers[temp.id]?.[q.id])));
  const consents:ConsentSubmission[] = consentTemplates.filter((v):v is NonNullable<typeof v>=>!!v).map(temp=>({
    templateId:temp.id,name:Validate.fullName(f.first,f.last),accepted:!!consentAccepted[temp.id],answers:consentAnswers[temp.id]||{},
  }));
  const transferOn = !!(cat && cat.transfer && cat.transfer.enabled);
  const waitOn = !!(cat && cat.waitlist && cat.waitlist.enabled);
  const dayFull = !!(date && studio.busyAt && studio.isOpenDay(date) && !studio.slots(date, minutes).some((x) => !x.busy));

  // Enlaces majobella://reservar?servicio=cejas&codigo=…
  useEffect(() => {
    if (params.servicio) setCart(String(params.servicio).split(',').filter((id) => studio.byId[id]));
    if (params.codigo) setCodeInput(String(params.codigo).toUpperCase());
  }, [params.servicio, params.codigo]);

  // Datos guardados o de la cuenta
  useEffect(() => {
    const src = client || (session ? { name: session.name, email: session.email, phone: '' } : null);
    if (!src) return;
    const n = Validate.splitName(src.name || '');
    setF((x) => ({
      ...x,
      first: x.first || (client && client.firstName) || n.first, last: x.last || (client && client.lastName) || n.last,
      phone: x.phone || src.phone || '', email: x.email || src.email || '',
      bm: x.bm || (client && client.birthday ? client.birthday.split('-')[0] : ''), bd: x.bd || (client && client.birthday ? client.birthday.split('-')[1] : ''),
    }));
  }, [client, session]);

  const refreshBusy = app.refreshBusy;
  useFocusEffect(useCallback(() => { refreshBusy(); }, [refreshBusy]));
  useEffect(() => { if (time && date && studio.busyAt && studio.isBusy(date, time, minutes)) setTime(null); }, [app.version]);
  useEffect(() => {
    setTime(null); setServer(null); setConsentAnswers({}); setConsentAccepted({});
    // Si eligió servicios nuevos después de reservar, empieza una reserva nueva
    if (cart.length && step === 4) { setDone(null); setDate(null); setTerms(false); setStep(0); }
  }, [cart.join(',')]);

  const go = (s: Step) => { setStep(s); setError(''); requestAnimationFrame(() => scroll.current && scroll.current.scrollTo({ y: 0, animated: true })); };

  /* ---- Paso 3: validar datos ---- */
  function validateData(quiet = false) {
    const e: Record<string, string> = {};
    const a = Validate.namePart(f.first, 'nombre'); if (a) e.first = a;
    const b = Validate.namePart(f.last, 'apellido'); if (b) e.last = b;
    if (!Validate.phone(f.phone).ok) e.phone = Validate.phoneError;
    if (!Validate.email(f.email)) e.email = Validate.emailError;
    if ((f.bd || f.bm) && !(Number(f.bd) >= 1 && Number(f.bd) <= 31 && Number(f.bm) >= 1 && Number(f.bm) <= 12)) e.bday = 'Escribe el día y el mes (por ejemplo 14 y 3), o déjalo vacío.';
    if (!quiet) setErrs(e);
    return !Object.keys(e).length;
  }

  /* Lista de espera: si el día está lleno, te avisamos cuando se libere un horario */
  async function joinWait(day: string) {
    if (!validateData(true)) { setWaitFor(day); go(2); return; }
    setBusy('Guardando tu lugar…'); setError('');
    try {
      const r = await api.waitlistJoin({ date: day, franja: 'cualquiera', services: cart, client: clientData() });
      setWaitMsg((r as any).already ? 'Ya estabas en la lista de espera de ese día. Te avisaremos.' : `Listo: si se libera un horario el ${whenText(day)}, te avisamos por correo${session ? ' y en la app' : ''}.`);
      setWaitFor('');
      if (step !== 1) go(1);
    } catch (e: any) { setError(e.message); } finally { setBusy(''); }
  }
  const clientData = () => ({
    name: Validate.fullName(f.first, f.last), firstName: Validate.properName(f.first), lastName: Validate.properName(f.last),
    phone: Validate.phone(f.phone).value, email: f.email.trim().toLowerCase(), notes: f.notes.trim(),
    birthday: f.bd && f.bm ? `${String(f.bm).padStart(2, '0')}-${String(f.bd).padStart(2, '0')}` : '',
  });

  /* ---- Código de descuento, tarjeta de regalo o paquete ---- */
  async function applyCode() {
    const v = codeInput.trim().toUpperCase().replace(/\s+/g, '');
    if (!v) return;
    setCodeMsg('Revisando…');
    try {
      const res = await api.checkCode(cart, v, v, null);
      const pr = res.pricing;
      let next = { ...codes }, msg = '';
      if (pr.giftStatus === 'ok' && pr.giftKind === 'bono') { next.gift = v; msg = `Paquete aplicado: ${pr.bonoName}. Te quedan ${pr.bonoLeft} ${pr.bonoLeft === 1 ? 'sesión' : 'sesiones'} (esta incluida).`; }
      else if (pr.giftStatus === 'notApplicable') msg = 'Ese paquete es para otro servicio. Añade ese servicio a tu cita para usarlo.';
      else if (pr.giftStatus === 'ok') { next.gift = v; msg = `Tarjeta de regalo aplicada: ${fmtPrice(Math.min(pr.giftBalanceRD || 0, pr.totalRD))} de ${fmtPrice(pr.giftBalanceRD || 0)} disponibles.`; }
      else if (pr.codeStatus === 'ok') { next.code = v; msg = `Código aplicado${pr.promoName ? `: ${pr.promoName}` : ''}.`; }
      else if (pr.codeStatus === 'notBetter') { next.code = v; msg = 'Tu cita ya tiene un descuento mayor; siempre se aplica el mejor.'; }
      else if (pr.codeStatus === 'notApplicable') { next.code = v; msg = 'Ese código no aplica a los servicios que elegiste por ahora.'; }
      else msg = 'No encontramos ese código o ya venció.';
      setCodeMsg(msg);
      if (next.code !== codes.code || next.gift !== codes.gift) {
        setCodeInput('');
        setCodes(next);
        const r2 = await api.checkCode(cart, next.code, next.gift, null);
        setServer({ sig: `${cart.join(',')}|${next.code}|${next.gift}`, pricing: { ...r2.pricing, depositUSD: Number(r2.pricing.depositUSD) } });
      }
    } catch (e: any) { setCodeMsg(e.message); }
  }
  async function clearCode(kind: 'code' | 'gift') {
    const next = { ...codes, [kind]: '' };
    setCodes(next); setCodeMsg('');
    if (next.code || next.gift) {
      try { const r = await api.checkCode(cart, next.code, next.gift, null); setServer({ sig: `${cart.join(',')}|${next.code}|${next.gift}`, pricing: { ...r.pricing, depositUSD: Number(r.pricing.depositUSD) } }); } catch (e) { setServer(null); }
    } else setServer(null);
  }

  /* ---- Reservar y pagar ---- */
  async function finish(a: Appointment, h: HoldResult) {
    await app.addGuest({ id: h.id, token: h.manageToken }, a);
    if (remember) await app.saveClient({ ...clientData(), notes: '' });
    setDone(a);
    setCart([]); setCodes({ code: '', gift: '' }); setServer(null); setCodeMsg('');
    app.refreshBusy(true);
    go(4);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    notificationsAllowed(true).catch(() => {});
  }

  async function book() {
    if (!consentValid) { setError('Completa el consentimiento antes de continuar al pago.'); return; }
    if (!terms) { setError('Acepta los términos y la política de cancelación para continuar.'); return; }
    if (!date || !time) { go(1); return; }
    setError(''); setBusy(method === 'paypal' ? 'Preparando el pago…' : 'Apartando tu horario…');
    let h: HoldResult | null = null;
    try {
      h = await api.hold({ services: cart, date, time, client: clientData(), code: codes.code, giftCode: codes.gift, origen: f.origen, canal: 'app', method, consents });
      if (h.confirmed && h.appointment) { await finish(h.appointment, h); return; }
      if (h.transfer) {
        await app.addGuest({ id: h.id, token: h.manageToken });
        setTransfer({ ...h, accounts: h.accounts || [] });
        if (remember) await app.saveClient({ ...clientData(), notes: '' });
        setCart([]); app.refreshBusy(true);
        return;
      }
      setBusy('Abriendo PayPal…');
      const r = await payWithPayPal(h.approveUrl || '');
      if (r === 'cancel') { await api.release(h.id, h.manageToken); setError('Pago cancelado. No se te cobró y el horario quedó libre.'); app.refreshBusy(true); return; }
      setBusy('Confirmando tu pago…');
      try {
        const c = await api.capture(h.id, h.orderId || '');
        await finish(c.appointment, h);
      } catch (e: any) {
        if (r === 'dismiss') { await api.release(h.id, h.manageToken); setError('No se completó el pago. No se te cobró y el horario quedó libre.'); app.refreshBusy(true); }
        else setError(`${e.message} Si se te cobró, escríbenos por WhatsApp con este código: ${h.id}.`);
      }
    } catch (e: any) {
      setError(e.message);
      if (/acaba de reservarse|ocupó|ocupado/i.test(e.message)) { setTime(null); app.refreshBusy(true); }
    } finally { setBusy(''); }
  }

  /* ---------- Pantallas ---------- */
  if (transfer) return <TransferPanel h={transfer} onDone={(a) => { setTransfer(null); setDone(a); go(4); }} onLater={() => { setTransfer(null); setDate(null); setTime(null); setTerms(false); go(0); router.navigate('/citas'); }} />;

  if (step === 4 && done) return <Done a={done} onAgain={() => { setDone(null); setDate(null); setTime(null); setTerms(false); go(0); }} />;

  return (
    <Screen ref={scroll} testID="reservar" footer={
      <View style={S.footer}>
        <View style={{ flex: 1 }}>
          <T v="muted" style={{ fontSize: 13 }} numberOfLines={1}>{t.items.length ? `${t.items.length} ${t.items.length === 1 ? 'servicio' : 'servicios'} · ${fmtDuration(t.minutes)}` : 'Elige tus servicios'}</T>
          <T v="price">{t.items.length ? `${t.hasFrom ? 'Desde ' : ''}${fmtPrice(pricing.totalRD)}` : '—'}</T>
        </View>
        {step === 0 ? <Button testID="next-1" full={false} title="Elegir día" iconRight="arrow-right" disabled={!cart.length} onPress={() => go(1)} /> : null}
        {step === 1 ? <Button testID="next-2" full={false} title="Continuar" iconRight="arrow-right" disabled={!date || !time} onPress={() => go(2)} /> : null}
        {step === 2 && waitFor ? <Button full={false} title="Avísame" icon="bell" loading={!!busy} onPress={() => { if (validateData()) joinWait(waitFor); }} /> : null}
        {step === 2 && !waitFor ? <Button testID="next-3" full={false} title="Continuar" iconRight="arrow-right" onPress={() => { if (validateData()) go(3); }} /> : null}
        {step === 3 && consentValid ? (
          <Button testID="pay" full={false} loading={!!busy} title={method === 'paypal' ? (pricing.depositRD > 0 ? `Pagar ${fmtUSD(pricing.depositUSD)}` : 'Confirmar') : 'Apartar'} icon={method === 'paypal' ? 'card' : 'bank'} onPress={book} />
        ) : null}
      </View>
    }>
      <T v="kicker">Reservar cita</T>
      <T v="title" style={{ marginTop: 6 }} accessibilityRole="header">{STEPS[step]}</T>
      <Row gap={6} style={{ marginTop: 14, marginBottom: space.lg }}>
        {STEPS.map((s, i) => (
          <Pressable key={s} disabled={i >= step} onPress={() => go(i as Step)} style={{ flex: 1 }} accessibilityRole="button" accessibilityLabel={`Paso ${i + 1}: ${s}`}>
            <View style={{ height: 3, backgroundColor: i <= step ? colors.ink : colors.beige }} />
          </Pressable>
        ))}
      </Row>
      {error ? (
        <Notice kind="error" style={{ marginBottom: space.md }}>
          <T v="small" style={{ color: colors.error }}>{error}</T>
          {/inicia sesión/i.test(error) && !session ? <Button small kind="outline" title="Iniciar sesión" icon="user" style={{ marginTop: 10 }} onPress={() => router.push('/entrar')} /> : null}
        </Notice>
      ) : null}
      {waitFor && step === 2 ? <Notice style={{ marginBottom: space.md }}>{`Completa tus datos y te avisamos si se libera un horario el ${whenText(waitFor)}.`}</Notice> : null}

      {/* 1 · Servicios */}
      {step === 0 ? (
        <View>
          <CatalogBrowser />
          <Button kind="link" full={false} title="Ver detalles de cada servicio" onPress={() => router.navigate('/servicios')} style={{ alignSelf: 'flex-start', marginTop: 4 }} />
        </View>
      ) : null}

      {/* 2 · Día y hora */}
      {step === 1 ? (
        <View>
          <Row style={{ justifyContent: 'space-between', marginBottom: 10 }}>
            <T v="label">{date ? whenText(date) : 'Elige el día'}</T>
            <Button kind="link" small full={false} title={showCal ? 'Próximos días' : 'Ver calendario'} onPress={() => setShowCal((x) => !x)} />
          </Row>
          {showCal
            ? <MonthCalendar studio={studio} minutes={minutes} value={date} onChange={(k) => { setDate(k); setTime(null); }} />
            : <DayStrip studio={studio} minutes={minutes} value={date} onChange={(k) => { setDate(k); setTime(null); }} />}
          <View style={{ marginTop: space.md }}>
            <FirstFree studio={studio} minutes={minutes} onPick={(k, tt) => { setDate(k); setTime(tt); }} />
          </View>
          {date ? (
            <View style={{ marginTop: space.lg }}>
              <T v="label" style={{ marginBottom: 10 }}>{`Horas disponibles · ${fmtDuration(minutes)}`}</T>
              <TimeSlots studio={studio} dateKey={date} minutes={minutes} value={time} onChange={setTime} busyError={app.busyError} />
              {app.busyError && !studio.busyAt ? <Button kind="outline" small title="Reintentar" icon="refresh" style={{ marginTop: 10 }} onPress={() => app.refreshBusy(true)} /> : null}
              {dayFull && waitOn ? (
                <Card style={{ marginTop: space.md }}>
                  <T v="h3">¿Quieres este día?</T>
                  <T v="muted" style={{ marginTop: 4 }}>Únete a la lista de espera: si alguien cancela, te avisamos para que reserves primero.</T>
                  <Button small kind="outline" icon="bell" title="Avísame si se libera" style={{ marginTop: 10 }} loading={!!busy} onPress={() => joinWait(date)} />
                </Card>
              ) : null}
              {waitMsg ? <Notice kind="ok" style={{ marginTop: space.md }}>{waitMsg}</Notice> : null}
            </View>
          ) : null}
          <T v="muted" style={{ marginTop: space.lg, fontSize: 13.5 }}>{`Te recomendamos llegar ${CONFIG.policies.arriveEarlyMinutes} minutos antes. Puedes cambiar o cancelar hasta ${studio.payments.cancelHours || CONFIG.policies.changeHours} horas antes.`}</T>
        </View>
      ) : null}

      {/* 3 · Datos */}
      {step === 2 ? (
        <View>
          {!session ? (
            <Card style={{ marginBottom: space.lg, backgroundColor: colors.sand, borderColor: colors.sand }} onPress={() => router.push('/entrar')}>
              <Row gap={12}><Icon name="user" /><View style={{ flex: 1 }}><T v="label">¿Ya tienes cuenta?</T><T v="muted">Inicia sesión para ver tus citas en cualquier celular.</T></View><Icon name="chevron-right" size={18} /></Row>
            </Card>
          ) : null}
          <Row gap={12} style={{ alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}><Field testID="f-first" label="Nombre" value={f.first} onChangeText={(v) => setF({ ...f, first: v })} onBlur={() => f.first && setF((x) => ({ ...x, first: Validate.properName(x.first) }))} autoCapitalize="words" autoComplete="given-name" textContentType="givenName" error={errs.first} maxLength={60} /></View>
            <View style={{ flex: 1 }}><Field testID="f-last" label="Apellido" value={f.last} onChangeText={(v) => setF({ ...f, last: v })} onBlur={() => f.last && setF((x) => ({ ...x, last: Validate.properName(x.last) }))} autoCapitalize="words" autoComplete="family-name" textContentType="familyName" error={errs.last} maxLength={60} /></View>
          </Row>
          <Field testID="f-phone" label="Celular (WhatsApp)" value={f.phone} onChangeText={(v) => setF((x) => ({ ...x, phone: Validate.phoneTyping(v, x.phone) }))} onBlur={() => { const p = Validate.phone(f.phone); if (p.ok) setF((x) => ({ ...x, phone: p.value })); }} keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" placeholder="809-555-1234" error={errs.phone} maxLength={20} />
          <Field testID="f-email" label="Correo" value={f.email} onChangeText={(v) => setF({ ...f, email: v })} keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" placeholder="nombre@gmail.com" error={errs.email} hint="Te enviamos la confirmación y el recibo." maxLength={120} />
          <T v="label" style={{ marginBottom: 6 }}>Cumpleaños <T v="muted">(opcional, para un detalle ese mes)</T></T>
          <Row gap={12} style={{ alignItems: 'flex-start' }}>
            <View style={{ width: 90 }}><Field label="Día" value={f.bd} onChangeText={(v) => setF({ ...f, bd: v.replace(/\D/g, '').slice(0, 2) })} keyboardType="number-pad" placeholder="14" maxLength={2} /></View>
            <View style={{ width: 90 }}><Field label="Mes" value={f.bm} onChangeText={(v) => setF({ ...f, bm: v.replace(/\D/g, '').slice(0, 2) })} keyboardType="number-pad" placeholder="3" maxLength={2} /></View>
          </Row>
          {errs.bday ? <T v="small" style={{ color: colors.error, marginTop: -8, marginBottom: 12 }}>{errs.bday}</T> : null}
          <Field label="Nota para Majo" optional value={f.notes} onChangeText={(v) => setF({ ...f, notes: v })} multiline placeholder="Alergias, si es tu primera vez, lo que quieres lograr…" maxLength={400} />
          <T v="label" style={{ marginBottom: 8 }}>¿Cómo nos conociste?</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: space.md }}>
            {ORIGENES.map((o) => <Chip key={o} label={o} selected={f.origen === o} onPress={() => setF({ ...f, origen: f.origen === o ? '' : o })} />)}
          </View>
          <Check checked={remember} onChange={setRemember}>Guardar mis datos en este celular para la próxima vez</Check>
        </View>
      ) : null}

      {/* Consentimiento previo al pago y después depósito */}
      {step === 3 && date && time ? (
        <View>
          {requiredConsentIds.length > 0 ? (
            <View style={{ marginBottom: space.lg }}>
              <T v="kicker">Antes del pago</T>
              <T v="h2" style={{ marginTop: 7, marginBottom: 10 }}>Tu bienestar es primero</T>
              <T v="muted" style={{ marginBottom: space.md }}>Responde con sinceridad. El depósito se habilitará únicamente cuando el consentimiento esté completo.</T>
              {consentMissing ? <Notice kind="error">El consentimiento requerido no está disponible. Contacta al estudio para poder continuar.</Notice> : null}
              {consentTemplates.map(temp=>temp ? (
                <Card key={temp.id} style={{ marginBottom: space.md }}>
                  <T v="h2">{temp.nombre}</T>
                  <T v="body" style={{ marginTop: 12, marginBottom: 14 }}>{temp.texto}</T>
                  {temp.preguntas.map((q,i)=>(
                    <View key={q.id} style={{ borderTopWidth:1,borderTopColor:colors.line,paddingVertical:14 }}>
                      <T v="body">{i+1}. {q.text}</T>
                      <Row gap={10} style={{ marginTop:10 }}>
                        {(['si','no'] as const).map(value=>(
                          <Button key={value} small full={false}
                            kind={consentAnswers[temp.id]?.[q.id]===value?'solid':'outline'}
                            title={value==='si'?'Sí':'No'}
                            onPress={()=>setConsentAnswers(prev=>({...prev,[temp.id]:{...(prev[temp.id]||{}),[q.id]:value}}))} />
                        ))}
                      </Row>
                    </View>
                  ))}
                  <Check checked={!!consentAccepted[temp.id]}
                    onChange={value=>setConsentAccepted(prev=>({...prev,[temp.id]:value}))}>
                    <T v="small">He leído la información, respondido con sinceridad y acepto el consentimiento para este tratamiento. Puedo retirarlo antes de que empiece.</T>
                  </Check>
                </Card>
              ):null)}
              {blocked ? <Notice kind="error" title="No podemos agendar esta sesión por el momento">
                {blocked.question.stopMessage || 'Gracias por responder con sinceridad. Para cuidar tu bienestar, esta sesión requiere una valoración previa. No se realizará ningún cargo. Escríbenos para orientarte.'}
              </Notice> : null}
              {!consentValid && !blocked ? <Notice>Completa las preguntas y acepta el consentimiento para continuar.</Notice> : null}
            </View>
          ) : null}
          {consentValid ? <View>
          <Card>
            <T v="kicker">Tu cita</T>
            <T v="h2" style={{ marginTop: 6 }}>{whenText(date, time)}</T>
            <T v="muted" style={{ marginTop: 4 }}>{`${t.items.map((s) => s.name).join(' + ')} · ${fmtDuration(t.minutes)}`}</T>
            <Divider />
            <KV k="Servicios" v={fmtPrice(pricing.subtotalRD)} />
            {pricing.discountRD > 0 ? <KV k={pricing.promoName || 'Descuento'} v={`−${fmtPrice(pricing.discountRD)}`} /> : null}
            {pricing.giftAppliedRD > 0 ? <KV k={pricing.giftKind === 'bono' ? 'Paquete' : 'Tarjeta de regalo'} v={`−${fmtPrice(pricing.giftAppliedRD)}`} /> : null}
            <KV k="Total" v={`${t.hasFrom ? 'Desde ' : ''}${fmtPrice(pricing.totalRD - (pricing.giftAppliedRD || 0))}`} strong />
            <Divider style={{ marginVertical: 10 }} />
            <KV k={`Depósito hoy${studio.depositPctLabel(t.items) ? ` (${studio.depositPctLabel(t.items)})` : ''}`} v={pricing.depositRD > 0 ? fmtPrice(pricing.depositRD) : 'Sin depósito'} strong />
            {pricing.depositRD > 0 && method === 'paypal' ? <KV k="En PayPal se cobra" v={fmtUSD(pricing.depositUSD)} /> : null}
            <KV k="Al terminar" v={fmtPrice(pricing.balanceRD)} />
          </Card>

          <Row gap={8} style={{ alignItems: 'flex-end', marginTop: space.lg }}>
            <View style={{ flex: 1 }}><Field testID="code" label="¿Tienes un código o tarjeta de regalo?" value={codeInput} onChangeText={(v) => setCodeInput(v.toUpperCase())} autoCapitalize="characters" autoCorrect={false} placeholder="Escribe tu código" onSubmitEditing={applyCode} /></View>
            <Button full={false} kind="outline" title="Aplicar" onPress={applyCode} disabled={!codeInput.trim()} style={{ marginBottom: space.md }} />
          </Row>
          {codes.code || codes.gift ? (
            <Row gap={8} style={{ flexWrap: 'wrap', marginTop: -6, marginBottom: 6 }}>
              {codes.code ? <Chip label={`Código ${codes.code}  ×`} onPress={() => clearCode('code')} /> : null}
              {codes.gift ? <Chip label={`${/^PAQ-/.test(codes.gift) ? 'Paquete' : 'Tarjeta'} ${codes.gift}  ×`} onPress={() => clearCode('gift')} /> : null}
            </Row>
          ) : null}
          {codeMsg ? <T v="small" style={{ marginBottom: 6 }}>{codeMsg}</T> : null}

          {pricing.depositRD > 0 ? (
            <>
              <T v="label" style={{ marginTop: space.md, marginBottom: 8 }}>¿Cómo pagas el depósito?</T>
              <Method on={method === 'paypal'} icon="card" title="PayPal o tarjeta" sub={`Se cobra ${fmtUSD(pricing.depositUSD)} (tasa RD$ ${studio.payments.usdRate}). Tu cita queda confirmada al instante.`} onPress={() => setMethod('paypal')} testID="m-paypal" />
              {transferOn ? <Method on={method === 'transferencia'} icon="bank" title="Transferencia bancaria" sub={`Transfieres ${fmtPrice(pricing.depositRD)} y subes el comprobante. Confirmamos al revisarlo.`} onPress={() => setMethod('transferencia')} testID="m-transfer" /> : null}
            </>
          ) : null}

          <View style={{ marginTop: space.md }}>
            <Check testID="terms" checked={terms} onChange={(v) => { setTerms(v); if (v) setError(''); }}>
              <T v="small">
                {'Acepto los '}
                <T v="small" style={S.link} onPress={() => Linking.openURL(`${WEB_URL}terminos.html`)}>términos</T>
                {' y la '}
                <T v="small" style={S.link} onPress={() => Linking.openURL(`${WEB_URL}cancelacion.html`)}>política de cancelación</T>
                {`. Puedes cambiar o cancelar hasta ${studio.payments.cancelHours || CONFIG.policies.changeHours} horas antes.`}
              </T>
            </Check>
          </View>
          {busy ? <T v="muted" style={{ marginTop: 10 }}>{busy}</T> : null}
          </View> : null}
        </View>
      ) : null}
    </Screen>
  );
}

function Method({ on, icon, title, sub, onPress, testID }: { on: boolean; icon: 'card' | 'bank'; title: string; sub: string; onPress: () => void; testID?: string }) {
  return (
    <Pressable testID={testID} onPress={onPress} accessibilityRole="radio" accessibilityState={{ checked: on }} style={[S.method, on && { borderColor: colors.ink }]}>
      <View style={[S.radio, on && { borderColor: colors.ink }]}>{on ? <View style={S.radioIn} /> : null}</View>
      <View style={{ flex: 1 }}>
        <Row gap={8}><Icon name={icon} size={19} /><T v="h3">{title}</T></Row>
        <T v="muted" style={{ marginTop: 4 }}>{sub}</T>
      </View>
    </Pressable>
  );
}

/* Cita reservada */
function Done({ a, onAgain }: { a: Appointment; onAgain: () => void }) {
  const router = useRouter();
  const [cal, setCal] = useState('');
  const pending = a.status !== 'confirmada';
  return (
    <Screen testID="done">
      <View style={{ alignItems: 'center', marginTop: space.lg }}>
        <View style={S.okCircle}><Icon name="check" size={34} color={colors.paper} stroke={2} /></View>
        <T v="kicker" style={{ marginTop: space.lg }}>{pending ? 'Horario apartado' : 'Cita confirmada'}</T>
        <T v="title" style={{ marginTop: 8, textAlign: 'center' }}>{whenText(a.date, a.time)}</T>
        <T v="muted" style={{ marginTop: 6, textAlign: 'center' }}>{a.services.map((s) => s.name).join(' + ')}</T>
      </View>
      <Card style={{ marginTop: space.xl }}>
        <KV k="Reserva" v={a.id} />
        {a.payment.depositRD > 0 ? <KV k="Depósito" v={`${fmtPrice(a.payment.depositRD)}${a.payment.depositPaid ? ' · pagado' : ' · por confirmar'}`} /> : null}
        <KV k="Al terminar" v={fmtPrice(a.payment.balanceRD)} strong />
      </Card>
      <T v="body" style={{ marginTop: space.md }}>
        {pending ? 'Te avisaremos en cuanto revisemos tu comprobante. ' : 'Te enviamos la confirmación a tu correo. '}
        {`Llega ${CONFIG.policies.arriveEarlyMinutes} minutos antes. Te recordaremos tu cita un día antes y el mismo día.`}
      </T>
      {a.consent && a.consent.needed && !a.consent.signed && a.consent.url ? (
        <Notice kind="warn" title="Firma tu consentimiento" style={{ marginTop: space.md }}>
          <T v="small">Este servicio necesita tu consentimiento firmado antes de la cita. Toma un minuto.</T>
          <Button small kind="outline" title="Firmar ahora" style={{ marginTop: 10 }} onPress={() => Linking.openURL(a.consent.url)} />
        </Notice>
      ) : null}
      <View style={{ gap: 10, marginTop: space.lg }}>
        <Button testID="add-cal" kind="outline" icon="calendar" title={cal || 'Añadir a mi calendario'} onPress={async () => { try { await addToCalendar(a); setCal('Añadida a tu calendario'); } catch (e: any) { inform('Calendario', e.message); } }} />
        <Button title="Ver mis citas" onPress={() => router.navigate('/citas')} />
        <Button kind="ghost" title="Reservar otra cita" onPress={onAgain} />
      </View>
    </Screen>
  );
}

const S = StyleSheet.create({
  footer: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: colors.line, backgroundColor: colors.paper },
  pick: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderWidth: 1, borderColor: colors.line, marginBottom: 10 },
  pickOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  box: { width: 22, height: 22, borderWidth: 1, borderColor: colors.lineStrong, alignItems: 'center', justifyContent: 'center' },
  method: { flexDirection: 'row', gap: 14, padding: 16, borderWidth: 1, borderColor: colors.line, marginBottom: 10, alignItems: 'flex-start' },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1, borderColor: colors.lineStrong, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  radioIn: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.ink },
  link: { textDecorationLine: 'underline', fontFamily: fonts.serifSemi },
  okCircle: { width: 76, height: 76, borderRadius: 38, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
});
