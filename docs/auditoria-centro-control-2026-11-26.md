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
| Turnos AYB en Eventos | 22 | Sin regla validada de dispositivo laboral |
| Turnos de Eventos con alguna marca interna ese día | 21 | La marca no basta para asociar el punto a Eventos |
| Novedades ELECCION AYB entre 23/08 y 22/11 | 8 | No tienen horario; requieren tratamiento distinto de vacaciones |
| Novedades VAC AYB entre 23/08 y 22/11 | 314 | Código expresamente contemplado como jornada completa |
| Novedades INC AYB entre 23/08 y 22/11 | 164 | Código expresamente contemplado como jornada completa |
| Novedades COMP AYB entre 23/08 y 22/11 | 205 | Código expresamente contemplado como jornada completa |

**Precisión metodológica:** 4.204 marcaciones son del Club, no son 4.204
marcaciones válidas de puntualidad AYB/Chef. `con alguna marca interna`
no prueba que haya habido entrada al punto de trabajo correcto.

## Hallazgo 1 — Subárea Eventos sin biométrico inequívoco
`equipoEsperado('Eventos')` devuelve `null` por decisión explícita del
alcance, y el motor clasifica el turno como `sin_punto`. **No cambiar este
mapeo sin confirmar la regla con AYB/operaciones**. No usar Portería como
entrada laboral ni asignar un equipo por proximidad.

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
- Se muestran aparte las novedades justificadas y las no comparables.
- No se altera ningún dato fuente ni el cálculo de nómina.

## Hallazgos y decisiones pendientes
1. **Eventos:** definir el biométrico de trabajo válido por subárea/servicio.
   Sin decisión del negocio, conservar `sin_punto`.
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
