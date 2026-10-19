/* ==========================================================================
   MAJOBELLA · Configuración general
   Edita este archivo para cambiar datos de contacto, horarios y conexiones.
   Los servicios y precios están en js/data/services.js
   ========================================================================== */
window.MAJOBELLA_CONFIG = {
  brand: {
    name: 'MAJOBELLA',
    // Eslogan tal como aparece en la web. Cámbialo aquí si lo prefieres sin tilde.
    slogan: 'MÁS YO, MÁS BELLA.',
  },

  /* WhatsApp ---------------------------------------------------------------
     Número en formato internacional, solo dígitos, sin "+" ni espacios.
     Ejemplo de formato: 18095551234 (código de país 1 + número).
     Mientras esté vacío, los botones de WhatsApp muestran un aviso en lugar de abrir el chat. */
  whatsapp: {
    number: '18299784986',
    display: '829-978-4986',
    greeting: 'Hola, quiero agendar una cita en MAJOBELLA.',
  },

  /* Inicio de sesión con Google -------------------------------------------
     1. En https://console.cloud.google.com crea un proyecto → "APIs y servicios" → "Credenciales".
     2. "Crear credenciales" → "ID de cliente de OAuth" → tipo "Aplicación web".
     3. En "Orígenes autorizados de JavaScript" añade el dominio de la web (ej. https://majobella.com).
     4. Copia el ID de cliente (termina en .apps.googleusercontent.com) aquí y en el backend (Code.gs). */
  google: {
    clientId: '',
  },

  /* Redes sociales (deja vacío lo que no uses) */
  social: {
    instagram: '', // ej. https://www.instagram.com/tu_usuario
    tiktok: '',    // ej. https://www.tiktok.com/@tu_usuario
  },

  /* Datos de contacto visibles en la web (opcionales) */
  contact: {
    address: 'Santo Domingo, República Dominicana',   // añade calle, número y sector si quieres mostrarlos
    email: '',     // correo del estudio
    mapsUrl: 'https://maps.app.goo.gl/d4uX28GuoKuyHuhf8',   // enlace de Google Maps
    lat: 18.465401,   // coordenadas del estudio (para Waze)
    lng: -69.9737548,
  },

  currency: { symbol: 'RD$', locale: 'es-DO' },

  /* Horario de atención --------------------------------------------------
     day: 0 = domingo, 1 = lunes ... 6 = sábado. Usa null para días cerrados.
     Las horas disponibles se generan con este horario y la duración de los servicios. */
  schedule: {
    timeZone: 'America/Santo_Domingo',
    utcOffset: '-04:00',      // República Dominicana no usa horario de verano
    hours: {
      // Igual que el horario publicado en Google Maps
      0: { open: '10:00', close: '13:00' },
      1: null,
      2: { open: '10:00', close: '17:00' },
      3: { open: '10:00', close: '17:00' },
      4: { open: '10:00', close: '17:00' },
      5: { open: '10:00', close: '17:00' },
      6: { open: '10:00', close: '17:00' },
    },
    slotStepMinutes: 30,      // cada cuánto empieza una cita posible
    minNoticeHours: 3,        // antelación mínima para reservar
    maxDaysAhead: 60,         // hasta cuántos días en el futuro se puede reservar
    blockedDates: [],         // días cerrados puntuales, formato 'AAAA-MM-DD'
  },

  /* Políticas que se muestran al reservar (deja en 0 para ocultar) */
  policies: {
    changeHours: 24,          // "Puedes cambiar o cancelar hasta 24 horas antes."
    arriveEarlyMinutes: 10,   // "Te recomendamos llegar 10 minutos antes."
  },

  /* Sistema de reservas ----------------------------------------------------
     apiUrl vacío: la cita se envía por WhatsApp y la clienta puede añadirla a su calendario.
     Con apiUrl: la web consulta la disponibilidad real y registra la cita en el calendario
     de MAJOBELLA. Ver backend/google-apps-script/Code.gs y README.md. */
  booking: {
    apiUrl: '',
    studioCalendarName: 'MAJOBELLA',
    reminderMinutesBefore: 120,
  },
};
