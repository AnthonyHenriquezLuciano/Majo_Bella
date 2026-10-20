/* Bloquear horario: una vez, varios días o cada semana (las clientas no podrán reservar ahí) */
import { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { colors, fmtTime12, space, todayKey } from '@majobella/core';
import { Button, Check, Chip, Field, IconButton, Notice, Row, Screen, Section, T } from '@majobella/ui';
import { useStudio } from '@/lib/studio-state';

const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const HOURS = Array.from({ length: 25 }, (_, i) => `${String(7 + Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);

export default function Bloquear() {
  const p = useLocalSearchParams<{ fecha?: string }>();
  const router = useRouter();
  const { act } = useStudio();
  const [tipo, setTipo] = useState<'unico' | 'rango' | 'semanal'>('unico');
  const [desde, setDesde] = useState(String(p.fecha || todayKey()));
  const [hasta, setHasta] = useState('');
  const [dias, setDias] = useState<number[]>([]);
  const [all, setAll] = useState(true);
  const [h1, setH1] = useState('12:00');
  const [h2, setH2] = useState('14:00');
  const [motivo, setMotivo] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const save = async () => {
    setBusy(true); setErr('');
    try {
      await act('adminBlock', { tipo, fechaDesde: desde, fechaHasta: tipo === 'unico' ? desde : hasta, dias: dias.join(','), horaDesde: all ? '00:00' : h1, horaHasta: all ? '23:59' : h2, motivo: motivo || 'Bloqueado' });
      close();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Screen top={false} style={{ paddingTop: space.lg }} footer={<View style={{ padding: 16, paddingBottom: 26, borderTopWidth: 1, borderTopColor: colors.line }}><Button title="Bloquear" icon="close" loading={busy} onPress={save} /></View>}>
      <Row style={{ justifyContent: 'space-between' }}><T v="kicker">Agenda</T><IconButton name="close" label="Cerrar" onPress={close} /></Row>
      <T v="title">Bloquear horario</T>
      <T v="muted" style={{ marginTop: 6 }}>Las clientas no podrán reservar en ese tiempo. Las citas ya hechas no se mueven.</T>
      {err ? <Notice kind="error" style={{ marginTop: space.md }}>{err}</Notice> : null}
      <Section kicker="Cuándo">
        <Row gap={8} style={{ marginBottom: space.md }}>
          <Chip label="Un día" selected={tipo === 'unico'} onPress={() => setTipo('unico')} />
          <Chip label="Varios días" selected={tipo === 'rango'} onPress={() => setTipo('rango')} />
          <Chip label="Cada semana" selected={tipo === 'semanal'} onPress={() => setTipo('semanal')} />
        </Row>
        <Field label={tipo === 'unico' ? 'Fecha (AAAA-MM-DD)' : 'Desde (AAAA-MM-DD)'} value={desde} onChangeText={setDesde} autoCapitalize="none" />
        {tipo !== 'unico' ? <Field label={tipo === 'semanal' ? 'Hasta (opcional)' : 'Hasta (AAAA-MM-DD)'} value={hasta} onChangeText={setHasta} autoCapitalize="none" /> : null}
        {tipo === 'semanal' ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: space.md }}>
            {DAYS.map((d, i) => <Chip key={d} label={d} selected={dias.includes(i)} onPress={() => setDias(dias.includes(i) ? dias.filter((x) => x !== i) : [...dias, i])} />)}
          </View>
        ) : null}
        <Check checked={all} onChange={setAll}>Todo el día</Check>
        {!all ? (
          <View style={{ marginTop: space.md }}>
            <T v="label" style={{ marginBottom: 8 }}>{`Desde las ${fmtTime12(h1)}`}</T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{HOURS.map((h) => <Chip key={h} label={fmtTime12(h)} selected={h1 === h} onPress={() => setH1(h)} />)}</View>
            <T v="label" style={{ marginTop: space.md, marginBottom: 8 }}>{`Hasta las ${fmtTime12(h2)}`}</T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{HOURS.map((h) => <Chip key={h} label={fmtTime12(h)} selected={h2 === h} onPress={() => setH2(h)} />)}</View>
          </View>
        ) : null}
      </Section>
      <Section kicker="Motivo">
        <Field label="Motivo (solo lo ve el estudio)" value={motivo} onChangeText={setMotivo} placeholder="Vacaciones, cita médica…" maxLength={120} />
      </Section>
    </Screen>
  );
}
