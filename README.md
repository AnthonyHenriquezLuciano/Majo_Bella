# MAJOBELLA · Sitio web

Web estática (HTML, CSS y JavaScript sin compilación). Se puede publicar tal cual en Netlify, Vercel, GitHub Pages, Hostinger o cualquier hosting.

**Páginas**

- `index.html`: presentación. Incluye Sobre MAJOBELLA, Conoce a Majo, servicios, resultados, opiniones, por qué elegirnos, la app, preguntas y contacto.
- `reservar.html`: reservas.
- `citas.html`: mis citas.
- `regalos.html`: tarjetas de regalo y paquetes.
- `aplicacion.html`: presentación y descarga de la app.
- `admin.html`: panel, aparte.

Las cinco primeras se arman con `node tools/build-web.mjs` a partir de `web/pages/` (el contenido de cada página) y `web/partials/` (cabecera, menú, pie y scripts compartidos). Para cambiar el menú o el pie se edita el partial y se vuelve a ejecutar el comando.

Los enlaces antiguos siguen funcionando. Por ejemplo, `index.html#reservar` (de correos ya enviados) lleva a `reservar.html`.

**Backend**: base de datos PostgreSQL en Supabase y API en `supabase/`. La guía está en `supabase/INSTALAR.md`. La versión anterior con Google Sheets sigue en `backend/google-apps-script/` hasta terminar la migración.

## Estructura

```
index.html, reservar.html, citas.html, regalos.html, aplicacion.html   Páginas (generadas: no editar a mano)
web/pages/, web/partials/       Contenido de cada página y partes compartidas → node tools/build-web.mjs
js/components/appinfo.js        Página Aplicación: botones de descarga (js/config.js → app) e instrucciones
supabase/                       Base de datos (migraciones), API (Edge Function), pruebas y guía de instalación
css/styles.css                  Estilos, colores y tipografías
js/config.js                    WhatsApp, redes, contacto, horario y conexión de reservas
js/data/services.js             Servicios: nombre, precio, duración y detalle (para quién, qué incluye, preparación, cuidados)
js/data/faq.js                  Preguntas frecuentes
js/data/brows.js                Forma de las cejas sobre el rostro ilustrado
js/core/utils.js                Estado compartido y formatos (precio, fechas, horas)
js/integrations/whatsapp.js     Mensajes y enlaces de WhatsApp
js/integrations/calendar.js     Google Calendar y archivo .ics (Apple, Outlook)
js/integrations/booking-api.js  Agenda (horarios ocupados), reservas, pagos y cancelaciones (backend)
js/integrations/paypal.js       Botones de PayPal para el depósito y el saldo
js/integrations/google-auth.js  Inicio de sesión con Google
js/integrations/appointments.js Registro de citas de la clienta (Citas)
js/integrations/giftcard.js     Imagen PNG de la tarjeta de regalo (web y dashboard)
js/components/*.js              Menú, rostro ilustrado, cejas, servicios, barra de suma, reservas, citas, contacto
js/components/site.js           Franja de anuncio, Conoce a Majo, galería, reseñas y mapa (contenido del dashboard → Web)
js/components/giftshop.js       Compra de tarjetas de regalo con PayPal
js/components/packages.js       Compra de paquetes de sesiones con PayPal
consentimiento.html, js/consent.js  Consentimiento digital con cuestionario de salud y firma
privacidad.html, cancelacion.html  Políticas de privacidad y de cancelación/reembolsos/tarjetas
sitemap.xml, assets/og-image.jpg   Google (sitemap) y vista previa al compartir en WhatsApp/redes
app/ (index.html, app.css, app.js)  App para el celular (PWA): inicio, reservar, mis citas, billetera y perfil
manifest.webmanifest, sw.js     Instalación de la app (icono, nombre) y funcionamiento sin conexión
js/integrations/install.js      Botón «Instalar la app» (Android: aviso del navegador · iPhone: pasos)
js/components/getapp.js         Botones de la web que llevan a instalar la app
js/integrations/manage.js       Depósito por transferencia (cuentas, comprobante) y cambiar la fecha de una cita
js/integrations/captcha.js      Protección contra robots (Cloudflare Turnstile), solo si está configurada
terminos.html, js/legal.js      Términos y condiciones; datos del negocio y valores actuales en las páginas legales
404.html                        Página de error con la marca (GitHub Pages)
PRUEBAS.md                      Lista para probar todo en celulares reales antes de lanzar
admin.html, js/admin/*.js       Dashboard privado: agenda, clientas, dinero, promociones (paquetes y fidelidad), web, correos y ajustes
backend/google-apps-script/     Backend gratuito: Google Sheets + PayPal + Google Calendar (ver INSTALAR.md)
assets/                         Logos, monograma, favicon y fuentes
```

## Antes de publicar

1. **WhatsApp**: configurado con 829-978-4986 (`whatsapp.number` en `js/config.js`).
2. **Precios y duraciones**: valores de ejemplo en `js/data/services.js`. Con el backend activo, los que cuentan son los de la pestaña **Servicios** de la hoja.
3. **Google**: para el botón "Continuar con Google", crea el ID de cliente (pasos en `js/config.js`) y ponlo en `google.clientId` y en `GOOGLE_CLIENT_ID` de `Code.gs`.
4. **Redes y contacto**: `social.instagram`, `social.tiktok`, `contact.email`. La dirección y el enlace de Google Maps ya están; puedes añadir calle y sector en `contact.address`.
5. **Horario**: igual al de Google Maps (lunes cerrado, martes a sábado 10:00–5:00, domingo 10:00–1:00). Se cambia en `schedule.hours`; días cerrados puntuales en `schedule.blockedDates`.
6. **Fuente Mistrully**: copia el archivo en `assets/fonts/` (ver `LEEME.txt`).
7. **Reservas con depósito y dashboard**: sigue `backend/google-apps-script/INSTALAR.md`.
8. **Políticas**: `privacidad.html` y `cancelacion.html` describen cómo funciona el sistema (depósito por servicio, reembolso con 24 h de aviso, tarjetas válidas 12 meses y no canjeables por efectivo). Revísalas con un abogado antes de cobrar de verdad.
9. **Google y WhatsApp**: título, descripción, imagen para compartir y ficha del negocio (JSON-LD) están en el `<head>` de `index.html`. Si cambias de dominio, actualiza esas URL y `sitemap.xml`.

## Cómo funcionan las reservas

Las reservas se guardan en una hoja de Google de MAJOBELLA y la cita se aparta pagando un depósito con PayPal. Para activarlo sigue `backend/google-apps-script/INSTALAR.md`.

**Con el backend activo** (`booking.apiUrl` y `payments.paypalClientId` en `js/config.js`):

1. **Elegir la cita.** La clienta elige servicio, día y hora. Los días llenos y las horas ya reservadas se ven en gris para todas, con o sin sesión. La agenda se actualiza al volver a la pestaña y cada dos minutos.
2. **Pagar el depósito.** Al continuar, ve el depósito (el % que tiene cada servicio, en RD$ y en US$) y paga con PayPal (tarjeta o cuenta). Mientras paga, el horario queda apartado 15 minutos.
3. **Confirmación.** Con el pago:
   - la cita pasa a **confirmada** en la hoja;
   - se agenda en Google Calendar;
   - la clienta recibe un correo y MAJOBELLA un aviso.
4. **Saldo.** El resto se paga al terminar:
   - en efectivo (se marca en el dashboard);
   - o con PayPal desde **Citas**.
5. **Cancelación.** Desde **Citas**:
   - con 24 h o más de aviso se reembolsa el depósito automáticamente;
   - con menos aviso no se reembolsa.

   Las horas y el porcentaje se cambian en la pestaña **Ajustes** de la hoja.

PayPal no cobra en pesos dominicanos. Por eso el depósito se cobra en dólares con la tasa de **Ajustes → tasaUSD**. La web muestra ambos montos antes de pagar.

**Dashboard** (`admin.html`):
- Solo entran los correos de Google en `ADMIN_EMAILS` (propiedad del script); el backend lo verifica en cada consulta.
- **Agenda:** día, semana o mes, citas creadas a mano, reprogramar, cobros del saldo, cancelaciones y bloqueos (una vez, varios días o cada semana).
- **Clientas:** ficha con citas, gasto, última visita, notas, fotos de antes/después y consentimiento (en una carpeta privada de Drive); clientas por volver; de dónde vienen; pagos sin completar.
- **Dinero:** cierre de caja, ganancia real del mes, gastos y reporte PDF mensual.
- **Promociones:** automáticas por servicio, códigos de descuento y tarjetas de regalo. En la web, la clienta escribe el código o la tarjeta en el resumen de su cita; siempre se aplica el mejor descuento.
- **Ajustes:** lo mismo que las pestañas Ajustes y Servicios de la hoja.
- `admin.html?demo` muestra el dashboard con datos de ejemplo.

**WhatsApp** es para dudas e información: botón flotante, contacto y "¿Dudas?" en cada cita. No confirma reservas.

**Sin backend** (`booking.apiUrl` vacío), modo temporal:
- La cita se envía como solicitud por WhatsApp y el estudio la confirma.
- La web no conoce las horas ya reservadas.

### Contrato de la API

Implementado en `backend/google-apps-script/Code.gs`; otro backend podría responder igual:

- `GET ?action=catalog` → `{ services, payments: { usdRate, depositPercent, holdMinutes, cancelHours, paypalEnv }, schedule, promos, site: { announcement, google, majo }, gallery, reviews, giftShop }`
- `GET ?action=busy&from=AAAA-MM-DD&to=AAAA-MM-DD` → `{ busy: [{ start, end }] }` (sin datos personales)
- `POST { action: 'hold', services: [ids], date, time, client }` → `{ id, manageToken, orderId, depositUSD, … }`
- `POST { action: 'capture', id, orderId }` → `{ appointment }`
- `POST { action: 'release' | 'cancel' | 'balanceOrder' | 'balanceCapture', id, token | idToken, … }`
- `POST { action: 'myAppointments', idToken }` · `{ action: 'lookup', items: [{ id, token }] }`
- `POST { action: 'loyalty', client }` · `{ action: 'waitlistJoin', date, franja, services, client }` · `{ action: 'consentInfo' | 'consentSign', c, … }` · `{ action: 'bonoOrder' | 'bonoCapture', … }`
- `POST { action: 'giftOrder', montoRD, correo, correoPara, de, para, mensaje }` → `{ id, orderId }` · `{ action: 'giftCapture', id, orderId }` → `{ gift: { codigo, … } }`
- `POST { action: 'adminList' | 'adminUpdate' | 'adminBlock', idToken, … }` (solo administradoras)

## App para el celular

La app vive en `app/` (https://anthonyhenriquezluciano.github.io/Majo_Bella/app/) y se instala en la pantalla de inicio como cualquier app. No es la página: es una experiencia aparte, pensada solo para el celular, con barra inferior de pestañas y hojas que se deslizan desde abajo.

- **Inicio**: saludo, próxima cita con cuenta regresiva, accesos rápidos, promociones, servicios y tarjeta de fidelidad.
- **Reservar** (botón central): servicios → día y hora (primer horario libre y lista de espera) → confirmar y pagar el depósito con PayPal, con códigos de descuento, tarjetas de regalo y paquetes.
- **Mis citas**: próximas y anteriores; en cada cita: calendario, cómo llegar, WhatsApp, firmar el consentimiento, subir el comprobante de la transferencia, cambiar la fecha, pagar el saldo, cancelar (con aviso de reembolso) y reservar de nuevo.
- **Billetera**: tarjetas de regalo (con saldo) y paquetes (sesiones usadas); con Google aparecen solas las compradas o recibidas con su correo, y sin Google puede pedir sus códigos por correo; agregar un código, usarlo en la próxima cita, compartirlo, descargar la tarjeta y comprar tarjetas o paquetes.
- **Perfil**: datos (nombre, teléfono, correo y cumpleaños), inicio de sesión con Google, instalar la app, cómo llegar, horario, WhatsApp, Instagram y políticas.
- **Instalar**: en Android aparece el botón «Instalar la app»; en iPhone se muestran los pasos (Compartir → Agregar a inicio).
- **Desde la web**: el menú de arriba tiene el apartado **Aplicación**, que abre la app. En el celular, la primera visita muestra la página «Tu belleza, en tu bolsillo» para instalarla (vuelve a ofrecerse cada 14 días); al cerrarla queda la **cinta** abajo con el botón Instalar (si se cierra, vuelve a los 5 días). En la PC solo aparece la cinta, y solo en navegadores que permiten instalar (Chrome y Edge). Quien llega desde Google ve solo la cinta, porque Google penaliza las pantallas que tapan el contenido al entrar desde el buscador. Código: `js/components/getapp.js`.
- **Actualizar la app**: al cambiar archivos, sube el número `?v=` en `app/index.html` y la constante `VERSION`/lista de `sw.js` para que los celulares descarguen lo nuevo.

## Dashboard (admin.html)

- **PC**: menú lateral agrupado (Día a día: Agenda, Clientas, Dinero · Crecer: Promociones, Web, Correos · Configuración: Ajustes). Cada sección empieza con su título y para qué sirve.
- **Buscador** (botón de arriba, `Ctrl K` o `/`): encuentra secciones, cada opción de Ajustes, acciones («Nueva cita», «Vender tarjeta»…), clientas por nombre, teléfono o correo, y códigos de promociones, tarjetas y paquetes. Código: `js/admin/buscar.js`.
- **Ajustes** por partes con accesos arriba: Negocio y reservas, Horario, Servicios, Transferencias, Seguridad y Avisos del sistema.
- **Celular**: barra inferior (Agenda, Clientas, Dinero, Promos y Más), tablas como tarjetas, ventanas como hojas que suben desde abajo y botón Guardar fijo.
- **Numeritos** en el menú: pendientes en Agenda (transferencias por revisar y depósitos por devolver) y avisos del sistema en Ajustes.
- **Sin esperas**: los cambios se ven al instante (se aplican antes de que responda el servidor y se deshacen si falla) y el dashboard se actualiza solo cada 3 minutos y al volver a la pestaña.

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
  - con el backend: el estado real de cada cita y sus pagos (y con Google, en cualquier dispositivo); se puede pagar el saldo y cancelar.
- Sin backend, reprogramar y cancelar se hace por WhatsApp con un mensaje ya preparado.

## Rostro y cejas

- El rostro es una ilustración dibujada en SVG (`js/components/face.js`): vista frontal y centrada, con cabello largo oscuro, lentes redondos, labios rosados, piercing en la nariz y cadena con corazón.
- Tiene capas con profundidad que se mueven con el cursor, parpadeo, respiración y brillo en los lentes.
- Las cejas se dibujan encima (`js/components/brows.js`, forma en `js/data/brows.js`):
  - normal: naturales, pobladas y algo despeinadas;
  - al pasar el cursor: powder brows, con el vello peinado y un relleno en degradado del inicio a la cola.
- Alrededor del arco se lee "SIN MAJOBELLA"; al pasar el cursor cambia al eslogan "MÁS YO, MÁS BELLA.".
- En móvil, el cambio se activa tocando el rostro.
