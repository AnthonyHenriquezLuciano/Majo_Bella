# MAJOBELLA · Activación y validación de PayPal Business
**Estado de esta guía:** procedimiento de preparación, NO comprobante de integración live ni de aprobación de tarjeta.

## Alcance y límites
- Checkout de cobro único: depósito de reservas, saldo, tarjetas regalo, paquetes.
- Suscripciones mensuales: producto + plan remoto por cada plan MAJOBELLA, aprobación expresa, primer cobro confirmado por webhook, renovaciones y cancelación.
- Reembolsos: consola admin; solo elegibles y verificados contra PayPal; la lógica actual hace reembolsos **totales** de depósitos/saldos de citas canceladas y tarjetas/paquetes sin uso. Los reembolsos parciales requieren revisión, no deben automatizarse sin soporte de conciliación.
- **La tarjeta sin cuenta PayPal no está garantizada.** El frontend solo muestra financiación CARD si el SDK indica elegibilidad. Los campos avanzados de tarjeta requieren aprobación comercial adicional y una integración específica.
- La interfaz está en RD$, pero los cobros de esta integración se realizan en USD; mostrar la tasa de conversión antes del consentimiento. Verificar tarifas reales con PayPal, no asumir que un porcentaje configurado en Ajustes es contractual.
- La cuenta PayPal Business del comercio debe estar verificada y autorizada para las funciones que se pretenden utilizar.

## 1. Activar Sandbox sin dinero real
1. Entrar en https://developer.paypal.com/dashboard/applications/sandbox .
2. Crear o seleccionar una **REST App** vinculada a la cuenta Business Sandbox del estudio.
3. Copiar **Client ID** y **Secret**; no publicar el secreto en GitHub, Expo, navegador ni mensajes.
4. En Supabase, abrir https://supabase.com/dashboard/project/thpjpsogcmqkemlxajcm/functions/secrets y definir:
   - `PAYPAL_CLIENT_ID`: de la app sandbox
   - `PAYPAL_SECRET`: secreto de la **misma** app sandbox
   - `PAYPAL_ENV=sandbox`
   - `MAJOBELLA_TEST_MODE=sandbox`
5. En la misma REST App, registrar un webhook con URL exacta:
   `https://thpjpsogcmqkemlxajcm.supabase.co/functions/v1/api`
6. Seleccionar al menos estos eventos:
   - `PAYMENT.SALE.COMPLETED`, `PAYMENT.SALE.REFUNDED`, `PAYMENT.SALE.REVERSED`
   - `BILLING.SUBSCRIPTION.CREATED`, `BILLING.SUBSCRIPTION.ACTIVATED`
   - `BILLING.SUBSCRIPTION.PAYMENT.FAILED`, `BILLING.SUBSCRIPTION.SUSPENDED`
   - `BILLING.SUBSCRIPTION.CANCELLED`, `BILLING.SUBSCRIPTION.EXPIRED`
   - `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.PENDING`, `PAYMENT.CAPTURE.DENIED`, `PAYMENT.CAPTURE.REFUNDED`, `PAYMENT.CAPTURE.REVERSED`
   - Los eventos `CUSTOMER.DISPUTE.*` relevantes para la gestión de disputas
7. Copiar el **Webhook ID** de ese webhook y guardarlo como `PAYPAL_WEBHOOK_ID` en Supabase.
8. Solo tras tener webhook, credenciales y permisos reales, definir `PAYPAL_SUBSCRIPTIONS_ENABLED=true`.
9. Abrir ADM → Pagos PayPal, ejecutar prueba de conexión autenticada. Una respuesta correcta **NO comprueba** la recepción de eventos ni habilitación de tarjetas.
10. En ADM → Membresías revisar la tarifa en RD$ (el plan `Faciales PRO` figura con RD$20 hasta corregirlo), y usar «Activar suscripciones PayPal» para crear el Product y Billing Plan remoto. Esto puede crear recursos en la cuenta conectada: usar Sandbox primero.

## 2. Validación obligatoria (cuenta compradora sandbox distinta de la vendedora)
- Crear orden y capturar un depósito; comprobar estado y captura en PayPal **y** reserva.
- Pagar saldo, tarjeta regalo y paquete; comprobar conciliación, emisión de correo y cambios de estado.
- Suscribirse a un plan, aprobar el mandato, comprobar que **NO** se conceden sesiones solo con la autorización.
- Confirmar llegada de `PAYMENT.SALE.COMPLETED`, verificación de firma, idempotencia (reenviar un evento y observar que NO suma sesiones/cobros dos veces), activación y comprobante.
- Probar cancelación de renovación y confirmación en PayPal; el período previamente pagado debe mantenerse.
- Probar fallo de pago y aviso, sin otorgar beneficios de un ciclo impago.
- Reembolsar una compra de prueba elegible desde ADM (doble confirmación); revisar ID, estado completo/pendiente y actualización en base. Nunca asumir un reembolso efectivo solo por haber solicitado la operación.
- Verificar rechazo de firma de webhook falsa, pedidos con importe distinto y error del procesador tras cobrar. Inspeccionar panel de eventos y logs sin exponer secretos.
- Confirmar comportamiento de tarjeta en navegador/móvil **según elegibilidad real**; no asumir que todos los compradores tendrán pago como invitado.
- Revisar que factura/comprobante diga que es **comprobante comercial sin NCF**, hasta cumplir requisitos fiscales dominicanos.

## 3. Paso a producción
1. Asegurar que la cuenta Business real acepta pagos, suscripciones y operaciones elegidas; verificar identidad, restricciones y disponibilidad específicas con PayPal.
2. Crear/seleccionar la REST App **Live**, generar Client ID y Secret de Live.
3. Registrar **un webhook de Live**, con la misma URL, y usar su Webhook ID Live. El webhook de Sandbox no verifica eventos de Live.
4. Sustituir como conjunto coherente los secretos `PAYPAL_CLIENT_ID`, `PAYPAL_SECRET`, `PAYPAL_WEBHOOK_ID`, `PAYPAL_ENV=live`, `MAJOBELLA_TEST_MODE=production` y `PAYPAL_SUBSCRIPTIONS_ENABLED=true`.
5. Cambiar el banner `testMode` de `js/config.js` a `false` **solamente después** de validar la conexión Live y los controles.
6. Crear de nuevo los planes remotos de **Live**. Jamás reutilizar `paypal_product_id` ni `paypal_plan_id` creados en Sandbox. Antes de sincronizar, limpiar/rehacer las referencias de sandbox a través de un procedimiento de migración verificado (no borrarlas en producción sin revisar vinculaciones).
7. Realizar una transacción live autorizada de importe pequeño, comprobar webhook/correo/saldo y procesar su reembolso; evitar pruebas con pagos que violen las normas de PayPal.
8. No anunciar como «automático» un método que no se haya confirmado extremo a extremo.

## Operación recurrente
- Consultar diariamente eventos PayPal y pagos rechazados; contrastar liquidaciones y transacciones de PayPal.
- Verificar comisiones efectivas, tipo de cambio, método de retiro y posibles reservas/retenciones aplicadas por PayPal.
- Comunicar antes de autorizar: precio **exacto USD**, ciclo mensual, beneficios, vencimiento de sesiones, cancelación y enlace a políticas.
- Ofrecer a clientas acceso a «Mis membresías» para cancelar renovaciones y obtener comprobantes.
- No prometer tarjetas, Apple Pay, Pay Later, pagos sin cuenta, transferencias bancarias de PayPal o campos avanzados si el merchant no cumple requisitos.
- Revisar política de devoluciones con asesoría legal/fiscal de República Dominicana; ninguna implementación técnica sustituye la aprobación de esos textos.

## Documentación técnica de referencia
- https://developer.paypal.com/subscriptions/about/
- https://developer.paypal.com/subscriptions/webhooks/
- https://developer.paypal.com/api/rest/webhooks/
- https://developer.paypal.com/checkout/refund-payment
- https://developer.paypal.com/subscriptions/payment-failure-retry/
- https://www.paypal.com/do/business/accept-payments/checkout
