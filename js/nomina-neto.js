import { modeloRevision as modeloOriginal } from './revision-evidencia.js?v=728';
import { esPorteria } from './revision-punto.js?v=713';

// Payroll-only adapter. No writes, no new schedules, no hard-coded people/areas.
// A&B/Chef keep their existing selection and calculation without modification.
const text = v => String(v ?? '').trim();
const finite = v => v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v);
const norm = v => text(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const key = r => `${text(r.cedula)}|${text(r.fecha).slice(0, 10)}`;

export function esAyBChefNomina(x = {}) {
  const p = x.jornada_actual || x;
  const tags = [x.grupo_codigo, p.grupo_codigo, p.grupo_nombre, x.origen, p.origen, p.origen_programacion,
    p.area, p.proceso_nombre, p.area_consulta].map(norm);
  return tags.some(t => ['ALIMENTOSBEBIDAS', 'ALIMENTOSYBEBIDAS', 'AYB', 'CHEF', 'COCINA', 'COCINACHEF'].includes(t)) ||
    Boolean(p.es_externo_chef || p.area_cocina || p.cocina_programacion_id);
}

function pausaExplicita(p = {}) {
  // Zero is an explicit configuration, NOT a missing value.
  for (const k of ['minutos_descanso', 'descanso_descontable_minutos']) {
    const n = finite(p[k]);
    if (n !== null) return { minutos: n, fuente: 'Descanso configurado para este turno' };
  }
  const horas = finite(p.descuento_almuerzo);
  return horas === null ? null : { minutos: horas * 60, fuente: 'Almuerzo configurado para este turno' };
}

export function completarDescansosNomina(jornadas, paquete) {
  if (!paquete?.personas || !paquete?.plantillas) return jornadas;
  const protegidas = new Set((paquete.protegidas || []).map(key));
  const plantillas = new Map(paquete.plantillas.map(t => [t.codigo, t]));
  const personas = new Map();
  for (const p of paquete.personas) {
    const k = text(p.cedula);
    if (!personas.has(k)) personas.set(k, []);
    personas.get(k).push(p);
  }
  return jornadas.map(x => {
    if (esAyBChefNomina(x) || protegidas.has(key(x)) || pausaExplicita(x) ||
        x.novedad_codigo || x.tipo_registro === 'novedad' || x.conflicto_programacion) return x;
    const fecha = text(x.fecha).slice(0, 10);
    if (fecha < '2026-08-23' || (paquete.festivos || []).some(f => f.fecha === fecha)) return x;
    const vinculos = (personas.get(text(x.cedula)) || []).filter(p => fecha >= p.vigente_desde &&
      (!p.vigente_hasta || fecha <= p.vigente_hasta) && (!p.fecha_ingreso || fecha >= p.fecha_ingreso));
    if (!vinculos.length || new Set(vinculos.map(p => [...p.plantillas].sort().join('|'))).size !== 1) return x;
    const dow = new Date(fecha + 'T12:00:00Z').getUTCDay() || 7;
    const codes = vinculos[0].plantillas;
    const dias = codes.map(c => plantillas.get(c)?.dias.find(d => d.dia === dow));
    // An unresolved rotating schedule may still have an unambiguous lunch rule.
    // Do not assign a shift: consider ONLY documented working alternatives.
    const laborales = dias.filter(d => d?.tipo === 'laboral');
    if (dias.some(d => !d) || !laborales.length) return x;
    const pausas = laborales.map(d => finite(d.descanso_descontable_minutos));
    if (pausas.some(n => n === null || n < 0) || new Set(pausas).size !== 1) return x;
    return { ...x, almuerzo_documental_nomina: {
      minutos: pausas[0], fuente: 'Almuerzo coincidente en las alternativas documentadas del empleado y d\u00eda',
      plantillas: codes.slice(), turno_confirmado: false
    } };
  });
}

export function modeloNomina(x = {}) {
  const original = modeloOriginal(x);
  if (esAyBChefNomina(x)) return { ...original, protegidoAyB: true,
    descuentoAplicado: original.neto === null ? null : original.brutos - original.neto,
    fuenteAlmuerzo: 'Parametrizaci\u00f3n existente de A&B / Chef, sin cambios' };
  const m = { ...original, seleccion: { ...original.seleccion }, protegidoAyB: false };
  // Gates are fallback only when EVERY received event belongs to Porteria.
  if (m.eventos.length >= 2 && m.eventos.length === m.cantidad && m.eventos.every(esPorteria)) {
    m.usadas = m.eventos;
    m.entrada = m.eventos[0].t; m.salida = m.eventos.at(-1).t;
    m.punto = 'Porter\u00eda'; m.base = 'Porter\u00eda: \u00fanico punto con marcaciones';
    m.seleccion = { ...m.seleccion, usadas: m.usadas, entrada: m.entrada, salida: m.salida,
      fuente: 'porteria_unica', completa: true, nota: 'Solo hay marcas de Porter\u00eda; se utilizan sus extremos como referencia.' };
  } else if (m.usadas.length === 1 && m.seleccion.completa) {
    m.entrada = m.usadas[0].t; m.salida = null;
  } else if (m.cantidad === 1 && m.eventos.length === 1) {
    m.entrada = m.eventos[0].t; m.salida = null;
  }
  m.brutos = m.entrada !== null && m.salida !== null && m.salida > m.entrada &&
    m.salida - m.entrada <= 1440 ? m.salida - m.entrada : null;
  const documental = m.p.almuerzo_documental_nomina || x.almuerzo_documental_nomina || x.jornada_actual?.almuerzo_documental_nomina;
  const config = pausaExplicita(m.p) || documental || null;
  m.pausa = config ? finite(config.minutos) : null;
  m.fuenteAlmuerzo = config?.fuente || 'No hay un descanso aplicable configurado para esta fecha';
  m.neto = null; m.descuentoAplicado = null;
  m.criterio = 'Faltan marcaciones completas para calcular el total neto.';
  if (m.brutos !== null) {
    if (m.b2) m.criterio = 'Turno partido: revisar los bloques; no se considera trabajada la pausa entre bloques.';
    else if (m.p.novedad_codigo || m.p.tipo_registro === 'novedad') m.criterio = 'Hay una novedad registrada; confirmar el horario y las pausas antes de liquidar.';
    else if (m.p.conflicto_programacion || (m.ev?.conflicto_horario && !m.p.documental_711)) m.criterio = 'Hay horarios incompatibles; revisar la base antes de calcular.';
    else if (!m.seleccion.completa) m.criterio = 'El recorrido no est\u00e1 completo; actualizar la lectura.';
    else if (m.pausa === null) m.criterio = 'Almuerzo por confirmar. No se supone una pausa de 0, 30 o 60 minutos.';
    else if (m.pausa < 0 || m.pausa > m.brutos) m.criterio = 'La pausa configurada no cabe en el intervalo; revisar la jornada parcial.';
    else {
      // Calculate from RAW endpoints exactly once. Never subtract again from a
      // net total returned by another source or from an approved payroll amount.
      m.descuentoAplicado = m.pausa;
      m.neto = m.brutos - m.pausa;
      m.criterio = `Intervalo del punto menos ${m.pausa} min de descanso configurado. Neto de referencia; no equivale a horas aprobadas.`;
      if (m.usadas.length > 2) m.criterio += ' Hay movimientos intermedios: verificar trabajo efectivo en el detalle.';
    }
  }
  const confirmado = m.p.programacion_tipo === 'confirmada' || (!m.p.documental_711 && Boolean(m.ev?.horario));
  const horario = Boolean(m.b1 && !m.b2 && !m.p.novedad_codigo && !m.p.conflicto_programacion && (confirmado || m.sugerido));
  m.comparable = horario && m.seleccion.fuente !== 'dos_sin_punto' && m.brutos !== null;
  m.deltaEntrada = m.comparable ? m.entrada - m.b1.start : null;
  m.deltaSalida = m.comparable ? m.salida - m.b1.end : null;
  if (m.b1 && !m.b2 && m.pausa !== null && m.pausa >= 0 && m.pausa <= m.b1.end - m.b1.start) {
    m.netoProgramado = m.b1.end - m.b1.start - m.pausa;
  } else if (!m.b1) m.netoProgramado = null;
  return m;
}

export function horasMinutosNomina(minutos) {
  if (minutos === null || !Number.isFinite(minutos) || minutos < 0) return '\u2014';
  const n = Math.floor(minutos + 1e-7);
  return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
}

export function columnasNetoNomina(x, m = modeloNomina(x)) {
  return {
    'Almuerzo configurado (min)': m.pausa,
    'Almuerzo descontado (min)': m.descuentoAplicado,
    'Total neto (h)': m.neto === null ? null : m.neto / 60,
    'Total neto (h:mm:ss)': m.neto === null ? null : m.neto / 1440,
    'Criterio del neto': m.criterio,
    'Fuente del almuerzo': m.fuenteAlmuerzo
  };
}

export function alertaAlmuerzoConcepto(x, m = modeloNomina(x)) {
  if (m.protegidoAyB || ['aprobado', 'rechazado'].includes(text(x.estado_revision || x.estado))) return null;
  const h = finite(x.horas_calculadas);
  if (h === null || h <= 0 || m.neto === null) return null;
  if (h * 60 > m.neto + 1) return 'El candidato supera el total neto despu\u00e9s del almuerzo. Ajusta las horas verificadas o rechaza el concepto.';
  const d = x.detalle || {};
  const reales = finite(d.horas_reales);
  if (m.pausa > 0 && reales !== null && Math.abs(reales * 60 - m.brutos) <= 1 &&
      ['P003', 'P004', 'P008', 'P009'].includes(text(x.concepto_codigo))) {
    return 'El candidato anterior usa un total bruto sin descontar almuerzo. Revisa el c\u00e1lculo antes de aprobar; no se corrige ni se paga autom\u00e1ticamente.';
  }
  return null;
}
