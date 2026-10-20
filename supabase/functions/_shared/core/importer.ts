/* MAJOBELLA · Pasar los datos de la hoja de Google a la base de datos
   El script anterior de Apps Script (función migrarABaseDeDatos) envía cada pestaña y cada archivo de Drive
   a esta acción, con la clave IMPORT_KEY (secreto de Supabase, solo para la migración).
   Se puede repetir sin duplicar: las filas con el mismo id se actualizan. */
import { env_ } from './ctx.ts';
import { appendRow_, readOpt_, readTable_, updateTable_ } from './db.ts';
import { TABLE } from './schema.ts';
import { PRIVATE_BUCKET, PUBLIC_BUCKET, filePath, publicUrl, putFile } from './storage.ts';
import { b64ToBytes, clean_, normPhone_, properName_ } from './util.ts';

/* Al importar, nombres, teléfonos y correos quedan con el mismo formato que los nuevos */
const NORMALIZE: Record<string, Record<string, 'name' | 'phone' | 'email'>> = {
  Reservas: { clienta: 'name', telefono: 'phone', correo: 'email' },
  Clientas: { nombre: 'name', telefono: 'phone', correo: 'email' },
  Espera: { clienta: 'name', telefono: 'phone', correo: 'email' },
  Bonos: { clienta: 'name', telefono: 'phone', correo: 'email' },
  Tarjetas: { comprador: 'name', para: 'name', correoComprador: 'email', correoPara: 'email' },
};
function normalize(name: string, r: any) {
  const plan = NORMALIZE[name];
  if (!plan) return r;
  Object.keys(plan).forEach((col) => {
    const v = String(r[col] || '');
    if (!v) return;
    if (name === 'Reservas' && col === 'clienta' && /^Bloque/.test(v)) return;
    if (plan[col] === 'name') r[col] = properName_(v);
    else if (plan[col] === 'email') r[col] = v.trim().toLowerCase();
    else { const ph = normPhone_(v); if (ph.ok) r[col] = ph.value; }
  });
  return r;
}

const IMPORTABLE = ['Ajustes', 'Servicios', 'Bloqueos', 'Clientas', 'Archivos', 'Promociones', 'Tarjetas', 'Gastos', 'Galeria', 'Resenas', 'Paquetes', 'Bonos', 'Espera', 'Cuentas', 'Reservas', 'Correos', 'Errores'];

function checkKey(d: any) {
  const key = env_('IMPORT_KEY');
  if (!key || d.key !== key) throw new Error('No autorizado para importar.');
}

export async function importData_(d: any) {
  checkKey(d);
  if (d.file) return importFile_(d);
  const out: Record<string, { nuevas: number; actualizadas: number }> = {};
  Object.keys(d.tables || {}).forEach((name) => {
    if (IMPORTABLE.indexOf(name) < 0) return;
    const t = TABLE[name];
    const rows = (d.tables[name] || []) as any[];
    const res = { nuevas: 0, actualizadas: 0 };
    const existing = t.pk ? readOpt_(name) : [];
    rows.forEach((raw) => {
      const r: any = {};
      Object.keys(raw).forEach((k) => { r[k] = raw[k] == null ? '' : String(raw[k]); });
      normalize(name, r);
      if (t.pk) {
        const id = String(r[t.pk] || '').trim();
        if (!id) return;
        const have = existing.find((x) => String(x[t.pk!]) === id);
        if (have) { updateTable_(name, have._row, r); res.actualizadas++; return; }
      }
      appendRow_(name, r);
      res.nuevas++;
    });
    out[name] = res;
  });
  return { ok: true, result: out };
}

/* Un archivo de Drive → Storage. tipo: 'archivo' (ficha privada) | 'galeria' (antes/después) | 'majo' (foto pública) */
async function importFile_(d: any) {
  const f = d.file;
  const bytes = b64ToBytes(String(f.data || ''));
  if (!bytes.length) return { ok: false, error: 'Archivo vacío.' };
  const mime = String(f.mime || 'application/octet-stream');
  if (f.tipo === 'archivo') {
    const row = readTable_('Archivos').find((x) => x.id === f.id);
    if (!row) return { ok: false, error: 'No existe la ficha ' + f.id };
    const path = await putFile(PRIVATE_BUCKET, filePath(row.clave || 'importado', clean_(row.nombre || f.id, 80)), bytes, mime);
    updateTable_('Archivos', row._row, { driveId: path });
    return { ok: true, path };
  }
  if (f.tipo === 'galeria') {
    const row = readTable_('Galeria').find((x) => x.id === f.id);
    if (!row) return { ok: false, error: 'No existe la foto ' + f.id };
    const ext = mime === 'image/png' ? '.png' : '.jpg';
    const path = await putFile(PUBLIC_BUCKET, 'galeria/' + f.id + '-' + f.lado + ext, bytes, mime);
    updateTable_('Galeria', row._row, f.lado === 'antes' ? { antesId: path, antesUrl: publicUrl(path) } : { despuesId: path, despuesUrl: publicUrl(path) });
    return { ok: true, path };
  }
  if (f.tipo === 'majo') {
    const path = await putFile(PUBLIC_BUCKET, 'web/majo-importada' + (mime === 'image/png' ? '.png' : '.jpg'), bytes, mime);
    const row = readTable_('Ajustes').find((x) => x.clave === 'majoFotoUrl');
    if (row) updateTable_('Ajustes', row._row, { valor: publicUrl(path) }); else appendRow_('Ajustes', { clave: 'majoFotoUrl', valor: publicUrl(path), 'qué es': '' });
    return { ok: true, path };
  }
  return { ok: false, error: 'Tipo de archivo no válido.' };
}
