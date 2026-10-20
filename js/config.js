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
    // WhatsApp es para dudas e información; las citas se reservan y se pagan en la web.
    greeting: 'Hola, tengo una pregunta sobre MAJOBELLA.',
  },

  /* Inicio de sesión con Google -------------------------------------------
     1. En https://console.cloud.google.com crea un proyecto → "APIs y servicios" → "Credenciales".
     2. "Crear credenciales" → "ID de cliente de OAuth" → tipo "Aplicación web".
     3. En "Orígenes autorizados de JavaScript" añade el dominio de la web (ej. https://majobella.com).
     4. Copia el ID de cliente (termina en .apps.googleusercontent.com) aquí y en el backend (Code.gs). */
  google: {
    clientId: '333956941163-rlgrb3759jf2uc05olhhpm9e2ggrhm1s.apps.googleusercontent.com',
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
     URL de la aplicación web de Google Apps Script (termina en /exec).
     Con ella, las reservas se guardan en la hoja de Google de MAJOBELLA, los horarios ocupados
     se ven en gris para todas y el dashboard (admin.html) muestra la agenda.
     Pasos en backend/google-apps-script/INSTALAR.md */
  booking: {
    apiUrl: 'https://script.google.com/macros/s/AKfycbxTtcibU04A-shJ2iKioIu6glN9uLDloUoSiJ3Y2bSuSAPDaRdzQ9TjEMTwxmaG5HVp/exec',
    studioCalendarName: 'MAJOBELLA',
    reminderMinutesBefore: 120,
  },

  /* Pagos con PayPal -------------------------------------------------------
     La cita se aparta pagando un depósito; el saldo se paga al terminar (efectivo o PayPal).
     PayPal no cobra en pesos dominicanos: el depósito se cobra en dólares con la tasa de abajo.
     Con el backend activo, la tasa y el porcentaje se toman de la pestaña "Ajustes" de la hoja.
     paypalClientId: ID de cliente PÚBLICO de la app de PayPal (sandbox para pruebas, live para cobrar).
     El secreto de PayPal NUNCA va aquí: se guarda en las propiedades del script de Apps Script. */
  payments: {
    enabled: true,
    paypalClientId: 'BAAPu52Nua2n7aV6kWfyDD9Am8Hn6IDSnL9-eztQfm3_TpDqZxiuiR6wFwzCp9bZpL3mbZRers9Rn5Arns',
    depositPercent: 50,
    usdRate: 63,              // RD$ por 1 US$ (ejemplo: actualízala en la hoja "Ajustes")
    holdMinutes: 15,          // minutos que se aparta el horario mientras la clienta paga
  },

  /* La app MAJOBELLA (nativa, Android y iPhone) ------------------------------
     androidUrl: enlace del archivo .apk de la app (o de Google Play cuando se publique). Vacío = «Muy pronto».
     iosUrl: enlace de App Store o de TestFlight. Vacío = en iPhone se ofrece la versión web (si iosWebApp es true).
     iosWebApp: mientras la app no esté en App Store, en iPhone se usa la versión web de la app (carpeta app/). */
  app: {
    androidUrl: '',
    iosUrl: '',
    iosWebApp: true,
    studioAndroidUrl: '',   // app del estudio (solo se muestra en el dashboard, no en la web pública)
  },
};
