# Nómina 7.56 — lunes festivo a 6,5 horas netas

## Regla
Únicamente los **lunes que además sean festivos activos** usan jornada estándar corta en A&B / Chef:

- permanencia: 7 horas;
- descanso/almuerzo: 30 minutos;
- jornada neta: 6,5 horas.

Sábados y domingos conservan 8 horas netas (8,5 horas de permanencia). Los festivos que no caen en lunes conservan la regla larga vigente.

## Backend aplicado
Se ajustaron las funciones existentes:

- `public.normalizar_jornada_estandar_ayb_42h()`
- `public.chef_hora_programada_v752(...)`

Se añadió el trigger privado `nomina_regla_v756.normalizar_chef_lunes_festivo()` para normalizar snapshots estándar de Chef en lunes festivo sin tocar horarios flexibles o códigos no estándar.

Las definiciones anteriores y los registros afectados fueron respaldados en el esquema privado `nomina_regla_v756`, con RLS y sin acceso para anon/authenticated. La función-trigger pública de A&B quedó sin EXECUTE directo para clientes; continúa funcionando como trigger.

## Reconciliación histórica
Se normalizaron las programaciones de lunes festivos desde 23/08/2026. La fecha vigente afectada fue 12/10/2026.

Validación posterior para 12/10/2026:

- vista A&B: 62 filas a 6,5 netas, 0 filas a 8 netas; 13 filas restantes corresponden a novedades/horarios personalizados u otros casos no estándar;
- Chef: 0 snapshots estándar de 8 netas;
- resolver Chef código 3: lunes festivo 07:00–14:00; sábado 07:00–15:30; festivo no lunes 07:00–15:30;
- 0 revisiones previamente aprobadas/rechazadas fueron modificadas.

El único P008 pendiente que tenía referencia antigua fue recalculado mediante `corregir_concepto_nomina_v722(..., 'recalcular', ...)`: pasó de 1,18 h a 2,68 h y quedó pendiente, sin horas aprobadas.

## Frontend
Chef usa el catálogo corto para lunes festivo y mantiene el catálogo largo para sábado, domingo y festivos no lunes. Nómina publica versión 7.56.

Este cambio no modifica el umbral de 26 minutos, marcaciones biométricas, PROSOF, conceptos cerrados ni las reglas de sábados/domingos.
