import {crearHorario,codigoAsignado,analizarHorario,resumenSemanal,proponerDistribucion,fechaMas,textoMinutos,esExternoChef} from './cocina-planificacion-core.js?v=chef-7-3';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const hoy=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function crearPlanificacionChef(cfg){
 let seleccion=null,ready=false,filas=[],persona=null,dirty=false,saving=false;
 async function verificar(){
  const {error}=await cfg.sb.from('cocina_programacion_turnos').select('horario_asignado').limit(1);
  ready=!error;
  if(!ready){cfg.aviso('La edici\u00f3n individual 7.3 requiere instalar primero SQL/01_ACTIVAR_CHEF.sql. La programaci\u00f3n anterior se conserva.',true);}
  return ready;
 }
 function inicializar(){
  for(const n of [1,2]){
   const select=$(n===1?'selectTurno':'selectTurno2');
   if(!select||$('chefHoraInicio'+n))continue;
   select.insertAdjacentHTML('afterend',`<div class="chef-edit-horas" id="chefEditor${n}"><div><label for="chefHoraInicio${n}">Entrada</label><input class="form-control" type="time" step="60" id="chefHoraInicio${n}"></div><div><label for="chefHoraFin${n}">Salida</label><input class="form-control" type="time" step="60" id="chefHoraFin${n}"></div><button type="button" class="btn btn-outline-secondary btn-sm" id="chefRestaurar${n}">Usar horario del c\u00f3digo</button></div>`);
   select.addEventListener('change',()=>{rellenar(n);dirty=true;cfg.resumen();});
   $('chefRestaurar'+n).onclick=()=>{rellenar(n);dirty=true;cfg.resumen();};
   for(const id of ['chefHoraInicio'+n,'chefHoraFin'+n])$(id).addEventListener('input',()=>{dirty=true;cfg.resumen();});
  }
  if(!$('chefTotalSemanaModal'))$('resumenHorarioAsignacionChef')?.insertAdjacentHTML('afterend','<div id="chefTotalSemanaModal" class="chef-meta-semana" aria-live="polite"></div>');
 }
 function rellenar(n,registro=null){
  if(!seleccion)return;const code=$(n===1?'selectTurno':'selectTurno2').value;
  const c=codigoAsignado(registro,cfg.resolver(code,seleccion.fecha),n);
  for(const [id,v] of [['chefHoraInicio',c.hora_inicio],['chefHoraFin',c.hora_fin]]){const el=$(id+n);el.value=v?String(v).slice(0,5):'';el.disabled=!ready||(!c.hora_inicio&&!c.hora_fin);}
 }
 function abrirEdicion(s){seleccion=s;dirty=false;inicializar();rellenar(1,s.registro);rellenar(2,s.registro);}
 function codigo(n){
  const base=cfg.resolver($(n===1?'selectTurno':'selectTurno2').value,seleccion.fecha);
  if(!ready)return base;
  return {...base,hora_inicio:$('chefHoraInicio'+n)?.value||null,hora_fin:$('chefHoraFin'+n)?.value||null};
 }
 function horarioModal(){
  if(!ready)throw Error('Instala primero la activaci\u00f3n SQL de Chef 7.3; no se guardaron cambios.');
  return crearHorario(codigo(1),$('checkTurnoPartidoChef').checked?codigo(2):null,{flexible:!!seleccion?.registro?.horario_asignado?.flexible,origen:dirty?'manual':seleccion?.registro?.horario_asignado?.origen||'plantilla'});
 }
 function desdeRegistro(r){if(r.horario_asignado)return r.horario_asignado;return crearHorario(cfg.resolver(r.codigo_turno,r.fecha),r.codigo_turno_2?cfg.resolver(r.codigo_turno_2,r.fecha):null);}
 function resumenModal(){
  const box=$('chefTotalSemanaModal');if(!box||!seleccion)return;
  try{
   const h=horarioModal(),a=analizarHorario(h),p=seleccion.persona,week=cfg.semana();
   if(esExternoChef(p)){box.textContent=`Personal externo: ${textoMinutos(a.netos)} programados; sin meta de N\u00f3mina Club.`;return;}
   if(week.length!==7){box.textContent='Elige un rango de 7 d\u00edas para comparar con la meta semanal. El horario individual se puede editar.';return;}
   const list=cfg.registros().filter(r=>r.cronograma_personal_id===p.id&&week.includes(r.fecha)&&r.fecha!==seleccion.fecha).map(r=>({fecha:r.fecha,horario:desdeRegistro(r)}));
   list.push({fecha:seleccion.fecha,horario:h});const x=resumenSemanal(list);
   box.textContent=`Semana: ${textoMinutos(x.total)} / 42 h. ${x.diferencia>0?'Faltan '+textoMinutos(x.diferencia):x.diferencia<0?'Supera la meta en '+textoMinutos(x.diferencia):'Meta completa'}. Programado, no pago aprobado.`;
  }catch(e){box.textContent=e.message;}
 }
 async function guardarCambios(personaId,cambios,motivo){
  if(!ready&&!(await verificar()))throw Error('Falta activar el backend Chef 7.3. No se envi\u00f3 la programaci\u00f3n.');
  const {data:auth,error:authError}=await cfg.sb.auth.getUser();
  if(authError||!auth?.user)throw Error('Inicia sesi\u00f3n con la cuenta autorizada de Chef o N\u00f3mina.');
  const {data,error}=await cfg.sb.rpc('guardar_programacion_chef_v3',{p_persona:personaId,p_cambios:cambios,p_motivo:motivo});
  if(error)throw Error(`${error.message||'No se pudo confirmar el guardado'}${error.code?' ('+error.code+')':''}`);
  if(data?.guardados!==cambios.length||!Array.isArray(data.registros))throw Error('No se recibi\u00f3 la confirmaci\u00f3n completa. Actualiza antes de repetir.');
  for(const c of cambios){const r=data.registros.find(r=>r.fecha===c.fecha);if(!r)throw Error('Falta una fecha en la confirmaci\u00f3n. Actualiza antes de repetir.');if(c.eliminar){if(!r.eliminado)throw Error('No se confirm\u00f3 la eliminaci\u00f3n');}else{for(const k of ['inicio1','fin1','inicio2','fin2','descanso_minutos','flexible'])if((r.horario_asignado?.[k]??null)!==(c.datos.horario_asignado[k]??null))throw Error('El horario devuelto no coincide con el enviado. Actualiza antes de repetir.');}}
  return data.registros;
 }
 function crearModalSemana(){
  if($('chefSemanaModal'))return;
  document.body.insertAdjacentHTML('beforeend',`<div class="modal fade" id="chefSemanaModal" tabindex="-1" aria-labelledby="chefSemanaTitulo"><div class="modal-dialog modal-xl modal-dialog-scrollable"><div class="modal-content"><div class="modal-header"><div><h5 id="chefSemanaTitulo" class="modal-title">Distribuci\u00f3n semanal</h5><small id="chefSemanaPersona"></small></div><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div><div class="modal-body">
 <p>Modifica los horarios de esta persona sin crear c\u00f3digos nuevos. El descanso se descuenta una sola vez por jornada.</p>
 <label for="chefSemanaModo" class="form-label">Organizaci\u00f3n</label><select id="chefSemanaModo" class="form-select"><option value="libre">Programaci\u00f3n libre (conservar d\u00edas existentes)</option><option value="sin_domingo">Domingo y lunes de descanso</option></select>
 <div id="chefSemanaTotal" class="chef-meta-semana mt-3" role="status"></div>
 <div class="table-responsive mt-3"><table class="table align-middle chef-tabla-semana"><thead><tr><th>D\u00eda</th><th>Turno / novedad</th><th>Entrada</th><th>Salida</th><th>Neto</th><th>Distribuir aqu\u00ed</th></tr></thead><tbody id="chefSemanaFilas"></tbody></table></div>
 <div class="alert alert-light border small">El lunes no se programa autom\u00e1ticamente. Para un evento particular, usa programaci\u00f3n libre. Un turno del s\u00e1bado que termine el domingo ocupa parte de ese descanso. Los turnos partidos conservan sus bloques; ed\u00edtalos en su celda individual.</div>
 <label for="chefSemanaMotivo" class="form-label">Motivo del ajuste</label><input id="chefSemanaMotivo" class="form-control" value="Distribuci\u00f3n semanal planificada" maxlength="500">
 <label class="d-block mt-3"><input type="checkbox" id="chefSemanaAcuerdo"> La distribuci\u00f3n flexible est\u00e1 acordada y se revis\u00f3 con Bienestar/N\u00f3mina. No modifica marcaciones ni aprueba horas extra.</label>
 <div id="chefSemanaError" class="text-danger mt-2" role="alert"></div></div><div class="modal-footer"><button id="chefProponer42" type="button" class="btn btn-outline-primary">Proponer para completar 42 h</button><button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancelar</button><button id="chefAplicarSemana" type="button" class="btn btn-primary">Aplicar a esta persona</button></div></div></div></div>`);
  $('chefSemanaModo').onchange=()=>{
   if($('chefSemanaModo').value==='sin_domingo'){
    const afectados=filas.filter(r=>[0,1].includes(new Date(r.fecha+'T00:00:00Z').getUTCDay())&&!r.bloqueado);
    if(afectados.some(r=>r.horario&&analizarHorario(r.horario).netos>0)&&!confirm('Se propondr\u00e1 descanso el domingo y el lunes de esta persona. Revisa los cambios antes de guardar.')){$('chefSemanaModo').value='libre';return;}
    for(const r of afectados){if(['INC','V','VAC','DF','DFAM','DC','CUMP','PNR','CAL','LUTO','MATR'].includes(r.datos.codigo_turno))continue;r.datos.codigo_turno='D';r.datos.codigo_turno_2=null;r.horario=crearHorario({},null,{origen:'manual'});r.ajustable=false;}
   }
   pintarSemana();
  };
  $('chefProponer42').onclick=()=>{try{leerFilas();if(!$('chefSemanaAcuerdo').checked)throw Error('Confirma el acuerdo de distribuci\u00f3n flexible antes de proponer.');filas=proponerDistribucion(filas);pintarSemana();$('chefSemanaError').textContent='';}catch(e){$('chefSemanaError').textContent=e.message;}};
  $('chefAplicarSemana').onclick=aplicarSemana;
  $('chefSemanaFilas').addEventListener('change',e=>{const tr=e.target.closest('[data-fecha]');if(!tr)return;const r=filas.find(x=>x.fecha===tr.dataset.fecha);if(e.target.matches('select')){r.datos.codigo_turno=e.target.value;r.datos.codigo_turno_2=null;r.horario=r.datos.codigo_turno?crearHorario(cfg.resolver(r.datos.codigo_turno,r.fecha),null,{origen:'manual'}):null;r.ajustable=!!r.horario?.inicio1&&!r.bloqueado;pintarSemana();}else{leerFilas();pintarTotal();}});
 }
 function datosBase(r,p){return {codigo_turno:r?.codigo_turno||'',codigo_turno_2:r?.codigo_turno_2||null,area_cocina_id:r?.area_cocina_id||p.area_cocina_id||null,area_cocina_id_2:r?.area_cocina_id_2||null,observacion:r?.observacion||'',observacion_2:r?.observacion_2||null,evento:r?.evento||'',evento_2:r?.evento_2||null};}
 async function abrirSemana(p){
  if(!cfg.puede())return;
  if(!ready&&!(await verificar()))return;
  if(esExternoChef(p)){alert('La meta semanal del Club no se aplica a externos. Puedes editar sus horas en cada celda.');return;}
  const week=cfg.semana();if(week.length!==7){alert('Selecciona un rango de 7 d\u00edas antes de distribuir las 42 horas. No se cambia el corte operativo.');return;}
  await cfg.recargarCatalogo();persona=p;crearModalSemana();
  const {data,error}=await cfg.sb.from('cocina_programacion_turnos').select('*').eq('cronograma_personal_id',p.id).gte('fecha',week[0]).lte('fecha',week.at(-1));
  if(error){alert(error.message);return;}
  filas=week.map(fecha=>{const r=(data||[]).find(x=>x.fecha===fecha),h=r?desdeRegistro(r):null;const bloqueado=fecha<hoy()||['aprobado','aprobada'].includes(r?.estado_extra);return {fecha,id:r?.id||null,updated_at:r?.updated_at||null,original:r||null,datos:datosBase(r,p),horario:h,bloqueado,ajustable:!bloqueado&&!!h?.inicio1&&!r?.codigo_turno_2&&![0,1,6].includes(new Date(fecha+'T00:00:00Z').getUTCDay())};});
  $('chefSemanaPersona').textContent=`${p.nombre_visible} | ${week[0]} al ${week.at(-1)}`;$('chefSemanaModo').value='libre';$('chefSemanaError').textContent='';$('chefSemanaAcuerdo').checked=false;pintarSemana();bootstrap.Modal.getOrCreateInstance($('chefSemanaModal')).show();
 }
 function pintarSemana(){
  $('chefSemanaFilas').innerHTML=filas.map(r=>{const partido=!!r.datos.codigo_turno_2,disabled=r.bloqueado||partido;const dow=new Intl.DateTimeFormat('es-CO',{weekday:'short',timeZone:'UTC'}).format(new Date(r.fecha+'T00:00:00Z'));
   return `<tr data-fecha="${r.fecha}"><td><strong>${dow}</strong><br>${r.fecha.slice(8)}/${r.fecha.slice(5,7)}${r.bloqueado?'<small class="d-block">No editable</small>':''}${partido?'<small class="d-block">Turno partido: editar celda</small>':''}</td><td><select class="form-select" ${disabled?'disabled':''}><option value="">Sin asignar</option>${cfg.codigos().map(c=>`<option value="${esc(c.codigo)}" ${c.codigo===r.datos.codigo_turno?'selected':''}>${esc(c.codigo)} - ${esc(c.descripcion||c.codigo)}</option>`).join('')}</select></td><td><input aria-label="Entrada ${r.fecha}" type="time" class="form-control" data-hora="inicio1" value="${r.horario?.inicio1||''}" ${disabled||!r.horario?.inicio1?'disabled':''}></td><td><input aria-label="Salida ${r.fecha}" type="time" class="form-control" data-hora="fin1" value="${r.horario?.fin1||''}" ${disabled||!r.horario?.inicio1?'disabled':''}></td><td class="chef-neto-dia"></td><td><input aria-label="Distribuir ${r.fecha}" type="checkbox" class="form-check-input" ${r.ajustable?'checked':''} ${disabled||!r.horario?.inicio1?'disabled':''}></td></tr>`;
  }).join('');pintarTotal();
 }
 function leerFilas(){
  for(const r of filas){const tr=$('chefSemanaFilas').querySelector(`[data-fecha="${r.fecha}"]`);if(!tr)continue;
   r.ajustable=tr.querySelector('[type=checkbox]').checked;
   if(r.horario?.inicio1&&!r.bloqueado&&!r.datos.codigo_turno_2){const inicio1=tr.querySelector('[data-hora=inicio1]').value,fin1=tr.querySelector('[data-hora=fin1]').value;r.horario={...r.horario,inicio1,fin1,origen:r.horario.inicio1!==inicio1||r.horario.fin1!==fin1?'manual':r.horario.origen};}
   r.sinDomingo=$('chefSemanaModo').value==='sin_domingo';
  }
 }
 function pintarTotal(){
  for(const r of filas){r.sinDomingo=$('chefSemanaModo').value==='sin_domingo';const td=$('chefSemanaFilas').querySelector(`[data-fecha="${r.fecha}"] .chef-neto-dia`);try{const a=r.horario?analizarHorario(r.horario):null;td.textContent=a?textoMinutos(a.netos)+(a.bloques.some(b=>b.diaFin>0)?' (+1 d\u00eda)':''):'Sin asignar';}catch(e){td.textContent=e.message;}}
  const x=resumenSemanal(filas);$('chefSemanaTotal').textContent=`${textoMinutos(x.total)} / 42 h netas. ${x.diferencia>0?'Faltan '+textoMinutos(x.diferencia):x.diferencia<0?'Exceso '+textoMinutos(x.diferencia):'Meta completa'}`;
  $('chefSemanaError').textContent=[...x.errores,...x.avisos].join('. ');
 }
 async function aplicarSemana(){
  if(saving)return;
  try{leerFilas();const sum=resumenSemanal(filas);if(sum.errores.length)throw Error(sum.errores[0]);if(sum.avisos.some(x=>x.includes('domingo')))throw Error(sum.avisos.find(x=>x.includes('domingo')));
   if(filas.some(x=>x.horario?.flexible)&&!$('chefSemanaAcuerdo').checked)throw Error('Confirma el acuerdo de distribuci\u00f3n flexible.');
   const cambios=filas.filter(r=>!r.bloqueado&&r.horario&&r.datos.codigo_turno&&(JSON.stringify(r.horario)!==JSON.stringify(r.original?.horario_asignado)||r.datos.codigo_turno!==r.original?.codigo_turno)).map(r=>({fecha:r.fecha,esperado_id:r.id,esperado_updated_at:r.updated_at,datos:{...r.datos,horario_asignado:r.horario}}));
   if(!cambios.length)throw Error('No hay cambios para guardar.');
   if(!confirm(`Se guardar\u00e1n ${cambios.length} jornadas de ${persona.nombre_visible}. Total: ${textoMinutos(sum.total)}. ${sum.diferencia!==0?'La semana NO queda en 42 horas. ':''}No se cambian marcaciones ni pagos. \u00bfContinuar?`))return;
   saving=true;for(const id of ['chefAplicarSemana','chefProponer42'])$(id).disabled=true;
   await guardarCambios(persona.id,cambios,$('chefSemanaMotivo').value.trim());
   bootstrap.Modal.getOrCreateInstance($('chefSemanaModal')).hide();cfg.aviso('Distribuci\u00f3n guardada. Actualizando la vista...');
   try{await cfg.recargar();}catch(e){cfg.aviso('La distribuci\u00f3n se guard\u00f3. Recarga la p\u00e1gina para verla; no repitas el env\u00edo.',true);}
  }catch(e){$('chefSemanaError').textContent=e.message;}finally{saving=false;for(const id of ['chefAplicarSemana','chefProponer42'])if($(id))$(id).disabled=false;}
 }
 return {inicializar,verificar,abrirEdicion,codigo,horarioModal,resumenModal,guardarCambios,desdeRegistro,abrirSemana,datosBase};
}
