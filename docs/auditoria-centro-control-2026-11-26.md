# Auditoría de integridad del Centro de Control AYB/Chef

**Corte:** 26 de noviembre de 2026. **Estado:** primera fase de revisión del motor y contraste de programación/marcaciones.  
**Principio:** el Centro de Control solo consulta; nunca modifica turnos, marcaciones, novedades, nómina ni aprobaciones.

## Alcance comprobado
- Código: `js/centro-control-metricas.js`, `js/centro-control-alcance.js`,
  `js/centro-control-historico.js`, `js/dashboard-general.js`.
- Motor de Edge Function: `supabase/functions/reporte-tardanzas-diario/centro-control-metricas.js`.
- Tablas originales: `programacion_turnos`, `cocina_programacion_turnos`,
  `cocina_cronograma_personal`, `empleados`, `biotime_marcaciones`,
  `biotime_terminales`, `solicitudes_empleado`, `novedades_personal`,
  `novedades_programacion`.
- Base de comparación principal: **16–22 de noviembre de 2026**.
- Datos agregados y verificados mediante consultas SELECT, sin extraer registros personales.

## Evidencia resumida

| Observación | Cantidad | Interpretación |
| --- | ---: | --- |
| Turnos laborales AYB (sin novedades) | 293 | Turnos con inicio/fin asignados |
| Turnos Chef fijo | 186 | Excluidos externos/cancelados |
| Jornadas-persona de ambas áreas | 479 | 0 coincidencias duplicadas por cédula/fecha en la semana |
| Marcaciones del Club en la semana | 4.204 | 0 IDs repetidos; 0 sin código; 0 sin terminal |
| Turnos AYB en Eventos | 22 | Eventos es modalidad de servicio, no ubicación física |
| Eventos con entrada biométrica interna dentro de su turno | 21 | 11 en Administración/Rialto y 10 en Hoyo 19; una jornada sin marca interna evaluable |
| Novedades ELECCION AYB entre 23/08 y 22/11 | 8 | No tienen horario; requieren tratamiento distinto de vacaciones |
| Novedades VAC AYB entre 23/08 y 22/11 | 314 | Código expresamente contemplado como jornada completa |
| Novedades INC AYB entre 23/08 y 22/11 | 164 | Código expresamente contemplado como jornada completa |
| Novedades COMP AYB entre 23/08 y 22/11 | 205 | Código expresamente contemplado como jornada completa |

**Precisión metodológica:** 4.204 marcaciones son del Club, no son 4.204
marcaciones válidas de puntualidad AYB/Chef. `con alguna marca interna`
no prueba que haya habido entrada al punto de trabajo correcto.

## Hallazgo 1 — Eventos no es ubicación física (aclaración operativa)
El responsable confirmó que un evento puede desarrollarse en **Rialto,
Tenis, Bar, Hoyo 19 o cualquier otro punto de trabajo**. Por tanto, no
se asigna a «Eventos» un biométrico fijo.

Regla correctiva aplicada: **si la programación señala subárea Eventos,
la primera entrada registrada en un dispositivo interno AYB/Chef validado
(Hy 19, Administración, Tenis o Piscina) determina el punto real de
ingreso**. Se compara esa hora con el turno programado; Portería y los
dispositivos ajenos a AYB/Chef nunca se usan como entrada laboral.

Para una jornada de Eventos, al mostrar entrada/salida se busca una salida
posterior en el mismo dispositivo de la entrada para no mezclar puntos
distintos y producir horas ficticias. Sin entrada interna válida, el
estado es `sin_marca` o `sin_entrada`, **no `sin_punto` ni tardanza
inventada**.

Una comprobación agregada de las 22 jornadas de Eventos de 16–22/11/2026
encontró 11 primeras marcas internas en Administración, 10 en Hy 19 y 1
sin ninguna marca interna dentro del intervalo laboral. **Se conserva la
distinción entre lugar de trabajo y modalidad de servicio**. Los demás
puntos biométricos no autorizados necesitan una regla confirmada antes
de calcular puntualidad.

Este ajuste no altera las reglas de subáreas con punto explícito
(como Hoyo 19, Tenis o Rialto), ni reglas salariales o de nómina.

## Hallazgo 2 — Error de clasificación de novedades sin horario
Condición original del motor:
`if (exempt || (b===null && s.notice)) status='justificada'`.

El segundo término convertía cualquier novedad sin hora en justificada,
aunque su código no estuviera definido como de jornada completa. Esto
incluye `ELECCION`, y potencialmente `NNJ` («Novedad no justificada»,
catalogada en el módulo AYB). **No se debe deducir una falta laboral ni una
tardanza a partir de esa novedad**.

Se corrige de forma conservadora:
- `NNJ` → `novedad_no_justificada` (requiere interpretación por el área responsable).
- Códigos sin jornada completa y sin hora → `novedad_no_comparable`.
- `VAC`, `INC`, `F`, `COMP`, `D`, entre otros explícitos de
  jornada completa, conservan `justificada`.
- El ranking no concede mérito con una novedad sin evaluación pendiente.
- Se muestran aparte las novedades justificadas, las no comparables y las NNJ.
- El **correo diario** muestra los totales y el detalle de empleados y
  conceptos declarados como **«Novedad no justificada (NNJ)»** o
  **«Justificación pendiente de validar»**. Lo primero corresponde al
  código NNJ original; lo segundo no permite concluir que haya falta laboral.
  Ambas categorías están excluidas del conteo de tardanzas.
- No se altera ningún dato fuente ni el cálculo de nómina.

## Hallazgos y decisiones pendientes
1. **Eventos:** revisar con los responsables los pocos casos sin registro
   interno y decidir si otros puntos biométricos son válidos cuando presten
   apoyo a un evento (sin asumir equivalencias nuevas).
2. **Cobertura de puntualidad:** hacer visibles jornadas comparables,
   sin entrada, sin punto, novedades no comparables y sin programación por día.
   El porcentaje de puntualidad no debe ocultar una cobertura baja.
3. **Días sin programación:** distinguir ausencia de fuente AYB y/o Chef
   de un día con cero retrasos; no clasificar como falta a quien no tiene turno.
4. **Entradas reales:** revisar casos nocturnos y marcas muy anteriores
   al inicio del turno (actualmente se admite ventana de hasta 4 h previas).
   No cambiar la tolerancia ni el criterio sin análisis por caso.
5. **Rendimiento:** medir duración de los RPC por bloque histórico y uso
   de índices antes de refactorizar consultas de producción.

## Pruebas y salida
Los cambios propuestos tienen casos de regresión para `VAC`,
`INC`, `F`, `ELECCION`, `NNJ`, `CITA`, efectos en porcentajes,
ranking e informe de correo. Se somete a CI antes de integrar a main.
