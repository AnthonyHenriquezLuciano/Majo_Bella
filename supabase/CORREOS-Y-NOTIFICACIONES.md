# MAJOBELLA · Pruebas sin Google Sheets — correos y notificaciones

## Entorno de trabajo
- **Solo Supabase** (proyecto `thpjpsogcmqkemlxajcm`): citas, horarios, clientas, cobros, agenda, historial, ajustes y logs.
- **PayPal SANDBOX**: `PAYPAL_ENV=sandbox`. El backend requiere dos señales explícitas (`MAJOBELLA_TEST_MODE=production` y `PAYPAL_ENV=live`) para abandonar las pruebas. No configurar esos valores hasta el lanzamiento real.
- **Google Sheets / Google Apps Script antiguos:** los archivos permanecen como referencia histórica en GitHub, pero la web y las apps nuevas ya no deben hacer peticiones a esa API ni importar ningún dato.
- Banner visible: versión de pruebas, sin pagos de dinero real.
- Los APK no se publican en cada push: compilación y distribución solo con ejecución manual del workflow Apps.

## Correo electrónico sin Apps Script
**Recomendado: Resend** (https://resend.com).
1. **Mientras MAJOBELLA siga en GitHub Pages y en pruebas (sin dominio propio):** crear cuenta en Resend; usar como remitente de prueba `MAJOBELLA <onboarding@resend.dev>`. Sin dominio verificado, Resend restringe los correos a la dirección propietaria de esa cuenta; **no permite enviar libremente a las clientas**. No anunciar envío real a terceros.
2. En **Supabase → Edge Functions → Secrets** configurar:
   - `RESEND_API_KEY`: clave de servidor (privada).
   - `MAIL_FROM`: `MAJOBELLA <onboarding@resend.dev>` **solo durante las pruebas**.
   - `ADMIN_EMAILS`: correo(s) autorizados del estudio y que reciben alertas. Para validar entregas, usar como destinataria la dirección de la cuenta Resend.
3. **Cuando se compre un dominio:** añadirlo a Resend, verificar los registros DNS (SPF/DKIM) y cambiar `MAIL_FROM` por una dirección de ese dominio, por ejemplo `MAJOBELLA <notificaciones@majobella.com>`. Esto no exige abandonar GitHub Pages: alojamiento web y dominio remitente del correo son independientes.
4. La API genera y encola los mensajes **después de registrar la operación en PostgreSQL**. `outbox.ts` intenta el envío mediante Resend; los resultados de cada correo se anotan en `Correos`, y los fallos en `Errores`.
5. Plantillas de `mail.ts` para: confirmación, cancelación, cambio, recibo/comprobante de transferencia, recordatorio, reseñas, cumpleaños, retoques y avisos de agenda al estudio.
6. Hacer una reserva de prueba con dirección propia, revisar Resend y `Correos`, y comprobar mensajes en spam. **No anunciar envíos automáticos a clientas hasta probarlos.**

**Importante:** si falta `RESEND_API_KEY` y tampoco está configurado `GOOGLE_RELAY_URL/KEY`, el sistema **NO envía correos**; solo registra la falta de integración. Se recomienda Resend para no depender de Apps Script.

## Notificaciones a los celulares
- **Local:** la app programa recordatorios en el teléfono, según sus permisos, incluso sin Expo Push de servidor.
- **Push remotas:** al iniciar sesión y aceptar permisos, una app registra un token Expo en la tabla privada `dispositivos`. Después, `outbox.ts` genera push correspondientes a notificaciones de cita, cambios y avisos de administración mediante el servicio Expo.
- Para publicar notificaciones push en Android hacen falta la configuración de Expo (`EAS_PROJECT_ID`), credenciales Firebase FCM y APK firmadas correctamente. iPhone requiere configuración APNs y publicación por TestFlight/App Store.
- Sin configuración o sin app instalada/permiso, **no se envían push**. El panel sigue manteniendo el estado en PostgreSQL.

## Recordatorios automáticos
- `pg_cron` y `pg_net` se han instalado. Configurar `CRON_KEY` en Supabase Secrets.
- El backend programa `majobella-tareas` al acceder el panel como administradora autorizada; verificar en **Supabase → Integrations → Cron**. La tarea revisa recordatorios, reseñas, retoques, cumpleaños, lista de espera y transferencias pendientes.
- Si no hay tareas o no se configuró Resend, **los recordatorios por correo todavía no están activos**.
- El usuario puede abrir un enlace de “Agregar al calendario” sin integración adicional.

## Google Calendar (opcional)
La integración **automática** de Google Calendar actualmente se implementa mediante `backend/google-relay/Relay.gs` (Apps Script, no Sheets). Para no utilizar Apps Script en absoluto, **no configurar** `GOOGLE_RELAY_URL` ni `GOOGLE_RELAY_KEY`. El estudio gestionará citas desde el panel de MAJOBELLA en Supabase; la sincronización automática con Google Calendar quedará desactivada hasta implementar integración directa de OAuth/Calendar API.

## Lista de verificación antes de permitir clientas reales
- [ ] Web y PWA usan exclusivamente URL Supabase y muestran aviso de pruebas.
- [ ] Correo de prueba enviado mediante Resend con remitente verificado; historial `Correos` correcto.
- [ ] Inicio de sesión de administradora y permisos correctos.
- [ ] Confirmación de pago real en Sandbox por una cuenta compradora, reembolso y concurrencia.
- [ ] Secretos `PAYPAL_ENV=sandbox`, `MAJOBELLA_TEST_MODE=testing` y origen CORS permitido.
- [ ] Push de prueba en un teléfono real; firma propia de Android.
- [ ] Cron configurado y recordatorio de prueba verificado.
- [ ] Antes del lanzamiento comercial, decisión explícita de activar cobros reales y retirar aviso de pruebas.

### Seguridad
La contraseña de una cuenta compradora de PayPal Sandbox se compartió previamente por el chat. **Cambiar esa contraseña en PayPal Sandbox** y no almacenarla en archivos, GitHub o mensajes. No hace falta introducirla para configurar Resend, Supabase ni despliegues.
