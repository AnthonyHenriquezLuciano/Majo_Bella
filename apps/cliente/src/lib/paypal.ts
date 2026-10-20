/* Pago con PayPal desde la app: se abre la página de PayPal en el navegador del sistema y, al terminar,
   PayPal vuelve a pago.html de la web, que regresa a la app (majobella://pago?r=ok&token=…). */
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { SCHEME } from './env';

export type PayResult = 'ok' | 'cancel' | 'dismiss';

export async function payWithPayPal(approveUrl: string): Promise<PayResult> {
  if (!approveUrl) throw new Error('PayPal no devolvió el enlace de pago. Inténtalo de nuevo.');
  const back = `${SCHEME}://pago`;
  const res = await WebBrowser.openAuthSessionAsync(approveUrl, back, { showInRecents: true });
  if (res.type !== 'success' || !res.url) return 'dismiss';
  const { queryParams } = Linking.parse(res.url);
  return queryParams && queryParams.r === 'cancel' ? 'cancel' : 'ok';
}
