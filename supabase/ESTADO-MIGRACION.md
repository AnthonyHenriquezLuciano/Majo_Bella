# MAJOBELLA · Activación desde cero (v1.1)

Fecha: 2026-10-21. **El propietario confirmó que todo el historial de Google Sheets/Apps Script es de prueba y no se debe importar.** Los datos de prueba quedan en el sistema anterior; no eliminarlos ni copiarlos.

## Preparado
- Proyecto Supabase `thpjpsogcmqkemlxajcm` (us-east-1), PostgreSQL con 20 tablas, tres migraciones registradas y RLS habilitado; tablas privadas a clientes.
- Buckets `fichas` (privado) y `publico` (público), revisión de seguridad sin avisos WARN/ERROR al terminar la instalación inicial.
- Edge Function `api` desplegada y probada en catálogo (HTTP 200).
- Pruebas automatizadas de backend, TypeScript y controles de sesión negativa completados en CI.
- Rama `fix/v1.1-reservas-fail-closed` prepara `js/config.js → booking.apiUrl` hacia el proyecto nuevo, **sin publicar en main**.
- PayPal desactivado como opción pública hasta que el backend tenga `PAYPAL_CLIENT_ID` y `PAYPAL_SECRET`, del mismo entorno; el catálogo de API aporta el Client ID público y el modo sandbox/live.
- Workflow Backend: despliegue manual desde `main`, nunca automático al fusionar cambios.

## Solo lo indispensable para activar reservas
1. Configurar en **Supabase → Edge Functions → Secrets**, sin enviar valores por chat:
   - `ADMIN_EMAILS`: correo(s) que gestionarán el panel.
   - `PAYPAL_CLIENT_ID`, `PAYPAL_SECRET`, `PAYPAL_ENV=sandbox`: credenciales para **la misma aplicación de PayPal Sandbox**. El ID público llega a la web desde el catálogo API.
   - `ALLOWED_ORIGINS=https://anthonyhenriquezluciano.github.io` para restringir los orígenes web; verificar si hay dominio propio.
2. **Opcional para primera fase, necesario para correos/calendario:** configurar `GOOGLE_RELAY_URL`, `GOOGLE_RELAY_KEY`; `CRON_KEY` para recordatorios automáticos.
3. Confirmar inicio de sesión: configurar **Supabase Authentication** con correo y las URLs web/app; Google OAuth solo si se va a utilizar.
4. Confirmar `catalog` con `payments.enabled=true` y el PayPal Client ID de **sandbox**, sin usar credenciales live en pruebas.
5. Ejecutar prueba end-to-end: elegir servicio y fecha, retener horario, pagar en PayPal Sandbox, ver cita en panel, cancelación y reembolso; comprobar que dos reservas simultáneas no ocupen el mismo horario.
6. Verificar que la web no cobre si falla la lectura del catálogo o faltan credenciales.
7. Tras aprobación, **fusionar PR**, reconstruir las páginas con el flujo de publicación habitual y validar reservas en GitHub Pages. La rama `main` no ha cambiado hasta entonces.

## Aplicaciones móviles (etapa posterior a reservas web)
- GitHub Actions variables: `SUPABASE_URL=https://thpjpsogcmqkemlxajcm.supabase.co` y `SUPABASE_ANON_KEY` (clave pública compatible).
- Configurar firma de APK privada y probar inicio de sesión del estudio; no publicar APKs firmadas con llave de prueba.

## No es necesario
- No configurar `IMPORT_KEY`.
- No ejecutar `migrarABaseDeDatos()` ni `migrarArchivos()`.
- No conectar Google Drive/Sheets a ChatGPT.
- No comparar ni replicar las reservas de prueba del servidor anterior. **Al activar la nueva web, esos datos de prueba dejarán de aparecer, por decisión del propietario.**

**Importante:** si antes del cambio aparece alguna reserva auténtica en el sistema antiguo, detener el corte y trasladarla o confirmarla manualmente. No exponer claves, tokens ni contraseñas en GitHub o el chat.

## Verificación Sandbox efectuada (2026-10-21)
- La API reporta PayPal **habilitado** y entorno `sandbox`; devuelve 5 servicios (HTTP 200).
- Se creó una orden PayPal Sandbox por un depósito de RD$450, equivalente a US$7.15, para una cita de prueba: el token de PayPal Sandbox y la creación de orden funcionaron, **sin capturar dinero**.
- Segunda retención en el mismo horario: rechazada correctamente por el backend (`ok:false`). Esto comprueba conflicto con una retención existente, **no sustituye una prueba de solicitudes simultáneas**.
- Se liberó la retención de prueba mediante la API y se eliminó exclusivamente la fila de QA expirada; la base volvió a 0 reservas, con 5 servicios iniciales y 0 clientas.
- Se comprobó acceso CORS desde GitHub Pages: actualmente devuelve `Access-Control-Allow-Origin: *`. Antes de producción establecer `ALLOWED_ORIGINS=https://anthonyhenriquezluciano.github.io` en Supabase y verificar nuevamente.
- El catálogo en localStorage se separó por URL de backend (`mjb.catalog.v3`) para impedir reutilizar configuración heredada de Apps Script durante la activación.
- GitHub Actions: pruebas backend + sintaxis web aprobadas en la ejecución `39660655380` para la corrección de caché.

## Pendiente para declarar lanzamiento listo
- Validar en un navegador una **compra completa con usuario comprador de PayPal Sandbox**, su captura y confirmación, más cancelación y reembolso.
- Probar inicio de sesión de una administradora autorizada y panel web.
- Configurar correo/calendario mediante Google Relay o la alternativa de correo seleccionada; activar y verificar tareas automáticas si son necesarias.
- Configurar origen CORS y volver a comprobar respuesta; publicar versión final del backend desde archivos locales en GitHub Actions, no conservar el despliegue provisional con imports remotos.
- Cambiar a **PayPal live** solo con las credenciales reales correctas y después de aprobar las pruebas; evitar publicar un checkout Sandbox al público como si aceptara pagos reales.
- Fusionar PR y comprobar la web publicada, manteniendo un plan de reversión.
