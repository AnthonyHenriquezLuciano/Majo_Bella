/* Nueva cita (por teléfono, WhatsApp o en persona) */
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Validate, addDaysKey, colors, fmtDuration, fmtPrice, fmtTime12, parseKey, space, todayKey, weekdayShort } from '@majobella/core';
import { Button, Check, Chip, Field, IconButton, Notice, Row, Screen, Section, T } from '@majobella/ui';
import { adminSlots, useStudio } from '@/lib/studio-state';

export default function Nueva() {
  const p = useLocalSearchParams<{ fecha?: string; clave?: string }>();
  const router = useRouter();
  const { data, act } = useStudio();
  const [svc, setSvc] = useState<string[]>([]);
  const [day, setDay] = useState(p.fecha && p.fecha >= todayKey() ? String(p.fecha) : todayKey());
  const [time, setTime] = useState('');
  const [c, setC] = useState({ name: '', phone: '', email: '', notes: '' });
  const [dep, setDep] = useState({ amount: '', method: 'efectivo' });
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ k: 'error' | 'warn'; t: string; force?: boolean } | null>(null);
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  useEffect(() => {
    if (!data || !p.clave) return;
    const f = data.clients.find((x) => x.clave === p.clave);
    const it = data.items.find((x) => x.clientKey === p.clave);
    setC({ name: (f && f.nombre) || (it && it.client.name) || '', phone: (f && f.telefono) || (it && it.client.phone) || '', email: (f && f.correo) || (it && it.client.email) || '', notes: '' });
  }, [data, p.clave]);

  const services = data ? data.services.filter((s) => !/^no$/i.test(String(s.activo))) : [];
  const chosen = services.filter((s) => svc.includes(s.id));
  const minutes = chosen.reduce((t, s) => t + (Number(s.duracionMin) || 30), 0) || 30;
  const total = chosen.reduce((t, s) => t + (Number(s.precioRD) || 0), 0);
  const days = useMemo(() => Array.from({ length: 21 }, (_, i) => addDaysKey(todayKey(), i)), []);
  const sl = data ? adminSlots(data, day, minutes) : null;
  // Sugerencias de clientas mientras escribe
  const sugg = useMemo(() => {
    if (!data || c.name.trim().length < 2 || p.clave) return [];
    const n = c.name.trim().toLowerCase();
    return data.clients.filter((x) => String(x.nombre).toLowerCase().includes(n)).slice(0, 4);
  }, [data, c.name, p.clave]);

  const save = async (force = false) => {
    if (!svc.length) { setMsg({ k: 'error', t: 'Elige al menos un servicio.' }); return; }
    if (!time) { setMsg({ k: 'error', t: 'Elige la hora.' }); return; }
    if (!c.name.trim() || (!Validate.phone(c.phone).ok && !Validate.email(c.email))) { setMsg({ k: 'error', t: 'Escribe el nombre y un teléfono o correo de la clienta.' }); return; }
    setBusy(true); setMsg(null);
    try {
      const r = await act<{ item: { id: string } }>('adminCreate', {
        services: svc, date: day, time, force,
        client: { name: Validate.properName(c.name), phone: Validate.phone(c.phone).ok ? Validate.phone(c.phone).value : '', email: c.email.trim().toLowerCase(), notes: c.notes.trim() },
        depositRD: Number(dep.amount) || 0, depositMethod: dep.method, notify: notify && !!c.email.trim(),
      });
      router.replace({ pathname: '/cita/[id]', params: { id: r.item.id } });
    } catch (e: any) {
      setMsg(e.data && e.data.conflict ? { k: 'warn', t: e.message, force: true } : { k: 'error', t: e.message });
    } finally { setBusy(false); }
  };

  return (
    <Screen top={false} style={{ paddingTop: space.lg }} footer={
      <View style={{ padding: 16, paddingBottom: 26, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.paper }}>
        <Button testID="save" title={time ? `Guardar · ${weekdayShort(day)} ${parseKey(day).d} · ${fmtTime12(time)}` : 'Guardar cita'} icon="check" loading={busy} onPress={() => save(false)} />
      </View>
    }>
      <Row style={{ justifyContent: 'space-between' }}><T v="kicker">Agenda</T><IconButton name="close" label="Cerrar" onPress={close} /></Row>
      <T v="title">Nueva cita</T>
      {msg ? (
        <Notice kind={msg.k} style={{ marginTop: space.md }}>
          <T v="small">{msg.t}</T>
          {msg.force ? <Button small kind="outline" title="Guardar igual" style={{ marginTop: 10 }} onPress={() => save(true)} /> : null}
        </Notice>
      ) : null}

      <Section kicker="Servicios">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {services.map((s) => <Chip key={s.id} testID={`s-${s.id}`} label={s.nombre} sub={`${fmtPrice(Number(s.precioRD) || 0)} · ${s.duracionMin} min`} selected={svc.includes(s.id)} onPress={() => { setSvc(svc.includes(s.id) ? svc.filter((x) => x !== s.id) : [...svc, s.id]); setTime(''); }} />)}
        </View>
        {svc.length ? <T v="muted" style={{ marginTop: 10 }}>{`${fmtDuration(minutes)} · ${fmtPrice(total)}`}</T> : null}
      </Section>

      <Section kicker="Día y hora">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ gap: 6, paddingHorizontal: 20 }}>
          {days.map((k) => <Chip key={k} label={`${k === todayKey() ? 'Hoy' : weekdayShort(k)} ${parseKey(k).d}`} selected={day === k} onPress={() => { setDay(k); setTime(''); }} />)}
        </ScrollView>
        {sl ? (
          <View style={{ marginTop: space.md }}>
            {sl.closed ? <T v="muted" style={{ marginBottom: 8 }}>Ese día el estudio está cerrado según el horario; puedes agendar igual.</T> : null}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {sl.slots.map((s) => <Chip key={s.time} testID={`t-${s.time}`} label={fmtTime12(s.time)} sub={s.busy ? 'ocupado' : undefined} selected={time === s.time} onPress={() => setTime(s.time)} style={s.busy ? { opacity: 0.55 } : undefined} />)}
            </View>
          </View>
        ) : null}
      </Section>

      <Section kicker="Clienta">
        <Field testID="c-name" label="Nombre y apellido" value={c.name} onChangeText={(v) => setC({ ...c, name: v })} autoCapitalize="words" />
        {sugg.length ? (
          <View style={{ marginTop: -8, marginBottom: 12, gap: 6 }}>
            {sugg.map((x) => <Chip key={x.clave} label={`${x.nombre}${x.telefono ? ` · ${x.telefono}` : ''}`} onPress={() => setC({ ...c, name: x.nombre, phone: x.telefono || '', email: x.correo || '' })} style={{ alignSelf: 'flex-start' }} />)}
          </View>
        ) : null}
        <Field testID="c-phone" label="Teléfono" value={c.phone} onChangeText={(v) => setC((x) => ({ ...x, phone: Validate.phoneTyping(v, x.phone) }))} keyboardType="phone-pad" />
        <Field label="Correo" optional value={c.email} onChangeText={(v) => setC({ ...c, email: v })} keyboardType="email-address" autoCapitalize="none" />
        <Field label="Nota" optional value={c.notes} onChangeText={(v) => setC({ ...c, notes: v })} multiline />
      </Section>

      <Section kicker="Depósito recibido">
        <Field label="Monto (RD$, 0 si no dejó depósito)" value={dep.amount} onChangeText={(v) => setDep({ ...dep, amount: v.replace(/\D/g, '') })} keyboardType="number-pad" placeholder="0" />
        {Number(dep.amount) > 0 ? (
          <Row gap={8} style={{ marginBottom: space.md }}>
            {['efectivo', 'transferencia'].map((m) => <Chip key={m} label={m === 'efectivo' ? 'Efectivo' : 'Transferencia'} selected={dep.method === m} onPress={() => setDep({ ...dep, method: m })} />)}
          </Row>
        ) : null}
        <Check checked={notify} onChange={setNotify}>Enviarle la confirmación por correo (si tiene correo)</Check>
      </Section>
      <View style={{ height: space.lg }} />
    </Screen>
  );
}
