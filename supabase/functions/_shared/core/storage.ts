/* MAJOBELLA · Archivos en Supabase Storage
   - fichas  (privada): fotos de antes y después, consentimientos y comprobantes de transferencia
   - publico (pública): copias publicadas en la galería de la web y la foto de "Conoce a Majo" */
import { cx, env_ } from './ctx.ts';

export const PRIVATE_BUCKET = 'fichas';
export const PUBLIC_BUCKET = 'publico';

function base() {
  const b = env_('SUPABASE_URL');
  if (!b) throw new Error('Falta configurar el almacenamiento de archivos (SUPABASE_URL).');
  return b.replace(/\/$/, '') + '/storage/v1';
}
function auth() { const k = env_('SUPABASE_SERVICE_ROLE_KEY'); return { Authorization: 'Bearer ' + k, apikey: k }; }
const enc = (path: string) => path.split('/').map(encodeURIComponent).join('/');

/* Nombre de archivo seguro y único: carpeta/fecha-aleatorio-nombre */
export function filePath(folder: string, name: string) {
  const clean = (t: string) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w@.+-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'archivo';
  return clean(folder) + '/' + new Date().toISOString().slice(0, 10) + '-' + Math.random().toString(36).slice(2, 8) + '-' + clean(name);
}

export async function putFile(bucket: string, path: string, bytes: Uint8Array, mime: string) {
  const res = await cx().deps.fetch(`${base()}/object/${bucket}/${enc(path)}`, {
    method: 'POST', headers: { ...auth(), 'Content-Type': mime, 'x-upsert': 'true', 'cache-control': '3600' }, body: bytes,
  });
  if (res.status >= 300) throw new Error('No se pudo guardar el archivo (' + res.status + ').');
  return path;
}
export async function getFile(bucket: string, path: string): Promise<Uint8Array> {
  const res = await cx().deps.fetch(`${base()}/object/${bucket}/${enc(path)}`, { headers: auth() });
  if (res.status !== 200) throw new Error('No encontramos el archivo.');
  return new Uint8Array(await res.arrayBuffer());
}
export async function copyFile(fromBucket: string, fromPath: string, toBucket: string, toPath: string, mime: string) {
  const bytes = await getFile(fromBucket, fromPath);
  await putFile(toBucket, toPath, bytes, mime);
  return toPath;
}
export function publicUrl(path: string) { return `${base()}/object/public/${PUBLIC_BUCKET}/${enc(path)}`; }
export function publicPathFromUrl(url: string) {
  const m = String(url || '').match(/\/object\/public\/publico\/(.+)$/);
  return m ? m[1].split('/').map(decodeURIComponent).join('/') : '';
}
/* Se borran después de guardar los cambios (si algo falla antes, el archivo sigue ahí) */
export function removeLater(bucket: string, paths: string[]) {
  const list = paths.filter(Boolean);
  if (list.length) cx().out.push({ kind: 'storage.remove', bucket, paths: list });
}
export async function removeNow(bucket: string, paths: string[]) {
  await cx().deps.fetch(`${base()}/object/${bucket}`, { method: 'DELETE', headers: { ...auth(), 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: paths }) });
}
