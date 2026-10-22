/* Ruta real para recibir majobella:///auth?code=...
   Debe existir en Expo Router: de lo contrario muestra Unmatched Route.
   PKCE se canjea una sola vez desde el helper compartido por navegador/deep link. */
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button, Screen, T } from '@majobella/ui';
import { useApp } from '@/lib/app-state';
import { finishOAuthCode } from '@/lib/supabase';

export default function AuthCallback() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  const { session, authReady } = useApp();
  const router = useRouter();
  const [error, setError] = useState('');

  useEffect(() => {
    if (typeof code !== 'string' || !code) {
      setError('El enlace no contiene un código válido. Vuelve a iniciar sesión.');
      return;
    }
    let active = true;
    finishOAuthCode(code).catch((e: unknown) => {
      if (active) setError(e instanceof Error ? e.message : 'No se pudo completar el inicio de sesión.');
    });
    return () => { active = false; };
  }, [code]);

  useEffect(() => {
    if (authReady && session) router.replace('/(tabs)');
  }, [authReady, session, router]);

  return (
    <Screen style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
      <View style={{ alignItems: 'center', gap: 16 }}>
        {error ? (
          <>
            <T v="h2">No pudimos completar el acceso</T>
            <T v="muted" style={{ textAlign: 'center' }}>{error}</T>
            <Button title="Volver a iniciar sesión" onPress={() => router.replace('/entrar')} />
          </>
        ) : (
          <>
            <ActivityIndicator size="large" />
            <T v="h2">Validando tu cuenta</T>
            <T v="muted">Finalizando el inicio de sesión de MAJOBELLA…</T>
          </>
        )}
      </View>
    </Screen>
  );
}
