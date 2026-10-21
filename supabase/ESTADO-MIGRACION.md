# MAJOBELLA · Estado real de la migración (21 octubre 2026)

**NO CAMBIAR EL BACKEND DE LA WEB AÚN.** La API antigua tiene un intervalo ocupado en el periodo 2026-10-21 a 2026-12-21 y la nueva todavía no. No se ha importado el historial.

## Completado y verificado

- Proyecto Supabase: `thpjpsogcmqkemlxajcm` · región `us-east-1`.
- 20 tablas PostgreSQL instaladas; todas con RLS activo, sin permisos de lectura directa para `anon` ni `authenticated`.
- Migraciones aplicadas y registro sincronizado con los nombres del repositorio: `20261020000000`, `20261020000100`, `20261021000000`.
- Storage: bucket privado `fichas`, bucket público `publico`.
- `pg_cron` y `pg_net` instalados; este último fuera del esquema `public`.
- Función `public.majobella_actualizado` con `search_path=pg_catalog`.
- Security Advisor: solo 20 notas informativas de RLS sin políticas, deliberadas porque la aplicación usa una API con controles de permisos.
- GitHub Actions Backend: comprobación de TypeScript y 8 suites de tests aprobadas para commit `e0484de8`, ejecución `39651654416`.
- API `https://thpjpsogcmqkemlxajcm.supabase.co/functions/v1/api` desplegada en Supabase; `GET ?action=catalog` devolvió HTTP 200 y `ok:true`.
- La API denegó `adminImport` con clave inválida y `adminData` sin token verificado.
- Catálogo del sistema antiguo vs nuevo: 5 servicios iguales, mismos horarios y parámetros públicos de pago; cero promociones en ambos.
- **Advertencia importante:** despliegue inicial de la API compilado desde una importación de código fuente GitHub fijada al commit `e0484de8`. Antes del corte definitivo volver a desplegar usando el workflow completo de GitHub Actions con el paquete local de archivos (no depender de importaciones remotas).
- El workflow de publicación del backend requiere ejecución manual desde `main` (nunca despliega al hacer merge).

## Bloqueos que requieren acceso del propietario

### A. Datos antiguos de Apps Script/Sheets/Drive
1. Hacer copia de la hoja de cálculo y archivos del Drive del estudio antes de importar.
2. Crear **fuera del chat** una clave aleatoria segura `IMPORT_KEY` en un gestor de contraseñas; guardarla en Supabase (Edge Functions → Secrets).
3. En el Apps Script que usa la hoja, actualizar el código con `backend/google-apps-script/Code.gs` del repositorio si no se ha hecho. En Propiedades del script establecer:
   - `NUEVA_API_URL` = `https://thpjpsogcmqkemlxajcm.supabase.co/functions/v1/api`
   - `IMPORT_KEY` = el mismo secreto configurado en Supabase.
4. Ejecutar `migrarABaseDeDatos()` y revisar registro de cada tabla.
5. Ejecutar `migrarArchivos()` hasta terminar; comprobar que `fallos=0`.
6. Realizar comparación del número de citas por estado, las reservas futuras, saldos/depósitos, servicios, cupones, tarjetas y archivos. La comparación pública de intervalos ocupados debe quedar sin diferencias.
7. Inmediatamente antes de cambiar la web realizar una sincronización final, con nuevas reservas temporalmente detenidas o un procedimiento coordinado, para evitar escrituras perdidas.

### B. Configuración operativa y de pagos (SIN secretos en GitHub)
Configurar Supabase → Edge Functions → Secrets: `PAYPAL_CLIENT_ID`, `PAYPAL_SECRET`, `PAYPAL_ENV=sandbox`, `ADMIN_EMAILS`, `CRON_KEY`, `GOOGLE_RELAY_URL`, `GOOGLE_RELAY_KEY` y opcionalmente `ALLOWED_ORIGINS=https://anthonyhenriquezluciano.github.io`. Desplegar `backend/google-relay/Relay.gs` desde una cuenta de Google autorizada y configurar su clave. Validar Google Auth y las URLs de redirección de ambas apps.

### C. Publicar la versión de código definitiva desde GitHub
GitHub → Settings → Secrets and variables → Actions:
- Secrets: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF` = `thpjpsogcmqkemlxajcm` (puede ser Variable pública), `SUPABASE_DB_PASSWORD`.
- Variables: `SUPABASE_URL=https://thpjpsogcmqkemlxajcm.supabase.co`, `SUPABASE_ANON_KEY` (clave pública legacy, si la requieren las apps).
- Tras validar y fusionar PR #1, ejecutar **manualmente** Actions → Backend → Run workflow desde `main`. Confirmar que no hay discrepancias en historial de migraciones ni fallos de despliegue.

### D. Pruebas finales y cambio
- PayPal Sandbox: reserva, captura repetida, pago parcial, reversión y reembolso, saldo final.
- Transferencia: pendiente, comprobante, aprobación/rechazo y caducidad.
- Prueba de concurrencia sobre la misma hora en backend nuevo.
- Inicio de sesión en web y ambas apps, cliente/admin; RLS y Storage privados.
- Envío de correo y calendario/recordatorios; no duplicar avisos.
- Backup completo, corte coordinado, actualizar `js/config.js → booking.apiUrl`, probar producción y conservar rollback al Apps Script.
- Cambiar `PAYPAL_ENV` a live solo después de pruebas controladas y autorización del propietario.

**Nunca publicar ni enviar por chat** secretos PayPal, contraseñas, claves de servicio, tokens de GitHub/Supabase o la clave de importación.
