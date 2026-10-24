// Corte mensual predeterminado: ultimo periodo 16-15 ya cerrado,
// usando la fecha de Colombia. No modifica las fechas que el usuario
// elige despues de abrir el modulo.
export function corteMensualNomina743(reloj = new Date()) {
  if (!(reloj instanceof Date) || !Number.isFinite(reloj.getTime())) throw new Error('Fecha no valida para el corte.');
  const partes = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(reloj).filter(p => p.type !== 'literal').map(p => [p.type, p.value]));

  const y = Number(partes.year), m = Number(partes.month), d = Number(partes.day);
  const iso = (year, month, day) => new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);

  // Si ya paso el dia 15, el ultimo corte cerrado termina el 15 del mes actual.
  // Antes del 16, el ultimo corte cerrado termina el 15 del mes anterior.
  const finYear = d >= 16 ? y : (m === 1 ? y - 1 : y);
  const finMonth = d >= 16 ? m : (m === 1 ? 12 : m - 1);

  const inicioYear = finMonth === 1 ? finYear - 1 : finYear;
  const inicioMonth = finMonth === 1 ? 12 : finMonth - 1;

  return {
    desde: iso(inicioYear, inicioMonth, 16),
    hasta: iso(finYear, finMonth, 15)
  };
}
