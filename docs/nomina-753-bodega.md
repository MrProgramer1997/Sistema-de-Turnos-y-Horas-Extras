# Nomina 7.53 - propuestas de Bodega para revision

## Alcance
Corte cerrado del 16/09/2026 al 15/10/2026. Solo coordinador y auxiliares de Bodega de A&B. Las plantillas no se extienden a Cocina, meseros u otras areas. Ninguna referencia inferida certifica la asignacion historica ni aprueba pagos.

Se usan las rotaciones de la tabla facilitada por el responsable y 30 minutos de descanso por jornada. El sabado del Turno 2 del coordinador tiene dos salidas en la fuente (16:00 y 16:30): ambas se conservan como alternativas. Lunes trabajados y festivos sin regla propia requieren revision. La ausencia de una marca dominical no se convierte en descanso confirmado.

## Backend aplicado y registrado
El historial de Supabase contiene las definiciones ejecutadas de estas migraciones:
- 20261022215936 / nomina_753_propuestas_bodega
- 20261022220027 / nomina_753_integracion_bodega_revision
- 20261022220048 / nomina_753_validacion_lote_bodega

Este archivo es el manifiesto operativo, no una copia SQL de esas migraciones. Un administrador autorizado puede exportar su fuente exacta desde `supabase_migrations.schema_migrations` (columnas version, name y statements), sin volver a ejecutarlas.

Esquema privado `nomina_bodega_v753`: plantillas, jornadas propuestas, respaldos de funciones y ejecuciones. Todas las tablas tienen RLS; anon y authenticated no tienen USAGE ni permisos directos para ejecutar el lote. No se agrega una RPC publica ni se amplian permisos de usuarios.

Funciones privadas:
- proponer(date,date): referencia semanal, no asignacion oficial.
- disponible(text,date): cede siempre ante programacion oficial, novedades o solicitudes aprobadas.
- candidatos(date,date): calculo de referencia o caso pendiente de horario/intervalo.
- preparar(date,date): lote idempotente acotado exclusivamente al corte indicado.

La propuesta semanal exige al menos tres dias validos, dos entradas a menos de 45 minutos de su alternativa, error medio de entrada de hasta 60 minutos, ausencia de dias marcados fuera de la alternativa y margen de 20 puntos frente a la segunda alternativa. El puntaje usa 80% entrada y 20% salida, con limites por componente. Estos parametros son una heuristica para revision, no evidencia documental del turno asignado. Un empate o evidencia insuficiente no elige un turno. Los horarios diarios comunes a varias alternativas se etiquetan tambien como propuestos.

Se integran propuestas de respaldo en las funciones existentes consultar_fuente_nomina_v721, nomina_rendimiento_v716.contexto y previsualizar_ayb_nomina_v721. Sus definiciones anteriores fueron copiadas a respaldo_funciones y verificadas por huella antes de sustituirlas. La programacion oficial mantiene prioridad.

## Lote ejecutado
- 90 filas persona/fecha propuestas, correspondientes a 3 empleados y 30 dias; no son 90 jornadas efectivamente trabajadas.
- 31 conceptos nuevos pendientes: 8 referencias con tiempo calculable y 23 casos por confirmar.
- Los 8 conceptos dominical/festivo existentes no se reescribieron.
- Total de 39 conceptos del corte para esas personas, sin aprobaciones nuevas.
- Las referencias extras calculables creadas son de al menos 26 minutos; no se descuentan los primeros 25 minutos ni se resta almuerzo dos veces.
- Se preservaron por huella las 2495 revisiones preexistentes y las filas de programacion oficial comprobadas por la transaccion.
- Repetir el lote produjo cero propuestas y cero conceptos nuevos.

Las entradas ambiguas tienen una cantidad sin calcular, no cero trabajo reconocido. No se debe convertir el conjunto en pagos mediante una aprobacion masiva sin validar rotacion, fechas, pausas y trabajo efectivo. Los registros aprobados solo se corrigen por el mecanismo auditado existente.

## Frontend
- Conserva la distincion entre horario propuesto y confirmado incluso cuando llega dentro de evidencia_revision.horario.
- Muestra Por confirmar para los nuevos conceptos sin calculo, conservando las alternativas de la tabla.
- Presenta hasta ocho alternativas en casos Bodega y mantiene los limites previos para otras areas.
- Retira del helper historico 7.49 la escritura del numero de version del pie de pagina. El HTML es la fuente del numero 7.53.
- Conserva rechazo, anadir concepto, selector de areas, multipunto, horarios Chef y exportador PROSOF.

## Verificacion
119/119 pruebas locales: nomina-{748,749,750,751,752,753}.test.mjs. Se verificaron los hashes Git de los ocho archivos enviados respecto de los archivos probados. Syntax checks y git diff --check correctos. No se utilizaron sesiones reales ni se efectuaron decisiones de prueba sobre empleados.

En SQL se comprobaron el alcance del corte, ausencia de horas aprobadas nuevas, umbral de referencias calculables, idempotencia y permisos privados. Los advisors conservan incidencias historicas fuera de alcance; no se declara una auditoria global de seguridad resuelta.

Pendiente: validar el flujo con la sesion autenticada del responsable en produccion. En el modulo, recargar, seleccionar el corte, entrar en Revision y aprobacion y buscar la persona. Origen del horario muestra las propuestas y las dudas. El informe se obtiene con Descargar revision .xlsx; PROSOF mantiene su flujo de decisiones aprobadas.
