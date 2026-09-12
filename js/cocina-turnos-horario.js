// Narrow compatibility fix: keep established weekday/weekend templates, but
// never replace an explicitly saved overnight code with a hard-coded day shift.
export function minutosCodigo(valor) {
  const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(String(valor ?? '').trim());
  if (!match || +match[1] > 23 || +match[2] > 59) return null;
  return +match[1] * 60 + +match[2];
}
export function cruzaMedianocheCodigo(codigo = {}) {
  const inicio = minutosCodigo(codigo.hora_inicio), fin = minutosCodigo(codigo.hora_fin);
  return inicio !== null && fin !== null && fin < inicio;
}
export function resolverHorarioCodigo(base, dinamico) {
  if (!dinamico || cruzaMedianocheCodigo(base)) return {...base};
  return {...base, descripcion: dinamico.descripcion || base.descripcion || '',
    hora_inicio: dinamico.hora_inicio, hora_fin: dinamico.hora_fin};
}
export function horarioTextoCodigo(codigo = {}) {
  if (minutosCodigo(codigo.hora_inicio) === null || minutosCodigo(codigo.hora_fin) === null) return 'Sin horario';
  return `${String(codigo.hora_inicio).slice(0,5)} - ${String(codigo.hora_fin).slice(0,5)}${cruzaMedianocheCodigo(codigo) ? ' (+1 d\u00eda)' : ''}`;
}
export function validarHorarioCodigo(inicio, fin) {
  if (!inicio && !fin) return ''; // Rest / leave codes intentionally have no clock times.
  if (!inicio || !fin) return 'Completa entrada y salida, o deja ambas vac\u00edas para un descanso.';
  const a = minutosCodigo(inicio), b = minutosCodigo(fin);
  if (a === null || b === null) return 'Usa horas v\u00e1lidas entre 00:00 y 23:59.';
  if (a === b) return 'Entrada y salida no pueden ser iguales. No se asumir\u00e1 un turno de 24 horas.';
  return ''; // A smaller end time means the following day, not an invalid time.
}
