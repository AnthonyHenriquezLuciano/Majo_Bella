# Activar reservas, pagos y dashboard

Tiempo estimado: 30 minutos. Todo se hace con la cuenta de Google de MAJOBELLA.

Resultado:

- Las reservas se guardan en una hoja de Google tuya.
- Los horarios ocupados se ven en gris en la web.
- El depósito se cobra con PayPal.
- Tienes tu dashboard en `admin.html`.

## 1. Crear la hoja y el script

1. Abre https://sheets.new y ponle de nombre **MAJOBELLA · Reservas**.
2. En la hoja: **Extensiones → Apps Script**.
3. Borra lo que aparece y pega todo el contenido de `Code.gs`. Guarda (ícono del disquete).
4. **Configuración del proyecto** (engranaje) → Zona horaria: **(GMT-04:00) Santo Domingo**.
5. Arriba, elige la función **setup** y pulsa **Ejecutar**. Google pedirá permisos:
   - pulsa **Revisar permisos**, elige la cuenta y luego **Configuración avanzada → Ir a … (no seguro)**;
   - después pulsa **Permitir**.

   Es tu propio script; el aviso sale porque Google no lo ha revisado.
6. Vuelve a la hoja: verás las pestañas **Reservas**, **Servicios** y **Ajustes**.

| Pestaña | Qué hay | Qué puedes cambiar |
|---|---|---|
| Reservas | Cada cita es una fila: estado, horario, clienta, pagos | No borres columnas |
| Servicios | Precio, duración, % de depósito y cada cuántos días vuelve la clienta | Todo; `activo = no` oculta uno; depósito 0 = se confirma sin pagar |
| Ajustes | Tasa del dólar, horario, días cerrados, correo de avisos | Todo |

## 2. Llaves de PayPal (modo de prueba)

1. Entra en https://developer.paypal.com con tu cuenta de PayPal (sirve una personal para las pruebas).
2. **Apps & Credentials** → pestaña **Sandbox** → **Create App** (nombre: MAJOBELLA, tipo: Merchant).
3. Copia el **Client ID** y el **Secret**.
4. En **Testing Tools → Sandbox Accounts** hay una cuenta *Personal* de prueba. Con ese correo y su contraseña puedes "pagar" sin dinero real.

## 3. Guardar las llaves en el script

En Apps Script: **Configuración del proyecto → Propiedades del script → Añadir propiedad**.

| Propiedad | Valor |
|---|---|
| `PAYPAL_CLIENT_ID` | el Client ID |
| `PAYPAL_SECRET` | el Secret (solo aquí, nunca en la web ni en GitHub) |
| `PAYPAL_ENV` | `sandbox` |
| `ADMIN_EMAILS` | el Gmail con el que entrarás al dashboard (varios separados por coma) |

`SHEET_ID` ya lo creó `setup`.

Para comprobar las llaves: elige la función **testPaypal** → **Ejecutar** → debe decir "PayPal conectado (sandbox)".

## 4. Publicar el backend

1. **Implementar → Nueva implementación** → tipo **Aplicación web**.
2. Ejecutar como: **Yo**. Quién tiene acceso: **Cualquier usuario**.
3. Copia la **URL de la aplicación web** (termina en `/exec`).

Si más adelante cambias `Code.gs`: **Implementar → Gestionar implementaciones → editar → Nueva versión**. Las propiedades y la hoja no necesitan volver a publicarse.

## 5. Conectar la web

En `js/config.js`:

```js
booking: { apiUrl: 'https://script.google.com/macros/s/…/exec', … },
payments: { enabled: true, paypalClientId: 'EL CLIENT ID DE PAYPAL', … },
```

El Client ID es público y puede ir en la web. El Secret no.

Para "Continuar con Google" en el dashboard, el dominio de la web debe estar en **Orígenes autorizados de JavaScript** del ID de cliente de Google (ya debería estar `https://anthonyhenriquezluciano.github.io`).

## 6. Probar

1. Reserva en la web y paga con la cuenta *Personal* de prueba de PayPal.
2. Revisa que todo haya funcionado:
   - la fila aparece en **Reservas** como `confirmada`;
   - te llega el correo de aviso y a la clienta el de confirmación;
   - la hora se ve en gris en la web;
   - la cita aparece en el dashboard: `https://anthonyhenriquezluciano.github.io/Majo_Bella/admin.html`.
3. Cancela la cita desde **Citas** y comprueba el reembolso en https://www.sandbox.paypal.com.

## 7. Cobrar de verdad

1. Abre o convierte tu cuenta en **PayPal Business** (paypal.com/do → Empresas) y verifícala.
2. En developer.paypal.com → **Apps & Credentials** → pestaña **Live** → **Create App**. Copia el Client ID y el Secret de **Live**.
3. Propiedades del script:
   - `PAYPAL_CLIENT_ID` y `PAYPAL_SECRET` con las llaves Live;
   - `PAYPAL_ENV = live`.
4. `js/config.js` → `payments.paypalClientId` con el Client ID Live.
5. Haz una reserva real pequeña y cancélala para probar el reembolso.

El dinero llega en dólares a tu PayPal. Desde PayPal puedes retirarlo a tu banco en RD$; PayPal cobra una comisión por cada retiro. Revisa también las comisiones de PayPal por pagos recibidos y por reembolsos en tu cuenta.

## Actualizar el código (cada vez que haya una versión nueva de Code.gs)

1. En Apps Script, borra el contenido de `Code.gs`, pega el nuevo y guarda.
2. Elige la función **setup** y pulsa **Ejecutar**.
   - Crea las pestañas y columnas nuevas sin tocar tus datos.
   - La primera vez crea también la carpeta privada **MAJOBELLA · Fichas de clientas** en tu Drive.
   - También crea la carpeta **MAJOBELLA · Web pública (galería)**. Ahí van solo las copias de las fotos que publicas en la web y tu foto de "Conoce a Majo", compartidas como "cualquier persona con el enlace puede ver". No muevas ni borres esa carpeta.
   - Crea también el **disparador de las tareas automáticas** (recordatorios, reseñas, retoques, cumpleaños y lista de espera), que se ejecuta cada hora. Puedes verlo en Apps Script → **Activadores** (ícono del reloj): `tareasProgramadas`, cada hora.
   - Si Google pide un permiso nuevo (por ejemplo, para crear el activador), acéptalo igual que antes.
3. **Implementar → Gestionar implementaciones → lápiz (editar) → Versión: Nueva versión → Implementar.**

   Así se mantiene la misma URL `/exec` y no hay que cambiar nada en la web.

## Uso diario

- **Dashboard** (`admin.html`), por secciones:
  - **Agenda:** día, semana o mes; crear citas a mano (teléfono, WhatsApp, en persona); reprogramar; cobrar el saldo en efectivo o transferencia; marcar realizada o "no asistió"; cancelar con o sin reembolso; **Bloqueos** de una vez, de varios días o que se repiten cada semana.
  - **Clientas:** lista con visitas, gasto, última visita y próxima cita; ficha con notas, fotos de antes y después y consentimiento (se guardan en tu Drive); **Por volver**; **De dónde vienen**; **Pagos sin completar**.
  - **Dinero:** cierre de caja del día, ganancia real del mes (ingresos − reembolsos − comisiones de PayPal − gastos), registro de gastos y **reporte PDF** mensual.
  - **Promociones:** descuentos automáticos por servicio (se anuncian en la web), códigos de descuento y tarjetas de regalo con imagen para enviar.
  - **Correos:** activar y ajustar los correos automáticos, ver cada correo de ejemplo, enviarte una prueba, editar el texto del consentimiento y ver el historial de todo lo enviado.
  - **Web:** galería de antes y después (se publica desde la ficha de la clienta, con su permiso), reseñas de Google, "Conoce a Majo" con tu foto, la franja de anuncio de arriba, tu puntuación y enlaces de Google, y la venta de tarjetas de regalo en la web.
  - **Ajustes:** depósito, tasa, horario, días cerrados, correos, comisiones y servicios (precio, duración y cada cuántos días vuelve la clienta).
- **Tasa del dólar, precios, horario y días cerrados**: desde **Ajustes** en el dashboard (o en las pestañas de la hoja). Se aplican a las reservas nuevas. Las descripciones de los servicios siguen en `js/data/services.js`.
- **Saber de dónde llegan**: comparte la web con `?utm_source=instagram` (o `tiktok`, `google`…) al final del enlace, por ejemplo en la bio de Instagram. Además, la clienta puede elegir "¿Cómo nos conociste?" al reservar.
- **Reembolsos**:
  - si la clienta cancela con 24 h o más de aviso (`horasCancelacion`), se le devuelve el depósito automáticamente;
  - con menos aviso, no se le devuelve;
  - desde el dashboard tú decides en cada caso.

Si un reembolso falla (por ejemplo, saldo insuficiente en PayPal), queda anotado en la columna `reembolso` y puedes hacerlo a mano en PayPal.

## La web en Google y en WhatsApp

- **Vista previa en WhatsApp:** al compartir el enlace sale la imagen `assets/og-image.jpg` con el logo. WhatsApp guarda la vista previa un tiempo; si ves la antigua, comparte el enlace con `?v=2` al final.
- **Google:**
  1. Entra en https://search.google.com/search-console y añade la propiedad de tipo **Prefijo de URL** con `https://anthonyhenriquezluciano.github.io/Majo_Bella/`.
  2. Verifica con el método **Etiqueta HTML**: copia la etiqueta que te dé y pásamela para ponerla en `index.html`.
  3. En **Sitemaps** envía `sitemap.xml`.
  4. Si tienes Perfil de Empresa de Google, pon esta web en el campo **Sitio web**. Es lo que más ayuda a aparecer en Maps.
- **Reseñas:** Google no deja mostrar sus reseñas en otra web sin una cuenta de pago de su API. Por eso se copian a mano en el dashboard → **Web**. Copia solo reseñas reales, tal como aparecen.

## Tarjetas de regalo en la web

- Se pagan con PayPal en dólares, con la tasa de **Ajustes**.
- Al pagar se genera el código. Le llega por correo a quien compra (y a quien la recibe, si escribió su correo), y a ti te llega un aviso.
- Aparecen en el dashboard → **Promociones**, marcadas como "comprada en la web".
- Para pausarlas: dashboard → **Web** → quita "Vender tarjetas de regalo con PayPal".

## Correos automáticos

Se revisan cada hora (activador `tareasProgramadas`). Los avisos de reseña, retoque y cumpleaños solo salen entre 8:00 a. m. y 9:00 p. m.

| Correo | Cuándo | Dónde se ajusta |
|---|---|---|
| Recordatorio | X horas antes de la cita (24 por defecto) | Correos |
| Pedir reseña | X horas después de marcar la cita como realizada, una vez cada 120 días por clienta | Correos (necesita el enlace de reseña en Web) |
| Retoque | Una semana antes de la fecha ideal, si no ha reservado | Días por servicio en Ajustes → Servicios |
| Cumpleaños | El día, con un código de un solo uso | Correos (%, días de validez) |
| Lista de espera | Cuando se libera un horario en un día lleno | Correos |

- Gmail permite unos **100 correos al día** con una cuenta normal (1,500 con Google Workspace). El dashboard muestra cuántos quedan.
- Para probar sin esperar: **Correos → Revisar ahora**, o **Enviarme una prueba** en cada correo.

## Consentimiento digital

- En **Ajustes → Servicios**, marca «Consentimiento» en los servicios que lo piden.
- La clienta recibe el enlace en la confirmación y en el recordatorio. También lo ve en **Citas** en la web, y desde la Agenda puedes copiarlo, mandarlo por WhatsApp o abrirlo en una tablet en el estudio.
- Al firmar, se guarda un PDF en su ficha (carpeta privada de Drive) y le llega una copia por correo. Si autorizó publicar sus fotos, se ve en su ficha.
- El texto se edita en **Correos → Consentimiento digital**. Revísalo con un abogado o con quien te formó en cada técnica antes de usarlo.

## Paquetes y fidelidad

- **Paquetes** (Promociones): creas el paquete (servicio, sesiones, precio, validez). Si lo marcas «en la web», se compra con PayPal en la sección Paquetes. También lo vendes en el estudio con **+ Vender paquete**.
- La clienta escribe el código del paquete al reservar: cubre ese servicio completo y descuenta una sesión. Si cancela con aviso, la sesión vuelve al paquete.
- **Premio de fidelidad** (Promociones): cada N visitas realizadas, la siguiente cita tiene un descuento. Se aplica solo al reservar con el mismo correo o teléfono y compite con las promociones (gana el mayor).

## App para el celular

La app (`/app/`) usa el mismo backend. La **Billetera** consulta el saldo de tarjetas y paquetes con la acción `walletLookup`, que viene en esta versión de `Code.gs`: actualiza el código (pasos de «Actualizar el código») para que funcione.

Cómo la instala la clienta:

- **Android (Chrome)**: abre la web o `…/Majo_Bella/app/` y toca **Instalar la app** (menú del celular, «Tus citas», pie de página o el aviso de abajo).
- **iPhone (Safari)**: abre la app y toca **Compartir** → **Agregar a inicio** → **Agregar**. La app muestra estos pasos.

Para compartirla, manda el enlace `https://anthonyhenriquezluciano.github.io/Majo_Bella/app/?instalar=1` (abre directamente la bienvenida con el botón de instalar).
