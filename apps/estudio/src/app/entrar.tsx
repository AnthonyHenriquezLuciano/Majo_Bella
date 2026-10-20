/* Entrar al estudio: solo las cuentas autorizadas (ADMIN_EMAILS en Supabase) */
import { useState } from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import { Validate, colors, space } from '@majobella/core';
import { Button, Divider, Field, Notice, Row, Screen, T } from '@majobella/ui';
import { useStudio } from '@/lib/studio-state';
import { AUTH_ENABLED } from '@/lib/env';

export default function Entrar() {
  const { sendCode, verifyCode, signInGoogle } = useStudio();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const send = async () => {
    if (!Validate.email(email)) { setErr(Validate.emailError); return; }
    setBusy('send'); setErr('');
    try { await sendCode(email); setSent(true); } catch (e: any) { setErr(e.message); } finally { setBusy(''); }
  };
  const verify = async () => {
    setBusy('verify'); setErr('');
    try { await verifyCode(email, code); } catch (e: any) { setErr(e.message); } finally { setBusy(''); }
  };
  return (
    <Screen style={{ paddingTop: 60 }}>
      <View style={{ alignItems: 'center', marginBottom: space.xl }}>
        <Image source={require('@/assets/images/logo.png')} style={{ width: 200, height: 78 }} contentFit="contain" accessibilityLabel="MAJOBELLA" />
        <T v="kicker" style={{ marginTop: space.md }}>Estudio</T>
      </View>
      <T v="title">{sent ? 'Revisa tu correo' : 'Entrar al estudio'}</T>
      <T v="muted" style={{ marginTop: 6 }}>{sent ? `Escribe el código que enviamos a ${email}.` : 'Solo para la cuenta del estudio. Te enviamos un código a tu correo.'}</T>
      {!AUTH_ENABLED ? <Notice kind="warn" style={{ marginTop: space.md }}>Falta conectar Supabase: configura EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_ANON_KEY (ver apps/README.md).</Notice> : null}
      {err ? <Notice kind="error" style={{ marginTop: space.md }}>{err}</Notice> : null}
      <View style={{ marginTop: space.lg }}>
        {!sent ? (
          <>
            <Field label="Correo del estudio" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" onSubmitEditing={send} />
            <Button title="Enviarme el código" icon="mail" loading={busy === 'send'} disabled={!AUTH_ENABLED} onPress={send} />
            <Row style={{ marginVertical: space.lg }} gap={12}><Divider style={{ flex: 1, marginVertical: 0 }} /><T v="muted">o</T><Divider style={{ flex: 1, marginVertical: 0 }} /></Row>
            <Button kind="outline" icon="google" title="Continuar con Google" loading={busy === 'google'} disabled={!AUTH_ENABLED} onPress={async () => { setBusy('google'); setErr(''); try { await signInGoogle(); } catch (e: any) { setErr(e.message); } finally { setBusy(''); } }} />
          </>
        ) : (
          <>
            <Field label="Código" value={code} onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 8))} keyboardType="number-pad" textContentType="oneTimeCode" autoComplete="one-time-code" style={{ fontSize: 24, letterSpacing: 8, textAlign: 'center' }} onSubmitEditing={verify} />
            <Button title="Entrar" loading={busy === 'verify'} onPress={verify} />
            <Button kind="ghost" title="Usar otro correo" style={{ marginTop: 8 }} onPress={() => { setSent(false); setCode(''); }} />
          </>
        )}
      </View>
      <T v="muted" style={{ marginTop: space.xl, fontSize: 12.5, color: colors.faint, textAlign: 'center' }}>¿Eres clienta? Descarga la app MAJOBELLA.</T>
    </Screen>
  );
}
