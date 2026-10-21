# MAJOBELLA · Creación inicial de Supabase

## Estado
No existe todavía un proyecto Supabase accesible para MAJOBELLA. Se encontró la organización **Majobella**. Antes de crear el proyecto se debe confirmar con la persona propietaria que esa es la organización elegida, así como cualquier coste propuesto por Supabase.

## Crear
1. Abrir https://supabase.com/dashboard y elegir la organización correcta.
2. Crear un proyecto llamado **majobella**, preferentemente en la región **us-east-1 (North Virginia)**.
3. Elegir una contraseña de base robusta y guardarla **solo** en un gestor de contraseñas; no enviarla por chat ni subirla al repositorio.
4. Esperar que el proyecto indique estado activo; anotar únicamente el ID de referencia del proyecto (no es una clave secreta).
5. Configurar autenticación (correo verificado y Google si se usa), URL de la web, URLs de redirección de las apps y ajustes de correo.

## Conectar CI / API (sin habilitar la migración pública)
- GitHub Actions → Secrets: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`. Son secretos; no incluirlos en archivos.
- GitHub Actions → Variables: `SUPABASE_URL` y la clave pública correspondiente compatible con la aplicación existente `SUPABASE_ANON_KEY`.
- Supabase Edge Functions → Secrets: `PAYPAL_CLIENT_ID`, `PAYPAL_SECRET`, `PAYPAL_ENV=sandbox`, `ADMIN_EMAILS`, `CRON_KEY` y credenciales de correo/Google cuando correspondan.
- Mantener `js/config.js` apuntando al backend anterior hasta que termine la validación integral.
- Ejecución manual de GitHub Actions → Backend para migraciones y publicar Edge Function, **únicamente cuando el código revisado esté fusionado en main y con la aprobación explícita**.

## Validación
1. Validar estado del proyecto, aplicación de migraciones SQL y existencia de tablas.
2. Revisar Supabase Security Advisor y Performance Advisor; RLS activado y sin políticas públicas excesivas.
3. Verificar Storage privado (comprobantes, fotos y consentimientos).
4. Comprobar catálogo, horarios ocupados, colisiones concurrentes y acceso administrativo.
5. Ejecutar PayPal Sandbox y comparar importes registrados con capturas/reembolsos.
6. Hacer copia y reconciliación de Google Sheets/Drive → Supabase, y documentar diferencias antes del corte.
7. Conservar la URL anterior y un plan de reversión; no mezclar puesta en producción con creación del proyecto.

Consultar también `supabase/PRE-MIGRACION-v1.1.md` y `supabase/INSTALAR.md`.

**Seguridad:** nunca introducir contraseñas, tokens de acceso, service-role keys ni PayPal secrets en el chat o en commits.
