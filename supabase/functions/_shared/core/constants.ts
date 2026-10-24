/* MAJOBELLA · Constantes del backend (ajustes por defecto, servicios iniciales, textos fijos) */

export const GOOGLE_CLIENT_ID = '333956941163-rlgrb3759jf2uc05olhhpm9e2ggrhm1s.apps.googleusercontent.com';
export const TZ = 'America/Santo_Domingo';
export const UTC_OFFSET = '-04:00';              // República Dominicana no usa horario de verano

// Estados que ocupan la agenda
export const BUSY_STATES = ['confirmada', 'completada', 'no-asistio', 'bloqueo', 'por-confirmar'];

export const DEFAULT_SETTINGS: string[][] = [
  ['tasaUSD', '63', 'Pesos dominicanos por 1 US$. PayPal no cobra en RD$: el depósito se convierte con esta tasa.'],
  ['tasaUSDModo', 'manual', 'manual o automatico. Si es automático se actualiza con una tasa de mercado indicativa, con controles de antigüedad y variación.'],
  ['tasaUSDFuente', '', 'Origen informativo de la última actualización automática.'],
  ['tasaUSDActualizada', '', 'Momento en que se actualizó la tasa automáticamente.'],
  ['gastosRecurrentes', '[]', 'Plantillas de gastos fijos programados; las futuras cuotas se crean como pendientes de pago.'],
  ['porcentajeDeposito', '50', 'Depósito para servicios sin porcentaje propio (cada servicio lo define en la pestaña Servicios).'],
  ['minutosRetencion', '15', 'Minutos que se aparta el horario mientras la clienta paga.'],
  ['horasCancelacion', '24', 'Si cancela con al menos estas horas de aviso, se le devuelve el depósito.'],
  ['minAntelacionHoras', '3', 'Antelación mínima para reservar.'],
  ['maxDiasAdelante', '60', 'Hasta cuántos días en el futuro se puede reservar.'],
  ['intervaloMinutos', '30', 'Cada cuánto empieza una cita posible.'],
  ['horario_domingo', '10:00-13:00', 'Formato 10:00-17:00, o "cerrado".'],
  ['horario_lunes', 'cerrado', ''],
  ['horario_martes', '10:00-17:00', ''],
  ['horario_miercoles', '10:00-17:00', ''],
  ['horario_jueves', '10:00-17:00', ''],
  ['horario_viernes', '10:00-17:00', ''],
  ['horario_sabado', '10:00-17:00', ''],
  ['diasCerrados', '', 'Días cerrados puntuales separados por coma: 2026-12-25, 2027-01-01'],
  ['correoAvisos', '', 'Correo que recibe un aviso por cada reserva (vacío = los de ADMIN_EMAILS).'],
  ['calendarioId', 'primary', 'Calendario donde se agendan las citas ("primary" = el principal). Vacío = no usar calendario. Necesita el conector de Google.'],
  ['invitarClienta', 'si', 'si/no: la clienta recibe la invitación de Google Calendar.'],
  ['direccion', 'MAJOBELLA Beauty Studio, Santo Domingo', 'Se usa en los correos y en el calendario.'],
  ['mapsUrl', 'https://maps.app.goo.gl/d4uX28GuoKuyHuhf8', ''],
  ['webUrl', 'https://anthonyhenriquezluciano.github.io/Majo_Bella/', 'Dirección de la web (enlaces de los correos).'],
  ['comisionPaypalPct', '5.4', 'Comisión de PayPal por pago recibido (%). Para calcular la ganancia real.'],
  ['comisionPaypalFijoUSD', '0.30', 'Cargo fijo de PayPal por pago (US$).'],
  ['conversionPct', '3.5', 'Pérdida al convertir dólares a pesos al retirar de PayPal (%).'],
  ['anuncioActivo', 'si', 'si/no: mostrar la franja de anuncio arriba de la web.'],
  ['anuncioTexto', '', 'Texto de la franja. Vacío = se anuncia sola la promoción automática vigente.'],
  ['anuncioEnlace', '', 'A dónde lleva la franja (vacío = a Reservar).'],
  ['googleRating', '', 'Puntuación de tu perfil de Google, por ejemplo 4.9.'],
  ['googleResenas', '', 'Cuántas reseñas tienes en Google.'],
  ['googleUrl', '', 'Enlace a tu perfil de Google para ver todas las reseñas.'],
  ['googleResenaUrl', '', 'Enlace para dejar una reseña (Perfil de Empresa de Google → Pedir reseñas).'],
  ['majoTitulo', 'Conoce a Majo', 'Título de la sección.'],
  ['majoTexto', '', 'Tu historia, en uno o varios párrafos.'],
  ['majoCerts', '', 'Formación y certificaciones, una por línea.'],
  ['majoFotoUrl', '', 'Se llena solo al subir la foto desde el dashboard.'],
  ['tarjetasEnLinea', 'si', 'si/no: vender tarjetas de regalo en la web.'],
  ['tarjetaMin', '500', 'Valor mínimo de una tarjeta de regalo en la web (RD$).'],
  ['tarjetaMax', '30000', 'Valor máximo de una tarjeta de regalo en la web (RD$).'],
  ['tarjetaVenceDias', '365', 'Días de validez de las tarjetas compradas en la web.'],
  ['whatsapp', '18299435470', 'WhatsApp del estudio con código de país, solo números (para los correos).'],
  ['recordatorioActivo', 'si', 'si/no: correo de recordatorio antes de cada cita.'],
  ['recordatorioHoras', '24', 'Cuántas horas antes de la cita se envía el recordatorio.'],
  ['resenaActiva', 'si', 'si/no: pedir una reseña de Google después de la cita realizada.'],
  ['resenaHoras', '3', 'Horas después de terminar la cita para pedir la reseña.'],
  ['retoqueActivo', 'si', 'si/no: avisar a la clienta cuando le toca el retoque (días por servicio en Servicios).'],
  ['cumpleActivo', 'si', 'si/no: correo de cumpleaños con un código de regalo.'],
  ['cumpleDescuento', '15', 'Descuento del regalo de cumpleaños (%).'],
  ['cumpleDias', '30', 'Días de validez del código de cumpleaños.'],
  ['esperaActiva', 'si', 'si/no: lista de espera en la web y aviso cuando se libera un horario.'],
  ['fidelidadActiva', 'si', 'si/no: premio por visitas.'],
  ['fidelidadVisitas', '5', 'Cada cuántas visitas realizadas se gana el premio (en la siguiente cita).'],
  ['fidelidadTipo', 'porcentaje', 'porcentaje o monto.'],
  ['fidelidadValor', '20', 'Valor del premio (% o RD$).'],
  ['consentimientoTexto', '', 'Texto del consentimiento que firma la clienta (vacío = texto general).'],
  ['transferenciaActiva', 'si', 'si/no: la clienta puede pagar el depósito por transferencia (necesita al menos una cuenta en Cuentas).'],
  ['transferenciaMinutos', '60', 'Minutos que tiene la clienta para subir el comprobante; si no lo sube, el horario se libera.'],
  ['cambiosMax', '1', 'Cuántas veces puede la clienta cambiar la fecha de una cita ella misma (0 = solo por WhatsApp).'],
  ['negocioNombre', 'MAJOBELLA Beauty Studio', 'Nombre legal o comercial (términos y privacidad).'],
  ['negocioRnc', '', 'RNC o cédula del negocio (opcional, términos y privacidad).'],
  ['negocioCorreo', '', 'Correo de contacto para temas legales y de datos personales.'],
  ['turnstileSiteKey', '', 'Clave del sitio de Cloudflare Turnstile (protección contra robots). La secreta va en Propiedades del script.'],
  ['adminInactividadMin', '30', 'Minutos sin usar el dashboard para cerrar la sesión sola.'],
];

export const LONG_SETTINGS = ['majoTexto', 'majoCerts', 'consentimientoTexto', 'gastosRecurrentes'];

export const SETTING_KEYS = DEFAULT_SETTINGS.map((x) => x[0]);

// [id, nombre, minutos, precio, desde, activo, vuelve cada, % depósito, retoque a los días, pide consentimiento]
export const DEFAULT_SERVICES: any[][] = [
  ['faciales', 'Faciales', 60, 2500, 'no', 'si', 30, 50, 0, 'si'],
  ['cejas', 'Cejas', 45, 900, 'no', 'si', 28, 50, 0, 'no'],
  ['pestanas', 'Pestañas', 60, 1800, 'no', 'si', 21, 50, 0, 'si'],
  ['micropigmentacion', 'Micropigmentación', 150, 12000, 'no', 'si', 365, 50, 45, 'si'],
  ['depilacion', 'Depilación facial y corporal', 30, 500, 'si', 'si', 30, 50, 0, 'no'],
];

export const DAY_KEYS = ['horario_domingo', 'horario_lunes', 'horario_martes', 'horario_miercoles', 'horario_jueves', 'horario_viernes', 'horario_sabado'];

export const FILE_TYPES = ['antes', 'despues', 'consentimiento', 'comprobante', 'otro'];

export const FILE_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

export const MAX_FILE_BYTES = 12 * 1024 * 1024;

export const CONSENT_QUESTIONS: { id: string; text: string; detail?: boolean }[] = [
  { id: 'embarazo', text: '¿Estás embarazada o en período de lactancia?' },
  { id: 'alergias', text: '¿Tienes alergias (medicamentos, látex, anestesia, pigmentos, cosméticos)?', detail: true },
  { id: 'medicamentos', text: '¿Tomas algún medicamento? (por ejemplo anticoagulantes, aspirina, isotretinoína/Roaccutane, antibióticos)', detail: true },
  { id: 'salud', text: '¿Tienes diabetes, problemas de coagulación, hipertensión o alguna enfermedad autoinmune?', detail: true },
  { id: 'cicatrizacion', text: '¿Tienes tendencia a cicatrices queloides o problemas de cicatrización?' },
  { id: 'piel', text: '¿Tienes alguna condición en la piel de la zona (acné activo, dermatitis, herpes, irritación)?', detail: true },
  { id: 'procedimientos', text: '¿Te hiciste en los últimos 30 días peeling, láser, bótox o rellenos en la zona?', detail: true },
  { id: 'lentes', text: '¿Usas lentes de contacto?' },
];

export const DEFAULT_CONSENT = [
  'Declaro que la información que di sobre mi salud es verdadera y completa, y que avisaré al estudio de cualquier cambio antes del servicio.',
  'Me explicaron en qué consiste el servicio, los cuidados antes y después, y los resultados que puedo esperar. Entiendo que el resultado depende de mi tipo de piel, de mi salud y de que siga los cuidados indicados, y que puede necesitar un retoque.',
  'Conozco las posibles reacciones, como enrojecimiento, inflamación o sensibilidad y, con menos frecuencia, reacciones alérgicas, y me comprometo a avisar al estudio si se presentan.',
  'Autorizo a MAJOBELLA Beauty Studio a realizar el servicio y a tomar fotos de antes y después para mi ficha, que se guardan de forma privada.',
  'Pude hacer todas las preguntas que necesité y puedo retirar este consentimiento antes de que empiece el servicio.',
].join('\n\n');

export const TOO_MANY = 'Demasiados intentos con códigos que no existen. Espera unos minutos e inténtalo de nuevo.';

export const NOT_HUMAN = 'No pudimos comprobar que no eres un robot. Recarga la página e inténtalo de nuevo.';

export const ERROR_TITLES: Record<string, string> = {
  pago: 'Un cobro necesita revisión',
  correo: 'Un correo no se pudo enviar',
  automatizacion: 'Las tareas automáticas tienen un problema',
  sistema: 'Hubo un error en el sistema',
};

export const NAME_PARTICLES = ['de', 'del', 'la', 'las', 'los', 'y', 'e', 'da', 'das', 'do', 'dos', 'di', 'van', 'von'];

export const PHONE_ERROR = 'Revisa el teléfono: debe tener 10 dígitos, por ejemplo 809-555-1234. Si es de otro país, empieza con + y el código.';

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const NAME_RE = /^[\p{L}][\p{L}\p{M}'’.\- ]*$/u;
