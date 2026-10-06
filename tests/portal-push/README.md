# Notificaciones 7.54

La actualización conserva el mismo manifiesto, la URL del receptor Push, su ámbito y las claves VAPID. Abrir, cerrar sesión o actualizar no elimina la suscripción ni vuelve a solicitar un permiso concedido. La opción explícita de desactivar continúa vigente.

Al guardar un dispositivo válido, el servidor recupera hasta 30 avisos pendientes recientes que quedaron sin envío durante una desconexión. Solo recupera avisos de las últimas 24 horas, sin duplicar envíos, con identidad y destinatario válidos. Omite avisos leídos y horarios pasados. Las pruebas permanecen limitadas al dispositivo que las solicitó.

El receptor muestra la notificación y marca la insignia sin depender de una ventana abierta. Un error de almacenamiento, insignia o comprobante no impide mostrar el aviso. El comprobante viaja en el payload cifrado y únicamente permite registrar la recepción de ese envío; no permite leer datos, cambiar suscripciones ni actuar como usuario.

`aceptado_at` confirma la aceptación por el proveedor Push. `mostrado_at` registra que `showNotification()` terminó correctamente y el comprobante llegó al servidor. Esto no demuestra que la persona haya leído la notificación. Un comprobante ausente puede corresponder a un receptor anterior, un problema de conexión o un aviso no mostrado.

## Validación

```sh
node --test tests/portal-push/*.test.mjs
```

Las 44 pruebas de Node usan simulaciones de las API del navegador, Supabase y Push. Comprueban persistencia del permiso, reutilización de suscripciones, baja explícita, carreras de sesión, recepción sin ventanas, rutas internas y aislamiento del comprobante. No sustituyen una prueba real del sistema operativo.

`backend.test.sql` comprueba la recuperación, repetición sin duplicados, exclusión de otros destinatarios y avisos leídos/vencidos, dispositivos desactivados y permisos del comprobante. Revierte todos sus datos de prueba y requiere un dispositivo válido y un envío previamente aceptado.

La migración está en `supabase/migrations/20261006012000_portal_push_recuperacion_v754.sql`. La función Edge conserva `verify_jwt=false`, como en la versión existente, con autenticación propia: sesión personal para operaciones de usuario, secreto de despacho para el trabajador y comprobante aleatorio para recepción. Sus fuentes están en `supabase/functions/portal-push-v748`.

Para revertir el frontend se puede volver al commit anterior. Las columnas nuevas son compatibles con el receptor anterior; no se deben eliminar las suscripciones ni cambiar las claves VAPID para revertir una actualización.
