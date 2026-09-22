import { textoHoras728, leerMinutos728, enlazarTiempo728 } from './tiempo-aprobacion.js?v=728';
const text = v => String(v ?? '').trim();
const esc = v => text(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Administrative exception only. The server independently verifies the current
// user, module, unchanged evidence and exact target. No marks are manufactured.
export function crearAutorizacionManual728({rpc, canWrite, canManual, onBusy, onSaved, onError}) {
  let dialog, current, preview, busy = false, serial = 0, focus;
  const close = (force = false) => {
    if (busy && !force) return;
    serial++; preview = null; dialog?.close(); dialog?.querySelector('[data-body]')?.replaceChildren();
    if (busy) {busy = false; onBusy(false);} focus?.focus?.();
  };
  async function call(name, args, read) {
    const r = await rpc(name, args, {read}); if (r?.error) throw r.error; return r?.data ?? r;
  }
  function ensure() {
    if (dialog) return;
    dialog = document.createElement('dialog'); dialog.className = 'nd-dialog'; dialog.setAttribute('aria-labelledby', 'nm728Titulo');
    dialog.innerHTML = '<header><h2 id="nm728Titulo">Aprobar concepto</h2><button class="btn btn-outline-secondary btn-sm" type="button" data-close>Cerrar</button></header><div class="nd-dialog-body" data-body></div>';
    dialog.querySelector('[data-close]').onclick = () => close();
    dialog.addEventListener('cancel', e => {e.preventDefault(); close();}); document.body.appendChild(dialog);
  }
  async function mostrar(x) {
    if (busy || !canWrite() || !canManual()) return;
    ensure(); current = x; preview = null; focus = document.activeElement;
    const id = ++serial; dialog.querySelector('[data-close]').disabled = false;
    const body = dialog.querySelector('[data-body]'); body.innerHTML = '<p role="status">Consultando el concepto y sus marcaciones...</p>';
    if (!dialog.open) dialog.showModal();
    try {
      const r = await call('previsualizar_manual_nomina_v728', {p_cedula:x.cedula,p_fecha:text(x.fecha).slice(0,10),p_concepto:x.concepto_codigo}, true);
      if (id !== serial || !dialog.open) return;
      if (r?.version !== '728' || r.cedula !== x.cedula || r.fecha !== text(x.fecha).slice(0,10) || r.concepto_codigo !== x.concepto_codigo || !r.puede_aprobar_manual || !r.huella || !Array.isArray(r.marcaciones) || !Array.isArray(r.otros)) throw new Error('No se recibio el concepto completo. Actualiza antes de aprobar.');
      preview = r;
      const initial = r.revision?.estado === 'aprobado' ? textoHoras728(r.revision.horas_aprobadas) : '';
      body.innerHTML = `<form novalidate><h3>${esc(r.empleado)}</h3><p>${esc(r.fecha)} &middot; <strong>${esc(r.concepto_codigo)} ${esc(r.concepto_nombre)}</strong></p>
        <p class="nd-small">Autorizacion manual del administrador. No necesitas seleccionar un turno.</p>
        <label for="nm728Horas">Tiempo NETO de este concepto</label><input id="nm728Horas" class="form-control" type="text" inputmode="text" maxlength="30" placeholder="1 h 26 min" value="${esc(initial)}" autocomplete="off" required>
        <strong id="nm728Tiempo" class="nd-small" aria-live="polite"></strong>
        <label for="nm728Comentario">Comentario (opcional)</label><textarea id="nm728Comentario" class="form-control" maxlength="2000" rows="2"></textarea>
        <details class="nd-evidencia"><summary>Ver marcaciones y otros conceptos</summary><p class="nd-small">Las horas ingresadas son netas; no se vuelve a descontar la alimentacion. Se conservan los registros originales, incluidos los dias contiguos como contexto, sin asignarlos automaticamente a esta jornada.</p>
        <p>${r.otros.map(o => `${esc(o.codigo)}: ${esc(o.estado)}${o.horas_aprobadas != null ? ' ' + esc(textoHoras728(o.horas_aprobadas)) : ''}`).join('<br>')}</p>
        <div class="table-responsive"><table class="table table-sm"><thead><tr><th>Fecha y hora original</th><th>Punto</th><th>Huellero</th></tr></thead><tbody>${r.marcaciones.map(m => `<tr><td>${esc(text(m.hora).replace('T',' '))}</td><td>${esc(m.punto)}</td><td>${esc(m.terminal)}</td></tr>`).join('') || '<tr><td colspan="3">Sin marcaciones recibidas en este contexto. No se crearan marcaciones.</td></tr>'}</tbody></table></div></details>
        <p class="nd-error" role="alert"></p><footer><button class="btn btn-success" type="submit">Aprobar este concepto</button></footer></form>`;
      enlazarTiempo728(body.querySelector('#nm728Horas'), body.querySelector('#nm728Tiempo'));
      body.querySelector('#nm728Horas').addEventListener('input', () => { body.querySelector('[role="alert"]').textContent = ''; });
      body.querySelector('form').onsubmit = save;
    } catch (e) {if (id === serial) body.innerHTML = `<p role="alert" class="nd-error">${esc(e.message || e)}</p>`;}
  }
  async function save(event) {
    event.preventDefault(); if (busy || !preview || !canWrite() || !canManual()) return;
    const body = dialog.querySelector('[data-body]'), error = body.querySelector('[role="alert"]');
    let minutes; try {minutes = leerMinutos728(body.querySelector('#nm728Horas').value);} catch(e) {error.textContent = e.message; return;}
    const r = preview, x = current, id = serial, comment = body.querySelector('#nm728Comentario').value.trim();
    busy = true; onBusy(true); dialog.querySelectorAll('button,input,textarea').forEach(e => e.disabled = true);
    try {
      const result = await call('aprobar_manual_nomina_v728', {p_cedula:r.cedula,p_fecha:r.fecha,p_concepto:r.concepto_codigo,p_minutos:minutes,p_huella:r.huella,p_comentario:comment || null}, false);
      if (id !== serial || !dialog.open) return;
      const saved = result.revision;
      if (!saved?.id || saved.cedula !== r.cedula || saved.fecha !== r.fecha || saved.concepto_codigo !== r.concepto_codigo || saved.estado !== 'aprobado' || !result.historial_id || saved.detalle?.aprobacion_manual_728?.minutos_netos_autorizados !== minutes) throw new Error('El servidor no confirmo el concepto y el tiempo solicitado. Actualiza antes de reintentar.');
      await onSaved(saved, x, 'aprobar'); busy = false; close();
    } catch(e) {
      if (id === serial) {preview = null; error.textContent = 'No se repetira la operacion automaticamente. ' + (e.message || e); onError(e);}
    } finally {busy = false; onBusy(false); dialog.querySelector('[data-close]').disabled = false;}
  }
  return {mostrar, cerrar: () => close(true)};
}
