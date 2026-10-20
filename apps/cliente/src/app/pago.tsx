/* majobella://pago: PayPal devuelve aquí si la app se abrió desde el enlace (el pago se confirma en la pantalla que lo pidió) */
import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { Loading, Screen } from '@majobella/ui';

export default function Pago() {
  const router = useRouter();
  useEffect(() => { const t = setTimeout(() => (router.canGoBack() ? router.back() : router.replace('/citas')), 400); return () => clearTimeout(t); }, [router]);
  return <Screen><Loading label="Volviendo…" /></Screen>;
}
