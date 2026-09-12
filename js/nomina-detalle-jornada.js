// Read-only evidence and presentation. No payroll decision or inferred schedule
// is approved here. Raw punches are retained even when the shift is unknown.
const trim = x => String(x ?? '').trim();
const finite = x => x === null || x === undefined || x === '' || !Number.isFinite(Number(x)) ? null : Number(x);
const rounded = n => n === null ? null : Math.round((n + Number.EPSILON) * 100) / 100;
export function instanteLocal(valor, fecha = '') {
  let s = trim(valor).replace(' ', 'T');
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(s)) s = `${fecha}T${s}`;
  // BioTime timestamps are local civil time. Explicit timezone offsets are
  // converted to Colombia civil time; browser timezone must not alter results.
  if (/(Z|[+-]\d{2}:?\d{2})$/i.test(s)) {
    const t = Date.parse(s); return Number.isFinite(t) ? t / 60000 - 300 : null;
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s)) return null;
  const t = Date.parse(s + 'Z'); return Number.isFinite(t) ? t / 60000 : null;
}
export function minutosReloj(valor) {
  const m = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(trim(valor));
  return m && +m[1] < 24 && +m[2] < 60 ? +m[1] * 60 + +m[2] : null;
}
export function duracionTexto(minutos) {
  if (minutos === null || !Number.isFinite(minutos) || minutos < 0) return 'No calculable';
  const m = Math.floor(minutos + 1e-7);
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
}
export function intervaloNocturno(inicio, fin) {
  if (inicio === null || fin === null || fin <= inicio) return 0;
  let n = 0;
  // Mirrors the payroll module's 19:00-06:00 observation window. It does not
  // classify the whole night interval as overtime or set monetary rates.
  for (let d = Math.floor(inicio / 1440); d <= Math.floor(fin / 1440); d++) {
    for (const [a,b] of [[d * 1440, d * 1440 + 360], [d * 1440 + 1140, (d + 1) * 1440]])
      n += Math.max(0, Math.min(fin,b) - Math.max(inicio,a));
  }
  return n;
}
export function eventosDelDia(x) {
  return (Array.isArray(x.recorrido) ? x.recorrido : []).map(m => ({...m, t: instanteLocal(m.hora || m.punch_time,x.fecha)}))
    .sort((a,b) => (a.t ?? Infinity) - (b.t ?? Infinity));
}
export function resumenTrabajoDia(x = {}) {
  const cantidad = Number(x.total_marcaciones || 0), eventos = eventosDelDia(x);
  const salida = instanteLocal(x.ultima_marcacion,x.fecha), entrada = instanteLocal(x.primera_marcacion,x.fecha);
  const r = {cantidad, entrada, salida: cantidad > 1 ? salida : null,
    minutosBrutos: null, minutosDescontados: null, minutosNetos: null, horasNetas: null,
    minutosNocturnos: null, minutosDespues: null, minutosDespuesNocturnos: null,
    estado: 'SIN REGISTROS RECIBIDOS', criterio: 'No hay marcaciones recibidas para esta fecha.',
    tipoTurno: trim(x.programacion_tipo).toLowerCase(), eventos};
  if (!cantidad) return r;
  if (cantidad === 1) return {...r, estado: 'MARCACI\u00d3N INCOMPLETA', criterio: 'Existe una marcaci\u00f3n. Confirma presencia registrada; no permite calcular entrada y salida ni horas completas.'};
  if (entrada === null || salida === null || salida <= entrada || salida - entrada > 1440)
    return {...r,estado:'REVISAR MARCACIONES',criterio:'Las fechas de entrada y salida no delimitan una jornada calculable.'};
  r.minutosBrutos = salida - entrada;
  r.minutosNocturnos = intervaloNocturno(entrada,salida);
  const pausa = finite(x.minutos_descanso);
  const fuenteMinutos = finite(x.minutos_trabajados);
  const fuenteHoras = finite(x.horas_reales_pareadas ?? x.horas_reales);
  if (fuenteMinutos !== null || fuenteHoras !== null) {
    const minutos = fuenteMinutos ?? fuenteHoras * 60;
    if (minutos >= 0 && minutos <= r.minutosBrutos + 1) {
      r.minutosNetos = minutos; r.horasNetas = rounded(minutos / 60);
      r.minutosDescontados = r.minutosBrutos - minutos;
      r.estado = 'TOTAL DEL MOTOR';
      r.criterio = 'Horas calculadas por la fuente de jornadas, sin alterar su regla. No equivalen a horas aprobadas.';
    }
  }
  if (r.minutosNetos === null && pausa !== null && pausa >= 0 && pausa <= r.minutosBrutos &&
      ['confirmada','inferida_alta','inferida_media'].includes(r.tipoTurno)) {
    r.minutosDescontados = pausa; r.minutosNetos = r.minutosBrutos - pausa; r.horasNetas = rounded(r.minutosNetos / 60);
    r.estado = 'ESTIMADO; REVISAR PAUSAS';
    r.criterio = 'Estimaci\u00f3n: primera a \u00faltima marca menos el descanso configurado. No demuestra trabajo continuo ni descuenta salidas intermedias no identificadas. No es liquidaci\u00f3n.';
  }
  if (r.minutosNetos === null) {
    r.estado = 'TOTAL NETO POR CONFIRMAR';
    r.criterio = 'Se muestra el tiempo entre marcas. Falta una pausa o un turno suficientemente definido para calcular el total neto sin inventarlo.';
  }
  // Informational post-shift span only. Do not automatically create P003/P004.
  const comienzo = minutosReloj(x.hora_inicio), final = minutosReloj(x.hora_fin_2 || x.hora_fin);
  const fecha = instanteLocal(`${trim(x.fecha).slice(0,10)}T00:00:00`);
  if (fecha !== null && comienzo !== null && final !== null && final !== comienzo &&
      ['confirmada','inferida_alta','inferida_media'].includes(r.tipoTurno)) {
    const finProgramado = fecha + final + (final < comienzo ? 1440 : 0);
    r.minutosDespues = Math.max(0,salida - finProgramado);
    r.minutosDespuesNocturnos = intervaloNocturno(Math.max(entrada,finProgramado),salida);
  }
  return r;
}
export function explicarTurno(x) {
  const t = trim(x.programacion_tipo).toLowerCase();
  if (t === 'inferida_ambigua' || x.estado_comparacion === 'turno_ambiguo')
    return 'Turno por confirmar: varios horarios se parecen o la marcaci\u00f3n se aleja de los horarios disponibles. La asistencia sigue visible. No es una ausencia ni una falta del empleado.';
  if (/^inferida_/.test(t)) return 'Turno sugerido por semejanza de marcaciones; no es una programaci\u00f3n confirmada por el jefe.';
  return t === 'confirmada' ? 'Programaci\u00f3n guardada en el sistema.' : 'No hay turno confirmado. Las marcaciones se conservan como evidencia independiente.';
}
export function resumenConceptosNocturnos(x, revisiones) {
  const rows = revisiones.filter(r => trim(r.cedula) === trim(x.cedula) && trim(r.fecha).slice(0,10) === trim(x.fecha).slice(0,10) && ['P004','P009'].includes(r.concepto_codigo));
  const pendiente = rows.filter(r => ['pendiente','observado'].includes(r.estado_revision || r.estado));
  const aprobadas = rows.filter(r => (r.estado_revision || r.estado) === 'aprobado');
  return {registros:rows.length, pendiente:rounded(pendiente.reduce((a,b) => a + Number(b.horas_calculadas || 0),0)),
    aprobada:rounded(aprobadas.reduce((a,b) => a + Number(b.horas_aprobadas || 0),0))};
}
export function coberturaPorArea(rows, areaFn) {
  const map = new Map();
  for (const x of rows) {
    if (!Number(x.total_marcaciones)) continue;
    const area = areaFn(x); if (!map.has(area)) map.set(area,{Area:area,Jornadas:0,Programadas:0,Sugeridas:0,'Por confirmar':0,'Sin turno':0,'Marca unica':0});
    const a = map.get(area);a.Jornadas++;
    const t = trim(x.programacion_tipo).toLowerCase();
    a[t === 'confirmada' ? 'Programadas' : /^inferida_(alta|media)$/.test(t) ? 'Sugeridas' : t === 'inferida_ambigua' ? 'Por confirmar' : 'Sin turno']++;
    if (Number(x.total_marcaciones) === 1) a['Marca unica']++;
  }
  return [...map.values()].sort((a,b) => a.Area.localeCompare(b.Area,'es'));
}
