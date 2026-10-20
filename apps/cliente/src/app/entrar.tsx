/* Iniciar sesión: código por correo (sin contraseña) o Google */
import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Validate, colors, space } from '@majobella/core';
import { Button, Divider, Field, IconButton, Notice, Row, Screen, T } from '@majobella/ui';
import { useApp } from '@/lib/app-state';
import { AUTH_ENABLED } from '@/lib/env';

export default function Entrar() {
  const { sendCode, verifyCode, signInGoogle } = useApp();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const close = () => (router.canGoBack() ? router.back() : router.replace('/cuenta'));
  const done = () => close();

  const send = async () => {
    if (!Validate.email(email)) { setErr(Validate.emailError); return; }
    setBusy('send'); setErr('');
    try { await sendCode(email); setSent(true); } catch (e: any) { setErr(e.message); } finally { setBusy(''); }
  };
  const verify = async () => {
    if (code.replace(/\D/g, '').length < 6) { setErr('Escribe el código de 6 dígitos que te llegó.'); return; }
    setBusy('verify'); setErr('');
    try { await verifyCode(email, code.replace(/\D/g, '')); done(); } catch (e: any) { setErr(e.message); } finally { setBusy(''); }
  };
  const google = async () => {
    setBusy('google'); setErr('');
    try { if (await signInGoogle()) done(); } catch (e: any) { setErr(e.message); } finally { setBusy(''); }
  };

  return (
    <Screen top={false} style={{ paddingTop: space.lg }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <T v="kicker">Tu cuenta</T>
        <IconButton name="close" label="Cerrar" onPress={close} />
      </Row>
      <T v="title" style={{ marginTop: 4 }}>{sent ? 'Revisa tu correo' : 'Inicia sesión'}</T>
      <T v="muted" style={{ marginTop: 8 }}>
        {sent ? `Te enviamos un código de 6 dígitos a ${email}. Escríbelo aquí (o toca el enlace del correo desde este celular).` : 'Sin contraseñas: te enviamos un código a tu correo. Usa el mismo correo con el que reservas para ver todas tus citas.'}
      </T>
      {!AUTH_ENABLED ? <Notice kind="warn" style={{ marginTop: space.md }}>El inicio de sesión estará disponible muy pronto. Mientras tanto puedes reservar sin cuenta.</Notice> : null}
      {err ? <Notice kind="error" style={{ marginTop: space.md }}>{err}</Notice> : null}
      <View style={{ marginTop: space.lg }}>
        {!sent ? (
          <>
            <Field testID="login-email" label="Correo" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" placeholder="nombre@gmail.com" onSubmitEditing={send} returnKeyType="send" />
            <Button testID="login-send" title="Enviarme el código" icon="mail" loading={busy === 'send'} disabled={!AUTH_ENABLED} onPress={send} />
            <Row style={{ marginVertical: space.lg }} gap={12}><Divider style={{ flex: 1, marginVertical: 0 }} /><T v="muted">o</T><Divider style={{ flex: 1, marginVertical: 0 }} /></Row>
            <Button kind="outline" title="Continuar con Google" icon="google" loading={busy === 'google'} disabled={!AUTH_ENABLED} onPress={google} />
          </>
        ) : (
          <>
            <Field testID="login-code" label="Código" value={code} onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 8))} keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" placeholder="123456" style={{ fontSize: 24, letterSpacing: 8, textAlign: 'center' }} onSubmitEditing={verify} />
            <Button testID="login-verify" title="Entrar" loading={busy === 'verify'} onPress={verify} />
            <Button kind="ghost" title="Usar otro correo" style={{ marginTop: 8 }} onPress={() => { setSent(false); setCode(''); setErr(''); }} />
            <Button kind="link" full={false} title="Enviar otro código" style={{ alignSelf: 'center' }} onPress={send} />
          </>
        )}
      </View>
      <T v="muted" style={{ marginTop: space.xl, fontSize: 13, color: colors.faint }}>Al continuar aceptas los términos y la política de privacidad de MAJOBELLA.</T>
    </Screen>
  );
}
