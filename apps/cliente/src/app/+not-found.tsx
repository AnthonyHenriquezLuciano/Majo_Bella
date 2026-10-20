import { useRouter } from 'expo-router';
import { Button, Empty, Screen } from '@majobella/ui';

export default function NotFound() {
  const router = useRouter();
  return <Screen><Empty title="Esta pantalla no existe" action={<Button title="Ir al inicio" onPress={() => router.replace('/')} />} /></Screen>;
}
