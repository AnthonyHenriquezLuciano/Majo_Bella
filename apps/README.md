# Apps de MAJOBELLA (React Native + Expo)

Dos apps nativas, con el mismo diseño de la web (blanco y negro, Source Serif 4):

| App | Carpeta | Para quién | Android |
|---|---|---|---|
| **MAJOBELLA** | `apps/cliente` | Clientas | `com.majobella.app` · `majobella.apk` |
| **MAJOBELLA Estudio** | `apps/estudio` | Majo y el equipo (cuentas de `ADMIN_EMAILS`) | `com.majobella.estudio` · `majobella-estudio.apk` |

Las dos hablan con la misma API que la web y el panel (`supabase/functions/api`), así que una cita reservada en la web aparece al instante en las apps y al revés.

```
apps/cliente/        App de clientas (Expo Router: src/app = pantallas)
apps/estudio/        App del estudio
packages/core/       Código compartido: API, horario y horas libres, precios, formatos, validación y diseño
packages/ui/         Piezas de pantalla compartidas (botones, campos, tarjetas, íconos)
packages/core/src/data.ts   Servicios, preguntas y configuración pública copiados de la web (no editar a mano)
tools/build-core-data.mjs   Genera data.ts desde js/config.js y js/data/*.js (corre con npm run web:build)
tools/app-icons.py          Íconos y pantalla de inicio de las dos apps desde el monograma de la web
```

## Qué hace cada app

**MAJOBELLA (clientas)**
- **Inicio**: bienvenida, próxima cita con cuenta regresiva, promoción del momento, premio por visitas, servicios, Conoce a Majo, Por qué elegirnos, antes y después, opiniones de Google, regalos y cómo llegar.
- **Servicios**: por categoría, con precio, promoción y duración; se añaden varios a la misma cita. Cada servicio tiene su detalle (para quién es, qué incluye, resultados, cómo prepararse y cuidados).
- **Reservar** (botón del centro): servicios → día y hora (próximos días, calendario del mes, primera hora libre y lista de espera si el día está lleno) → datos (se guardan en el celular) → depósito con **PayPal** o **transferencia** (cuentas del estudio, copiar el número y subir la foto del comprobante), con códigos de descuento, tarjetas de regalo y paquetes.
- **Mis citas**: próximas y anteriores. En cada cita: añadir al calendario del celular, cómo llegar, WhatsApp, cambiar día u hora, cancelar (con el aviso de la política), pagar el saldo con PayPal al terminar, subir el comprobante, firmar el consentimiento y reservar de nuevo.
- **Cuenta**: iniciar sesión (código por correo o Google), mis datos, billetera (tarjetas y paquetes con saldo), comprar tarjetas de regalo y paquetes, avisos, contacto y documentos.
- **Avisos**: recordatorio 24 horas y 2 horas antes de cada cita (en el celular, sin internet) y, con sesión iniciada, un aviso por cada correo que le manda el estudio (confirmación, transferencia confirmada, cambios, lista de espera…).

**MAJOBELLA Estudio**
- **Agenda**: el día con sus citas y bloqueos, total del día y lo que falta cobrar; días con puntos según las citas.
- **Revisar**: transferencias con comprobante (se ve la foto) para confirmar o rechazar, reembolsos por devolver, reservas esperando la transferencia y avisos del sistema.
- **Cita**: WhatsApp y llamar, pagos, completar, no asistió, cobrar el saldo (efectivo o transferencia), mover (avisa si choca), recordatorio por correo, nota interna y cancelar (con reembolso en PayPal).
- **Nueva cita** (teléfono, WhatsApp o en persona), **bloquear horarios** (un día, varios o cada semana), **clientas** (búsqueda y ficha con historial) y **dinero** (cobrado, por forma de pago, gastos y ganancia).
- **Avisos**: llega un aviso con cada reserva nueva, comprobante, cancelación o cambio (los mismos correos que recibe el estudio).
- Lo demás (servicios y precios, promociones, contenido de la web, correos, ajustes) sigue en el panel web (`admin.html`), que se abre desde **Más**.

## Instalar en los celulares (sin Play Store ni App Store)

**Android (MAJOBELLA en pruebas)**: cuando cambian `apps/` o `packages/`, **GitHub Actions → Apps** compila ambos APK y los deja como *artifacts* de la ejecución. **No reemplaza Releases automáticamente**. Una publicación de APK firmados en **Releases → app** requiere una ejecución manual con `publish_release=true` y una firma privada configurada en GitHub. Los enlaces de Releases pueden apuntar todavía a versiones anteriores:

- Clientas: `https://github.com/AnthonyHenriquezLuciano/Majo_Bella/releases/download/app/majobella.apk`
- Estudio: `https://github.com/AnthonyHenriquezLuciano/Majo_Bella/releases/download/app/majobella-estudio.apk`

En el celular se abre el enlace, se descarga y se permite «instalar apps de este origen» la primera vez. Cada versión nueva se instala encima de la anterior (misma firma, número de versión mayor). La página **Aplicación** de la web muestra el botón de descarga cuando `js/config.js → app.androidUrl` tiene el enlace; el panel muestra el del estudio con `app.studioAndroidUrl`.

**iPhone**: Apple solo permite instalar apps desde la App Store (o TestFlight), y para eso hace falta una cuenta de Apple Developer (US$ 99 al año). Mientras tanto, en iPhone la web ofrece la versión web de la app (`app/`, se agrega a la pantalla de inicio). Cuando haya cuenta de Apple: `npx eas build -p ios` y `npx eas submit` desde `apps/cliente`.


## Dos proyectos independientes de Expo para avisos push

**No existe aún un EAS Project ID registrado en el repositorio de cada app**. Un identificador de Supabase no puede sustituirlo. **No se puede inventar ni obtener un ID Expo sin vincular una cuenta de Expo autorizada.**

1. Inicia sesión en [expo.dev](https://expo.dev) con la cuenta propietaria de MAJOBELLA.
2. En una copia local del repositorio, abre la carpeta `apps/cliente` y ejecuta `npx eas-cli@latest init`. Esto crea/vincula el proyecto Expo **MAJOBELLA Cliente**. Copia el valor `projectId` mostrado (UUID).
3. Repite desde `apps/estudio` usando `npx eas-cli@latest init`; debe generar un **segundo** proyecto Expo con otro UUID.
4. En GitHub → **Settings → Secrets and variables → Actions → Variables**, introduce los dos identificadores en `EAS_PROJECT_ID_CLIENTE` y `EAS_PROJECT_ID_ESTUDIO`. El workflow `apps.yml` pasa únicamente el ID de la app de cada compilación a `EXPO_PUBLIC_EAS_PROJECT_ID`.
5. `app.config.js` en cada carpeta inyecta `extra.eas.projectId`, que es lo que usa Expo para atribuir los tokens push. Si `eas init` ya guardó un ID en `app.json`, se conservará como respaldo. El código valida el formato UUID y no acepta identificadores mal formados.
6. Firebase **ya está enlazado en el código**: `apps/cliente/google-services.json` contiene únicamente `com.majobella.app` y `apps/estudio/google-services.json` únicamente `com.majobella.estudio`, ambos del proyecto Firebase `majobella` (`483134079714`). Cada `app.json` tiene `expo.android.googleServicesFile: "./google-services.json"`. La compilación valida que no se confundan.
7. **Pendiente fuera del repositorio:** en [Firebase → Configuración → Cuentas de servicio](https://console.firebase.google.com/), genera el JSON **privado** de la cuenta de servicio para FCM V1. En [Expo → tu proyecto Cliente → Credentials → Android](https://expo.dev/), registra el paquete `com.majobella.app` y carga esa clave bajo **FCM V1 service account key**. Repite para el proyecto **Estudio** y `com.majobella.estudio`, usando esa misma credencial del proyecto Firebase si Expo lo permite. **Jamás** subas ese archivo privado a GitHub o al chat. [Guía oficial de Expo](https://docs.expo.dev/push-notifications/fcm-credentials/).
8. Verifica que los dos UUID Expo estén guardados en GitHub Actions Variables como `EAS_PROJECT_ID_CLIENTE` y `EAS_PROJECT_ID_ESTUDIO`. No es posible inferirlos de Firebase. El siguiente build debe realizarse DESPUÉS de definirlos y vincular FCM V1 para registrar tokens remotos.
9. Para nuevas compilaciones de prueba puedes usar **Actions → Apps → Run workflow**, con **Publish release: false**; los APK quedarán bajo **Artifacts**. No distribuyas APKs de prueba como producción.

Los archivos `google-services.json` incluyen identificadores públicos de Firebase: **NO** contienen la clave privada de servicio FCM V1. Los recordatorios **locales** de citas funcionan sin EAS cuando la clienta habilita notificaciones en Android. Los avisos push **remotos** de reservas requieren ID EAS, FCM, aplicación instalada, sesión iniciada y permiso de notificaciones.

## Configuración

Las apps usan solo valores **públicos** (los mismos que ya ve cualquiera en la web). Ningún secreto va en las apps.

| Variable | Dónde | Qué es |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | GitHub → Settings → Secrets and variables → Actions → **Variables** → `SUPABASE_URL` | `https://<referencia>.supabase.co` |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Variable `SUPABASE_ANON_KEY` | Supabase → Project Settings → API → `anon` `public` |
| `EXPO_PUBLIC_EAS_PROJECT_ID` (cliente) | Variable `EAS_PROJECT_ID_CLIENTE` | UUID exclusivo de la app de clientas en Expo (no es el Project Ref de Supabase). |
| `EXPO_PUBLIC_EAS_PROJECT_ID` (estudio) | Variable `EAS_PROJECT_ID_ESTUDIO` | UUID exclusivo de la app del estudio en Expo; distinto al anterior. |
| `EXPO_PUBLIC_API_URL` | Solo para pruebas | Otra API (por ejemplo la local) |

Ambas apps utilizan exclusivamente Supabase. Tienen como respaldo el URL y la clave **publishable** pública del proyecto MAJOBELLA. Las variables de GitHub permiten sustituir estos valores, por ejemplo al rotar la clave.

Para firmar los `.apk` siempre con la misma llave, el repositorio necesita los secretos `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` y `ANDROID_KEY_PASSWORD` (solo viven en GitHub). Se crean una vez desde tu computadora con `bash tools/android-keystore.sh` (necesita Java y GitHub CLI). Mientras no existan, los `.apk` salen firmados con la llave de prueba de React Native (la misma en cada versión, así que se actualizan bien, pero es pública): conviene crear la propia antes de repartir la app. Al pasar de la llave de prueba a la propia (o si algún día se cambia), las apps instaladas tendrán que desinstalarse una vez.

### Inicio de sesión (Supabase → Authentication)

1. **Sign In / Providers → Email**: activo. En **Email Templates**, en **Magic Link** y en **Confirm signup**, añade el código para que llegue en el correo: `Tu código de MAJOBELLA: {{ .Token }}` (la app pide ese código de 6 dígitos; la primera vez llega «Confirm signup» y después «Magic Link»).
2. **URL Configuration → Redirect URLs**: añade `majobella://auth` y `majobella-estudio://auth` (también vale el enlace del correo tocado en el mismo celular).
3. **Providers → Google** (opcional): activa Google con el ID de cliente y su secreto de Google Cloud. En Google Cloud, en ese ID de cliente, añade como URI de redirección `https://<referencia>.supabase.co/auth/v1/callback`.

La app del estudio solo deja entrar a los correos de `ADMIN_EMAILS` (secreto de la API).

### Avisos push (opcional)

1. Crea una cuenta gratis en <https://expo.dev>, un proyecto y copia su **Project ID** a la variable `EAS_PROJECT_ID`.
2. Para Android, sube la llave de Firebase Cloud Messaging del proyecto a Expo (expo.dev → proyecto → Credentials → FCM V1). La llave privada de Firebase va **solo** ahí.
3. Opcional: un token de acceso de Expo como secreto `EXPO_ACCESS_TOKEN` de la API en Supabase.

Sin esto, las apps igual programan los recordatorios en el propio celular; solo no llegan los avisos que manda el estudio.

## Probar en la computadora

```bash
npm install                       # una vez, en la raíz del repositorio
npm run cliente                   # abre Expo: escanea el QR con la app Expo Go o pulsa w para verla en el navegador
npm run estudio
npm run typecheck                 # revisa los tipos de todo
npx tsx packages/core/test/core.test.ts
```

**API local con datos de ejemplo** (sin Supabase ni internet; PayPal, correos y archivos simulados):

```bash
cd supabase && PGHOST=/tmp PGPORT=54329 npx tsx dev/servidor-local.ts 8787
# en otra terminal:
cd apps/cliente && EXPO_PUBLIC_API_URL=http://localhost:8787 npx expo start
cd apps/estudio && EXPO_PUBLIC_API_URL=http://localhost:8787 EXPO_PUBLIC_DEV_ID_TOKEN=admin-token npx expo start
```

`EXPO_PUBLIC_DEV_ID_TOKEN` es solo para la API local (la API lo verifica como cualquier sesión, así que con Supabase no abre nada).

## Pagos con PayPal en la app

La app pide la orden a la API con `app: 'cliente'`; la API agrega a la orden la página de regreso `pago.html` de la web y devuelve el enlace de PayPal (`approveUrl`). La app lo abre en el navegador del sistema; al pagar, PayPal vuelve a `pago.html`, que regresa a la app (`majobella://pago`), y la app confirma el cobro con la API. El Secret de PayPal sigue solo en los secretos de Supabase.

## Cambiar textos, servicios o colores

- Precios, duraciones, horario, promociones y contenido: desde el panel (la app los toma de la API).
- Descripciones de los servicios y preguntas: `js/data/services.js` y `js/data/faq.js`, luego `npm run web:build` (actualiza la web y `packages/core/src/data.ts`).
- Colores y tipografía: `packages/core/src/theme.ts`. Íconos de las apps: `python3 tools/app-icons.py`.
