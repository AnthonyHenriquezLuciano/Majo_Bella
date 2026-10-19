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
| Servicios | Precio y duración que se cobran | Precios, duraciones; `activo = no` oculta uno |
| Ajustes | Tasa del dólar, % de depósito, horario, días cerrados, correo de avisos | Todo |

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
   - Google pedirá un permiso nuevo (Drive): acéptalo igual que antes.
3. **Implementar → Gestionar implementaciones → lápiz (editar) → Versión: Nueva versión → Implementar.**

   Así se mantiene la misma URL `/exec` y no hay que cambiar nada en la web.

## Uso diario

- **Dashboard** (`admin.html`), por secciones:
  - **Agenda:** día, semana o mes; crear citas a mano (teléfono, WhatsApp, en persona); reprogramar; cobrar el saldo en efectivo o transferencia; marcar realizada o "no asistió"; cancelar con o sin reembolso; **Bloqueos** de una vez, de varios días o que se repiten cada semana.
  - **Clientas:** lista con visitas, gasto, última visita y próxima cita; ficha con notas, fotos de antes y después y consentimiento (se guardan en tu Drive); **Por volver**; **De dónde vienen**; **Pagos sin completar**.
  - **Dinero:** cierre de caja del día, ganancia real del mes (ingresos − reembolsos − comisiones de PayPal − gastos), registro de gastos y **reporte PDF** mensual.
  - **Promociones:** descuentos automáticos por servicio (se anuncian en la web), códigos de descuento y tarjetas de regalo con imagen para enviar.
  - **Ajustes:** depósito, tasa, horario, días cerrados, correos, comisiones y servicios (precio, duración y cada cuántos días vuelve la clienta).
- **Tasa del dólar, precios, horario y días cerrados**: desde **Ajustes** en el dashboard (o en las pestañas de la hoja). Se aplican a las reservas nuevas. Las descripciones de los servicios siguen en `js/data/services.js`.
- **Saber de dónde llegan**: comparte la web con `?utm_source=instagram` (o `tiktok`, `google`…) al final del enlace, por ejemplo en la bio de Instagram. Además, la clienta puede elegir "¿Cómo nos conociste?" al reservar.
- **Reembolsos**:
  - si la clienta cancela con 24 h o más de aviso (`horasCancelacion`), se le devuelve el depósito automáticamente;
  - con menos aviso, no se le devuelve;
  - desde el dashboard tú decides en cada caso.

Si un reembolso falla (por ejemplo, saldo insuficiente en PayPal), queda anotado en la columna `reembolso` y puedes hacerlo a mano en PayPal.
