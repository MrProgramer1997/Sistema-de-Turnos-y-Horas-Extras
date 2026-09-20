import { modeloNomina, horasMinutosNomina } from './nomina-neto.js?v=714';
import { fechaDiaRevision, recorridoRevisionHtml } from './revision-punto.js?v=713';

const text = v => String(v ?? '').trim();
const esc = v => text(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const claveAprobacionDia = x => `${text(x.cedula)}|${text(x.fecha).slice(0, 10)}`;
export const estadoConceptoDia = x => text(x.estado_revision || x.estado || 'pendiente').toLowerCase();
export const hoyNomina = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit'
}).format(new Date());

// Start from the COMPLETE calendar universe, not only from payable concepts.
// One row per employee/day, even with no punches, no overtime, or several concepts.
export function agruparAprobacionDiaria(jornadas, conceptos, { estado = '', calendario = null, hoy = hoyNomina() } = {}) {
  const mapa = new Map();
  for (const jornada of jornadas) {
    const k = claveAprobacionDia(jornada);
    if (!mapa.has(k)) mapa.set(k, { clave: k, jornada, conceptos: [] });
  }
  for (const concepto of conceptos) {
    const k = claveAprobacionDia(concepto);
    if (!mapa.has(k)) mapa.set(k, { clave: k, jornada: concepto.jornada_actual || concepto, conceptos: [] });
    const fila = mapa.get(k);
    // Each employee/date may have many distinct payroll concepts.
    // A persisted decision wins over an unsaved suggestion of the same concept.
    const cod = text(concepto.concepto_codigo || concepto.Concepto);
    const found = fila.conceptos.findIndex(c => cod ? text(c.concepto_codigo || c.Concepto) === cod :
      text(c.revision_id || c.id) === text(concepto.revision_id || concepto.id));
    if (found < 0) fila.conceptos.push(concepto);
    else if ((fila.conceptos[found].sugerencia_719 || fila.conceptos[found].sugerencia_721) &&
      !concepto.sugerencia_719 && !concepto.sugerencia_721) fila.conceptos[found] = concepto;
  }
  return [...mapa.values()].map(f => {
    const fecha = text(f.jornada.fecha).slice(0, 10);
    f.especial = Boolean(calendario?.festivos?.has(fecha)) || new Date(fecha + 'T12:00:00Z').getUTCDay() === 0;
    f.abierta = fecha >= hoy;
    f.pendientes = f.conceptos.filter(c => !['aprobado', 'rechazado'].includes(estadoConceptoDia(c)));
    f.sinConceptoEspecial = f.especial && Number(f.jornada.total_marcaciones) > 0 &&
      !f.conceptos.some(c => ['P006', 'P007'].includes(c.concepto_codigo));
    return f;
  }).filter(f => !estado || f.conceptos.some(c => estadoConceptoDia(c) === estado) ||
    (estado === 'pendiente' && f.sinConceptoEspecial)).sort((a, b) =>
    text(a.jornada.fecha).localeCompare(text(b.jornada.fecha)) ||
    text(a.jornada.empleado || a.jornada.nombre_completo || a.jornada.cedula)
      .localeCompare(text(b.jornada.empleado || b.jornada.nombre_completo || b.jornada.cedula), 'es'));
}

export function resumenNetoHtml(m) {
  return `<div class="nd-resumen-neto">
    <div><span>Tiempo entre marcas</span><strong>${horasMinutosNomina(m.brutos)}</strong></div>
    <div><span>Almuerzo / descanso</span><strong>${horasMinutosNomina(m.descuentoAplicado)}</strong></div>
    <div><span>Total neto</span><strong>${horasMinutosNomina(m.neto)}</strong></div>
  </div><p class="nd-aclaracion">${esc(m.neto === null ? m.criterio :
    'Neto de referencia, con el descanso descontado una sola vez. No significa horas aprobadas.')}</p>`;
}
function nombre(x) { return text(x.empleado || x.nombre_completo || `${x.nombres || ''} ${x.apellidos || ''}`) || text(x.cedula); }
function evidenciaHtml(x, m) {
  return `<details class="nd-evidencia"><summary>Ver turno, origen del almuerzo y marcaciones</summary>
    <p><strong>Turno:</strong> ${esc(m.p?.turno || 'Por confirmar')} &middot; ${esc(m.p?.hora_inicio || '\u2014')} a ${esc(m.p?.hora_fin || '\u2014')}</p>
    <p><strong>Almuerzo:</strong> ${esc(m.fuenteAlmuerzo)}. Configurado: ${horasMinutosNomina(m.pausa)}.</p>
    <p>${esc(m.criterio)}</p><p>${esc(m.seleccion?.nota)}</p>
    <div class="table-responsive"><table class="table table-sm"><thead><tr><th>Fecha y hora</th><th>Punto</th><th>Huellero</th><th>Referencia</th></tr></thead>
    <tbody>${recorridoRevisionHtml(m) || '<tr><td colspan="4">Sin marcaciones recibidas.</td></tr>'}</tbody></table></div></details>`;
}

let dialogo = null, resolverDialogo = null, focoAnterior = null;
function finalizar(valor) {
  const done = resolverDialogo; resolverDialogo = null;
  dialogo?.close(); done?.(valor); focoAnterior?.focus?.();
}
export function cerrarDialogosNomina() { finalizar(null); }
function crearDialogo() {
  if (dialogo) return dialogo;
  dialogo = document.createElement('dialog');
  dialogo.className = 'nd-dialog'; dialogo.setAttribute('aria-labelledby', 'ndDialogTitulo');
  document.body.appendChild(dialogo);
  dialogo.addEventListener('cancel', e => { e.preventDefault(); finalizar(null); });
  return dialogo;
}
function abrir(contenido) {
  const d = crearDialogo(); focoAnterior = document.activeElement; d.innerHTML = contenido;
  d.querySelectorAll('[data-nd-cerrar]').forEach(b => b.addEventListener('click', () => finalizar(null)));
  d.showModal(); d.querySelector('[data-nd-cerrar]')?.focus(); return d;
}
export function verDetalleDiario(x, m = modeloNomina(x)) {
  if (dialogo?.open) return;
  abrir(`<header><h2 id="ndDialogTitulo">Detalle de la jornada</h2><button type="button" class="btn btn-outline-secondary btn-sm" data-nd-cerrar>Cerrar</button></header>
    <div class="nd-dialog-body"><h3>${esc(nombre(x))}</h3><p>${fechaDiaRevision(x.fecha)} &middot; ${esc(m.base)}</p>
    ${resumenNetoHtml(m)}${x.agrupacion_719?`<p class="nd-aclaracion">${esc(x.agrupacion_719.nota)}</p>`:''}${evidenciaHtml(x, m)}</div>`);
  dialogo.querySelector('details').open = true;
}

export function minutosDecisionNomina(valor) {
  const a = /^(\d{1,2}):([0-5]\d)$/.exec(text(valor));
  if (!a) throw new Error('Escribe horas y minutos, por ejemplo 01:30.');
  const minutos = Number(a[1]) * 60 + Number(a[2]);
  if (minutos <= 0 || minutos > 1440) throw new Error('Las horas deben estar entre 00:01 y 24:00.');
  return minutos;
}
export function validarDecisionNomina({ x, m, accion, horas, motivo, confirmado, hoy = hoyNomina() }) {
  motivo = text(motivo);
  if (!['aprobar', 'ajustar', 'validarDomingo', 'rechazar', 'observar'].includes(accion))
    throw new Error('Accion no valida.');
  if (['aprobado', 'rechazado'].includes(estadoConceptoDia(x)))
    throw new Error('La decision ya esta cerrada. Puedes agregar un comentario sin cambiarla.');
  if (motivo.length > 2000) throw new Error('El comentario admite hasta 2000 caracteres.');
  if (accion === 'rechazar' || accion === 'observar') {
    // Observing is a separate legacy workflow, not a payment decision or a note.
    if (accion === 'observar' && !motivo) throw new Error('Escribe la observacion que deseas registrar.');
    return { accion, horas: null, motivo };
  }
  if (text(x.fecha).slice(0, 10) >= hoy) throw new Error('La jornada actual o futura sigue abierta. No se aprueba antes de terminar el d\u00eda.');
  const minutos = minutosDecisionNomina(horas);
  // Sunday/holiday hours may be entered manually by the responsible user.
  // The protected server RPC records the current evidence and actor.
  if (accion !== 'validarDomingo' && (m.cantidad < 2 || m.brutos === null)) throw new Error('Falta un intervalo completo del punto. Revisa las marcaciones antes de aprobar.');
  if (m.neto !== null && minutos > m.neto + 0.6) throw new Error('Las horas del concepto no pueden superar el total neto de esta jornada.');
  if (m.brutos !== null && minutos > m.brutos + 0.6) throw new Error('Las horas superan el intervalo recibido.');
  const aprobadas = Math.round(minutos / 60 * 100) / 100;
  const original = Number(x.horas_calculadas || 0);
  const especial = accion === 'validarDomingo';
  const ajuste = !especial && (accion === 'ajustar' || Math.abs(aprobadas - original) > 0.005);
  // Submitting the approval is the confirmation; there is no extra checkbox.
  return { accion: especial ? accion : ajuste ? 'ajustar' : 'aprobar', horas: aprobadas, motivo };
}

export function pedirDecisionNomina(x, { accion = 'aprobar', modelo = modeloNomina(x), aviso = '' } = {}) {
  if (dialogo?.open) return Promise.resolve(null);
  const rechazo = accion === 'rechazar' || accion === 'observar';
  const especial = accion === 'validarDomingo';
  const titulo = rechazo ? (accion === 'rechazar' ? 'Rechazar concepto' : 'Observar concepto') : 'Aprobar horas verificadas';
  const sugerencia = especial ? '' : horasMinutosNomina(Math.round(Number(x.horas_calculadas || 0) * 60));
  const d = abrir(`<form novalidate><header><h2 id="ndDialogTitulo">${titulo}</h2><button type="button" class="btn btn-outline-secondary btn-sm" data-nd-cerrar>Cerrar</button></header>
    <div class="nd-dialog-body"><h3>${esc(nombre(x))}</h3><p>${fechaDiaRevision(x.fecha)} &middot; <strong>${esc(x.concepto_codigo)}</strong> ${esc(x.concepto_nombre)}</p>
    ${aviso ? `<p class="nd-aviso" role="note">${esc(aviso)}</p>` : ''}
    ${!rechazo ? `<label for="ndHoras">Horas a aprobar de este concepto (horas:minutos)</label><input class="form-control" id="ndHoras" name="horas" type="text" inputmode="text" maxlength="5" placeholder="01:30" value="${esc(sugerencia)}" autocomplete="off" required>
` : ''}
    <label for="ndMotivo">${accion === 'observar' ? 'Observacion a registrar' : 'Comentario (opcional)'}</label>
    <textarea class="form-control" id="ndMotivo" name="motivo" rows="3" maxlength="2000" placeholder="Puedes dejarlo en blanco al aprobar o rechazar"></textarea>
    <p class="nd-error" role="alert"></p>${evidenciaHtml(x, modelo)}</div>
    <footer><button type="button" class="btn btn-outline-secondary" data-nd-cerrar>Cancelar</button><button type="submit" class="btn ${rechazo ? 'btn-outline-danger' : 'btn-success'}">${titulo}</button></footer></form>`);
  return new Promise(resolve => {
    resolverDialogo = resolve;
    const form = d.querySelector('form');
    form.addEventListener('submit', e => {
      e.preventDefault();
      try {
        const value = validarDecisionNomina({ x, m: modelo, accion, horas: form.elements.horas?.value,
          motivo: form.elements.motivo.value });
        finalizar(value);
      } catch (err) { d.querySelector('[role="alert"]').textContent = err.message; }
    });
  });
}

// UI availability only. Supabase remains responsible for authorization and write validation.
export function accionesConceptoDiario(c, { disponible = true, abierta = false } = {}) {
  const existe = Boolean(c && text(c.revision_id || c.id));
  const cerrado = existe && ['aprobado', 'rechazado'].includes(estadoConceptoDia(c));
  const revisable = existe && !cerrado && c.permite_revision !== false;
  const puedeDecidir = disponible && revisable && !abierta;
  return {
    cerrado, mostrarDecision: existe,
    aprobar: puedeDecidir, rechazar: disponible && existe && !abierta,
    revisar: disponible && cerrado, recalcular: disponible && cerrado && !abierta,
    comentar: disponible && existe,
    motivo: !existe ? 'Sin concepto para decidir.' : cerrado ? '' :
      !disponible ? 'Actualiza el periodo completo antes de continuar.' : abierta ?
      'Jornada actual o futura: pendiente de cierre.' : !revisable ?
      'Este concepto no esta habilitado para revision.' : ''
  };
}
