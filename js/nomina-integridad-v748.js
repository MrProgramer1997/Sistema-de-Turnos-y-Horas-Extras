/* Fase 7.48. Protege rechazos frente a estado local desactualizado. */
const CLOSED_STATES = new Set(['aprobado', 'rechazado']);
const text = value => String(value ?? '').trim();
const lower = value => text(value).toLowerCase();

export function esEstadoCerradoV748(value) {
  return CLOSED_STATES.has(lower(value));
}

export function esConflictoCerradoV748(error) {
  const message = `${text(error?.message)} ${text(error?.details)} ${text(error?.hint)}`.toLowerCase();
  return error?.code === 'P0001'
    && /(revision|decisi[oó]n).*(cerrad|aprob|rechaz)|ya esta cerrada/.test(message);
}

export function rutaRechazoV748(estadoLocal, estadoServidor) {
  if (esEstadoCerradoV748(estadoLocal) || esEstadoCerradoV748(estadoServidor)) return 'revisar';
  if (['pendiente', 'observado'].includes(lower(estadoServidor))) return 'rechazar';
  return 'actualizar';
}

export function idRevisionDesdeBotonV748(button) {
  if (!button) return '';
  if (button.dataset.action === 'rechazar') return text(button.dataset.id);
  if (button.dataset.ndAction === 'rechazar') {
    return text(button.closest('[data-nd-row]')?.querySelector('[data-nd-concepto]')?.value);
  }
  return '';
}

function estadoLocalDesdeBoton(button) {
  if (button.dataset.action === 'rechazar') {
    const row = button.closest('tr');
    return row?.querySelector('button[data-action="revisar"],button[data-action="recalcular"]')
      ? 'cerrado'
      : '';
  }
  const select = button.closest('[data-nd-row]')?.querySelector('[data-nd-concepto]');
  return text(select?.dataset.estadoConcepto);
}

function report(documentRef, message, type = 'warning') {
  const target = documentRef.getElementById('heEstadoCarga')
    || documentRef.getElementById('heEstadoResumen');
  if (!target) return;
  if (target.id === 'heEstadoCarga') target.className = `alert alert-${type} py-2 small`;
  else target.className = `nd-estado ${type === 'danger' ? 'danger' : type === 'success' ? 'success' : 'warning'}`;
  target.textContent = message;
}

function refreshWhenAvailable(documentRef, attempt = 0) {
  const update = documentRef.getElementById('heActualizar');
  if (update && !update.disabled) {
    update.click();
    return;
  }
  if (attempt < 40) setTimeout(() => refreshWhenAvailable(documentRef, attempt + 1), 150);
}

function repeatClick(button, attribute, action) {
  const previous = button.getAttribute(attribute);
  button.dataset.v748Bypass = '1';
  button.setAttribute(attribute, action);
  button.disabled = false;
  button.click();
  queueMicrotask(() => {
    if (previous === null) button.removeAttribute(attribute);
    else button.setAttribute(attribute, previous);
  });
}

export function instalarNominaIntegridadV748(supabase, documentRef = globalThis.document) {
  if (!supabase || !documentRef || globalThis.__nominaIntegridadV748) return false;
  globalThis.__nominaIntegridadV748 = true;

  documentRef.addEventListener('click', async event => {
    const button = event.target?.closest?.(
      'button[data-action="rechazar"],button[data-nd-action="rechazar"]'
    );
    if (!button) return;
    if (button.dataset.v748Bypass === '1') {
      delete button.dataset.v748Bypass;
      return;
    }
    if (button.disabled) return;

    const revisionId = idRevisionDesdeBotonV748(button);
    if (!revisionId) return;
    const localState = estadoLocalDesdeBoton(button);
    if (esEstadoCerradoV748(localState) || localState === 'cerrado') return;

    event.preventDefault();
    event.stopImmediatePropagation();
    button.disabled = true;
    report(documentRef, 'Verificando el estado actual antes de rechazar...');

    try {
      const { data, error } = await supabase
        .from('turnos_conceptos_revision')
        .select('id,estado,updated_at')
        .eq('id', revisionId)
        .single();
      if (error) throw error;

      const route = rutaRechazoV748(localState, data?.estado);
      const attribute = button.dataset.ndAction !== undefined ? 'data-nd-action' : 'data-action';
      if (route === 'revisar') {
        const dailyView = button.dataset.ndAction !== undefined;
        report(
          documentRef,
          dailyView
            ? `El concepto ya esta ${lower(data?.estado) || 'cerrado'} en servidor. Se actualizara la bandeja para mostrar la correccion disponible.`
            : `El concepto ya esta ${lower(data?.estado) || 'cerrado'} en servidor. Se abre la correccion auditada.`,
          'warning'
        );
        if (dailyView) {
          button.disabled = false;
          refreshWhenAvailable(documentRef);
        } else {
          repeatClick(button, attribute, 'revisar');
        }
        return;
      }
      if (route === 'rechazar') {
        repeatClick(button, attribute, 'rechazar');
        return;
      }

      report(documentRef, 'El estado cambio y no es seguro rechazarlo. Se actualizara la bandeja.', 'warning');
      button.disabled = false;
      refreshWhenAvailable(documentRef);
    } catch (error) {
      console.error('Validacion previa de rechazo v7.48:', error);
      report(
        documentRef,
        'No se pudo verificar el estado antes del rechazo. No se envio la decision; se actualizara la bandeja.',
        'warning'
      );
      button.disabled = false;
      refreshWhenAvailable(documentRef);
    }
  }, true);

  let refreshScheduled = false;
  const watchClosedConflict = target => {
    if (!target || typeof MutationObserver === 'undefined') return;
    new MutationObserver(() => {
      const message = text(target.textContent);
      if (refreshScheduled || !/(revision|decision).*cerrad|ya esta cerrada/i.test(message)) return;
      refreshScheduled = true;
      report(
        documentRef,
        'La decision ya habia cambiado en servidor. Se actualizara la bandeja sin repetir la operacion.',
        'warning'
      );
      setTimeout(() => {
        refreshWhenAvailable(documentRef);
        refreshScheduled = false;
      }, 0);
    }).observe(target, { childList: true, characterData: true, subtree: true });
  };
  watchClosedConflict(documentRef.getElementById('heEstadoCarga'));
  watchClosedConflict(documentRef.getElementById('heEstadoResumen'));

  return true;
}
