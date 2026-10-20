/* MAJOBELLA · Acceso a la base de datos
   Cada petición:
     1. carga en memoria las tablas que necesita (una sola consulta);
     2. la lógica lee y cambia esa memoria (readTable_, appendRow_, updateTable_, deleteRow_);
     3. al final todos los cambios se guardan juntos en una transacción.
   Las acciones que tocan la agenda o los pagos se ejecutan una detrás de otra (candado de la base),
   así nunca se reservan dos citas en el mismo horario.
   Para la lógica cada valor es texto (como en la antigua hoja); en la base cada columna tiene su tipo real. */
import { cx, type Row } from './ctx.ts';
import { TABLE, COLS, TABLES, HEAVY, type Col } from './schema.ts';

const ISO = (c: string) => `to_char(${c} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
function selectExpr(c: Col): string {
  const x = c.col;
  switch (c.type) {
    case 'date': return `to_char(${x}, 'YYYY-MM-DD')`;
    case 'time': return `to_char(${x}, 'HH24:MI')`;
    case 'ts': return ISO(x);
    case 'bool': return `case when ${x} then 'si' when not ${x} then 'no' end`;
    case 'int': case 'num': case 'json': return `${x}::text`;
    default: return x;
  }
}
const ident = (s: string) => '"' + s.replace(/"/g, '""') + '"';

/* Consulta que trae varias tablas de una vez, cada una como un arreglo JSON */
function loadQuery(names: string[], where: Record<string, string>): string {
  const parts = names.map((n) => {
    const t = TABLE[n];
    const cols = [`row_id as "_row"`].concat(t.cols.map((c) => `${selectExpr(c)} as ${ident(c.key)}`)).join(', ');
    const w = where[n] ? ` where ${where[n]}` : '';
    const order = n === 'Correos' || n === 'Errores' ? ' order by row_id desc limit 300' : ' order by row_id';
    const inner = `select ${cols} from public.${t.table}${w}${order}`;
    return `${lit(n)}, coalesce((select json_agg(z) from (${inner}) z), '[]'::json)`;
  });
  return `select json_build_object(${parts.join(', ')}) as data`;
}

export interface LoadOpts { tables?: string[]; reservasRange?: { from: string; to: string } }

/* Carga las tablas de esta petición (por defecto, todas menos los historiales grandes) */
export async function loadTables(tx: any, opts: LoadOpts = {}) {
  const c = cx();
  const names = (opts.tables || TABLES.map((t) => t.name).filter((n) => !HEAVY.includes(n))).filter((n) => !c.tables[n]);
  if (!names.includes('Sistema') && !c.tables.Sistema) names.push('Sistema');
  if (!names.includes('Cache') && !c.tables.Cache) names.push('Cache');
  const where: Record<string, string> = { Cache: 'vence is null or vence > now()' };
  if (opts.reservasRange) {
    const { from, to } = opts.reservasRange;
    where.Reservas = `fin >= ${lit(from + 'T00:00:00-04:00')}::timestamptz and inicio <= ${lit(to + 'T23:59:59-04:00')}::timestamptz`;
  }
  const res = await tx.unsafe(loadQuery(names, where));
  const data = res[0].data;
  names.forEach((n) => {
    // Los historiales se cargan del más nuevo al más viejo (solo los últimos): se dejan en orden de llegada
    const rows = (data[n] || []) as Row[];
    if (n === 'Correos' || n === 'Errores') rows.reverse();
    rows.forEach((r) => { Object.keys(r).forEach((k) => { if (k !== '_row' && r[k] == null) r[k] = ''; }); });
    c.tables[n] = rows;
  });
}
function lit(s: string) { return "'" + String(s).replace(/'/g, "''") + "'"; }

/* ---- Lectura y escritura en la memoria de la petición ---- */

function loaded(name: string): Row[] {
  const c = cx();
  const t = c.tables[name];
  if (!t) throw new Error(`La tabla ${name} no se cargó para esta acción.`);
  return t;
}
export function isLoaded(name: string) { return !!cx().tables[name]; }

/* Filas como objetos { columna: texto, _row } (copias: se pueden modificar) */
export function readTable_(name: string): Row[] { return loaded(name).map((o) => Object.assign({}, o)); }
export function readOpt_(name: string): Row[] { try { return readTable_(name); } catch (e) { return []; } }

export function appendRow_(name: string, obj: Row) { return appendRowRef_(name, obj)._row; }
/* Igual, pero devuelve la fila (después de guardar, su _row pasa a ser el número real) */
export function appendRowRef_(name: string, obj: Row): Row {
  const c = cx();
  const cols = COLS[name];
  if (!cols) throw new Error('Tabla desconocida: ' + name);
  const row: Row = { _row: 'nuevo:' + (++c.seq) };
  Object.keys(cols).forEach((k) => { row[k] = String(obj[k] == null ? '' : obj[k]); });
  if (c.tables[name]) c.tables[name].push(row);
  c.ops.push({ kind: 'insert', table: name, row });
  return row;
}

/* Cambia columnas de una fila (por su _row) */
export function updateTable_(name: string, rowId: any, patch: Record<string, any>) {
  const c = cx();
  const cols = COLS[name];
  const keys = Object.keys(patch).filter((k) => cols[k]);
  if (!keys.length) return;
  const clean: Record<string, any> = {};
  keys.forEach((k) => { clean[k] = patch[k]; });
  const list = c.tables[name] || [];
  let row = list.find((o) => o._row === rowId);
  if (row) keys.forEach((k) => { row![k] = String(patch[k] == null ? '' : patch[k]); });
  else row = { _row: rowId };
  // Si la fila se creó en esta misma petición, basta con cambiar lo que se va a insertar
  const ins = c.ops.find((o) => o.kind === 'insert' && o.table === name && o.row._row === rowId);
  if (ins) { keys.forEach((k) => { ins.row[k] = String(patch[k] == null ? '' : patch[k]); }); return; }
  c.ops.push({ kind: 'update', table: name, row, patch: clean });
}

export function deleteRow_(name: string, rowId: any) {
  const c = cx();
  const list = c.tables[name] || [];
  const i = list.findIndex((o) => o._row === rowId);
  const row = i >= 0 ? list[i] : { _row: rowId };
  if (i >= 0) list.splice(i, 1);
  const ii = c.ops.findIndex((o) => o.kind === 'insert' && o.table === name && o.row._row === rowId);
  if (ii >= 0) { c.ops.splice(ii, 1); return; }
  c.ops.push({ kind: 'delete', table: name, row });
}

/* Inserta o reemplaza por la clave (tablas Sistema y Cache) */
function upsert_(name: string, key: string, obj: Row) {
  const c = cx();
  const list = c.tables[name] || (c.tables[name] = []);
  let row = list.find((o) => o.clave === key);
  if (row) Object.keys(obj).forEach((k) => { row![k] = String(obj[k] == null ? '' : obj[k]); });
  else { row = { _row: 'nuevo:' + (++c.seq), clave: key }; Object.keys(COLS[name]).forEach((k) => { if (k !== 'clave') row![k] = String(obj[k] == null ? '' : obj[k]); }); list.push(row); }
  c.ops = c.ops.filter((o) => !(o.kind === 'upsert' && o.table === name && o.row.clave === key));
  c.ops.push({ kind: 'upsert', table: name, row });
}

/* ---- Estado del sistema (antes: Propiedades del script) ---- */
export function sysGet(k: string): string { const r = (cx().tables.Sistema || []).find((x) => x.clave === k); return r ? String(r.valor || '') : ''; }
export function sysSet(k: string, v: any) { upsert_('Sistema', k, { clave: k, valor: String(v == null ? '' : v) }); }

/* ---- Memoria temporal con vencimiento (antes: CacheService) ---- */
export function cacheGet(k: string): string | null {
  const r = (cx().tables.Cache || []).find((x) => x.clave === k);
  if (!r) return null;
  if (r.vence && new Date(r.vence).getTime() <= Date.now()) return null;
  return String(r.valor);
}
export function cachePut(k: string, v: any, seconds: number) { upsert_('Cache', k, { clave: k, valor: String(v), vence: new Date(Date.now() + seconds * 1000).toISOString() }); }
export function cacheRemove(k: string) { const r = (cx().tables.Cache || []).find((x) => x.clave === k); if (r) deleteRow_('Cache', r._row); }

/* ---- Guardar ---- */

function toDb(col: Col, v: any): any {
  const t = v == null ? '' : String(v).trim();
  switch (col.type) {
    case 'text': return v == null || v === '' ? null : String(v);
    case 'int': { if (t === '') return null; const n = Number(t.replace(',', '.')); return isFinite(n) ? Math.round(n) : null; }
    case 'num': { if (t === '') return null; const n = Number(t.replace(',', '.')); return isFinite(n) ? t.replace(',', '.') : null; }
    case 'bool': if (/^(s[ií]|true|1)$/i.test(t)) return true; if (/^(no|false|0)$/i.test(t)) return false; return null;
    case 'date': return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
    case 'time': { const m = t.match(/^(\d{1,2}):(\d{2})/); return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null; }
    case 'ts': { if (!t) return null; const d = new Date(t); return isNaN(d.getTime()) ? null : d.toISOString(); }
    case 'json': { if (t === '') return null; try { return { __json: JSON.parse(t) }; } catch (e) { return null; } }
  }
}
function dbObject(tx: any, name: string, row: Row, keys?: string[]) {
  const cols = COLS[name];
  const o: Record<string, any> = {};
  (keys || Object.keys(cols)).forEach((k) => {
    if (!cols[k] || !(k in row)) return;
    const v = toDb(cols[k], row[k]);
    o[cols[k].col] = v && typeof v === 'object' && '__json' in v ? tx.json(v.__json) : v;   // jsonb: con el ayudante de postgres.js
  });
  return o;
}

export async function commit(tx: any) {
  const c = cx();
  const ops = c.ops;
  c.ops = [];
  for (const op of ops) {
    const t = TABLE[op.table];
    if (op.kind === 'insert') {
      const o = dbObject(tx, op.table, op.row);
      const res = await tx`insert into ${tx('public.' + t.table)} ${tx(o)} returning row_id`;
      op.row._row = Number(res[0].row_id);
    } else if (op.kind === 'update') {
      if (typeof op.row._row !== 'number') continue;
      const o = dbObject(tx, op.table, op.patch, Object.keys(op.patch));
      if (Object.keys(o).length) await tx`update ${tx('public.' + t.table)} set ${tx(o)} where row_id = ${op.row._row}`;
    } else if (op.kind === 'delete') {
      if (typeof op.row._row === 'number') await tx`delete from ${tx('public.' + t.table)} where row_id = ${op.row._row}`;
    } else if (op.kind === 'upsert') {
      const o = dbObject(tx, op.table, op.row);
      const keys = Object.keys(o).filter((k) => k !== 'clave');
      await tx`insert into ${tx('public.' + t.table)} ${tx(o)} on conflict (clave) do update set ${tx(o, keys)}`;
    }
  }
  return ops.length;
}
