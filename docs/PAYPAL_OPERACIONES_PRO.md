# MAJOBELLA · Manual operativo de PayPal Business

**Alcance:** depósitos para reservar, saldos de citas, tarjetas de regalo, paquetes, suscripciones mensuales, recuperación de pagos, comprobantes, reembolsos, disputas y conciliación. Estado: **integración instalada, Live pendiente de habilitación y pruebas de cuenta**.

Referencias oficiales:
- [Orders v2 – Checkout](https://developer.paypal.com/platforms/checkout/standard/integrate)
- [Pagos con tarjeta: elegibilidad y vetting](https://developer.paypal.com/platforms/checkout/advanced/sdk/v1/)
- [Subscriptions v1 API](https://developer.paypal.com/api/subscriptions/v1)
- [Webhooks de suscripciones](https://developer.paypal.com/subscriptions/webhooks/)
- [Validación de webhooks](https://developer.paypal.com/api/rest/webhooks/rest/)
- [Retries de cobro recurrente](https://developer.paypal.com/subscriptions/payment-failure-retry/)
- [Refund capture v2](https://developer.paypal.com/api/payments/v2/captures-refund)
- [Disputas](https://developer.paypal.com/api/disputes/)
- [Transaction Search & reportes](https://developer.paypal.com/api/rest/current-resources/)

## 1. Flujo comercial

**Reserva:** antes del cobro se comprueba disponibilidad, políticas y los consentimientos médicos/estéticos configurados. El depósito se calcula en RD$ y la API genera una orden en USD. PayPal captura el dinero; la reserva no se confirma hasta que la API verifica la captura COMPLETED, importe esperado y moneda. Si el horario se ocupa, se solicita el reembolso y se informa del resultado verdadero.

**Saldo:** la clienta puede pagar al finalizar el tratamiento; se crea una orden diferente y se comprueba la captura.

**Regalo / paquete:** PayPal genera la orden; el sistema activa la tarjeta o las sesiones del paquete después de captura confirmada. El comprobante lleva una referencia de compra.

**Suscripción:** en Administración se crea un plan mensual en USD. El importe USD se muestra antes del consentimiento; la clienta autoriza en PayPal. El retorno `APPROVED`/ `ACTIVE` por sí solo **no** concede sesiones. Únicamente `PAYMENT.SALE.COMPLETED` firmado o la transacción `COMPLETED` recuperada desde la API abre el período. Las renovaciones usan IDs de venta únicos; webhook repetido no crea meses extra. Cambiar tarifa genera un nuevo plan remoto: los compromisos previos conservan el importe aceptado.

**Tarjetas:** el SDK de PayPal muestra una opción de tarjeta solo si es elegible. Para campos de tarjeta con marca blanca, solicitar **Advanced Credit and Debit Card Payments**; requiere evaluación/aprobación del comercio en mercados compatibles. MAJOBELLA no aloja campos propios que reciban números de tarjeta o CVV.

## 2. Configuración Sandbox paso a paso

1. Inicia sesión en [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/) con tu Business y entra a **Apps & Credentials**.
2. Crea/selecciona la app REST de **Sandbox** y confirma que corresponde al negocio que recibe el dinero. Copia el **Client ID** (público) y **Secret** (privado). NUNCA comparta el Secret por correo, chat o GitHub.
3. En Supabase, proyecto MAJOBELLA `thpjpsogcmqkemlxajcm`, abre **Edge Functions → Secrets**. Configura `PAYPAL_CLIENT_ID` y `PAYPAL_SECRET` de la misma aplicación de Sandbox, junto con `PAYPAL_ENV=sandbox` y `MAJOBELLA_TEST_MODE` distinto de `production`.
4. En la misma app PayPal, crea un **Webhook** con la URL:
   `https://thpjpsogcmqkemlxajcm.supabase.co/functions/v1/api`
5. Marca como mínimo los siguientes eventos:
   - `PAYMENT.SALE.COMPLETED`, `PAYMENT.SALE.REFUNDED`, `PAYMENT.SALE.REVERSED`
   - `BILLING.SUBSCRIPTION.CREATED`, `BILLING.SUBSCRIPTION.ACTIVATED`, `BILLING.SUBSCRIPTION.CANCELLED`, `BILLING.SUBSCRIPTION.EXPIRED`, `BILLING.SUBSCRIPTION.SUSPENDED`, `BILLING.SUBSCRIPTION.PAYMENT.FAILED`
   - `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.PENDING`, `PAYMENT.CAPTURE.DENIED`, `PAYMENT.CAPTURE.REFUNDED`, `PAYMENT.CAPTURE.REVERSED`
   - `CUSTOMER.DISPUTE.CREATED`, `CUSTOMER.DISPUTE.UPDATED`, `CUSTOMER.DISPUTE.RESOLVED`
6. Copia el **Webhook ID** generado (distinto del Client ID) a `PAYPAL_WEBHOOK_ID` en Supabase.
7. Habilita de forma explícita `PAYPAL_SUBSCRIPTIONS_ENABLED=true` en los secretos de Supabase **solo para Sandbox**. El catálogo no expondrá suscripciones automáticas cuando falte la clave o Webhook ID.
8. En Administración → **Dinero → Centro PayPal**, consulta las tarjetas de estado, luego pulsa **Probar conexión**. Una respuesta correcta confirma que PayPal aceptó una operación autenticada: no confirma que tarjetas o suscripciones estén habilitadas para Live.
9. En **Membresías**, crea y publica los planes; comprueba la tasa USD/RD$ en Ajustes. Pulsa **Activar suscripciones PayPal**, revisa el importe fijo USD y prueba con un comprador de Sandbox.
10. Verifica que llegan eventos firmados, que se emiten correos, y que los cobros aparecen en el libro de conciliación de Administración.

**Importante:** el webhook pertenece a la aplicación REST específica que origina los pagos. Webhooks configurados en otra app o entorno no recuperan automáticamente las transacciones de esta app.

## 3. Matriz de pruebas antes de producción

- Pago de reserva por cuenta PayPal y, si está habilitada, por tarjeta: correcta confirmación, monto, moneda y depósito.
- Una captura con importe incorrecto debe causar alerta, sin entregar servicios.
- Abandono de PayPal: la cita no se confirma.
- Renovación de suscripción: verifica 1 registro por transacción, 1 período por pago y reinicio de sesiones.
- Devolución de PayPal y llegada duplicada del webhook: sin duplicar movimientos.
- Fallo de pago recurrente: correo amable, alerta en Administración, no abrir sesiones sin cobro; PayPal administra sus propios reintentos.
- Cancelación desde la clienta y desde el estudio: cancelación remota confirmada; derechos del período pagado conservados.
- Webhook inválido: rechazado; webhook repetido: reconocido sin volver a ejecutar el cambio.
- Webhook perdido: en Membresías → **Verificar cobros en PayPal**, recuperar exclusivamente transacciones `COMPLETED`.
- Reembolso completo desde Administración en Sandbox: solo compras elegibles, confirmación explícita, registro único, aviso por correo; simulación de reembolso parcial y disputa quedan para revisión.
- Verificar que la opción Tarjeta no se muestre si PayPal niega su elegibilidad.

## 4. Reembolsos y disputas

En **Dinero → Centro PayPal** puedes consultar capturas, motivos, estados y la lista de eventos firmados.

**Reembolsos permitidos por el panel:** el importe íntegro de una captura de depósito/saldo con cita cancelada, o de regalo/paquete **sin utilizar**. Se valida en el servidor contra `GET /v2/payments/captures/{id}` y se solicita mediante `POST .../refund` con `PayPal-Request-Id` determinista. Una respuesta `PENDING` se muestra como pendiente, no como completada. En Live se exige además escribir `REEMBOLSAR`.

**No se reembolsa automáticamente desde el panel:** pagos parciales, períodos de membresía ya usados, cargos sometidos a disputa o contracargos. Gestionar esos casos en PayPal y conciliar su resultado con el estudio. Las cancelaciones de citas mantienen la lógica de políticas y devolución ya implementada.

**Disputas:** los eventos firmados `CUSTOMER.DISPUTE.*` abren una alerta. El estudio prepara evidencia (orden, consentimiento, comprobante, comunicación, fecha y política) y gestiona el caso en el Centro de Resoluciones de PayPal. Una disputa creada no equivale a un reembolso y no se debe falsear la contabilidad.

**Eventos:** Supabase conserva referencia, tipo, recurso, resultado y hora en la tabla privada `eventos_paypal`. Los eventos se procesan idempotentemente por ID. Algunos reembolsos hechos directamente en PayPal pueden carecer de información para conciliación automática; aparecen como `requiere_revision`.

## 5. Centro de finanzas / conciliación

- **Dinero:** caja, pagos en RD$, comisiones PayPal **estimadas** (no confundir con los importes reales); movimientos de reembolsos de regalos/paquetes registrados en su fecha.
- **Centro PayPal:** entorno Sandbox/Live, presencia de credenciales, Webhook ID, eventos firmados, casos por revisar, referencias de capturas, reembolsos validados.
- **Membresías:** historial de cobros en USD y estados, activar plan remoto, cancelar renovación, verificar historial de transacciones desde PayPal.
- **Comprobantes MAJOBELLA:** concepto, cliente, fecha, referencia, método, USD y equivalente RD$ referencial; pueden imprimirse o guardarse como PDF desde la web. **No** son facturas fiscales NCF/e-CF.
- Para conciliación contable real, contrasta los resultados con **Actividad/Reportes/Transaction Search** de PayPal, incluidas comisiones reales, contracargos, retenciones y tipo de cambio aplicable.

## 6. Activación Live

1. Completar la verificación y aprobación del negocio en PayPal Business y validar disponibilidad de Checkout, Subscriptions y pagos con tarjetas para el país.
2. Generar las credenciales de **Live** y Webhook ID de **esa misma app Live**.
3. Actualizar el Client ID público del SDK web y los secretos del backend **al mismo tiempo**: nunca mezclar Live y Sandbox.
4. Probar Sandbox en todos los escenarios, revisar webhooks y políticas de reembolso/cancelación; solo entonces configurar `PAYPAL_ENV=live` y `MAJOBELLA_TEST_MODE=production`.
5. Confirmar legalidad de términos de renovaciones, privacidad, informaciones tributarias y avisos de cobro. Un negocio sin formalizar puede enfrentar requisitos de cumplimiento de PayPal o de autoridades antes de operar.
6. Ejecutar una compra real de importe pequeño, revisar la conciliación en PayPal y no promocionar el método hasta comprobar el resultado.

**Bloqueo de seguridad:** al integrar código y base de datos en Supabase **no se habilita Live**. La cuenta PayPal Business aún debe aprobar los métodos y las credenciales/ID deben colocarse directamente en Secrets. No es posible leer secretos privados con el conector actual de Supabase.

## 7. Próximas capacidades (no implementar sin aprobación)

- Reembolso parcial con revisión financiera y asiento en ambos métodos, comprobantes corregidos y límites por rol.
- Reconciliación masiva diaria via Transaction Search/Settlement Report con comisiones efectivas en cada moneda.
- Facturación fiscal NCF/e-CF cuando MAJOBELLA esté formalizada y autorizada.
- Workflow multirrol y doble aprobación de reembolsos Live de alto importe.
- Monitor operativo sobre tiempos de webhook, discrepancias, disputas y cuentas por cobrar.
