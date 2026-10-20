/* MAJOBELLA · Diseño de las apps: el mismo de la web (blanco y negro, serif, líneas finas) */
export const colors = {
  ink: '#111111',
  black: '#000000',
  text: '#111111',
  muted: '#575757',
  faint: '#8a8a8a',
  paper: '#ffffff',
  sand: '#f2f2f2',
  beige: '#e6e6e6',
  line: 'rgba(0,0,0,0.12)',
  lineStrong: 'rgba(0,0,0,0.3)',
  error: '#a3261b',
  ok: '#2f6b3a',
  warn: '#8a5a00',
};
export const fonts = {
  serif: 'SourceSerif4_400Regular',
  serifItalic: 'SourceSerif4_400Regular_Italic',
  serifSemi: 'SourceSerif4_600SemiBold',
};
export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 };
export const radius = { none: 0, sm: 4, md: 10, pill: 999 };

/* Estado de una cita en palabras */
export const STATUS_LABEL: Record<string, string> = {
  retenida: 'Por pagar', expirada: 'Vencida', confirmada: 'Confirmada', completada: 'Completada',
  'no-asistio': 'No asistió', cancelada: 'Cancelada', 'por-confirmar': 'Por confirmar', bloqueo: 'Bloqueo',
};
