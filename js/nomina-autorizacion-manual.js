import { textoAlimentacion742 } from './nomina-ajustes-pago.js?v=746';
import { referenciaEspecial723 } from './nomina-descanso-especial.js?v=727';
import { textoHoras728, textoMinutos728, leerMinutos728, enlazarTiempo728 } from './tiempo-aprobacion.js?v=728';
const text = v => String(v ?? '').trim();
const esc = v => text(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// 7.29 extends the administrator-only manual path. Automatic payroll engines,
// attendance, schedules and the independent concepts of the day are unchanged.
export function crearAutorizacionManual728({rpc, canWrite, canManual, onBusy, onSaved, onError, modelo = () => null}) {
  let dialog, current, preview, busy = false, serial = 0, selectionSerial = 0, selecting = false, focus;
  // 7.50: adding is independent from reclassification; never save the source implicitly.
  let returnDraft = null;
  const close = (force = false) => {
    if (busy && !force) return;
    serial++; selectionSerial++; selecting = false; preview = null; returnDraft = null; dialog?.close(); dialog?.querySelector('[data-body]')?.replaceChildren();
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
  async function mostrar(x, keepDraft = false) {
    if (!x || busy || !canWrite() || !canManual(x)) return;
    if (!keepDraft) returnDraft = null;
    ensure(); current = x; preview = null;
    if (!dialog.open) focus = document.activeElement;
    const alta = x._nuevoConcepto743 === true, incompleta = x._jornadaIncompleta761 === true; selecting = false;
    dialog.querySelector('#nm728Titulo').textContent = incompleta ? 'Autorizar con marcación incompleta' : alta ? 'Añadir y aprobar concepto' : 'Aprobar concepto';
    const id = ++serial; dialog.querySelector('[data-close]').disabled = false;
    const body = dialog.querySelector('[data-body]'); body.innerHTML = '<p role="status">Consultando el concepto y sus marcaciones...</p>';
    if (!dialog.open) dialog.showModal();
    try {
      const r = await call('previsualizar_concepto_nomina_v729', {p_cedula:x.cedula,p_fecha:text(x.fecha).slice(0,10),p_concepto_origen:x.concepto_codigo}, true);
      if (id !== serial || !dialog.open) return;
      if (r?.version !== '729' || r.cedula !== x.cedula || r.fecha !== text(x.fecha).slice(0,10) ||
          r.concepto_codigo !== x.concepto_codigo || r.concepto_origen !== x.concepto_codigo ||
          !r.puede_aprobar_manual || !r.huella || !Array.isArray(r.marcaciones) || !Array.isArray(r.otros) ||
          !Array.isArray(r.conceptos_disponibles) || !r.conceptos_disponibles.length ||
          !r.conceptos_disponibles.every(c => typeof c.codigo === 'string' && typeof c.nombre === 'string') ||
          !r.conceptos_disponibles.some(c => c.codigo === r.concepto_origen))
        throw new Error('No se recibio el concepto completo. Actualiza antes de aprobar.');
      preview = r;
      const exact = r.revision?.detalle?.aprobacion_manual_728?.minutos_netos_autorizados;
      const approvedInitial = Number.isInteger(exact) && Math.abs(Number(r.revision?.horas_aprobadas) - exact / 60) < 0.006
        ? textoMinutos728(exact) : textoHoras728(r.revision?.horas_aprobadas);
      const m = modelo(x), special = referenciaEspecial723(x, m);
      const initial = alta ? '' : x._tiempoInicial729 ?? (r.revision?.estado === 'aprobado' ? approvedInitial : special ? textoMinutos728(special.neto) : '');
      const choices = r.conceptos_disponibles.map(c => {
        const existing = (alta || c.codigo !== r.concepto_origen) && r.otros.find(o => o.codigo === c.codigo);
        const retained = alta && c.codigo === x._conceptoConservar750;
        return `<option value="${esc(c.codigo)}" ${!alta && c.codigo === r.concepto_origen ? 'selected' : ''} ${existing || retained ? 'disabled' : ''}>${esc(c.codigo)} — ${esc(c.nombre)}${existing ? ' (ya registrado: ' + esc(existing.estado) + ')' : retained ? ' (concepto actual; se conserva)' : ''}</option>`;
      }).join('');
      body.innerHTML = `<form novalidate><h3>${esc(r.empleado)}</h3><p>${esc(r.fecha)}${alta ? '' : ` &middot; <strong data-original>${esc(r.concepto_origen)} ${esc(r.concepto_nombre)}</strong>`}</p>
        ${incompleta ? '<div class="alert alert-warning py-2 small" role="note"><strong>Marcación incompleta.</strong> Esta autorización no crea una entrada ni una salida falsa. El responsable debe seleccionar únicamente el concepto y el tiempo que realmente autoriza; el usuario aprobador, los minutos y las marcaciones recibidas quedan en auditoría.</div>' : alta ? '<p class="nd-small" role="note">Se añade un concepto independiente para esta persona y fecha. El concepto anterior conserva su estado; no se aprueba ni se rechaza al abrir esta opción.</p>' : ''}
        <label for="nm729Concepto">${alta ? 'Concepto a autorizar' : 'Concepto a aprobar'}</label><select id="nm729Concepto" class="form-select" aria-describedby="nm729Cambio">${alta ? '<option value="" selected>Selecciona el concepto</option>' : ''}${choices}</select>
        <p id="nm729Cambio" class="nd-small" aria-live="polite">Autorizacion del responsable. No necesitas seleccionar un turno.</p>
        ${m ? `<p class="nd-small" data-alimentacion>${esc(textoAlimentacion742(m))}</p>` : ''}
        <label for="nm728Horas">Tiempo NETO de este concepto (alimentacion ya descontada)</label><input id="nm728Horas" class="form-control" type="text" inputmode="text" maxlength="30" placeholder="1 h 26 min" value="${esc(initial)}" autocomplete="off" required>
        <strong id="nm728Tiempo" class="nd-small" aria-live="polite"></strong>
        <label for="nm728Comentario">Comentario ${incompleta ? '(obligatorio)' : '(opcional)'}</label><textarea id="nm728Comentario" class="form-control" maxlength="2000" rows="2">${esc(x._comentarioInicial729 ?? '')}</textarea>
        <details class="nd-evidencia"><summary>Ver marcaciones y otros conceptos</summary><p class="nd-small">Las horas ingresadas son netas; no se vuelve a descontar la alimentacion. Se conservan los registros originales, incluidos los dias contiguos como contexto, sin asignarlos automaticamente a esta jornada. Un concepto ya registrado se revisa desde su propia fila y no se sobrescribe al cambiar otro.</p>
        <p>${r.otros.map(o => `${esc(o.codigo)}: ${esc(o.estado)}${o.horas_aprobadas != null ? ' ' + esc(textoHoras728(o.horas_aprobadas)) : ''}`).join('<br>')}</p>
        <div class="table-responsive"><table class="table table-sm"><thead><tr><th>Fecha y hora original</th><th>Punto</th><th>Huellero</th></tr></thead><tbody>${r.marcaciones.map(m => `<tr><td>${esc(text(m.hora).replace('T',' '))}</td><td>${esc(m.punto)}</td><td>${esc(m.terminal)}</td></tr>`).join('') || '<tr><td colspan="3">Sin marcaciones recibidas en este contexto. No se crearan marcaciones.</td></tr>'}</tbody></table></div></details>
        <p class="nd-error" role="alert"></p><footer class="flex-wrap">
          ${!alta ? '<button class="btn btn-outline-primary" type="button" data-add-concept>Añadir otro concepto</button>' : returnDraft ? '<button class="btn btn-outline-secondary" type="button" data-back-concept>Volver al concepto anterior</button>' : ''}
          <button class="btn btn-success" type="submit" ${alta ? 'disabled' : ''}>${incompleta ? 'Autorizar este concepto' : alta ? 'Añadir y aprobar este concepto' : 'Aprobar este concepto'}</button></footer></form>`;
      enlazarTiempo728(body.querySelector('#nm728Horas'), body.querySelector('#nm728Tiempo'));
      body.querySelector('#nm728Horas').addEventListener('input', () => {body.querySelector('[role="alert"]').textContent = '';});
      const changeConcept = async () => {
        const destination = body.querySelector('#nm729Concepto').value;
        if (alta) {
          const selection = ++selectionSerial;
          preview = null; selecting = true;
          body.querySelector('[type="submit"]').disabled = true;
          body.querySelector('[role="alert"]').textContent = '';
          body.querySelector('#nm729Cambio').textContent = 'Comprobando el concepto seleccionado...';
          try {
            if (!destination) {body.querySelector('#nm729Cambio').textContent='Selecciona el concepto que vas a autorizar.'; return;}
            if (destination === x._conceptoConservar750) throw new Error('El concepto anterior se conserva. Selecciona otro tipo de concepto.');
            const next = await call('previsualizar_concepto_nomina_v729', {p_cedula:x.cedula,p_fecha:text(x.fecha).slice(0,10),p_concepto_origen:destination}, true);
            if (selection !== selectionSerial || id !== serial || !dialog.open) return;
            if (next?.version !== '729' || next.cedula !== x.cedula || next.fecha !== r.fecha || next.concepto_origen !== destination || !next.huella || !next.puede_aprobar_manual || !Array.isArray(next.otros) || !Array.isArray(next.conceptos_disponibles) || !next.conceptos_disponibles.some(c=>c.codigo===destination)) throw new Error('No se recibio la validacion completa.');
            if (next.revision || next.otros.some(o=>o.codigo===destination)) throw new Error('Ese concepto ya existe. Revisalo desde su propia fila; no se sobrescribe.');
            preview = next;
            body.querySelector('#nm729Cambio').textContent = 'Se agrega unicamente este concepto. No se rechazan ni modifican los demas.';
            body.querySelector('[type="submit"]').disabled = false;
          } catch(e) {
            if (selection === selectionSerial && id === serial) {preview=null;body.querySelector('[role="alert"]').textContent=e.message||String(e);}
          } finally {if(selection===selectionSerial)selecting=false;}
          return;
        }
        const changing = destination !== r.concepto_origen;
        body.querySelector('#nm729Cambio').textContent = changing
          ? `Al aprobar, ${r.concepto_origen} quedara rechazado y ${destination} aprobado con el tiempo indicado. Los demas conceptos no cambian.`
          : 'Autorizacion del responsable. No necesitas seleccionar un turno.';
        body.querySelector('[type="submit"]').textContent = changing ? 'Cambiar concepto y aprobar' : 'Aprobar este concepto';
        body.querySelector('[role="alert"]').textContent = '';
      };
      body.querySelector('#nm729Concepto').addEventListener('change', changeConcept);
      // Restore an unsaved draft only when returning explicitly, never on a new addition.
      if (!alta && x._conceptoInicial750 && r.conceptos_disponibles.some(c => c.codigo === x._conceptoInicial750) &&
          (x._conceptoInicial750 === r.concepto_origen || !r.otros.some(o => o.codigo === x._conceptoInicial750))) {
        body.querySelector('#nm729Concepto').value = x._conceptoInicial750;
        await changeConcept();
      }
      body.querySelector('[data-add-concept]')?.addEventListener('click', async () => {
        if (busy || selecting || !canWrite() || !canManual(current)) return;
        returnDraft = {...x, _tiempoInicial729: body.querySelector('#nm728Horas').value,
          _comentarioInicial729: body.querySelector('#nm728Comentario').value,
          _conceptoInicial750: body.querySelector('#nm729Concepto').value};
        await mostrar({...x, _nuevoConcepto743: true, _conceptoConservar750: r.concepto_origen,
          _tiempoInicial729: undefined, _comentarioInicial729: undefined, _conceptoInicial750: undefined}, true);
      });
      body.querySelector('[data-back-concept]')?.addEventListener('click', async () => {
        if (busy || !returnDraft || !canWrite() || !canManual(returnDraft)) return;
        await mostrar(returnDraft);
      });
      body.querySelector('form').onsubmit = save;
    } catch(e) {
      if (id === serial) body.innerHTML = `<p role="alert" class="nd-error">${esc(e.message || e)}</p>`;
    }
  }
  async function save(event) {
    event.preventDefault(); if (busy || selecting || !preview || !canWrite() || !canManual(current)) return;
    const body = dialog.querySelector('[data-body]'), error = body.querySelector('[role="alert"]'), r = preview;
    const destination = body.querySelector('#nm729Concepto').value;
    if (current._nuevoConcepto743 && (destination === current._conceptoConservar750 || destination !== r.concepto_origen || r.revision || r.otros.some(o=>o.codigo===destination))) {error.textContent='Selecciona un concepto nuevo y espera su validacion.';return;}
    if (!r.conceptos_disponibles.some(c => c.codigo === destination) ||
        destination !== r.concepto_origen && r.otros.some(o => o.codigo === destination)) {
      error.textContent = 'Elige un concepto disponible. Los ya registrados se revisan desde su propia fila.'; return;
    }
    let minutes; try {minutes = leerMinutos728(body.querySelector('#nm728Horas').value);} catch(e) {error.textContent = e.message; return;}
    const x = current, id = serial, comment = body.querySelector('#nm728Comentario').value.trim();
    if (current._jornadaIncompleta761 && !comment) {error.textContent = 'Indica por qué el responsable autoriza esta jornada con marcación incompleta.'; return;}
    if (comment.length > 2000) {error.textContent = 'El comentario puede tener hasta 2000 caracteres.'; return;}
    busy = true; onBusy(true); dialog.querySelectorAll('button,input,select,textarea').forEach(e => {e.disabled = true;});
    try {
      const result = await call('aprobar_concepto_nomina_v729', {
        p_cedula:r.cedula,p_fecha:r.fecha,p_concepto_origen:r.concepto_origen,p_concepto_destino:destination,
        p_minutos:minutes,p_huella:r.huella,p_comentario:comment || null
      }, false);
      if (id !== serial || !dialog.open) return;
      const saved = result.revision, changing = destination !== r.concepto_origen, affected = result.revisiones_afectadas;
      if (result?.version !== '729' || result.reclasificado !== changing || !saved?.id ||
          saved.cedula !== r.cedula || saved.fecha !== r.fecha || saved.concepto_codigo !== destination ||
          saved.estado !== 'aprobado' || !result.historial_id ||
          saved.detalle?.aprobacion_manual_728?.minutos_netos_autorizados !== minutes ||
          !Array.isArray(affected) || affected.length !== (changing ? 2 : 1) ||
          !affected.every(f => f.id && f.cedula === r.cedula && f.fecha === r.fecha) ||
          !affected.some(f => f.id === saved.id && f.estado === 'aprobado' && f.concepto_codigo === destination) ||
          changing && (!result.reclasificacion_id || !affected.some(f =>
            f.concepto_codigo === r.concepto_origen && f.estado === 'rechazado' && Number(f.horas_aprobadas) === 0 &&
            (!r.revision?.id || f.id === r.revision.id))))
        throw new Error('El servidor no confirmo el concepto y el tiempo solicitado. Actualiza antes de reintentar.');
      // Rebuild the table only after releasing its shared busy state (same order as 7.49).
      onBusy(false);
      await onSaved(saved, x, changing ? 'reclasificar' : 'aprobar', affected);
      busy = false; close();
    } catch(e) {
      if (id === serial) {preview = null; error.textContent = 'No se repetira la operacion automaticamente. ' + (e.message || e); onError(e);}
    } finally {
      busy = false; onBusy(false); dialog.querySelector('[data-close]').disabled = false;
    }
  }
  return {mostrar, cerrar: () => close(true)};
}
