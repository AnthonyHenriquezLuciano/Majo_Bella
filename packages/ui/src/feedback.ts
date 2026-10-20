/* Preguntas y avisos del sistema (en la web se usan los del navegador) */
import { Alert, Platform } from 'react-native';

export function confirm(title: string, message: string, ok = 'Sí', cancel = 'No', destructive = false): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`));
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: cancel, style: 'cancel', onPress: () => resolve(false) },
      { text: ok, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
}

export function inform(title: string, message?: string) {
  if (Platform.OS === 'web') { if (typeof window !== 'undefined') window.alert(message ? `${title}\n\n${message}` : title); return; }
  Alert.alert(title, message);
}
