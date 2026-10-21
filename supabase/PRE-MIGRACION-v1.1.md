# MAJOBELLA · Puerta de migración v1.1 (NO CAMBIAR PRODUCCIÓN)
Fecha: 2026-10-21

## Estado técnico comprobado
- La web pública sigue apuntando a Google Apps Script en `js/config.js`.
- La API Supabase tiene bloqueo transaccional para operaciones críticas (`pg_advisory_xact_lock` en `api.ts`).
- Los tests y `typecheck` del backend pasaron en GitHub Actions para el commit `ec858f5` (ver PR #1). El último cambio de workflow aún requiere su propia comprobación.
- La publicación del backend ahora se inicia **solo manualmente** (`workflow_dispatch` desde `main`). Hacer merge **no** migra la base.
- No se han ejecutado cobros reales ni pruebas de extremo a extremo contra la cuenta Supabase del negocio.
- La conexión Supabase disponible en ChatGPT no muestra proyectos: falta acceso a un proyecto existente o crearlo/conectarlo.

## Controles obligatorios antes de habilitar el backend
1. [ ] Confirmar proyecto Supabase accesible y región; **no compartir secretos en chat**.
2. [ ] Verificar el resultado de Backend (PR #1): TypeScript y todos los tests.
3. [ ] Auditar RLS, permisos anon/authenticated, funciones SECURITY DEFINER y buckets privados con los asesores de seguridad de Supabase.
4. [ ] Configurar los secretos de Edge Functions (PAYPAL_CLIENT_ID, PAYPAL_SECRET, PAYPAL_ENV=sandbox, ADMIN_EMAILS, CRON_KEY, integración de correo/calendario).
5. [ ] Usar PayPal Sandbox para: reserva/captura, orden repetida, importe incorrecto, reserva expirada, devolución exitosa y devolución fallida.
6. [ ] Realizar dos intentos concurrentes de reserva para la misma hora; solo uno debe crear retención.
7. [ ] Validar reserva por transferencia, comprobante, aprobación, rechazo y vencimiento automático.
8. [ ] Confirmar inicio de sesión de clienta y administradora; denegar accesos no autorizados.
9. [ ] Respaldar datos de Apps Script/Sheets/Drive y PostgreSQL; migrar sobre ambiente de pruebas, comprobar recuentos, totales, fechas, códigos y archivos sin duplicados.
10. [ ] Hacer prueba de correos y eventos Google Calendar; confirmar cron y avisos sin duplicados.
11. [ ] Configurar origen web, CORS y endpoint nuevo; probar web/PWA y dos apps antes de cambiar `js/config.js`.
12. [ ] Tener plan de reversión: guardar URL de Apps Script y snapshot de datos, definir ventana de mantenimiento y responsable.
13. [ ] Aprobar manualmente puesta en producción; ejecutar despliegue y prueba real mínima controlada.

## Bloqueos actuales
- No se puede certificar la migración sin acceso verificable al proyecto Supabase y Sandbox de PayPal.
- Los tests automatizados no sustituyen pruebas de pagos/concurrencia ni validación de datos existentes.
- Evitar publicar automáticamente al fusionar el PR. La publicación debe mantenerse separada de la revisión de código.

## Política de seguridad
Nunca pegar contraseñas, service_role, PayPal Secret, tokens de acceso o claves de firma en commits, issues o chats. Configurarlos directamente en los gestores de secretos correspondientes.
