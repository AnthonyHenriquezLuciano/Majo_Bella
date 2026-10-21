# Base de datos y API de MAJOBELLA (Supabase)

La hoja de Google se reemplaza por una base de datos PostgreSQL en Supabase. La web, la app de clientas, la app del estudio y el panel hablan con una sola API.

> **Activación MAJOBELLA v1.1:** la persona propietaria confirmó que todos los registros antiguos son pruebas. **No hay que importar Google Sheets ni Drive**, configurar `IMPORT_KEY` ni ejecutar las funciones de migración. El procedimiento mínimo vigente está en [ESTADO-MIGRACION.md](ESTADO-MIGRACION.md). La publicación desde GitHub Actions es **manual**, no automática.

```
web · app de clientas · app del estudio · panel
                 │
                 ▼
     API (Supabase Edge Function "api")  ──►  PayPal
                 │                         ──►  Conector de Google (Gmail, Calendar, PDF)
                 ▼
     PostgreSQL (tablas con su tipo real) + Storage (fotos, consentimientos, comprobantes)
```

**Seguridad.** Las tablas tienen RLS activado y no tienen permisos públicos. Nadie las lee desde el navegador ni desde las apps: todo pasa por la API, que revisa cada acción. Para eso valida:

- la sesión de la clienta;
- las cuentas del estudio;
- la clave de gestión de cada cita;
- la clave de las tareas automáticas.

Las claves secretas viven solo en Supabase. **Nunca** van en GitHub ni se mandan por mensaje.

---

## 1. Crear el proyecto (una vez)

1. Entra a <https://supabase.com> con tu cuenta de Google y pulsa **New project**.
   - Nombre: `majobella`.
   - Región: **East US (North Virginia)**, la más cercana a República Dominicana.
   - Contraseña de la base: elige una larga y **guárdala**. Se usa en el paso 2.
2. Cuando termine, ve a **Project Settings → General**. Copia el **Reference ID**: son letras como `abcdxyz…`.
   Tu API quedará en: `https://<Reference ID>.supabase.co/functions/v1/api`

> Plan gratis: sirve para empezar, pero el proyecto se pausa si pasa 7 días sin uso. Para el negocio en marcha conviene el plan Pro (US$25 al mes).

## 2. Publicar la base y la API desde GitHub (manual, tras validar)

1. En Supabase, abre **Account → Access Tokens** (<https://supabase.com/dashboard/account/tokens>) y crea un token. Cópialo.
2. En GitHub, abre el repositorio y ve a **Settings → Secrets and variables → Actions → New repository secret**. Crea estos tres:
   - `SUPABASE_ACCESS_TOKEN`: el token del paso anterior.
   - `SUPABASE_PROJECT_REF`: el Reference ID.
   - `SUPABASE_DB_PASSWORD`: la contraseña de la base.
3. Ve a **Actions → Backend → Run workflow**.
   - Primero corren las pruebas.
   - Si pasan, se crean las tablas y se publica la API.
   - Los cambios en `supabase/` se prueban automáticamente; el despliegue queda **manual**.

## 3. Secretos de la API

En Supabase, abre **Edge Functions → Secrets** (o **Project Settings → Edge Functions**) y añade estos valores:

| Nombre | Qué es |
|---|---|
| `PAYPAL_CLIENT_ID` | El mismo Client ID de PayPal que ya usas. |
| `PAYPAL_SECRET` | El Secret de PayPal. **Solo aquí.** |
| `PAYPAL_ENV` | `sandbox` para pruebas o `live` para cobrar de verdad. |
| `ADMIN_EMAILS` | Correos de Google que pueden entrar al panel, separados por coma. |
| `GOOGLE_CLIENT_ID` | `333956941163-rlgrb3759jf2uc05olhhpm9e2ggrhm1s.apps.googleusercontent.com` (el de la web). |
| `CRON_KEY` | Una clave larga inventada por ti (por ejemplo, de tu gestor de contraseñas). Protege las tareas automáticas. |
| `IMPORT_KEY` | Otra clave larga inventada por ti. Solo sirve para pasar los datos de la hoja (paso 5). Después puedes borrarla. |
| `GOOGLE_RELAY_URL` y `GOOGLE_RELAY_KEY` | Del conector de Google (paso 4). |
| `TURNSTILE_SECRET` | Opcional: la clave secreta de Cloudflare Turnstile, si la usas. En las apps, en su lugar se pide haber iniciado sesión. |
| `EXPO_ACCESS_TOKEN` | Opcional: token de expo.dev para enviar los avisos push de las apps. |
| `PUSH_ACTIVO` | Opcional: `no` apaga los avisos push de las apps. |

`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` y `SUPABASE_DB_URL` los pone Supabase solo. No hay que crearlos.

## 4. Conector de Google (correos, calendario y PDF)

Los correos salen desde tu Gmail, como hasta ahora, y las citas se agendan en tu Google Calendar.

1. Entra a <https://script.google.com> y pulsa **Nuevo proyecto**. Llámalo «MAJOBELLA · Conector».
2. Borra lo que trae, pega el contenido de `backend/google-relay/Relay.gs` y guarda.
3. Elige la función **preparar** y pulsa **Ejecutar**. Acepta los permisos (Gmail, Calendar). En el registro aparece la **clave**.
4. Pulsa **Implementar → Nueva implementación → ⚙ → Aplicación web** y elige:
   - Ejecutar como: **yo**.
   - Quién tiene acceso: **cualquier usuario**.

   Copia la URL que termina en `/exec`.
5. En los secretos de Supabase (paso 3), guarda:
   - `GOOGLE_RELAY_URL`: esa URL.
   - `GOOGLE_RELAY_KEY`: la clave del registro.

> Alternativa solo para el correo: una cuenta de [Resend](https://resend.com). Añade `RESEND_API_KEY` y `MAIL_FROM`; necesita un dominio propio verificado.

## 5. Pasar los datos de la hoja (NO APLICA: solo datos de prueba)

1. Abre el proyecto de Apps Script de siempre (el de la hoja) y pega la versión nueva de `backend/google-apps-script/Code.gs`.
2. En **Configuración del proyecto → Propiedades del script**, añade:
   - `NUEVA_API_URL`: `https://<Reference ID>.supabase.co/functions/v1/api`
   - `IMPORT_KEY`: la misma del paso 3.
3. Ejecuta **migrarABaseDeDatos**. Copia todas las pestañas: citas, clientas, tarjetas, paquetes, ajustes…
   - Al copiar, ordena nombres, teléfonos y correos.
   - Se puede repetir sin duplicar nada.
4. Ejecuta **migrarArchivos**. Copia fotos, consentimientos y comprobantes de Drive a Storage.
   - Si tarda, se detiene sola a los 5 minutos.
   - Ejecútala otra vez hasta que el registro diga «Archivos listos».

Mientras pruebas, la hoja sigue funcionando igual. Cuando la web y las apps apunten a la API nueva, la hoja queda solo como respaldo.

## 6. Tareas automáticas

Recordatorios, reseñas, retoques, cumpleaños, lista de espera y aviso de transferencias sin revisar corren cada hora con **pg_cron**.

La primera vez que entras al panel con la API nueva, la API las programa sola: necesita `CRON_KEY` (paso 3). Puedes verlas en Supabase, en **Integrations → Cron → majobella-tareas**.

## 7. Apps del celular

Las apps de clientas y del estudio usan esta misma API. Para que funcionen con Supabase:

1. En GitHub → Settings → Secrets and variables → Actions → **Variables**, crea `SUPABASE_URL` (`https://<referencia>.supabase.co`) y `SUPABASE_ANON_KEY` (Project Settings → API → `anon` `public`; es pública, como la de la web).
2. En Supabase → **Authentication**: correo con código y las direcciones de regreso `majobella://auth` y `majobella-estudio://auth`.
3. GitHub vuelve a armar los `.apk` (Actions → Apps → Run workflow).

Los pasos completos (inicio de sesión, Google, avisos push, iPhone) están en [`apps/README.md`](../apps/README.md).

## Para desarrollar (opcional)

Desde la carpeta `supabase/`:

```bash
npm install
npm test            # prueba la API contra un PostgreSQL local
npm run typecheck
npm run migration   # vuelve a generar el SQL de las tablas desde functions/_shared/core/schema.ts
PGHOST=/tmp PGPORT=54329 npx tsx dev/servidor-local.ts 8787   # API local con datos de ejemplo (para probar las apps)
```
