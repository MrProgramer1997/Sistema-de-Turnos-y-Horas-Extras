# Acceso administrativo 7.61

## Incidencia observada - 23 de octubre de 2026
Auth aceptaba los intentos (HTTP 200), pero consultas posteriores a empleados y al directorio devolvian HTTP 520 despues de 43-50 segundos. El servicio PostgREST registro siete errores `Warp server error: Thread killed by timeout manager` en la ventana 15:25-15:34 UTC (10:25-10:34 Colombia). El codigo anterior esperaba sin plazo las consultas y a los 12 segundos solo ocultaba el indicador visual. Permitio solicitudes superpuestas y no distinguia una demora del servidor de un fallo de cuenta.

La consulta puntual por empleado comprobada directamente en SQL utilizo el indice primario y tardo 0,026 ms; la inspeccion posterior de actividad no mostro sesiones bloqueadoras. Esto no explica la causa interna del timeout de la pasarela: no se atribuye a claves invalidas ni se declara resuelta una incidencia general de infraestructura.

## Cambio acotado
- Auth sigue verificando usuario y contrasena. No hay reintentos automaticos de contrasenas ni accesos de respaldo por tablas de claves.
- Perfil, empleado activo y modulos se validan antes de guardar ccp_sesion o navegar. user_metadata no autoriza.
- Consulta del empleado con campos explicitos y permisos en paralelo; hasta dos intentos de lectura, 10 segundos cada uno, solo ante fallo transitorio. Las consultas llevan AbortSignal.
- Auth tiene un limite de espera de 15 segundos. Como el SDK no ofrece AbortSignal por signInWithPassword, una autenticacion aun pendiente bloquea nuevos intentos y pide recargar. Su resolucion tardia no guarda la sesion de aplicacion ni redirige.
- Se comprueba de nuevo la identidad de la sesion antes de abrir el panel, y se conservan los destinos permitidos existentes.
- Interfaz con estado por etapa, Cancelar ingreso, restauracion en finally y prevencion del doble envio.
- Directorio con espera maxima de 5 segundos, listado local disponible, sin borrar una seleccion hecha durante la consulta. Se restaura explicitamente el valor del select para evitar seleccionar Otra cuenta al reinsertar opciones.
- No se modifica el cliente global Supabase, el SDK, el service worker, las suscripciones push, el endpoint de acceso personal, contrasenas, perfiles ni datos de programacion/nomina. No se ejecutaron escrituras SQL.

## Verificacion
24/24 pruebas Node de autenticacion, timeouts, 520, permisos denegados, empleado inactivo, identidad cambiada, doble envio, cancelacion y respuestas tardias.
8/8 escenarios de interfaz en Chromium aislado (1366 y 390 px), con respuestas simuladas: exito, reintento 520, consultas que no responden, clave incorrecta, permisos denegados, Auth tardia, cancelacion y directorio tardio. Por restricciones de navegacion del entorno se usaron HTML/scripts locales incorporados en una pagina sin red, almacenamiento simulado y destino capturado; NO es una prueba de navegacion productiva ni del SDK con credenciales reales. Los limites de tiempo se redujeron solo en el entorno de prueba.

La validacion real del usuario sigue pendiente. Recargar la pantalla y comprobar Acceso 7.61. Esta version pertenece al login y no cambia el numero de version del modulo de Nomina.
