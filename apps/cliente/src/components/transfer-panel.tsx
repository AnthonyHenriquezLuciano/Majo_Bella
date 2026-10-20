/* Transferencia: cuentas del estudio y subir el comprobante (al reservar y desde la cita) */
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { colors, fmtPrice, fmtTime12, space, type Appointment, type TransferAccount } from '@majobella/core';
import { Button, Card, Field, Icon, IconButton, Notice, Screen, T } from '@majobella/ui';
import { api, useApp } from '@/lib/app-state';
import { pickProof } from '@/lib/files';

export function TransferPanel({ h, onDone, onLater, auth, laterLabel = 'Lo envío después desde Mis citas' }: { h: { id: string; manageToken?: string; accounts: TransferAccount[]; depositRD?: number; expiresAt?: string }; onDone: (a: Appointment) => void; onLater: () => void; auth?: { token: string } | { idToken: string }; laterLabel?: string }) {
  const app = useApp();
  const [acc, setAcc] = useState(h.accounts[0] ? h.accounts[0].id : '');
  const [ref, setRef] = useState('');
  const [file, setFile] = useState<{ mime: string; data: string; uri: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const until = h.expiresAt ? new Date(h.expiresAt) : null;
  const untilText = until ? new Date(until.getTime() - 4 * 3600000).toISOString().slice(11, 16) : '';
  const copy = async (text: string) => { await Clipboard.setStringAsync(text); Haptics.selectionAsync().catch(() => {}); };
  const send = async () => {
    if (!file) { setErr('Elige la foto o captura del comprobante.'); return; }
    setBusy(true); setErr('');
    try {
      const res = await api.transferProof(h.id, auth || { token: h.manageToken || '' }, file, acc, ref);
      const list = await api.lookup(h.manageToken ? [{ id: h.id, token: h.manageToken }] : []).catch(() => []);
      const a = res.appointment || list[0];
      if (a) app.upsertAppointment(a);
      app.refreshAppointments();
      if (a) onDone(a); else onLater();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Screen testID="transfer">
      <T v="kicker">Horario apartado</T>
      <T v="title" style={{ marginTop: 6 }}>Envía tu transferencia</T>
      <T v="body" style={{ marginTop: 10 }}>
        {`Transfiere ${h.depositRD ? fmtPrice(h.depositRD) : 'el depósito'} a una de estas cuentas y sube la foto del comprobante.`}
        {untilText ? ` Tu horario queda apartado hasta las ${fmtTime12(untilText)}.` : ''}
      </T>
      <View style={{ marginTop: space.lg, gap: 10 }}>
        {h.accounts.map((a) => (
          <Pressable key={a.id} onPress={() => setAcc(a.id)} accessibilityRole="radio" accessibilityState={{ checked: acc === a.id }} style={[S.method, acc === a.id && { borderColor: colors.ink }]}>
            <View style={[S.radio, acc === a.id && { borderColor: colors.ink }]}>{acc === a.id ? <View style={S.radioIn} /> : null}</View>
            <View style={{ flex: 1, gap: 2 }}>
              <T v="h3">{a.bank}</T>
              <T v="small">{`${a.type ? `${a.type} · ` : ''}${a.number}`}</T>
              <T v="muted">{`${a.holder}${a.doc ? ` · ${a.doc}` : ''}`}</T>
              {a.note ? <T v="muted" style={{ fontSize: 13 }}>{a.note}</T> : null}
            </View>
            <IconButton name="copy" label={`Copiar número de ${a.bank}`} onPress={() => copy(a.number)} />
          </Pressable>
        ))}
      </View>
      <View style={{ marginTop: space.md }}><Field label="Número de referencia" optional value={ref} onChangeText={setRef} maxLength={60} /></View>
      <Card onPress={async () => { try { const p = await pickProof(); if (p) setFile(p); } catch (e: any) { setErr(e.message); } }} style={{ alignItems: 'center', gap: 10, paddingVertical: 22, borderStyle: 'dashed', borderColor: colors.lineStrong }}>
        {file ? <Image source={{ uri: file.uri }} style={{ width: 140, height: 180 }} contentFit="cover" /> : <Icon name="upload" size={28} />}
        <T v="label">{file ? 'Cambiar foto' : 'Elegir foto del comprobante'}</T>
      </Card>
      {err ? <Notice kind="error" style={{ marginTop: space.md }}>{err}</Notice> : null}
      <View style={{ marginTop: space.lg, gap: 10 }}>
        <Button testID="send-proof" title="Enviar comprobante" icon="upload" loading={busy} onPress={send} />
        <Button kind="ghost" title={laterLabel} onPress={onLater} />
      </View>
      <T v="muted" style={{ marginTop: space.md, fontSize: 13 }}>{`Reserva ${h.id}. Si no recibimos el comprobante a tiempo, el horario se libera solo.`}</T>
    </Screen>
  );
}

const S = StyleSheet.create({
  method: { flexDirection: 'row', gap: 14, padding: 16, borderWidth: 1, borderColor: colors.line, alignItems: 'flex-start' },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1, borderColor: colors.lineStrong, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  radioIn: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.ink },
});
