/* Presentation layer. Uses the existing Bienestar routines; no DB/storage calls. */
(() => {
  'use strict';
  let api, rows = [], page = 1, pageSize = 12, group = 'todas', signature = '';
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm = (value) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const reviewStates = ['pendiente','pendiente_documentos','en_revision_bienestar','fuera_de_tiempo'];
  const resolvedStates = ['aprobada','rechazada','aplicada_programacion','cerrada'];
  const descriptions = {bandeja:'Solicitudes del personal que puedes gestionar.',nueva:'Radica una solicitud sin perder tu lugar en la bandeja.',historial:'Consulta las solicitudes y respuestas de una persona.'};
  const sections = {bandeja:'bwBandeja',nueva:'bwNueva',historial:'bwHistorial'};
  function text(id, value) { if ($(id)) $(id).textContent = value; }
  function fullName(e) { return e ? String(e.nombre_completo || `${e.nombres || ''} ${e.apellidos || ''}`).trim() : ''; }
  function status(item) {
    const known = ['pendiente','pendiente_documentos','en_revision_bienestar','aprobada','rechazada','fuera_de_tiempo','aplicada_programacion','cerrada'];
    return known.includes(item.estado) ? api.badge(item.estado) : `<span class="estado-badge estado-cerrada">${esc(api.formatState(item.estado) || 'Sin estado')}</span>`;
  }
  function dates(item) { return `${esc(api.formatDate(item.fecha_inicio))}<br><span class="bw-secondary">al ${esc(api.formatDate(item.fecha_fin))}</span>`; }
  function docInfo(item) {
    const required = Array.isArray(item.documentos_requeridos) ? item.documentos_requeridos.length : 0;
    const uploaded = Array.isArray(item.documentos_cargados) ? item.documentos_cargados.length : 0;
    // Keep original completeness flag: quantities alone do not validate document types.
    if (!required) return `<span class="bw-doc-ok">No exigidos</span>${uploaded ? `<div class="bw-secondary">${uploaded} adjunto(s)</div>` : ''}`;
    return `<span class="${item.documentacion_completa ? 'bw-doc-ok' : 'bw-doc-pending'}">${item.documentacion_completa ? 'Completos' : 'Por completar'}</span><div class="bw-secondary">${uploaded} adjunto(s) / ${required} requerido(s)</div>`;
  }
  function response(item) {
    if (!item.observacion_revision) return '';
    return `<div class="bw-response"><strong>Respuesta:</strong> ${esc(item.observacion_revision)}</div>`;
  }
  function actions(item) {
    const id = esc(item.id);
    return `<div class="table-actions"><button type="button" class="btn btn-sm btn-outline-primary bw-main-action" data-bw-review="${id}">Ver detalle</button><button type="button" class="btn btn-sm btn-outline-success" data-bw-review="${id}" data-bw-decision="aprobada">Aprobar</button><button type="button" class="btn btn-sm btn-outline-danger" data-bw-review="${id}" data-bw-decision="rechazada">Rechazar</button></div>`;
  }
  function openSection(name, focus = true) {
    if (!sections[name]) return;
    for (const [key,id] of Object.entries(sections)) $(id).hidden = key !== name;
    document.querySelectorAll('.bw-tab').forEach(b => {
      const active = b.dataset.bwOpen === name;
      b.classList.toggle('is-active', active);
      b.setAttribute('aria-expanded', String(active));
    });
    text('bwViewDescription', descriptions[name]);
    if (name === 'historial') renderHistory();
    if (focus) {
      const target = $(name === 'nueva' ? 'buscarEmpleado' : name === 'historial' ? 'bwHistorySearch' : 'filtroGestionBusqueda');
      target?.focus({preventScroll:true});
      document.querySelector('.bw-tabs')?.scrollIntoView({block:'start',behavior:'auto'});
    }
  }
  function setGroup(value) {
    group = value;
    document.querySelectorAll('[data-bw-group]').forEach(b => {
      b.classList.toggle('is-active', b.dataset.bwGroup === group);
      b.setAttribute('aria-pressed', String(b.dataset.bwGroup === group));
    });
    $('filtroGestionEstado').value = '';
    api.apply();
  }
  function refine(list) {
    const year = $('bwYear')?.value || '';
    const order = $('bwOrder')?.value || 'recientes';
    let out = list.slice();
    if (group === 'revision') out = out.filter(x => reviewStates.includes(x.estado));
    if (group === 'documentos') out = out.filter(x => x.estado === 'pendiente_documentos');
    if (group === 'resueltas') out = out.filter(x => resolvedStates.includes(x.estado));
    if (year) out = out.filter(x => String(x.fecha_inicio || '').slice(0,4) === year);
    out.sort((a,b) => {
      if (order === 'nombre') return norm(a.nombre_empleado).localeCompare(norm(b.nombre_empleado),'es') || String(a.id).localeCompare(String(b.id));
      const key = order === 'inicio' ? 'fecha_inicio' : 'created_at';
      const comparison = String(a[key] || '').localeCompare(String(b[key] || ''));
      return (order === 'recientes' ? -comparison : comparison) || String(a.id).localeCompare(String(b.id));
    });
    const newSignature = [group,year,order,...['filtroGestionBusqueda','filtroGestionTipo','filtroGestionEstado','filtroGestionArea'].map(id => $(id).value)].join('|');
    if (newSignature !== signature) { page = 1; signature = newSignature; }
    return out;
  }
  function renderManagement(list) {
    rows = Array.isArray(list) ? list : [];
    const pages = Math.max(1,Math.ceil(rows.length/pageSize));
    page = Math.max(1,Math.min(page,pages));
    const shown = rows.slice((page-1)*pageSize,page*pageSize);
    text('contadorGestion', `${rows.length} solicitud(es)`);
    text('bwTabCount', api.rows().length);
    text('bwReviewCount', api.rows().filter(x => reviewStates.includes(x.estado)).length);
    if (!shown.length) {
      const message = api.rows().length ? 'No hay solicitudes con estos filtros.' : 'Todav\u00eda no hay solicitudes para mostrar.';
      $('tablaGestionSolicitudes').innerHTML = `<tr><td colspan="7"><div class="bw-empty"><strong>${esc(message)}</strong>Prueba otra b\u00fasqueda o radica una nueva solicitud.</div></td></tr>`;
      $('bwMobileList').innerHTML = `<div class="bw-empty"><strong>${esc(message)}</strong>Prueba otra b\u00fasqueda o radica una nueva solicitud.</div>`;
    } else {
      $('tablaGestionSolicitudes').innerHTML = shown.map(item => `<tr data-bw-row="${esc(item.id)}"><td><strong>${esc(item.nombre_empleado || 'Sin nombre')}</strong><div class="bw-secondary">${esc(item.cedula)}</div><div class="bw-secondary">${esc(item.area || 'Sin \u00e1rea registrada')}</div></td><td>${esc(api.formatType(item.tipo_solicitud))}<div class="bw-secondary">${esc(api.formatSubtype(item.subtipo))}</div></td><td class="bw-range">${dates(item)}</td><td>${esc(item.dias_solicitados ?? 0)}</td><td>${status(item)}${response(item)}</td><td>${docInfo(item)}</td><td>${actions(item)}</td></tr>`).join('');
      $('bwMobileList').innerHTML = shown.map(item => `<article class="bw-request"><div class="bw-request-head"><div><h3>${esc(item.nombre_empleado || 'Sin nombre')}</h3><div class="bw-secondary">${esc(item.cedula)} \u00b7 ${esc(item.area || 'Sin \u00e1rea')}</div></div>${status(item)}</div><dl><dt>Solicitud</dt><dd>${esc(api.formatType(item.tipo_solicitud))}</dd><dt>Fechas</dt><dd>${dates(item)} \u00b7 ${esc(item.dias_solicitados ?? 0)} d\u00eda(s)</dd><dt>Soportes</dt><dd>${docInfo(item)}</dd></dl>${response(item)}${actions(item)}</article>`).join('');
    }
    text('bwPageInfo', rows.length ? `${(page-1)*pageSize+1}\u2013${Math.min(page*pageSize,rows.length)} de ${rows.length} solicitudes \u00b7 P\u00e1gina ${page} de ${pages}` : '0 solicitudes');
    $('bwPrevious').disabled = page <= 1;
    $('bwNext').disabled = page >= pages;
    decorateAutocomplete();
  }
  function renderHistory() {
    const e = api.employee();
    const list = e ? api.history().filter(x => String(x.cedula) === String(e.cedula)) : [];
    text('contadorMisSolicitudes', `${list.length} solicitud(es)`);
    text('bwHistoryIdentity', e ? `${fullName(e)} \u00b7 ${e.cedula || ''} \u00b7 ${e.cargo || ''}` : 'Selecciona un empleado para ver su historial.');
    if (!list.length) {
      $('tablaMisSolicitudes').innerHTML=`<tr><td colspan="6" class="bw-empty">${e ? 'Este empleado no tiene solicitudes registradas.' : 'Busca un empleado por nombre o c\u00e9dula.'}</td></tr>`;
      return;
    }
    $('tablaMisSolicitudes').innerHTML=list.map(item => `<tr><td>${esc(api.formatDate(item.fecha_radicacion))}</td><td>${esc(api.formatType(item.tipo_solicitud))}<div class="bw-secondary">${esc(api.formatSubtype(item.subtipo))}</div></td><td class="bw-range">${dates(item)}</td><td>${esc(item.dias_solicitados ?? 0)}</td><td>${status(item)}${response(item)}</td><td>${docInfo(item)}</td></tr>`).join('');
  }
  function complete() {
    const sel = $('bwYear'), previous = sel.value;
    const years = [...new Set(api.rows().map(x => String(x.fecha_inicio || '').slice(0,4)).filter(x => /^\d{4}$/.test(x)))].sort().reverse();
    sel.innerHTML='<option value="">Todos los a\u00f1os</option>'+years.map(y=>`<option value="${y}">${y}</option>`).join('');
    if (years.includes(previous)) sel.value=previous;
    text('bwLoadStatus','Actualizado '+new Date().toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'})+' \u00b7 Actualizaci\u00f3n manual');
  }
  function findEmployees(query) {
    const q=norm(query);
    if (q.length<2) return [];
    return api.employees().filter(e=>norm([fullName(e),e.cedula,e.codigo].join(' ')).includes(q)).sort((a,b)=>{
      const aExact=[a.cedula,a.codigo].some(v=>norm(v)===q), bExact=[b.cedula,b.codigo].some(v=>norm(v)===q);
      return Number(bExact)-Number(aExact) || fullName(a).localeCompare(fullName(b),'es');
    }).slice(0,8);
  }
  function historySearch() {
    const list=findEmployees($('bwHistorySearch').value);
    const box=$('bwHistorySuggestions');
    box.classList.toggle('hidden', !$('bwHistorySearch').value.trim());
    box.innerHTML=list.length ? list.map(e=>`<button type="button" class="autocomplete-item" role="option" data-bw-employee="${esc(e.id)}"><strong>${esc(fullName(e))}</strong><div class="autocomplete-meta">${esc(e.cedula)} \u00b7 ${esc(e.cargo || '')}</div></button>`).join('') : '<div class="autocomplete-item">Escribe al menos dos caracteres o prueba otra b\u00fasqueda.</div>';
  }
  function decorateAutocomplete() {
    document.querySelectorAll('#listaSugerencias .autocomplete-item').forEach(el=>{
      el.tabIndex=0;
      el.setAttribute('role','option');
    });
  }
  function init(bridge) {
    api=bridge;
    document.addEventListener('click',event=>{
      const nav=event.target.closest('[data-bw-open]');
      if(nav) openSection(nav.dataset.bwOpen);
      const filter=event.target.closest('[data-bw-group]');
      if(filter) setGroup(filter.dataset.bwGroup);
      const type=event.target.closest('[data-bw-type]');
      if(type){$('tipoSolicitud').value=type.dataset.bwType;$('tipoSolicitud').dispatchEvent(new Event('change',{bubbles:true}));$('fechaInicio').focus();}
      const action=event.target.closest('[data-bw-review]');
      if(action && api.canManage()){
        api.review(action.dataset.bwReview);
        if(action.dataset.bwDecision) $('gestionNuevoEstado').value=action.dataset.bwDecision;
      }
      const choice=event.target.closest('[data-bw-employee]');
      if(choice){
        const e=api.employees().find(e=>e.id===choice.dataset.bwEmployee);
        if(e){
          // Clear the previous person's history while the existing query runs.
          $('tablaMisSolicitudes').innerHTML='<tr><td colspan="6" class="bw-empty">Consultando historial...</td></tr>';
          api.selectEmployee(e);
          text('bwHistoryIdentity',`${fullName(e)} \u00b7 ${e.cedula}`);
          $('bwHistorySearch').value=fullName(e);
          $('bwHistorySuggestions').classList.add('hidden');
        }
      }
      if(!event.target.closest('.bw-history-search')) $('bwHistorySuggestions')?.classList.add('hidden');
    });
    $('bwClearFilters').addEventListener('click',()=>{
      ['filtroGestionBusqueda','filtroGestionTipo','filtroGestionEstado','filtroGestionArea','bwYear'].forEach(id=>$(id).value='');
      $('bwOrder').value='recientes';setGroup('todas');
    });
    $('filtroGestionEstado').addEventListener('change',()=>{if($('filtroGestionEstado').value){group='todas';document.querySelectorAll('[data-bw-group]').forEach(b=>{b.classList.toggle('is-active',b.dataset.bwGroup==='todas');b.setAttribute('aria-pressed',String(b.dataset.bwGroup==='todas'));});api.apply();}});
    ['bwYear','bwOrder'].forEach(id=>$(id).addEventListener('change',()=>api.apply()));
    $('bwPrevious').addEventListener('click',()=>{page--;renderManagement(rows);});
    $('bwNext').addEventListener('click',()=>{page++;renderManagement(rows);});
    $('bwPageSize').addEventListener('change',()=>{page=1;pageSize=Number($('bwPageSize').value)||12;renderManagement(rows);});
    $('bwHistorySearch').addEventListener('input',historySearch);
    $('listaSugerencias').addEventListener('keydown',event=>{if(event.target.matches('.autocomplete-item')&&['Enter',' '].includes(event.key)){event.preventDefault();event.target.click();}});
    const autoObserver=new MutationObserver(decorateAutocomplete);
    autoObserver.observe($('listaSugerencias'),{childList:true});
    window.addEventListener('pagehide',()=>autoObserver.disconnect(),{once:true});
    // Surface existing form errors even when the user is scrolled down.
    const alerts=new MutationObserver(()=>{ if($('contenedorAlertas').textContent.trim()) $('contenedorAlertas').scrollIntoView({block:'nearest',behavior:'auto'}); });
    alerts.observe($('contenedorAlertas'),{childList:true});
    window.addEventListener('pagehide',()=>alerts.disconnect(),{once:true});
  }
  window.BienestarUX={iniciar:init,renderGestion:renderManagement,refinarFiltros:refine,renderHistorial:renderHistory,cargaCompleta:complete};
})();
