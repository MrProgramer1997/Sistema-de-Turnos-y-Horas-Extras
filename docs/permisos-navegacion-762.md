# Navegacion 7.62 - bloqueo recuperable de permisos

## Incidencia verificada el 23/10/2026
El menu cargaba permisos-modulos.js?v=735 y Nomina/Dashboard A&B cargaban ?v=720. Aunque tenian el mismo contenido, eran instancias ESM diferentes: cada una mantenia su propia lectura en curso, cache y estado de bloqueo. Una demora superior a 15 segundos ocultaba main/dialog/modal y abandonaba la inicializacion. El codigo nunca restauraba ese contenido al obtener una verificacion posterior correcta. Las dos instancias tambien podian crear dos paneles con el mismo identificador.

La ultima modificacion historica del archivo permisos-modulos.js, antes de este cambio, es del 24/09/2026. Las modificaciones de Nomina 7.51-7.53 y del login 7.61 no corrigieron ese verificador compartido. No se afirma que las modificaciones de ayer hayan provocado la demora de la infraestructura.

Consulta de produccion: el perfil de la cuenta afectada seguia activo, empleado activo y modulo horas-extras permitido. Entre 15:40 y 16:05 UTC, los registros disponibles al consultar incluyeron 27 respuestas HTTP 200 para consultar_mis_modulos_v720, con una demora maxima de 40.875 ms. El codigo anterior podia mostrar un bloqueo persistente aunque la API acabara respondiendo 200. No se determino la causa interna de esa demora; esta correccion no garantiza por si sola la disponibilidad de PostgREST.

## Correccion
- El archivo historico se convierte en un reexportador de un modulo canonico versionado. Las URLs ?v=720, ?v=735 y ?v=762 comparten las mismas funciones y estado.
- Consulta unica en curso, incluida la obtencion de sesion. Las comprobaciones concurrentes no duplican la RPC. Conserva cache solo en memoria durante 10 s, ligada al usuario y token; nunca usa permisos persistidos como respaldo administrativo.
- Lecturas RPC cancelables de hasta 10 s y un solo reintento ante un fallo temporal. La comprobacion de sesion tiene un limite de 8 s. No reintenta credenciales, decisiones de nomina ni denegaciones reales.
- Un unico panel de error. Ante demora, Reintentar permisos mantiene pendiente la inicializacion y la continua una sola vez tras verificar. En una pagina ya inicializada restaura la visibilidad anterior y conserva los valores escritos.
- Perfil inactivo, identidad cambiada, sesion terminada o permiso realmente denegado siguen bloqueados. Una respuesta tardia no publica permisos ni altera la sesion visual.
- El menu descarga su estructura publica en paralelo a la verificacion, pero no la habilita antes de validar acceso. Focus/visibility no fuerzan consultas redundantes en menos de 10 s.
- Distintivo Navegacion 7.62 en el menu y en el panel recuperable. Nomina permanece en 7.53 y el login en Acceso 7.61.

## Verificacion ejecutada
Base tomada del artefacto de Pages correspondiente al commit a3e1aa922941765a8bbbefadd342e836d726fed9. Baseline: 143/143 pruebas especificas aprobadas. Resultado final: 167/167, sin omitidas al ejecutar con --experimental-vm-modules. Incluye 24 nuevas pruebas, una de las cuales ejecuta los wrappers ESM reales de diferentes versiones y comprueba que solo se hace una RPC concurrente.

Ocho escenarios de UI aprobados en Chromium aislado, 1366 y 390 px: exito, 520 recuperable, timeout y reintento, denegacion 403, cuenta inactiva y modulo no permitido. Tambien se comprobo recuperacion durante revalidacion sin perder un valor escrito, ausencia de paneles duplicados, repetidos eventos focus, conservacion de elementos originalmente ocultos y bloqueo al cerrar sesion. Cero errores JavaScript en esos escenarios.

El navegador del entorno no permite navegar al sitio de prueba. Se inyectaron el markup real de main, layout y las funciones de permisos; se adaptaron solo almacenamiento, ruta, transporte y duraciones del arnes. Las respuestas fueron simuladas. NO fue una prueba autenticada de produccion ni del SDK con credenciales reales. Sigue pendiente la comprobacion del usuario.

No se modificaron SQL, roles, permisos del servidor, contrasenas, SDK/cliente Supabase, datos de nomina, horarios, marcaciones, exportaciones ni push. No se reinicio ningun servicio.

## Comprobacion operativa
En Horas extras y nomina, guardar antes cualquier edicion que exista y recargar con Ctrl + F5 para actualizar los archivos historicos en cache. Comprobar Navegacion 7.62 en el menu. Si la consulta vuelve a agotar sus plazos, usar Reintentar permisos. No eliminar almacenamiento de la app ni volver a habilitar notificaciones.

## Pruebas reproducibles
node --experimental-vm-modules --test tests/permisos-762.test.mjs tests/login-admin-761.test.mjs tests/nomina-748.test.mjs tests/nomina-749.test.mjs tests/nomina-750.test.mjs tests/nomina-751.test.mjs tests/nomina-752.test.mjs tests/nomina-753.test.mjs
