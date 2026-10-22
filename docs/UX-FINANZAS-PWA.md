# MAJOBELLA · Mejoras de administración, finanzas y PWA
## Estado
Implementadas en la rama `feature/ux-fx-expenses-pwa-20261022` y PR #17, **no fusionadas ni desplegadas**. Mantener la producción estable hasta verificar los flujos abajo.

## Ajustes simplificados
Ajustes agrupa tarifas, reservas, avisos, contacto y comisiones estimadas en acordeones con ayudas legibles. Las políticas y opciones siguen configurables desde el panel.

## USD/DOP automático
- Por defecto permanece en modo **Manual** con la tasa existente. No alteramos los valores reales sin consentimiento del estudio.
- El administrador puede elegir **Automático** en ADM → Ajustes → Reservas y pagos.
- Fuente indicativa: ExchangeRate-API `open.er-api.com/v6/latest/USD`, no BCRD ni PayPal. Actualización automática aproximadamente diaria por el cron `majobella-tareas` (horario). Una caída, antigüedad mayor a 72 horas, variación >3% o valor fuera de rango impide sobrescribir la tasa y genera registro de error.
- La fuente que se muestra al comprador es solo indicativa. Las órdenes ya creadas conservan el importe autorizado; no hacer conversión nueva para una captura existente.
- Este flujo requiere publicar el nuevo código de Supabase Edge Function `api`, y probar cron, origen, tasa y fecha. La preferencia automática solo opera si la API se actualizó y el cron existente sigue activo.

## Gastos más automáticos, sin inventar pagos
- Botones para conceptos comunes y sugerencia automática de categoría.
- Si el operador marca `Repetir automáticamente cada mes`, se guarda una plantilla de gasto fijo.
- Cron crea una fila mensual con método `pendiente` al llegar el día configurado. Los gastos pendientes **NO** reducen el saldo en caja ni la ganancia hasta que se seleccione `Marcar pagado` y el administrador confirme que el dinero salió.
- Las plantillas se pueden desactivar; no se eliminan los gastos históricos. Días 29–31 se aproximan al día 28 por seguridad de calendario.
- No hay lectura de extractos bancarios, OCR ni integración externa de proveedores: ningún gasto variable se puede afirmar pagado automáticamente sin un origen confiable.
- Las comisiones PayPal mostradas en Dinero siguen siendo **estimaciones**, no una conciliación bancaria automática.

## PWA visualmente alineada
- Tabs: Inicio, Servicios, Reservar, Mis citas, Cuenta; Billetera dentro de Cuenta, con compatibilidad de antiguos enlaces `#billetera`.
- Portada con el mismo mensaje y jerarquía visual que Android, catálogo filtrable y acciones `Ver detalles` / `Reservar`.
- JS/CSS PWA pasa a red primero, fallback de caché sin conexión.
- Sigue siendo un frontend JS independiente del nativo React Native; equivalencia pixel a pixel y paridad de funciones necesitan comparar pantallas con dispositivos reales y/o utilizar Expo Web para compartir pantallas.

## Comprobaciones antes de fusionar
1. Acceso y guardado de Ajustes en móviles y escritorio; modo Manual; no sobrescribir datos.
2. Cron con tasa válida, API caída, timestamp antiguo y variación >3%.
3. Crear gasto mensual, disparar dos veces cron, comprobar ausencia de duplicados; marcar pagado y verificar el cálculo, desactivar plantilla.
4. PWA: inicio, navegación, detalles, selección, compra, cita, billetera, inicio de sesión, offline y actualización.
5. Web: tarjetas de regalo compartidas que abran correctamente `reservar.html`, reembolsos, permisos, consentimiento, PayPal Sandbox.
6. `npm run typecheck`, `npm test`, chequeo de sintaxis en GitHub Actions.

## Despliegue
- Fusionar PR #17 **solo si pasan las pruebas**.
- Publicar backend nuevo en Supabase Edge Functions; publicar estáticos reconstruidos desde `web/partials` y `web/pages`. No modificar secretos existentes.
- Verificar el panel y la PWA en la URL productiva, limpiar cachés si la versión anterior sigue instalada.
- Activar tasa automática expresamente desde ADM. Supervisar los primeros días.

Fuente y atribución: https://www.exchangerate-api.com/docs/free .
