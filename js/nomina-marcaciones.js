import { modeloNomina as modeloRevision, columnasNetoNomina } from './nomina-neto.js?v=714';
import { diaSemanaRevision } from './revision-punto.js?v=713';
/* Fase 7.9. Read-only daily intervals and attendance exceptions.
 * This module never writes to Supabase or creates/changes payroll concepts.
 * A duration between two timestamps is not evidence of continuous work.
 */
const text = v => String(v ?? '').trim();
const finite = v => v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v);
const norm = v => text(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export const CRITERIO_INTERVALO = 'Salida menos ingreso, con sus fechas reales. Sin descuento autom\u00e1tico de descanso. Es tiempo entre registros, no horas netas ni aprobadas; puede incluir pausas o movimientos.';

// Return Colombia civil minutes on a UTC numeric axis. Independent of browser TZ.
export function minutoMarcacion(valor, fecha = '') {
  let s = text(valor).replace(' ', 'T');
  if (/^\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(s)) s = `${fecha}T${s}`;
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?(Z|[+-]\d{2}:?\d{2})?$/i.exec(s);
  if (!match || +match[2] > 23 || +match[3] > 59 || +(match[4] || 0) > 59) return null;
  const midnight = Date.parse(match[1] + 'T00:00:00Z');
  if (!Number.isFinite(midnight) || new Date(midnight).toISOString().slice(0, 10) !== match[1]) return null;
  const epoch = Date.parse(s + (match[6] ? '' : 'Z'));
  return Number.isFinite(epoch) ? epoch / 60000 - (match[6] ? 300 : 0) : null;
}
export function fechaHoraMarcacion(minutos) {
  if (minutos === null || !Number.isFinite(minutos)) return '';
  return new Date(Math.round(minutos * 60000)).toISOString().slice(0, 19).replace('T', ' ');
}
export function duracionMarcaciones(minutos, segundos = false) {
  if (minutos === null || !Number.isFinite(minutos) || minutos < 0) return 'No calculable';
  const s = Math.round(minutos * 60);
  return `${Math.floor(s / 3600)} h ${String(Math.floor(s % 3600 / 60)).padStart(2, '0')} min` +
    (segundos ? ` ${String(s % 60).padStart(2, '0')} s` : '');
}
export function intervaloDiario(x = {}, modelo = null) {
  modelo = modelo || modeloRevision(x);
  const fecha = text(x.fecha).slice(0, 10);
  const raw = Array.isArray(x.recorrido) ? x.recorrido : [];
  const eventos = raw.map(v => ({ ...v, t: minutoMarcacion(v.hora || v.punch_time, fecha) }))
    .filter(v => v.t !== null).sort((a, b) => a.t - b.t);
  const cantidad = finite(modelo?.cantidad ?? x.total_marcaciones) ?? raw.length;
  const entrada = modelo ? modelo.entrada : minutoMarcacion(x.primera_marcacion, fecha) ?? eventos[0]?.t ?? null;
  const salida = cantidad > 1 ? (modelo ? modelo.salida : minutoMarcacion(x.ultima_marcacion, fecha) ?? eventos.at(-1)?.t ?? null) : null;
  let minutos = null, motivo = '';
  if (!cantidad) motivo = 'No hay marcaciones recibidas.';
  else if (cantidad === 1) motivo = 'Una sola marcaci\u00f3n: no se inventa una salida.';
  else if (entrada === null || salida === null) motivo = 'Falta un extremo v\u00e1lido de la jornada.';
  else if (salida <= entrada) motivo = 'Marcas sin intervalo positivo: revisar fechas o repeticiones.';
  else if (salida - entrada > 1440) motivo = 'El intervalo supera 24 horas: revisar la asociaci\u00f3n de jornadas.';
  else minutos = (Math.round(salida * 60000) - Math.round(entrada * 60000)) / 60000;
  return { fecha, cantidad, entrada: cantidad ? entrada : null, salida, minutos,
    segundos: minutos === null ? null : Math.round(minutos * 60),
    horas: minutos === null ? null : minutos / 60,
    base: modelo?.base || 'Primera y \u00faltima marcaci\u00f3n recibidas',
    criterio: minutos === null ? motivo : CRITERIO_INTERVALO,
    estado: minutos === null ? 'NO CALCULABLE' : 'INTERVALO SIN DESCUENTOS', eventos, motivo };
}
function horarioFila(x) { return x.evidencia_revision?.horario || x.jornada_actual || x; }
export function descansoReferencia(x) {
  const p = horarioFila(x);
  return finite(p.minutos_descanso) ?? (finite(p.descuento_almuerzo) === null ? null : Number(p.descuento_almuerzo) * 60);
}
function finConfirmado(x) {
  const p = horarioFila(x), fecha = text(x.fecha).slice(0, 10);
  if (!x.evidencia_revision?.horario && norm(p.programacion_tipo) !== 'confirmada') return null;
  let a = minutoMarcacion(p.hora_inicio, fecha), b = minutoMarcacion(p.hora_fin, fecha);
  if (a === null || b === null || a === b) return null;
  if (b < a) b += 1440;
  let a2 = minutoMarcacion(p.hora_inicio_2, fecha), b2 = minutoMarcacion(p.hora_fin_2, fecha);
  if (a2 !== null && b2 !== null && a2 !== b2) {
    if (a2 < a) { a2 += 1440; b2 += 1440; }
    if (b2 < a2) b2 += 1440;
    b = b2;
  }
  return b;
}
export function estadoMarcacion(x = {}, ahoraMs = Date.now()) {
  const r = intervaloDiario(x), p = horarioFila(x), dayStart = minutoMarcacion('00:00', r.fecha);
  const ahora = ahoraMs / 60000 - 300;
  const hoy = Math.floor(ahora / 1440) * 1440;
  const fin = finConfirmado(x);
  const estadoFuente = norm(x.estado_comparacion);
  const codigo = norm(p.novedad_codigo || p.turno);
  const novedad = norm(p.tipo_registro) === 'novedad' || Boolean(p.novedad_codigo) ||
    ['d', 'descanso', 'libre', 'vac', 'inc', 'pnr', 'compensatorio'].includes(codigo);
  // Do not accuse a missing exit during an open shift. Without a confirmed
  // schedule, a current-day pair is only an observed interval, not a closed day.
  const pendiente = dayStart !== null && (dayStart > hoy || (fin !== null ? ahora < fin : dayStart === hoy));
  const incompleta = ['incompleta', 'marcaciones_incompletas', 'marcacion_unica'].includes(estadoFuente) || x.jornada_incompleta === true;
  const noVinculada = estadoFuente === 'marcacion_sin_empleado_vinculado';
  const lecturaParcial = x.evidencia_revision?.completo === false;
  let codigoEstado, etiqueta, detalle;
  if (!r.cantidad) {
    codigoEstado = 'sin_marcas'; etiqueta = 'Sin marcaciones';
    detalle = novedad ? 'Descanso o novedad registrada; no se presume ausencia.' :
      pendiente ? 'Fecha futura o jornada abierta: a\u00fan no es una omisi\u00f3n cerrada.' :
      fin === null ? 'Sin registro recibido; confirmar si deb\u00eda trabajar y revisar sincronizaci\u00f3n.' : 'Turno programado sin registro recibido; verificar novedad y sincronizaci\u00f3n.';
  } else if (r.cantidad === 1) {
    codigoEstado = 'unica'; etiqueta = 'Una sola marcaci\u00f3n';
    detalle = pendiente ? 'Registro parcial de una jornada todav\u00eda abierta.' : 'Hay presencia registrada, pero falta delimitar entrada y salida.';
  } else if (r.minutos === null || incompleta || noVinculada || lecturaParcial) {
    codigoEstado = 'por_revisar'; etiqueta = 'Marcaciones por revisar';
    detalle = r.motivo || (noVinculada ? 'C\u00f3digo biom\u00e9trico sin v\u00ednculo confirmado.' : 'La fuente informa evidencia incompleta; el intervalo no acredita una jornada completa.');
  } else {
    codigoEstado = 'con_intervalo'; etiqueta = 'Con intervalo entre marcas';
    detalle = pendiente ? 'Intervalo observado hasta la \u00faltima marca; la jornada a\u00fan puede continuar.' :
      'Duraci\u00f3n entre extremos. Tener varias marcas no verifica por s\u00ed solo el sentido de entrada y salida.';
  }
  const incidencia = !pendiente && (!novedad || r.cantidad > 0) && ['sin_marcas', 'unica', 'por_revisar'].includes(codigoEstado);
  return { codigo: codigoEstado, etiqueta, detalle, pendiente, incidencia, novedad, intervalo: r };
}
export function coincideMarcacion(x, filtro = '', ahoraMs = Date.now()) {
  if (!filtro) return true;
  const e = estadoMarcacion(x, ahoraMs);
  if (filtro === 'incidencias') return e.incidencia;
  if (filtro === 'abiertas') return e.pendiente;
  return e.codigo === filtro;
}

// Raw timestamps, seconds and the calculation criterion travel with the report.
// The numeric/duration cells below receive formulas plus verified cached values.
export function columnasIntervalo(x, modelo = null) {
  const r = intervaloDiario(x, modelo);
  return {
    'Día':diaSemanaRevision(r.fecha),
    'Ingreso usado (fecha y hora)': fechaHoraMarcacion(r.entrada),
    'Salida usada (fecha y hora)': fechaHoraMarcacion(r.salida),
    'Total diario entre marcas (h)': r.horas,
    'Total diario (h:mm:ss)': r.minutos === null ? null : r.minutos / 1440,
    'Duraci\u00f3n exacta (segundos)': r.segundos,
    'Descanso de plantilla (min; NO descontado)': descansoReferencia(x),
    'Descuento aplicado al intervalo (min)': r.minutos === null ? null : 0,
    'Estado del total': r.estado,
    'Base del intervalo': r.base,
    'Criterio del total': r.criterio,
    ...columnasNetoNomina(x, modelo || modeloRevision(x))
  };
}
export function hojaIntervalos(XLSX, filas) {
  const headers = Object.keys(filas[0] || {});
  const ws = XLSX.utils.json_to_sheet(filas);
  if (!filas.length) return ws;
  const col = k => headers.indexOf(k);
  const address = (c, r) => XLSX.utils.encode_cell({ c, r });
  const iStart = col('Ingreso usado (fecha y hora)'), iEnd = col('Salida usada (fecha y hora)');
  const iHoras = col('Total diario entre marcas (h)'), iDur = col('Total diario (h:mm:ss)'), iSeg = col('Duraci\u00f3n exacta (segundos)');
  filas.forEach((fila, i) => {
    const rr = i + 1;
    for (const c of [iStart, iEnd]) {
      if (c < 0) continue;
      const valor = minutoMarcacion(fila[headers[c]]);
      if (valor !== null) ws[address(c, rr)] = { t: 'n', v: valor / 1440 + 25569, z: 'yyyy-mm-dd hh:mm:ss' };
    }
    if (iStart < 0 || iEnd < 0 || fila['Total diario entre marcas (h)'] === null || fila['Total diario entre marcas (h)'] === undefined) return;
    const a = address(iStart, rr), b = address(iEnd, rr);
    for (const [c, formula, z] of [[iHoras, `(${b}-${a})*24`, '0.00'], [iDur, `${b}-${a}`, '[h]:mm:ss'], [iSeg, `ROUND((${b}-${a})*86400,0)`, '0']]) {
      if (c >= 0) ws[address(c, rr)] = { t: 'n', v: fila[headers[c]], f: formula, z };
    }
  });
  // Net uses the raw interval minus the APPLIED break once. Cached results
  // match the UI. PROSOF export is separate and uses only approved amounts.
  const iNeto = col('Total neto (h)'), iNetoDur = col('Total neto (h:mm:ss)'), iPausa = col('Almuerzo descontado (min)');
  filas.forEach((fila, i) => {
    const rr = i + 1;
    if (fila['Total neto (h)'] === null || fila['Total neto (h)'] === undefined) return;
    const useFormula = iStart >= 0 && iEnd >= 0 && iPausa >= 0 && fila['Almuerzo descontado (min)'] !== null;
    for (const [c, divisor, z] of [[iNeto, 60, '0.00'], [iNetoDur, 1440, '[h]:mm:ss']]) {
      if (c < 0) continue;
      const cell = { t: 'n', v: fila[headers[c]], z };
      if (useFormula) cell.f = `((${address(iEnd, rr)}-${address(iStart, rr)})*1440-${address(iPausa, rr)})/${divisor}`;
      ws[address(c, rr)] = cell;
    }
  });
  ws['!cols'] = headers.map(k => ({ wch: /Criterio|Detalle|Motivo/.test(k) ? 66 : /Empleado/.test(k) ? 34 : /fecha y hora/.test(k) ? 23 : 24 }));
  ws['!autofilter'] = { ref: ws['!ref'] };
  return ws;
}
