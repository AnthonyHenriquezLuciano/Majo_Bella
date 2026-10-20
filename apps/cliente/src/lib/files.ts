/* Elegir una foto (comprobante de transferencia) y prepararla para enviarla: se achica para que suba rápido */
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

export async function pickProof(): Promise<{ mime: string; data: string; uri: string } | null> {
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1, allowsEditing: false });
  if (res.canceled || !res.assets || !res.assets[0]) return null;
  const a = res.assets[0];
  const ctx = ImageManipulator.manipulate(a.uri);
  if ((a.width || 0) > 1600) ctx.resize({ width: 1600 });
  const img = await ctx.renderAsync();
  const out = await img.saveAsync({ format: SaveFormat.JPEG, compress: 0.8, base64: true });
  if (!out.base64) throw new Error('No se pudo leer la imagen.');
  return { mime: 'image/jpeg', data: out.base64, uri: out.uri };
}
