# MAJOBELLA · PayPal Business / pagos premium

La experiencia de pago usa la cuenta PayPal Business del estudio. **No almacena tarjetas ni CVV**; las órdenes de cita, regalos y paquetes se crean/capturan en la API. Las membresías usan PayPal Subscriptions y se activan **solo tras un pago verificado**.

## Métodos que aparecen en el checkout
- **PayPal:** disponible con una cuenta Business configurada y botón elegible.
- **Tarjeta sin cuenta PayPal:** sólo cuando `FUNDING.CARD` aparece como elegible en la cuenta y navegador de la compradora. Algunas cuentas o países necesitan solicitar **Advanced Credit and Debit Card Payments**. MAJOBELLA no dibuja campos de tarjeta falsos ni puede garantizar la opción hasta que PayPal apruebe el comercio.
- **Transferencia:** sigue disponible en los flujos que ya la ofrecían.

La tarjeta y PayPal usan la interfaz hospedada por PayPal. En ambos casos, el backend valida el resultado antes de confirmar una cita. Los consentimientos de tratamiento se presentan antes del cobro según la lógica de reservas.

## Habilitar suscripciones (primero Sandbox)
1. En [PayPal Developer](https://developer.paypal.com/dashboard/), utiliza una REST App asociada a tu **PayPal Business**, empieza por Sandbox y comprueba su elegibilidad para **Subscriptions**.
2. En Supabase → Edge Functions → Secrets de **api**, configura:
   - `PAYPAL_CLIENT_ID`, `PAYPAL_SECRET`: credenciales de la misma REST App.
   - `PAYPAL_ENV=sandbox` y `MAJOBELLA_TEST_MODE` **distinto de** `production` en las pruebas.
   - `PAYPAL_SUBSCRIPTIONS_ENABLED=true`: interruptor explícito (por defecto apagado).
   - `PAYPAL_WEBHOOK_ID`: ID del webhook generado en esa REST App, **NO** el Client ID.
3. Registrar URL del webhook: `https://thpjpsogcmqkemlxajcm.supabase.co/functions/v1/api` con los eventos:
   `PAYMENT.SALE.COMPLETED`, `PAYMENT.SALE.REFUNDED`, `PAYMENT.SALE.REVERSED`,
   `BILLING.SUBSCRIPTION.ACTIVATED`, `BILLING.SUBSCRIPTION.CANCELLED`,
   `BILLING.SUBSCRIPTION.EXPIRED`, `BILLING.SUBSCRIPTION.SUSPENDED`,
   `BILLING.SUBSCRIPTION.PAYMENT.FAILED`.
   La firma se verifica mediante la API de PayPal y el Webhook ID.
4. En Administración → Ajustes revisa la **tasa USD/RD$** (PayPal factura en USD).
5. En Administración → Membresías crea/publica un plan; pulsa **Activar suscripciones PayPal**. Verifica el importe USD mostrado. El plan remoto se mantiene como precio histórico de quienes ya lo contrataron; al cambiar RD$ debes sincronizar uno nuevo.
6. La clienta inicia sesión, elige **Suscribirme con PayPal**, aprueba en PayPal y vuelve a MAJOBELLA. El simple retorno o `BILLING.SUBSCRIPTION.ACTIVATED` **no** habilita sesiones; la primera `PAYMENT.SALE.COMPLETED` firmada y por el importe exacto sí. Nunca activar prestaciones por un evento de autorización.
7. Prueba con cuentas de Sandbox: cobro inicial, renovación, pago fallido, cancelación desde ambos lados, repetición de webhook, importes incorrectos y tarjeta no elegible. Confirma la entrega de correos y la conciliación en Administración.

### Activar cobros reales
Solo cuando PayPal habilite tu Business, la moneda, el país y el método de financiación:
- Sustituye el Client ID público de la web y los secretos del backend por los de la **misma app Live**.
- Actualiza el Webhook ID al registrado en Live.
- Configura **ambos** `PAYPAL_ENV=live` y `MAJOBELLA_TEST_MODE=production` para permitir operaciones reales. Sin esta doble confirmación, el backend continúa en Sandbox.
- Confirma políticas de reembolso, términos de renovación y avisos al comprador según la normativa aplicable antes de publicar la suscripción automática.

## ¿Qué pasa si falla un pago?
1. PayPal intenta procesar la renovación según la configuración del plan. El estudio nunca hace cargos invisibles desde MAJOBELLA.
2. Un evento de pago fallido **no crea sesiones nuevas**. Se registra `PAYMENT_FAILED`, se envía un correo cálido a la clienta y un aviso al estudio.
3. La clienta puede revisar sus métodos en PayPal, contactar a MAJOBELLA o cancelar la renovación desde Mis membresías.
4. Si termina el período ya pagado sin nuevo cobro confirmado, las sesiones disponibles quedan en cero. Si llega un cobro completado de la misma suscripción, se reconcilia una vez y se abre el nuevo período.
5. Cancelar llama a **PayPal** y solo entonces marca la renovación desactivada en MAJOBELLA, conservando lo ya pagado hasta vencimiento.
6. Ante dudas sobre un pago, **comprobar el historial de PayPal antes de reintentarlo**, para evitar cobros duplicados.

## Recibos y facturación
- Cada cobro recurrente confirmado crea una referencia única de PayPal y un **comprobante comercial premium** por correo; en la web, la clienta puede imprimir o guardar en PDF su comprobante.
- El comprobante incluye MAJOBELLA, plan, titular, fecha, referencia, importe en USD y equivalencia referencial RD$.
- **No es una factura fiscal con NCF**. El sistema no emite NCF, e-CF ni ITBIS automáticamente. Para facturación fiscal necesitarás la formalización y habilitación correspondiente.
- El libro de cobros recurrentes conserva IDs, estados y importes, no datos de tarjeta ni de autenticación.

## Precauciones
- Las claves secretas están exclusivamente en Supabase; no incluirlas en GitHub, la web ni las apps.
- El endpoint webhook responde con error no-2xx si no logra autenticar o procesar un evento; PayPal puede reintentarlo.
- Se deduplican pagos por el ID de venta de PayPal y se valida el importe y moneda.
- Los cobros automáticos se mantienen **deshabilitados por defecto** hasta completar la configuración y pruebas.
