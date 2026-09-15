// Horarios Chef 7.2. Catalogo nocturno guardado, sin reemplazo por plantilla numerica.
export const VERSION_HORARIOS_CHEF = '7.3';
export function minutosCodigo(valor) {
  const m = /^(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/.exec(String(valor ?? '').trim());
  if (!m || +m[1] > 23 || +m[2] > 59 || +(m[3] || 0) > 59) return null;
  return +m[1] * 60 + +m[2];
}
export function cruzaMedianocheCodigo(codigo = {}) {
  const a = minutosCodigo(codigo.hora_inicio), b = minutosCodigo(codigo.hora_fin);
  return a !== null && b !== null && b < a;
}
export function resolverHorarioCodigo(base, dinamico) {
  if (!base || base.catalogo_no_disponible || base.activo === false) {
    return { ...(base || {}), hora_inicio: null, hora_fin: null,
      catalogo_no_disponible: true, origen_horario: 'no_disponible' };
  }
  if (cruzaMedianocheCodigo(base)) return { ...base, origen_horario: 'catalogo_nocturno' };
  // Se conservan las plantillas diurnas laborable/fin de semana ya aprobadas.
  if (dinamico && minutosCodigo(base.hora_inicio) !== null && minutosCodigo(base.hora_fin) !== null) {
    return { ...base, descripcion: dinamico.descripcion || base.descripcion || '',
      hora_inicio: dinamico.hora_inicio, hora_fin: dinamico.hora_fin, origen_horario: 'plantilla_diurna' };
  }
  return { ...base, origen_horario: 'catalogo' };
}
export function horarioTextoCodigo(codigo = {}) {
  if (codigo.catalogo_no_disponible) return 'C\u00f3digo no disponible: actualizar cat\u00e1logo';
  if (minutosCodigo(codigo.hora_inicio) === null || minutosCodigo(codigo.hora_fin) === null) return 'Sin horario';
  return `${String(codigo.hora_inicio).slice(0,5)} - ${String(codigo.hora_fin).slice(0,5)}${cruzaMedianocheCodigo(codigo) ? ' (+1 d\u00eda)' : ''}`;
}
export function validarHorarioCodigo(inicio, fin) {
  if (!inicio && !fin) return '';
  if (!inicio || !fin) return 'Completa entrada y salida, o deja ambas vac\u00edas para un descanso.';
  const a = minutosCodigo(inicio), b = minutosCodigo(fin);
  if (a === null || b === null) return 'Usa horas v\u00e1lidas entre 00:00 y 23:59.';
  if (a === b) return 'Entrada y salida no pueden ser iguales. No se asumir\u00e1 un turno de 24 horas.';
  return '';
}
export function sumarFechaCodigo(fecha, dias) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fecha || ''))) throw new Error('Fecha de turno inv\u00e1lida.');
  const d = new Date(`${fecha}T00:00:00Z`);
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0,10) !== fecha) throw new Error('Fecha de turno inv\u00e1lida.');
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0,10);
}
export function intervaloCodigo(codigo, fecha) {
  const error = validarHorarioCodigo(codigo?.hora_inicio, codigo?.hora_fin);
  if (error) throw new Error(error);
  const a = minutosCodigo(codigo?.hora_inicio), b = minutosCodigo(codigo?.hora_fin);
  if (a === null || b === null || codigo.catalogo_no_disponible) return null;
  return { fecha_inicio: sumarFechaCodigo(fecha, 0), fecha_fin: sumarFechaCodigo(fecha, b < a ? 1 : 0),
    hora_inicio: String(codigo.hora_inicio).slice(0,5), hora_fin: String(codigo.hora_fin).slice(0,5),
    minutos_brutos: b - a + (b < a ? 1440 : 0), dia_siguiente: b < a };
}
export function firmaHorarioCodigo(codigo = {}) {
  return JSON.stringify([String(codigo.codigo || '').trim(), minutosCodigo(codigo.hora_inicio),
    minutosCodigo(codigo.hora_fin), codigo.origen_horario || '', Boolean(codigo.catalogo_no_disponible)]);
}
// Ley 2466/2025, art. 10: 19:00-06:00 desde 25/12/2025.
// Para el historial previo del proyecto conserva 21:00-06:00.
export function inicioNocturnoChef(fechaISO) {
  return fechaISO && fechaISO < '2025-12-25' ? 21 * 60 : 19 * 60;
}
