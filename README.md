# MAJOBELLA · Sitio web

Web estática (HTML, CSS y JavaScript sin compilación). Se puede publicar tal cual en Netlify, Vercel, GitHub Pages, Hostinger o cualquier hosting.

## Estructura

```
index.html                      Página (secciones y textos)
css/styles.css                  Estilos, colores y tipografías
js/config.js                    WhatsApp, redes, contacto, horario y conexión de reservas
js/data/services.js             Servicios: nombre, precio, duración y detalle (para quién, qué incluye, preparación, cuidados)
js/data/faq.js                  Preguntas frecuentes
js/data/brows.js                Forma de las cejas sobre el rostro ilustrado
js/core/utils.js                Estado compartido y formatos (precio, fechas, horas)
js/integrations/whatsapp.js     Mensajes y enlaces de WhatsApp
js/integrations/calendar.js     Google Calendar y archivo .ics (Apple, Outlook)
js/integrations/booking-api.js  Disponibilidad, registro, consulta y cancelación de citas (backend)
js/integrations/google-auth.js  Inicio de sesión con Google
js/integrations/appointments.js Registro de citas de la clienta (Citas)
js/components/*.js              Menú, rostro ilustrado, cejas, servicios, barra de suma, reservas, citas, contacto
backend/google-apps-script/     Backend gratuito con Google Calendar
assets/                         Logos, monograma, favicon y fuentes
```

## Antes de publicar

1. **WhatsApp**: en `js/config.js`, escribe el número en `whatsapp.number` (solo dígitos, con código de país; por ejemplo `1809…`).
2. **Precios y duraciones**: en `js/data/services.js`. Los valores actuales son de ejemplo.
3. **Google**: para el botón "Continuar con Google", crea el ID de cliente (pasos en `js/config.js`) y ponlo en `google.clientId` y en `GOOGLE_CLIENT_ID` de `Code.gs`.
4. **Redes y contacto**: `social.instagram`, `social.tiktok`, `contact.address`, `contact.email`.
5. **Horario**: `schedule.hours`, días cerrados en `schedule.blockedDates`.
6. **Fuente Mistrully**: copia el archivo en `assets/fonts/` (ver `LEEME.txt`).

## Cómo funcionan las reservas

**Sin backend** (`booking.apiUrl` vacío):
- Las horas se calculan con el horario configurado.
- Al pulsar *Confirmar cita* se abre WhatsApp con servicio, fecha, hora, nombre, teléfono y correo. MAJOBELLA confirma la cita respondiendo.
- La clienta puede guardar la cita en Google Calendar o descargar el archivo `.ics` (Apple Calendar, Outlook).
- La web no conoce las citas ya tomadas. Por eso la confirmación final la hace el estudio.

**Con backend** (Google Apps Script incluido):
- Sigue los pasos al inicio de `backend/google-apps-script/Code.gs` y pega la URL `/exec` en `booking.apiUrl`.
- La web solo mostrará horas libres en el calendario de MAJOBELLA.
- Al confirmar, la cita se crea en ese calendario y la clienta recibe la invitación por correo.
- El script rechaza horarios ocupados para evitar dobles reservas.

### Contrato de la API

Si más adelante se usa otro backend (Node, Firebase, Supabase, un sistema de reservas…), solo tiene que responder igual:

- `GET {apiUrl}?action=availability&date=AAAA-MM-DD` → `{ "busy": [{ "start": ISO, "end": ISO }] }`
- `POST {apiUrl}` con JSON `{ "action": "create", services, date, time, start, end, durationMinutes, totalPrice, currency, client: { name, phone, email, notes } }` → `{ "ok": true, "id": "…" }` o `{ "ok": false, "error": "…" }`

Las cancelaciones y reprogramaciones se pueden añadir con nuevas acciones (`cancel`, `reschedule`) usando el `id` devuelto.

## Experiencia de la clienta

- **Reserva en tres pasos** al inicio de la página para que sepa qué esperar.
- **Ver detalles** en cada servicio: para quién es, qué incluye, cuánto dura el resultado, cómo prepararse y cuidados después. Todo se edita en `js/data/services.js`.
- **Primer horario disponible**: con un toque elige el día y la hora más cercanos para los servicios añadidos.
- **Días rápidos** (Hoy, Mañana, …) y calendario completo solo si lo necesita.
- **Datos recordados** en el dispositivo (la clienta puede borrarlos) o completados con Google.
- **Resumen** con hora de inicio y fin, política de cambios (`policies` en `js/config.js`) y guía de preparación al confirmar.
- **Volver a reservar** desde Citas con los mismos servicios.
- **Cuenta opcional**: la ventana de inicio explica qué gana la clienta y siempre permite seguir sin cuenta.

## Servicios, suma y citas

- El menú de servicios funciona como Fresha: pestañas por categoría y tarjetas con el botón **Añadir**.
- Al añadir uno o varios servicios aparece abajo una barra con los servicios, el tiempo total y el precio total, y el botón **Agendar estos servicios**.
- **Citas** muestra las citas próximas y anteriores de la clienta:
  - sin iniciar sesión: las citas reservadas desde ese dispositivo (se guardan en el navegador);
  - con Google y el backend activos: las citas de la agenda de MAJOBELLA, en cualquier dispositivo, con opción de cancelar.
- Reprogramar y cancelar sin backend se hace por WhatsApp con un mensaje ya preparado.

## Rostro y cejas

- El rostro es una ilustración dibujada en SVG (`js/components/face.js`): vista frontal y centrada, con cabello largo oscuro, lentes redondos, labios rosados, piercing en la nariz y cadena con corazón.
- Tiene capas con profundidad que se mueven con el cursor, parpadeo, respiración y brillo en los lentes.
- Las cejas se dibujan encima (`js/components/brows.js`, forma en `js/data/brows.js`):
  - normal: naturales, pobladas y algo despeinadas;
  - al pasar el cursor: powder brows, con el vello peinado y un relleno en degradado del inicio a la cola.
- Alrededor del arco se lee "SIN MAJOBELLA"; al pasar el cursor cambia al eslogan "MÁS YO, MÁS BELLA.".
- En móvil, el cambio se activa tocando el rostro.
