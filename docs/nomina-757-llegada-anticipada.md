# Nómina 7.57 — llegada anticipada no genera recargo nocturno

La ruta biométrica heredada podía convertir una marcación anterior al inicio programado en P005/P100. Para estos conceptos ahora se usa la misma referencia auditada que la revisión A&B: solo cuenta la intersección entre marcaciones válidas y horario programado.

Regla:
- marcar antes del inicio del turno no genera recargo;
- si el turno realmente empieza antes de las 06:00, el tramo nocturno sí aplica;
- extras posteriores, festivos y domingos no cambian.

Validación:
- Gisell 09/10/2026, turno 04:30–11:30, entrada 04:34: mantiene P005 correcto (~1 h 25 min);
- Gisell 25/08/2026, turno 06:00–13:00, entrada 05:36: P005 = 0;
- 75 candidatos P005/P100 pendientes/observados comparados;
- 0 discrepancias contra la referencia auditada;
- 0 aprobados/rechazados modificados.

La definición anterior y los registros afectados quedaron respaldados en el esquema privado nomina_regla_v757.