// Corte mensual: desde el 16 hasta el 15 siguiente, usando la fecha de Colombia.
// No modifica las fechas que el usuario elige despues de abrir el modulo.
export function corteMensualNomina743(reloj = new Date()) {
  if (!(reloj instanceof Date) || !Number.isFinite(reloj.getTime())) throw new Error('Fecha no valida para el corte.');
  const partes = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(reloj).filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
  const y = Number(partes.year), m = Number(partes.month), d = Number(partes.day);
  const iso = (year, month, day) => new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
  return d >= 16 ? {desde: iso(y, m, 16), hasta: iso(y, m + 1, 15)}
                 : {desde: iso(y, m - 1, 16), hasta: iso(y, m, 15)};
}
