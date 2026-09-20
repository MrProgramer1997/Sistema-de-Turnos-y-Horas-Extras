// Revisar is read-only until submit. Every correction targets exactly one persisted concept.
import { minutosDecisionNomina } from './nomina-aprobacion-diaria.js?v=722';
const text = value => String(value ?? '').trim();
const esc = value => text(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const horasCorreccion722 = value => {
  if (value == null || !Number.isFinite(Number(value))) return '';
  const minutes = Math.round(Number(value) * 60);
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
};
const instant = value => value ? text(value).replace('T', ' ').slice(0, 19) : 'Sin extremo completo';
const auditDate = value => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('es-CO', {timeZone:'America/Bogota',dateStyle:'short',timeStyle:'short'}).format(date) : '';
};
export function crearCorreccionesNomina722({rpc, canWrite, onBusy, onSaved, onError}) {
  let dialog = null, context = null, current = null, action = 'revisar', busy = false, ticket = 0, focus = null;
  function close(force = false) {
    if (busy && !force) return;
    ticket++; context = null; current = null;
    dialog?.close(); dialog?.querySelector('[data-body]')?.replaceChildren();
    if (busy) { busy = false; onBusy(false); }
    focus?.focus?.();
  }
  async function call(name, args, read) {
    const result = await rpc(name, args, {read});
    if (result?.error) throw result.error;
    return result?.data ?? result;
  }
  function ensure() {
    if (dialog) return;
    dialog = document.createElement('dialog'); dialog.className = 'nd-dialog';
    dialog.setAttribute('aria-labelledby', 'nc722Titulo');
    dialog.innerHTML = '<header><h2 id="nc722Titulo">Revisar concepto</h2><button type="button" data-close class="btn btn-outline-secondary btn-sm">Cerrar</button></header><div class="nd-dialog-body" data-body></div>';
    dialog.querySelector('[data-close]').onclick = () => close();
    dialog.addEventListener('cancel', event => {event.preventDefault(); close();});
    document.body.appendChild(dialog);
  }
  async function load(option = null) {
    const requestId = ++ticket; context = null;
    const body = dialog.querySelector('[data-body]');
    body.innerHTML = '<p role="status">Consultando este concepto...</p>';
    try {
      const result = await call('previsualizar_correccion_nomina_v722', {p_revision_id:current.revision_id || current.id,p_opcion:option}, true);
      if (requestId !== ticket || !dialog.open) return;
      if (result?.version !== '722' || result.revision?.id !== (current.revision_id || current.id) || !result.huella || !Array.isArray(result.historial) || !Array.isArray(result.otros)) {
        throw new Error('No se recibio la revision completa. Actualiza el corte.');
      }
      context = result; paint();
    } catch (error) {
      if (requestId === ticket) body.innerHTML = `<p role="alert" class="nd-error">${esc(error.message || error)}</p>`;
    }
  }
  function paint() {
    const r = context, x = r.revision, body = dialog.querySelector('[data-body]');
    const changingHours = action === 'revisar';
    const canApprove = r.jornada_cerrada && (r.manual || Number.isFinite(r.referencia) && r.referencia > 0);
    const options = Array.isArray(r.opciones) ? r.opciones : [];
    dialog.querySelector('h2').textContent = action === 'rechazar' ? 'Rechazar concepto' : action === 'recalcular' ? 'Recalcular concepto' : 'Revisar concepto';
    body.innerHTML = `<form novalidate>
      <h3>${esc(r.empleado || current.empleado)}</h3><p>${esc(x.fecha)} &middot; <strong>${esc(x.concepto_codigo)} ${esc(x.concepto_nombre)}</strong></p>
      <p>Estado: <strong>${esc(x.estado)}</strong> &middot; Horas aprobadas: <strong>${esc(horasCorreccion722(x.horas_aprobadas) || '00:00')}</strong></p>
      ${options.length > 1 && action !== 'rechazar' ? `<label for="nc722Opcion">Turno de referencia</label><select id="nc722Opcion" class="form-select"><option value="">Selecciona un turno</option>${options.map(o => `<option value="${esc(o.key)}" ${o.key === r.horario?.key ? 'selected' : ''}>${esc(o.codigo)} &middot; ${esc(o.inicio)} a ${esc(o.fin)}</option>`).join('')}</select>` : ''}
      ${action === 'recalcular' ? `<p>Referencia actual: <strong>${esc(horasCorreccion722(r.referencia) || 'Por revisar')}</strong>. Al confirmar, este concepto queda <strong>pendiente</strong> y deja de exportarse hasta aprobarlo de nuevo.</p>` : ''}
      ${changingHours ? `<label for="nc722Horas">Horas del concepto (horas:minutos)</label><input class="form-control" id="nc722Horas" type="text" inputmode="text" maxlength="5" value="${esc(horasCorreccion722(x.estado === 'aprobado' ? x.horas_aprobadas : r.referencia))}" placeholder="01:30"><small class="nd-small">Referencia actual: ${esc(horasCorreccion722(r.referencia) || 'Por revisar')}. La decision solo cambia al guardar.</small>` : ''}
      ${changingHours && !canApprove ? '<p class="nd-small">Revisa el turno o las marcaciones. Puedes cerrar sin cambios; rechazar y recalcular siguen disponibles en la tabla.</p>' : ''}
      ${action === 'rechazar' ? '<p>Se rechazara solamente este concepto. Los demas conceptos de la jornada no cambian.</p>' : ''}
      <label for="nc722Comentario">Comentario (opcional)</label><textarea id="nc722Comentario" class="form-control" rows="2" maxlength="2000"></textarea>
      <details class="nd-evidencia"><summary>Ver marcaciones e historial</summary>
        ${r.aviso ? `<p>${esc(r.aviso)}</p>` : ''}
        <p>Ingreso: ${esc(instant(r.evidencia?.entrada))}<br>Salida: ${esc(instant(r.evidencia?.salida))}</p>
        <p>${r.otros.map(o => `${esc(o.codigo)}: ${esc(o.estado)}${o.horas_aprobadas != null ? ' ' + esc(horasCorreccion722(o.horas_aprobadas)) : ''}`).join('<br>')}</p>
        <div class="table-responsive"><table class="table table-sm"><thead><tr><th>Fecha y hora</th><th>Punto</th><th>Huellero</th></tr></thead><tbody>${(r.evidencia?.recorrido || []).map(m => `<tr><td>${esc(instant(m.hora))}</td><td>${esc(m.punto || m.area_alias)}</td><td>${esc(m.terminal || m.terminal_alias)}</td></tr>`).join('') || '<tr><td colspan="3">Sin marcaciones disponibles en la referencia.</td></tr>'}</tbody></table></div>
        <div class="table-responsive"><table class="table table-sm"><thead><tr><th>Fecha</th><th>Usuario</th><th>Cambio</th><th>Horas</th></tr></thead><tbody>${r.historial.map(h => `<tr><td>${esc(auditDate(h.created_at))}</td><td>${esc(h.usuario)}</td><td>${esc(h.operacion || h.accion)}: ${esc(h.estado_anterior)} &rarr; ${esc(h.estado_nuevo)}</td><td>${esc(horasCorreccion722(h.horas_aprobadas_anterior) || '00:00')} &rarr; ${esc(horasCorreccion722(h.horas_aprobadas_nueva) || '00:00')}</td></tr>`).join('') || '<tr><td colspan="4">Sin cambios anteriores registrados.</td></tr>'}</tbody></table></div>
      </details><p class="nd-error" role="alert"></p>
      <footer><button type="button" data-cancel class="btn btn-outline-secondary">Cerrar sin cambios</button><button type="submit" class="btn ${action === 'rechazar' ? 'btn-outline-danger' : 'btn-primary'}" ${changingHours && !canApprove ? 'disabled' : ''}>${action === 'rechazar' ? 'Confirmar rechazo' : action === 'recalcular' ? 'Recalcular y dejar pendiente' : 'Guardar horas aprobadas'}</button></footer>
    </form>`;
    body.querySelector('[data-cancel]').onclick = () => close();
    body.querySelector('#nc722Opcion')?.addEventListener('change', event => load(event.target.value || null));
    body.querySelector('form').onsubmit = save;
  }
  async function save(event) {
    event.preventDefault(); if (busy || !context || !canWrite()) return;
    const body = dialog.querySelector('[data-body]'), alert = body.querySelector('[role="alert"]');
    let hours = null;
    try {
      if (action === 'revisar') hours = Math.round(minutosDecisionNomina(body.querySelector('#nc722Horas').value) / 60 * 100) / 100;
    } catch (error) {alert.textContent = error.message; return;}
    const comment = body.querySelector('#nc722Comentario').value.trim(), r = context, requestId = ticket, previous = current;
    const operation = action === 'revisar' ? 'ajustar' : action;
    busy = true; onBusy(true);
    dialog.querySelectorAll('button,input,select,textarea').forEach(el => {el.disabled = true;});
    try {
      const result = await call('corregir_concepto_nomina_v722', {p_revision_id:r.revision.id,p_accion:operation,p_version:r.revision.updated_at,p_huella:r.huella,p_horas:hours,p_comentario:comment || null,p_opcion:r.horario?.key || null}, false);
      if (requestId !== ticket) return;
      const f = result.revision, expected = operation === 'rechazar' ? 'rechazado' : operation === 'recalcular' ? 'pendiente' : 'aprobado';
      if (!f || f.id !== r.revision.id || f.cedula !== r.revision.cedula || f.fecha !== r.revision.fecha || f.concepto_codigo !== r.revision.concepto_codigo || f.estado !== expected || !result.historial_id) throw new Error('No se confirmo la correccion esperada. Actualiza antes de reintentar.');
      await onSaved(f, previous, operation); busy = false; close();
    } catch (error) {
      if (requestId === ticket) {context = null; alert.textContent = 'No se repetira la operacion automaticamente. ' + (error.message || error); onError(error);}
    } finally {
      busy = false; onBusy(false);
      dialog.querySelector('[data-close]').disabled = false;
    }
  }
  return {cerrar: () => close(true), async mostrar(x, requestedAction = 'revisar') {
    if (busy || !canWrite() || !x) return;
    ensure(); current = x; action = ['revisar', 'rechazar', 'recalcular'].includes(requestedAction) ? requestedAction : 'revisar';
    focus = document.activeElement; dialog.querySelector('[data-close]').disabled = false;
    if (!dialog.open) dialog.showModal(); await load();
  }};
}
