/* MAJOBELLA · Esquema de la base de datos (PostgreSQL / Supabase)
   Una sola definición para todo:
   - dev/gen-migration.ts genera con ella el SQL de las tablas;
   - db.ts la usa para leer y escribir cada columna con su tipo.
   Cada tabla tiene su nombre en la base (snake_case) y el nombre que usa la lógica (el de la antigua hoja). */

export type ColType = 'text' | 'int' | 'num' | 'bool' | 'date' | 'time' | 'ts' | 'json';
export interface Col { key: string; col: string; type: ColType; notNull?: boolean; check?: string; default?: string }
export interface Table { name: string; table: string; pk: string | null; cols: Col[]; indexes?: string[]; comment: string; migration?: string }

const c = (key: string, type: ColType = 'text', extra: Partial<Col> = {}): Col => ({ key, col: snake(key), type, ...extra });
export function snake(k: string): string {
  return k.replace(/RD$/, 'Rd').replace(/USD$/, 'Usd').replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}

const ESTADOS_CITA = ['retenida', 'expirada', 'confirmada', 'completada', 'no-asistio', 'cancelada', 'bloqueo', 'por-confirmar'];
const inList = (list: string[]) => `in (${list.map((x) => `'${x}'`).join(', ')})`;

export const TABLES: Table[] = [
  {
    name: 'Reservas', table: 'reservas', pk: 'id', comment: 'Cada cita: estado, horario, clienta, pagos y origen.',
    cols: [
      c('id', 'text', { notNull: true }), c('creada', 'ts'), c('estado', 'text', { notNull: true, check: inList(ESTADOS_CITA) }),
      c('fecha', 'date'), c('hora', 'time'), c('inicio', 'ts'), c('fin', 'ts'), c('duracionMin', 'int'),
      c('servicios'), c('serviciosJson', 'json'), c('totalRD', 'num'), c('depositoRD', 'num'), c('depositoUSD', 'num'), c('saldoRD', 'num'),
      c('clienta'), c('telefono'), c('correo'), c('nota'), c('tokenHash'),
      c('paypalOrden'), c('paypalCaptura'), c('depositoPagado', 'ts'),
      c('saldoEstado'), c('saldoMetodo'), c('saldoPagado', 'ts'), c('saldoOrden'), c('saldoCaptura'), c('saldoUSD', 'num'),
      c('retenidaHasta', 'ts'), c('eventoId'), c('canceladaEn', 'ts'), c('canceladaPor'), c('reembolso'), c('notaInterna'),
      c('subtotalRD', 'num'), c('descuentoRD', 'num'), c('promoId'), c('codigo'), c('giftCodigo'), c('giftRD', 'num'),
      c('metodoDeposito'), c('origen'), c('canal'), c('creadaPor'), c('reprogramadaDe'),
      c('recordatorio', 'ts'), c('resenaPedida'), c('retoqueAviso'), c('firmaToken'), c('consentimiento', 'ts'), c('consentimientoArchivo'), c('permisoFotos', 'bool'), c('consentimientosJson', 'json'),
      c('bonoCodigo'), c('bonoRD', 'num'), c('fidelidad', 'bool'), c('cumpleanos'),
      c('comprobanteId'), c('comprobanteEn', 'ts'), c('cuentaId'), c('transferenciaRef'), c('revisadaEn', 'ts'), c('cambios', 'int'),
    ],
    indexes: ['fecha', 'estado', 'inicio', 'correo', 'paypal_orden'],
  },
  {
    name: 'Ajustes', table: 'ajustes', pk: 'clave', comment: 'Ajustes del estudio (tasa del dólar, horario, políticas, textos de la web…).',
    cols: [c('clave', 'text', { notNull: true }), c('valor'), { key: 'qué es', col: 'descripcion', type: 'text' }],
  },
  {
    name: 'Categorias', table: 'categorias', pk: 'id', comment: 'Categorías visuales del catálogo público.',
    cols: [c('id', 'text', { notNull: true }), c('nombre'), c('orden', 'int'), c('activo', 'bool'), c('estado')],
  },
  {
    name: 'Servicios', table: 'servicios', pk: 'id', comment: 'Servicios: precio, duración, depósito y avisos.',
    cols: [
      c('id', 'text', { notNull: true }), c('nombre'), c('duracionMin', 'int'), c('precioRD', 'num'), c('precioDesde', 'bool'), c('activo', 'bool'),
      c('volverDias', 'int'), c('depositoPct', 'num'), c('retoqueDias', 'int'), c('consentimiento', 'bool'),
      c('categoriaId'), c('padreId'), c('tipo'), c('orden', 'int'), c('descripcion'), c('estado'), c('consentTemplateId'),
    ],
  },
  {
    name: 'PlantillasConsentimiento', table: 'plantillas_consentimiento', pk: 'id', comment: 'Plantillas informadas del estudio con preguntas y reglas de elegibilidad.',
    cols: [
      c('id', 'text', { notNull: true }), c('nombre'), c('descripcion'), c('texto'),
      c('estado'), c('preguntas', 'json'), c('actualizado', 'ts'),
    ],
  },
  {
    name: 'Bloqueos', table: 'bloqueos', pk: 'id', comment: 'Horarios bloqueados: una vez, varios días o cada semana.',
    cols: [
      c('id', 'text', { notNull: true }), c('tipo', 'text', { check: inList(['unico', 'rango', 'semanal']) }), c('dias'),
      c('horaDesde', 'time'), c('horaHasta', 'time'), c('fechaDesde', 'date'), c('fechaHasta', 'date'), c('motivo'), c('activo', 'bool'), c('creada', 'ts'),
    ],
  },
  {
    name: 'Clientas', table: 'clientas', pk: 'clave', comment: 'Ficha de cada clienta (la clave es su correo o su teléfono).',
    cols: [c('clave', 'text', { notNull: true }), c('nombre'), c('telefono'), c('correo'), c('notas'), c('cumpleanos'), c('actualizada', 'ts'), c('cumpleEnviado')],
  },
  {
    name: 'Archivos', table: 'archivos', pk: 'id', comment: 'Fotos de antes y después, consentimientos y comprobantes (el archivo está en Storage, carpeta privada).',
    cols: [
      c('id', 'text', { notNull: true }), c('clave'), c('tipo'), c('nombre'), c('mime'),
      { key: 'driveId', col: 'ruta', type: 'text' }, c('citaId'), c('fecha', 'date'), c('nota'), c('creada', 'ts'),
    ],
    indexes: ['clave', 'cita_id'],
  },
  {
    name: 'Promociones', table: 'promociones', pk: 'id', comment: 'Descuentos automáticos y códigos de descuento.',
    cols: [
      c('id', 'text', { notNull: true }), c('nombre'), c('tipo'), c('codigo'), c('servicios'), c('descuentoTipo'), c('valor', 'num'),
      c('desde', 'date'), c('hasta', 'date'), c('usosMax', 'int'), c('usos', 'int'), c('activo', 'bool'), c('creada', 'ts'),
    ],
  },
  {
    name: 'Tarjetas', table: 'tarjetas', pk: 'id', comment: 'Tarjetas de regalo.',
    cols: [
      c('id', 'text', { notNull: true }), c('codigo'), c('montoRD', 'num'), c('saldoRD', 'num'), c('comprador'), c('para'), c('mensaje'), c('metodoPago'),
      c('vendida', 'date'), c('vence', 'date'), c('estado'), c('creada', 'ts'), c('correoComprador'), c('correoPara'), c('paypalOrden'), c('paypalCaptura'),
    ],
    indexes: ['codigo'],
  },
  {
    name: 'Gastos', table: 'gastos', pk: 'id', comment: 'Gastos del estudio (para la ganancia real).',
    cols: [c('id', 'text', { notNull: true }), c('fecha', 'date'), c('concepto'), c('categoria'), c('montoRD', 'num'), c('metodo'), c('creada', 'ts')],
  },
  {
    name: 'Galeria', table: 'galeria', pk: 'id', comment: 'Fotos de antes y después publicadas en la web (copias en Storage, carpeta pública).',
    cols: [c('id', 'text', { notNull: true }), c('servicio'), c('antesId'), c('despuesId'), c('antesUrl'), c('despuesUrl'), c('texto'), c('orden', 'int'), c('visible', 'bool'), c('creada', 'ts')],
  },
  {
    name: 'Resenas', table: 'resenas', pk: 'id', comment: 'Reseñas reales de Google que se muestran en la web.',
    cols: [c('id', 'text', { notNull: true }), c('autora'), c('estrellas', 'int'), c('texto'), c('fecha', 'date'), c('visible', 'bool'), c('orden', 'int'), c('creada', 'ts')],
  },
  {
    name: 'Paquetes', table: 'paquetes', pk: 'id', comment: 'Paquetes de sesiones que vende el estudio.',
    cols: [
      c('id', 'text', { notNull: true }), c('nombre'), c('servicio'), c('sesiones', 'int'), c('precioRD', 'num'), c('venceDias', 'int'), c('descripcion'),
      c('enWeb', 'bool'), c('activo', 'bool'), c('creada', 'ts'),
    ],
  },
  {
    name: 'Bonos', table: 'bonos', pk: 'id', comment: 'Paquetes vendidos a cada clienta (sesiones usadas, código, vencimiento).',
    cols: [
      c('id', 'text', { notNull: true }), c('codigo'), c('paqueteId'), c('nombre'), c('servicio'), c('sesiones', 'int'), c('usadas', 'int'),
      c('clienta'), c('telefono'), c('correo'), c('montoRD', 'num'), c('metodoPago'), c('vendida', 'date'), c('vence', 'date'), c('estado'),
      c('paypalOrden'), c('paypalCaptura'), c('creada', 'ts'),
    ],
    indexes: ['codigo', 'correo'],
  },
  {
    name: 'Espera', table: 'espera', pk: 'id', comment: 'Lista de espera por día.',
    cols: [
      c('id', 'text', { notNull: true }), c('fecha', 'date'), c('franja'), c('serviciosJson', 'json'), c('servicios'), c('duracionMin', 'int'),
      c('clienta'), c('telefono'), c('correo'), c('estado'), c('creada', 'ts'), c('avisada', 'ts'),
    ],
    indexes: ['fecha'],
  },
  {
    name: 'Correos', table: 'correos', pk: null, comment: 'Historial de correos enviados.',
    cols: [c('fecha', 'ts'), c('tipo'), c('para'), c('asunto'), c('ref'), c('estado')],
  },
  {
    name: 'Cuentas', table: 'cuentas', pk: 'id', comment: 'Cuentas bancarias para el depósito por transferencia.',
    cols: [c('id', 'text', { notNull: true }), c('banco'), c('tipo'), c('numero'), c('titular'), c('documento'), c('nota'), c('activa', 'bool'), c('orden', 'int'), c('creada', 'ts')],
  },
  {
    name: 'Errores', table: 'errores', pk: null, comment: 'Avisos del sistema (cobros por revisar, correos que no salieron, tareas que fallaron).',
    cols: [c('fecha', 'ts'), c('tipo'), c('mensaje'), c('ref'), c('detalle'), c('avisado', 'ts'), c('resuelto', 'ts')],
  },
  {
    name: 'Sistema', table: 'sistema', pk: 'clave', comment: 'Estado interno del sistema (última ejecución de las tareas, avisos enviados, accesos al panel).',
    cols: [c('clave', 'text', { notNull: true }), c('valor')],
  },
  {
    name: 'Cache', table: 'cache', pk: 'clave', comment: 'Valores temporales (límites de intentos, token de PayPal). Se borran solos al vencer.',
    cols: [c('clave', 'text', { notNull: true }), c('valor'), c('vence', 'ts')],
  },
  {
    // Celulares con la app de clientas o la del estudio: reciben un aviso con cada correo que se envía a su cuenta
    name: 'Dispositivos', table: 'dispositivos', pk: 'token', comment: 'Celulares con la app (avisos push): cuenta, app y plataforma.',
    migration: '20261021000000_dispositivos',
    cols: [c('token', 'text', { notNull: true }), c('correo', 'text', { notNull: true }), c('app', 'text', { check: inList(['cliente', 'estudio']) }), c('plataforma'), c('creado', 'ts'), c('visto', 'ts')],
    indexes: ['correo'],
  },
];

export const TABLE: Record<string, Table> = Object.fromEntries(TABLES.map((t) => [t.name, t]));
export const COLS: Record<string, Record<string, Col>> = Object.fromEntries(TABLES.map((t) => [t.name, Object.fromEntries(t.cols.map((x) => [x.key, x]))]));

/* Tablas que casi nunca hacen falta y crecen sin parar: solo se cargan cuando la acción las pide */
export const HEAVY = ['Correos', 'Errores', 'Dispositivos'];
