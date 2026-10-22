/* Fase 7.48. Controles de integridad, filtro principal y conciliacion manual. */
const text = value => String(value ?? '').trim();
const norm = value => text(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, ' ')
  .toUpperCase();
const key = row => `${text(row.cedula)}|${text(row.fecha).slice(0, 10)}`;
const finite = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))
  ? Number(value)
  : null;

export const AREAS_PRINCIPALES = Object.freeze([
  Object.freeze({ codigo: 'ADMINISTRATIVO', nombre: 'Administrativo' }),
  Object.freeze({ codigo: 'ALIMENTOS_BEBIDAS', nombre: 'Alimentos y Bebidas' }),
  Object.freeze({ codigo: 'EVENTOS_SERVICIOS', nombre: 'Eventos y Servicios' }),
  Object.freeze({ codigo: 'INFRAESTRUCTURA', nombre: 'Infraestructura' }),
  Object.freeze({ codigo: 'MANTENIMIENTO', nombre: 'Mantenimiento' }),
  Object.freeze({ codigo: 'MERCADEO_COMUNICACIONES', nombre: 'Mercadeo y Comunicaciones' }),
  Object.freeze({ codigo: 'OPERACIONES', nombre: 'Operaciones' }),
  Object.freeze({ codigo: 'SERVICIOS_DEPORTIVOS', nombre: 'Servicios Deportivos' })
]);

const areaKey = value => norm(value)
  .replace(/[^A-Z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '');

const areaByKey = new Map();
for (const area of AREAS_PRINCIPALES) {
  areaByKey.set(areaKey(area.codigo), area);
  areaByKey.set(areaKey(area.nombre), area);
}

const AREA_ALIASES = Object.freeze([
  ['ADMINISTRATIVO', /(ADMINISTR|SISTEMA|INNOVACION|CONTABIL|CARTERA|TESORER|COMPRAS|BIENESTAR|RECURSOS HUMANOS|GESTION HUMANA|GERENCIA ADMINISTRATIVA)/],
  ['ALIMENTOS_BEBIDAS', /(ALIMENT|BEBID|COCINA|CHEF|MESA|RIALTO|PORCION|BAR|RESTAUR|FRIA|CALIENTE)/],
  ['EVENTOS_SERVICIOS', /(EVENTOS?|RECEPCION|RECREACION|SERVICIO AL SOCIO)/],
  ['INFRAESTRUCTURA', /(INFRAESTRUCTURA|LOCATIV)/],
  ['MANTENIMIENTO', /(MANTENIMIENTO|JARDINER|PTARD|TALLER)/],
  ['MERCADEO_COMUNICACIONES', /(MERCADEO|COMUNICACION|DISENO|PUBLICIDAD)/],
  ['OPERACIONES', /(OPERACIONES|PORTERIA|SERVICIOS GENERALES|OFICIOS VARIOS|VESTIER|SEGURIDAD)/],
  ['SERVICIOS_DEPORTIVOS', /(DIRECCION DEPORT|DEPORT|GOLF|TENIS|FUTBOL|NATACION|PISCINA|GIMNASIO|WAKEBOARD|CANCHER|MARSHALL|ACADEMIA)/]
]);

export function codigoAreaPrincipal(value) {
  const exact = areaByKey.get(areaKey(value));
  if (exact) return exact.codigo;
  const valueNormalized = norm(value);
  if (!valueNormalized) return '';
  return AREA_ALIASES.find(([, pattern]) => pattern.test(valueNormalized))?.[0] || '';
}

export function registroAreaPrincipal(row = {}, journey = row.jornada_actual, employee = {}) {
  const candidates = [
    row.grupo_codigo,
    row.grupo_nombre,
    journey?.grupo_codigo,
    journey?.grupo_nombre,
    employee.grupo_codigo,
    employee.grupo_nombre,
    row.area_consulta,
    row.proceso_nombre,
    journey?.proceso_nombre,
    row.area,
    journey?.area,
    employee.area,
    row.proceso_codigo,
    journey?.proceso_codigo,
    row.centro_costos,
    journey?.centro_costos,
    employee.centro_costos
  ];
  for (const candidate of candidates) {
    const code = codigoAreaPrincipal(candidate);
    if (code) return AREAS_PRINCIPALES.find(area => area.codigo === code) || null;
  }
  return null;
}

export function fechaLocalColombia(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(now);
}

export function fechaValidaControl(date) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date)
    && Number.isFinite(Date.parse(`${date}T12:00:00Z`))
    && new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) === date;
}

export function areaConsulta(row, journey = row.jornada_actual, employee = {}) {
  // Se conserva el proceso/subarea para el detalle. Solo el selector se agrupa.
  return text(
    row.proceso_nombre
    || journey?.proceso_nombre
    || journey?.area
    || row.area
    || employee.area
    || row.grupo_nombre
    || row.grupo_codigo
    || employee.centro_costos
    || row.centro_costos
    || 'SIN AREA'
  );
}


// 7.49: operational visibility, not a deletion or a payroll settlement rule.
// Keep the complete source, approved decisions and special-day coverage intact.
export const MINIMO_CANDIDATO_749 = 26;
const CONCEPTOS_UMBRAL_749 = new Set(['P003', 'P004', 'P005', 'P008', 'P009', 'P100']);
export function minutosReferencia749(row = {}) {
  const d = row.detalle || {};
  if (d.calculo_pendiente === true) return null;
  const adjusted = finite(d.ajuste_almuerzo_742?.referencia_extra_minutos);
  if (adjusted !== null && adjusted >= 0) return adjusted;
  // Suggestions retain exact segment endpoints, including seconds. Do not
  // round 25:59 to 26:00 when deciding whether to show a candidate.
  if (Array.isArray(d.tramos_sugeridos) && d.tramos_sugeridos.length) {
    let minutes = 0;
    for (const segment of d.tramos_sugeridos) {
      const start = finite(segment.inicio), end = finite(segment.fin);
      if (start === null || end === null || end < start) return null;
      minutes += end - start;
    }
    return minutes;
  }
  const hours = finite(row.horas_calculadas ?? row.horas_candidatas);
  if (hours === null || hours < 0) return null;
  // Legacy persisted hours have 2 decimal places (up to 0.3 min precision
  // loss). A value straddling the boundary stays visible for validation;
  // it is never treated as a confirmed amount below the threshold.
  const minutes = hours * 60;
  if (minutes < MINIMO_CANDIDATO_749 && minutes + 0.300001 >= MINIMO_CANDIDATO_749) return null;
  return minutes;
}
export function esMenorUmbral749(row = {}) {
  if (!CONCEPTOS_UMBRAL_749.has(text(row.concepto_codigo))) return false;
  const state = text(row.estado_revision ?? row.estado ?? 'pendiente').toLowerCase();
  if (!['pendiente', 'observado'].includes(state)) return false;
  const minutes = minutosReferencia749(row);
  return minutes !== null && minutes >= 0 && minutes < MINIMO_CANDIDATO_749 - 1e-8;
}
export function visibleEnBandeja749(row, { incluirMenores = false } = {}) {
  return incluirMenores || !esMenorUmbral749(row);
}
function incluirMenoresEnAuditoria749() {
  return typeof document !== 'undefined' && document.getElementById('heIncluirMenores749')?.checked === true;
}
function instalarControlUmbral749() {
  if (typeof document === 'undefined' || document.getElementById('heIncluirMenores749')) return;
  const target = document.querySelector('#heOpcionesTecnicas .nd-avanzadas-body');
  if (!target) return;
  const box = document.createElement('div');
  box.className = 'alert alert-secondary py-2 small';
  const label = document.createElement('label');
  const check = document.createElement('input');
  check.type = 'checkbox'; check.id = 'heIncluirMenores749'; check.className = 'form-check-input me-2';
  label.append(check, document.createTextNode('Incluir conceptos menores de 26 minutos en la consulta de auditoria'));
  box.append(label);
  const note = document.createElement('p'); note.className = 'mb-0 mt-1';
  note.textContent = 'La bandeja habitual muestra extras y recargos desde 26 minutos por concepto y dia. Los tiempos menores se conservan, sin rechazo ni eliminacion automatica. Los conceptos aprobados y el dominical/festivo base no cambian.';
  box.append(note); target.prepend(box);
  check.addEventListener('change', () => document.getElementById('heArea')?.dispatchEvent(new Event('change', { bubbles: true })));
  const rule = target.querySelector('.alert-info');
  if (rule) rule.textContent = 'Candidatos de extras y recargos: desde 26 minutos por concepto y dia. No se descuentan los primeros 25 minutos. No se aprueba ningun pago automaticamente.';
  const version = document.querySelector('.nd-version');
  if (version) version.textContent = 'Aprobacion del corte - version 7.49';
}

export function coincideAreaConsulta(row, selected) {
  // Shared consultation predicate: used by both payroll approval views.
  if (!visibleEnBandeja749(row, { incluirMenores: incluirMenoresEnAuditoria749() })) return false;
  if (!text(selected)) return true;
  const journey = row.jornada_actual;
  const selectedCode = codigoAreaPrincipal(selected);
  const principal = registroAreaPrincipal(row, journey, {});
  if (selectedCode && principal) return principal.codigo === selectedCode;
  return [
    row.area_consulta,
    row.proceso_nombre,
    row.area,
    row.grupo_nombre,
    row.grupo_codigo,
    row.proceso_codigo,
    row.centro_costos,
    journey?.proceso_nombre,
    journey?.area,
    journey?.centro_costos
  ].some(area => text(area) && norm(area) === norm(selected));
}

function installMainAreaFilter() {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;

  const install = () => {
    instalarControlUmbral749();
    const select = document.getElementById('heArea');
    if (!select || select.dataset.areasPrincipales748 === 'si') return;
    select.dataset.areasPrincipales748 = 'si';

    const expectedSignature = [
      '|Todas',
      ...AREAS_PRINCIPALES.map(area => `${area.codigo}|${area.nombre}`)
    ].join('||');
    let syncing = false;

    const remember = () => {
      select.dataset.areaPrincipalSeleccionada = codigoAreaPrincipal(select.value) || '';
    };

    const synchronize = () => {
      if (syncing) return;
      const currentSignature = [...select.options]
        .map(option => `${option.value}|${text(option.textContent)}`)
        .join('||');
      const remembered = select.dataset.areaPrincipalSeleccionada || '';
      const current = codigoAreaPrincipal(select.value)
        || remembered
        || codigoAreaPrincipal(select.selectedOptions?.[0]?.textContent);

      if (currentSignature === expectedSignature) {
        if (current && select.value !== current) select.value = current;
        return;
      }

      syncing = true;
      const all = document.createElement('option');
      all.value = '';
      all.textContent = 'Todas';
      const options = [
        all,
        ...AREAS_PRINCIPALES.map(area => {
          const option = document.createElement('option');
          option.value = area.codigo;
          option.textContent = area.nombre;
          return option;
        })
      ];
      select.replaceChildren(...options);
      select.value = current || '';
      select.dataset.areaPrincipalSeleccionada = select.value;
      syncing = false;
    };

    select.addEventListener('change', remember);
    new MutationObserver(synchronize).observe(select, { childList: true });
    synchronize();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    queueMicrotask(install);
  }
}

installMainAreaFilter();

export function domingosSinConcepto(jornadas, revisiones, {
  hoy = fechaLocalColombia(),
  calendario = null,
  oficiales = null
} = {}) {
  const present = new Set(
    revisiones
      .filter(row => ['P006', 'P007'].includes(text(row.concepto_codigo)))
      .map(key)
  );
  const seen = new Set();
  const output = [];

  for (const row of jornadas) {
    const date = text(row.fecha).slice(0, 10);
    const rowKey = key(row);
    const holiday = Boolean(calendario?.festivos?.has(date));
    if (
      !fechaValidaControl(date)
      || date > hoy
      || (!holiday && new Date(`${date}T12:00:00Z`).getUTCDay() !== 0)
      || Number(row.total_marcaciones) < 1
      || present.has(rowKey)
      || seen.has(rowKey)
    ) continue;
    if (
      row.es_externo_chef === true
      || ['extra', 'externo', 'eventual'].includes(text(row.tipo_personal).toLowerCase())
    ) continue;
    if (oficiales && !oficiales.has(text(row.cedula))) continue;

    seen.add(rowKey);
    output.push({
      jornada: row,
      fecha: date,
      clave: rowKey,
      festivo: holiday,
      preparable: Boolean(calendario),
      motivo: 'Hay marcas sin registro base. Preparar solo incorpora el caso; no calcula ni aprueba pagos.'
    });
  }

  return output.sort((left, right) => (
    left.fecha.localeCompare(right.fecha)
    || text(left.jornada.empleado).localeCompare(text(right.jornada.empleado), 'es')
  ));
}

export async function prepararDomingoSeleccionado(request, date, {
  hoy = fechaLocalColombia(),
  calendario,
  signal
} = {}) {
  if (
    !fechaValidaControl(date)
    || date > hoy
    || (!calendario?.festivos?.has(date) && new Date(`${date}T12:00:00Z`).getUTCDay() !== 0)
  ) throw new Error('Selecciona domingo o festivo con registros recibidos.');
  if (signal?.aborted) throw new Error('Operacion cancelada antes de enviar.');

  const response = await request(
    'preparar_revision_general_v713',
    { p_desde: date, p_hasta: date },
    { read: false, signal }
  );
  if (response?.error) throw response.error;
  const data = response?.data;
  if (
    !data
    || data.sin_aprobar !== true
    || !Array.isArray(data.cobertura)
    || data.cobertura.some(item => item.faltantes !== 0)
  ) throw new Error('No se confirmo la cobertura. Actualiza antes de reintentar.');

  return { insertados: data.insertados, actualizados: data.actualizados, fecha: date };
}

export function controlExtraVigente(row, model) {
  if (
    ['aprobado', 'rechazado'].includes(text(row.estado_revision || row.estado).toLowerCase())
    || !['P003', 'P004', 'P008', 'P009'].includes(text(row.concepto_codigo))
  ) return null;
  if (row.detalle?.retirado_por_correccion_horario_v711 === true) {
    return 'Candidato retirado al corregir el horario confirmado. Sin horas extra por esta salida; se conserva el registro y su auditoria.';
  }

  const current = model?.p || {};
  const document = current.documental_711;
  const confirmed = document
    ? current.programacion_tipo === 'confirmada'
    : Boolean(model?.ev?.horario)
      || current.programacion_tipo === 'confirmada'
      || row.programacion_tipo === 'confirmada';

  if (document && ['deteccion_semanal', 'pendiente', 'conflicto', 'festivo_sin_regla'].includes(document.tipo)) {
    return 'Turno semanal no confirmado. Se muestran las marcas, pero falta validar la base para decidir extras.';
  }
  if (document?.conflicto_documental) {
    return 'La asignacion guardada difiere del horario fijo documental. Confirmar la excepcion o corregir la base antes de decidir extras.';
  }
  if (document?.reconciliar_guardado) {
    return 'Horario confirmado corregido en lectura. La asignacion y el candidato antiguos requieren reconciliacion auditada en la base antes de aprobar.';
  }
  if (document && document.tipo !== 'guardada') {
    const detail = row.detalle || {};
    const start = text(detail.hora_inicio);
    const end = text(detail.hora_fin);
    const scheduledHours = finite(detail.horas_programadas ?? detail.horas_programadas_netas);
    if (
      !start
      || !end
      || scheduledHours === null
      || Math.abs(scheduledHours - Number(current.horas_programadas_netas || 0)) > 0.01
    ) return 'Candidato anterior no conciliado con el horario documental y su descanso. Revisar y recalcular sin aprobar automaticamente.';
  }
  if (!confirmed) return null;

  const detail = row.detalle || {};
  const fields = ['hora_inicio', 'hora_fin', 'hora_inicio_2', 'hora_fin_2'];
  const hhmm = value => text(value).slice(0, 5);
  if (fields.some(field => Object.prototype.hasOwnProperty.call(detail, field) && hhmm(detail[field]) !== hhmm(current[field]))) {
    return 'El horario actual difiere del utilizado para calcular este candidato. Revisar la asignacion y recalcular antes de aprobar o ajustar; la lectura no modifica el registro.';
  }
  if (model.comparable && Number.isFinite(model.deltaSalida) && model.deltaSalida <= 25) {
    return 'La salida comparada no supera 25 minutos despues del turno vigente. Este candidato de extras requiere revision; no se ofrece aprobacion directa.';
  }
  return null;
}
