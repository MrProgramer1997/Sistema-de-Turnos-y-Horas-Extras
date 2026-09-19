// Independent append-only notes. Never updates a concept, its hours, or its decision.
const texto = v => String(v ?? '').trim();
const esc = v => texto(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function validarComentarioNomina(valor) {
  const comentario = texto(valor);
  if (!comentario) throw new Error('Escribe un comentario para guardarlo o pulsa Cerrar.');
  if ([...comentario].length > 2000) throw new Error('El comentario admite hasta 2000 caracteres.');
  return comentario;
}
function fechaNota(v) {
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota', dateStyle: 'short', timeStyle: 'short'
  }).format(d) : '';
}
export function crearVisorComentariosNomina({ rpc, canWrite = () => false, onSaved = () => {}, onError = () => {}, onBusy = () => {} }) {
  let dialogo = null, version = 0, ocupado = false, bloqueado = false, foco = null;
  function cerrar(forzar = true) {
    if (ocupado && !forzar) return;
    version++;
    dialogo?.close();
    dialogo?.replaceChildren();
    if (ocupado) { ocupado = false; onBusy(false); }
    bloqueado = false;
    foco?.focus?.();
  }
  async function llamada(nombre, args) {
    const r = await rpc(nombre, args);
    if (r?.error) throw r.error;
    return r?.data ?? r;
  }
  async function mostrar(x) {
    if (!canWrite() || dialogo?.open || ocupado) return;
    const id = texto(x.revision_id || x.id);
    if (!id) return;
    if (!dialogo) {
      dialogo = document.createElement('dialog');
      dialogo.className = 'nd-dialog nd-comentarios';
      dialogo.setAttribute('aria-labelledby', 'ndNotasTitulo');
      dialogo.addEventListener('cancel', e => { e.preventDefault(); cerrar(false); });
      document.body.appendChild(dialogo);
    }
    const actual = ++version;
    let notas = [], total = 0;
    ocupado = false; bloqueado = true; foco = document.activeElement;
    dialogo.innerHTML = `<form novalidate>
      <header><h2 id="ndNotasTitulo">Comentarios del concepto</h2><button type="button" class="btn btn-outline-secondary btn-sm" data-nota-cerrar>Cerrar</button></header>
      <div class="nd-dialog-body">
        <h3>${esc(x.empleado || x.cedula)}</h3>
        <p>${esc(texto(x.fecha).slice(0, 10))} &middot; <strong>${esc(x.concepto_codigo)}</strong> ${esc(x.concepto_nombre)}</p>
        <p class="nd-aclaracion">Comentar no aprueba, rechaza ni cambia las horas. Puedes dejar notas incluso en conceptos ya aprobados o rechazados.</p>
        ${texto(x.observacion) ? `<section class="nd-nota"><small>Comentario registrado con la decisi\u00f3n</small><p>${esc(x.observacion)}</p></section>` : ''}
        <label for="ndNotaTexto">Nuevo comentario (opcional)</label>
        <textarea id="ndNotaTexto" class="form-control" rows="3" maxlength="2000" placeholder="Escribe solo si deseas agregar una nota"></textarea>
        <p class="nd-aclaracion">Los comentarios no son obligatorios para aprobar o rechazar.</p>
        <p data-nota-resultado role="status" aria-live="polite">Consultando comentarios...</p>
        <section class="nd-notas-historial" aria-label="Historial de comentarios"><h3 data-nota-total>Historial</h3><div data-nota-lista></div></section>
      </div>
      <footer><button type="button" class="btn btn-outline-secondary" data-nota-cerrar>Cerrar</button><button type="submit" class="btn btn-primary" data-nota-guardar disabled>Guardar comentario</button></footer>
    </form>`;
    const form = dialogo.querySelector('form'), input = dialogo.querySelector('#ndNotaTexto');
    const boton = dialogo.querySelector('[data-nota-guardar]'), status = dialogo.querySelector('[data-nota-resultado]');
    const vigente = () => actual === version && dialogo.open;
    function habilitar() {
      boton.disabled = ocupado || bloqueado || !canWrite() || !texto(input.value);
      input.disabled = ocupado;
      dialogo.querySelectorAll('[data-nota-cerrar]').forEach(b => { b.disabled = ocupado; });
    }
    function renderNotas() {
      dialogo.querySelector('[data-nota-total]').textContent = total > 50 ? `Historial: ultimos 50 de ${total} comentarios` : `Historial (${total})`;
      dialogo.querySelector('[data-nota-lista]').innerHTML = notas.length ? notas.map(n =>
        `<article class="nd-nota"><small>${esc(n.usuario)} &middot; ${esc(fechaNota(n.creado_at))}</small><p>${esc(n.comentario)}</p></article>`
      ).join('') : '<p class="nd-aclaracion">No hay comentarios adicionales.</p>';
    }
    dialogo.querySelectorAll('[data-nota-cerrar]').forEach(b => b.addEventListener('click', () => cerrar(false)));
    input.addEventListener('input', habilitar);
    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (ocupado || bloqueado || !canWrite() || !vigente()) return;
      let comentario;
      try { comentario = validarComentarioNomina(input.value); }
      catch (err) { status.className = 'nd-error'; status.textContent = err.message; return; }
      ocupado = true; onBusy(true); habilitar();
      status.className = ''; status.textContent = 'Guardando comentario...';
      try {
        const r = await llamada('guardar_comentario_nomina_v715', { p_revision_id: id, p_comentario: comentario });
        if (!vigente()) return;
        if (r?.revision_id !== id || r.sin_cambiar_decision !== true || !r.comentario?.id || r.comentario.comentario !== comentario)
          throw new Error('El servidor no confirmo el comentario guardado.');
        notas = [r.comentario, ...notas].slice(0, 50); total++;
        input.value = ''; renderNotas();
        status.textContent = 'Comentario guardado. Las horas y la decision no cambiaron.';
        onSaved(r.comentario);
      } catch (err) {
        if (!vigente()) return;
        bloqueado = true;
        status.className = 'nd-error';
        status.textContent = `No se confirmo el guardado: ${err.message || err}. Cierra y consulta el historial antes de volver a guardar. No se repite automaticamente.`;
        onError(err);
      } finally {
        if (actual === version) { ocupado = false; onBusy(false); habilitar(); }
      }
    });
    dialogo.showModal(); dialogo.querySelector('[data-nota-cerrar]').focus();
    try {
      const r = await llamada('consultar_comentarios_nomina_v715', { p_revision_id: id });
      if (!vigente()) return;
      if (r?.revision_id !== id || !Array.isArray(r.comentarios) || !Number.isInteger(r.total) || r.total < r.comentarios.length)
        throw new Error('No se recibio un historial valido.');
      notas = r.comentarios; total = r.total; bloqueado = false;
      renderNotas(); status.textContent = ''; habilitar();
    } catch (err) {
      if (!vigente()) return;
      bloqueado = true; status.className = 'nd-error';
      status.textContent = `No se pudo consultar el historial: ${err.message || err}. Cierra y vuelve a consultar.`;
      habilitar(); onError(err);
    }
  }
  return { mostrar, cerrar };
}
