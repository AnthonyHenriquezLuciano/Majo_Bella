# MAJOBELLA · Lista de pruebas antes de lanzar

Marca cada punto en un **iPhone (Safari)** y en un **Android (Chrome)**. Usa tu propio correo y teléfono como clienta. Haz las pruebas de pago primero en **modo de prueba** (PayPal sandbox) y repite las marcadas con 💵 ya en **modo real**, con montos pequeños.

## Antes de empezar
- [ ] Code.gs actualizado y publicado: setup ejecutado, permisos aceptados y **nueva versión** de la implementación.
- [ ] Dashboard → Ajustes:
  - [ ] cuentas para transferencias;
  - [ ] tiempo para el comprobante;
  - [ ] cambios de fecha;
  - [ ] datos del negocio;
  - [ ] guardar.
- [ ] Dashboard → Ajustes → Seguridad: la hoja y la carpeta salen como «Privada».
- [ ] Dashboard → Correos: «Enviarme una prueba» de cada correo llega bien y **no cae en spam**.

## Web (en el celular y en la computadora)
- [ ] La página carga rápido; el menú, los servicios, la galería y las reseñas se ven bien.
- [ ] Reservar con **PayPal**: cita confirmada, llega el correo y aparece en Google Calendar del estudio. 💵
- [ ] Reservar con **transferencia**:
  - [ ] se ven las cuentas y se copia el número;
  - [ ] se sube la foto del comprobante;
  - [ ] llegan el correo «Recibimos tu comprobante» a la clienta y el aviso con la foto al estudio. 💵
- [ ] Apartar por transferencia **sin subir** el comprobante: la cita aparece en «Mis citas» como «Falta el comprobante» y se puede subir desde ahí.
- [ ] No subir el comprobante a tiempo: el horario se libera solo.
- [ ] Código de descuento, tarjeta de regalo y paquete al reservar.
- [ ] **Cambiar la fecha** desde «Mis citas» (con más de 24 h): llegan los correos a la clienta y al estudio, y el calendario se mueve.
- [ ] Cancelar con más de 24 h:
  - [ ] si se pagó con PayPal, el reembolso es automático; 💵
  - [ ] si se pagó por transferencia, aparece «Depósitos por devolver» en el dashboard.
- [ ] Comprar una tarjeta de regalo y un paquete. 💵
- [ ] Lista de espera en un día lleno.
- [ ] Firmar el consentimiento desde el enlace del correo.
- [ ] Páginas de términos, privacidad y cancelación con los datos correctos.
- [ ] Una dirección que no existe (por ejemplo `/hola`) muestra la página 404 de MAJOBELLA.

## App
- [ ] **Instalar**:
  - [ ] Android: botón «Instalar la app»;
  - [ ] iPhone: Compartir → Agregar a inicio;
  - [ ] el ícono y el nombre se ven bien.
- [ ] La app abre sin la barra del navegador. Las pestañas Inicio, Reservar, Mis citas, Billetera y Perfil funcionan.
- [ ] Reservar con PayPal y con transferencia desde la app.
- [ ] Cerrar la ventana de la transferencia sin subir el comprobante: la app avisa y lleva a «Mis citas».
- [ ] Cambiar la fecha y cancelar desde la app.
- [ ] Billetera:
  - [ ] agregar un código;
  - [ ] con Google, ver las tarjetas y paquetes comprados con el correo;
  - [ ] sin Google, «Enviarme mis códigos» llega al correo.
- [ ] Perfil: guardar datos y cumpleaños; borrar mis datos.
- [ ] Sin internet (modo avión): la app abre y muestra las citas guardadas.

## Dashboard (en el celular de Majo y en la computadora)
- [ ] Entrar con Google. Otra cuenta que no esté autorizada no puede entrar.
- [ ] Agenda → Pendientes:
  - [ ] revisar el comprobante, confirmar y rechazar;
  - [ ] marcar un depósito como devuelto.
- [ ] Crear, mover, cobrar el saldo, marcar realizada y cancelar una cita.
- [ ] Ajustes → Avisos del sistema: se ven y se pueden marcar como revisados.
- [ ] La sesión se cierra sola tras el tiempo de inactividad configurado.

## Cuando todo esté bien
- [ ] Cambiar PayPal a **live** (INSTALAR.md → «Cobrar de verdad»).
- [ ] Hacer una reserva real pequeña y reembolsarla. 💵
- [ ] Borrar las citas de prueba desde la hoja de Google.
