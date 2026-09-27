import {supabase} from '../supabase/supabaseClient.js';
import {exigirModulo,filtrarEnlaces} from './permisos-modulos.js?v=735';
import {NOVEDADES,DIAS,add,dow,monday,dates,today,short,net,duration,normalize,esc,name,resolveTemplate,planned,dayText,weeklyTotal,summary,copyItem} from './programacion-administracion-core.js?v=740';

const $=id=>document.getElementById(id);
const app={data:null,period:null,days:[],ready:false,loading:false,busy:false,copy:null,editing:null,code:null,session:null};
const modals={};
const editButtons=['admNueva','admGenerar','admCopiarPeriodo','admCodigos','admPersonal','admPdf'];
const rowKey=e=>`${e.empleado_id}|${e.proceso_id}`;
const areaPeople=()=>app.data?.personal.filter(e=>!$('admArea').value||e.proceso_id===$('admArea').value)||[];
const visiblePeople=()=>areaPeople().filter(e=>normalize([name(e),e.cedula,e.codigo,e.cargo].join(' ')).includes(normalize($('admBuscar').value)));
const findPerson=key=>app.data.personal.find(e=>rowKey(e)===key);
const row=(e,f)=>app.data.programacion.find(r=>r.empleado_id===e.empleado_id&&r.proceso_id===e.proceso_id&&r.fecha===f)||null;
const turns=e=>app.data.turnos.filter(t=>t.proceso_id===e.proceso_id&&t.activo);
function notice(e,f){return app.data.novedades.find(n=>(n.empleado_id===e.empleado_id||n.cedula===e.cedula)&&n.fecha_inicio<=f&&n.fecha_fin>=f);}
function status(text,error=false){$('admEstado').textContent=text;$('admEstado').dataset.error=String(error);}
function errorBox(id,error){$(id).textContent=error?.message||String(error||'');$(id).hidden=!error;}
function enable(){editButtons.forEach(id=>$(id).disabled=!app.ready||app.busy||app.loading);['admCargar','admAnterior','admSiguiente','admActual'].forEach(id=>$(id).disabled=app.busy||app.loading);}
async function rpc(fn,args){const {data,error}=await supabase.rpc(fn,args);if(error)throw error;return data;}
async function mutate(fn){if(app.busy||!app.ready)return;app.busy=true;enable();try{return await fn();}finally{app.busy=false;enable();}}
function setOptions(el,list,first=''){const prev=el.value;el.innerHTML=first+list.map(x=>`<option value="${esc(x.value)}">${esc(x.label)}</option>`).join('');if([...el.options].some(o=>o.value===prev))el.value=prev;}
function areaOptions(id,empty=false){setOptions($(id),app.data.procesos.map(p=>({value:p.id,label:p.nombre})),empty?'<option value="">Todas las áreas</option>':'');}
function personOptions(){setOptions($('admEmpleado'),app.data.personal.map(e=>({value:rowKey(e),label:`${name(e)} · ${e.proceso_nombre}`})));}
function sync(){ $('admDesde').value=app.period.start;$('admHasta').value=app.period.end; }

window.addEventListener('DOMContentLoaded',init);
async function init(){
 try{
  app.session=await exigirModulo('programacion-administrativo');if(!app.session)return;filtrarEnlaces(app.session);
  for(const key of ['Asignacion','Generar','Codigos','Personal'])modals[key]=new bootstrap.Modal($('admModal'+key));
  $('admUsuario').textContent=app.session.nombre_completo||app.session.correo||'';
  const start=monday(today());app.period={start,end:add(start,6)};sync();
  $('admNovedad').innerHTML=Object.entries(NOVEDADES).map(([k,v])=>`<option value="${k}">${v}</option>`).join('');
  events();await load();
 }catch(e){status(`No se pudo iniciar Administración: ${e.message}`,true);}
}
function events(){
 $('admCargar').onclick=()=>load();
 $('admAnterior').onclick=()=>move(-1);$('admSiguiente').onclick=()=>move(1);
 $('admActual').onclick=()=>{if(app.busy||app.loading)return;const start=monday(today());$('admDesde').value=start;$('admHasta').value=add(start,6);load();};
 $('admArea').onchange=render;$('admBuscar').oninput=render;
 $('admLimpiar').onclick=()=>{$('admArea').value='';$('admBuscar').value='';render();};
 $('admNueva').onclick=()=>openAssignment(undefined,undefined,true);
 $('admGenerar').onclick=openGenerate;$('admFormGenerar').onsubmit=saveGenerate;
 $('admAreaGenerar').onchange=generateOptions;$('admTurnoGenerar').onchange=generatePreview;
 $('admDesdeGenerar').onchange=generatePreview;$('admHastaGenerar').onchange=generatePreview;
 $('admTodosGenerar').onchange=()=>{$('admPersonasGenerar').querySelectorAll('input').forEach(c=>c.checked=$('admTodosGenerar').checked);};
 $('admFormAsignacion').onsubmit=saveAssignment;
 $('admEmpleado').onchange=()=>{assignmentTurns();preview();};
 ['admFecha','admFechaFin','admTipo','admTurno','admCustom','admEntrada','admSalida','admPausa','admNovedad'].forEach(id=>$(id).addEventListener('change',preview));
 $('admQuitar').onclick=cancelAssignment;
 $('admBody').onclick=matrixClick;
 $('admBorrarCopia').onclick=()=>{app.copy=null;render();};
 $('admCopiarPeriodo').onclick=copyPeriod;
 $('admVisual').onclick=()=>{const on=$('admMatrizPanel').classList.toggle('adm-fullscreen');document.body.classList.toggle('adm-is-fullscreen',on);$('admVisual').textContent=on?'Cerrar vista ampliada':'Visual programación';};
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.body.classList.contains('adm-is-fullscreen'))$('admVisual').click();});
 $('admPdf').onclick=calendarPdf;
 $('admCodigos').onclick=()=>{areaOptions('admAreaCodigos');if($('admArea').value)$('admAreaCodigos').value=$('admArea').value;$('admFormCodigo').hidden=true;listCodes();modals.Codigos.show();};
 $('admAreaCodigos').onchange=()=>{$('admFormCodigo').hidden=true;listCodes();};
 $('admNuevoCodigo').onclick=()=>editCode();$('admCancelarCodigo').onclick=()=>{$('admFormCodigo').hidden=true;};
 $('admListaCodigos').onclick=e=>{const b=e.target.closest('[data-edit-code]');if(b)editCode(app.data.turnos.find(t=>t.id===b.dataset.editCode));};
 $('admDiasCodigo').onchange=previewCode;$('admDiasCodigo').oninput=previewCode;$('admFormCodigo').onsubmit=saveCode;
 $('admPersonal').onclick=()=>{areaOptions('admAreaPersonal');if($('admArea').value)$('admAreaPersonal').value=$('admArea').value;renderPeople();modals.Personal.show();};
 $('admAreaPersonal').onchange=renderPeople;$('admBuscarPersonal').oninput=renderPeople;
 $('admListaPersonal').onclick=managePeople;
}
async function move(n){if(app.busy||app.loading)return;const len=app.days.length||7;$('admDesde').value=add(app.period.start,n*len);$('admHasta').value=add(app.period.end,n*len);await load();}
async function load(){
 if(app.loading)return false;
 let ds;try{ds=dates($('admDesde').value,$('admHasta').value,14);}catch(e){status(e.message,true);return false;}
 app.loading=true;app.ready=false;enable();status('Cargando programación, personal y turnos vigentes…');
 try{
  const d=await rpc('consultar_programacion_administracion_v740',{p_desde:ds[0],p_hasta:ds.at(-1)});
  if(d?.version!=='740'||['procesos','personal','turnos','programacion','novedades','festivos','candidatos'].some(k=>!Array.isArray(d[k])))throw Error('Respuesta incompleta; no se habilitan cambios');
  app.data=d;app.days=ds;app.period={start:ds[0],end:ds.at(-1)};app.ready=true;sync();areaOptions('admArea',true);personOptions();render();
  status(`${app.data.personal.length} colaboradores del grupo Administrativo · ${short(ds[0])} al ${short(ds.at(-1))}. Consulta completa.`);return true;
 }catch(e){status(`No se pudo completar la lectura: ${e.message}. Recarga antes de volver a guardar.`,true);$('admBody').innerHTML='<tr><td colspan="16" class="p-4">Carga no completada. Pulsa Cargar periodo para consultar de nuevo.</td></tr>';$('admResumen').replaceChildren();return false;}
 finally{app.loading=false;enable();}
}
function render(){if(!app.data||!app.ready)return;renderMatrix();renderSummary();$('admCopia').hidden=!app.copy;if(app.copy)$('admCopiaTexto').textContent=`Turno copiado: ${app.copy.nombre} · ${dayText(app.copy.row)}`;}
function renderMatrix(){
 const people=visiblePeople();
 $('admHead').innerHTML=`<tr><th>Colaborador / área</th>${app.days.map(f=>{const h=app.data.festivos.find(h=>h.fecha===f);return `<th class="${h||dow(f)===7?'adm-holiday':''}">${DIAS[dow(f)-1]}<small>${short(f).slice(0,5)}${h?' · Festivo':''}</small></th>`;}).join('')}<th>Neto programado</th></tr>`;
 $('admBody').innerHTML=people.map(e=>{
 const s=summary(e,app.data.programacion,app.days,app.data.turnos);
 return `<tr><th>${esc(name(e))}<small>${esc(e.codigo||e.cedula)} · ${esc(e.cargo||'')}</small><small>${esc(e.proceso_nombre)}</small></th>${app.days.map(f=>cell(e,f)).join('')}<td class="adm-total">${s.saved?duration(s.minutes):'—'}</td></tr>`;
 }).join('')||`<tr><td colspan="${app.days.length+2}" class="p-4">No hay colaboradores con ese filtro.</td></tr>`;
 $('admConteo').textContent=`${people.length} colaboradores visibles de ${areaPeople().length} en el área seleccionada. El calendario no crea asignaciones al abrir.`;
}
function cell(e,f){const r=row(e,f),n=notice(e,f),ts=turns(e),ref=ts.length===1?resolveTemplate(ts[0],f,app.data.festivos):null;const key=esc(rowKey(e));
 let text=r?dayText(r):n?(NOVEDADES[n.codigo]||n.codigo)+' · Bienestar':'Sin asignación';
 let sub=r?.tipo_registro==='turno'?`${r.turno_codigo||'Personalizado'} · ${duration(planned(r).net)} netas`:r?.tipo_registro==='novedad'?'Novedad registrada':!r&&!n?(ref?.tipo==='laboral'?'Sin programación manual':'Referencia vigente en nómina'):'';
 return `<td><button type="button" class="adm-cell ${!r?'adm-empty':r.tipo_registro==='turno'?'':r.tipo_registro==='novedad'?'adm-nov':'adm-rest'}" data-cell="${key}" data-date="${f}">${esc(text)}<small>${esc(sub)}</small></button><div class="adm-cell-actions">${r?`<button type="button" data-copy="${r.id}">Copiar</button>`:''}${app.copy?`<button type="button" data-paste="${key}" data-date="${f}">Pegar</button>`:''}</div></td>`;
}
function renderSummary(){
 $('admResumen').innerHTML=areaPeople().map(e=>{const s=summary(e,app.data.programacion,app.days,app.data.turnos);let state=!s.saved?'Sin programación manual':s.nov?'Con novedades':s.saved<app.days.length?'Programación parcial':s.diff===null?'Periodo programado':s.diff===0?'En referencia':`${s.diff>0?'+':'−'}${duration(Math.abs(s.diff))} programadas`;
 return `<tr><td><strong>${esc(name(e))}</strong><small>${esc(e.proceso_nombre)}</small></td><td>${s.work}</td><td>${duration(s.pause)}</td><td><strong>${s.saved?duration(s.minutes):'—'}</strong></td><td>${s.inc} incap. / ${s.nov} nov.</td><td>${s.ref===null?'Según turno':duration(s.ref)}</td><td><span class="adm-state ${s.diff>0?'adm-excess':''}">${esc(state)}</span></td></tr>`;}).join('');
}
function matrixClick(ev){if(!app.ready||app.busy)return;const a=ev.target.closest('[data-cell]'),c=ev.target.closest('[data-copy]'),p=ev.target.closest('[data-paste]');if(a)openAssignment(findPerson(a.dataset.cell),a.dataset.date);else if(c){const r=app.data.programacion.find(r=>r.id===c.dataset.copy);const e=app.data.personal.find(e=>e.empleado_id===r.empleado_id);app.copy={row:structuredClone(r),nombre:name(e)};render();}else if(p)paste(findPerson(p.dataset.paste),p.dataset.date);}
function assignmentTurns(selected=''){const e=findPerson($('admEmpleado').value);setOptions($('admTurno'),(e?turns(e):[]).map(t=>({value:t.id,label:`${t.codigo} · ${t.nombre}`})),'<option value="">Selecciona un turno</option>');if(selected)$('admTurno').value=selected;}
function openAssignment(e=visiblePeople()[0],f=app.period.start,forceNew=false){
 if(!e)return status('No hay colaboradores en esta área.',true);
 app.editing=forceNew?null:row(e,f);$('admFormAsignacion').reset();errorBox('admErrorAsignacion');personOptions();$('admEmpleado').value=rowKey(e);$('admEmpleado').disabled=!!app.editing;
 $('admFecha').value=f;$('admFechaFin').value=f;$('admFecha').disabled=!!app.editing;$('admFechaFin').disabled=!!app.editing;
 const r=app.editing;$('admTituloAsignacion').textContent=r?'Editar asignación':'Nueva asignación / novedad';$('admTipo').value=r?.tipo_registro||'turno';$('admNovedad').value=r?.novedad_codigo||'INC';$('admObservacion').value=r?.observacion||'';
 assignmentTurns(r?.horario_base_id);
 if(r?.tipo_registro==='turno'){
  const t=app.data.turnos.find(t=>t.id===r.horario_base_id),d=resolveTemplate(t,f,app.data.festivos);
  $('admCustom').checked=!d||d.tipo!=='laboral'||d.inicio?.slice(0,5)!==r.hora_inicio||d.fin?.slice(0,5)!==r.hora_fin||Number(d.descanso)!==r.minutos_descanso;
  $('admEntrada').value=r.hora_inicio;$('admSalida').value=r.hora_fin;$('admPausa').value=r.minutos_descanso;
 }
 $('admQuitar').hidden=!r;preview();modals.Asignacion.show();
}
function preview(){
 const type=$('admTipo').value,custom=$('admCustom').checked;
 $('admCamposTurno').hidden=type!=='turno';$('admCamposNovedad').hidden=type!=='novedad';$('admHoras').hidden=!custom;$('admTurno').disabled=custom;
 try{const ds=dates($('admFecha').value,$('admFechaFin').value);let mins=0,wait=0;
  if(type==='turno')for(const f of ds){if(custom)mins+=net($('admEntrada').value,$('admSalida').value,Number($('admPausa').value)).net;else{const t=app.data.turnos.find(t=>t.id===$('admTurno').value),d=resolveTemplate(t,f,app.data.festivos);if(!d)wait++;else if(d.tipo==='laboral')mins+=net(d.inicio,d.fin,d.descanso).net;}}
  $('admPreview').textContent=type==='turno'?`${duration(mins)} netas en el rango seleccionado${wait?` · ${wait} día(s) sin turno definido; revisa el código o usa horario personalizado`:''}.`:`${type==='novedad'?(NOVEDADES[$('admNovedad').value]||'Novedad'):type==='descanso'?'Descanso':'Compensatorio'}: ${ds.length} día(s), del ${short(ds[0])} al ${short(ds.at(-1))}. No se contabilizan como horas trabajadas.`;
 }catch(e){$('admPreview').textContent=e.message;}
}
function buildAssignment(){
 const e=findPerson($('admEmpleado').value);if(!e)throw Error('Selecciona un colaborador');const ds=dates($('admFecha').value,$('admFechaFin').value);const type=$('admTipo').value,custom=$('admCustom').checked,t=app.data.turnos.find(t=>t.id===$('admTurno').value);
 if(type==='turno'&&!custom&&!t)throw Error('Selecciona un turno base o un horario personalizado');if(type==='turno'&&custom)net($('admEntrada').value,$('admSalida').value,Number($('admPausa').value));
 return ds.map(f=>({empleado_id:e.empleado_id,proceso_id:e.proceso_id,fecha:f,tipo_registro:type,personalizado:custom,horario_base_id:type==='turno'&&!custom?t.id:null,turno_revision:t?.revision||null,hora_inicio:$('admEntrada').value||null,hora_fin:$('admSalida').value||null,minutos_descanso:Number($('admPausa').value),novedad_codigo:type==='novedad'?$('admNovedad').value:null,novedad_descripcion:type==='novedad'?NOVEDADES[$('admNovedad').value]:null,observacion:$('admObservacion').value.trim()||null,revision:row(e,f)?.revision||null}));
}
async function persist(items,mode='vacias'){
 if(!items.length)return {guardados:[],omitidas:[]};if(items.length>250)throw Error('Selecciona menos colaboradores o un periodo menor (máximo 250 jornadas por guardado)');
 const result=await rpc('guardar_programacion_administracion_v740',{p_payload:{items,modo:mode,solicitud_id:crypto.randomUUID()}});if(result?.ok!==true)throw Error('No se pudo verificar el guardado. Recarga antes de repetir.');return result;
}
function savedMessage(r){const omit=r.omitidas||[];return `${r.guardados.length} jornada(s) guardada(s)${omit.length?`. ${omit.length} conservadas o pendientes: ${[...new Set(omit.map(x=>x.motivo))].join('; ')}`:''}. Las marcaciones y las aprobaciones no se modificaron.`;}
async function saveAssignment(ev){ev.preventDefault();errorBox('admErrorAsignacion');try{const items=buildAssignment();const existing=items.filter(x=>x.revision).length;if(existing&&(!app.editing||items.length>1)&&!confirm(`Se actualizarán ${existing} jornadas ya guardadas dentro del rango. ¿Continuar?`))return;await mutate(async()=>{$('admGuardar').disabled=true;try{const r=await persist(items,'editar');modals.Asignacion.hide();if(await load())status(savedMessage(r));}finally{$('admGuardar').disabled=false;}});}catch(e){errorBox('admErrorAsignacion',e);}}
async function cancelAssignment(){if(!app.editing||!confirm('¿Quitar esta asignación? Se conserva su historial. Si no hay otra asignación, Nómina vuelve a usar la referencia vigente.'))return;try{await mutate(async()=>{await rpc('cancelar_programacion_administracion_v740',{p_id:app.editing.id,p_revision:app.editing.revision});modals.Asignacion.hide();await load();});}catch(e){errorBox('admErrorAsignacion',e);}}
async function paste(e,f){if(!app.copy||!e)return;const existing=row(e,f);if(existing&&!confirm(`¿Reemplazar la asignación de ${name(e)} del ${short(f)} por el turno copiado?`))return;try{await mutate(async()=>{const x=copyItem(app.copy.row,e,f,app.data.turnos,app.data.festivos);x.revision=existing?.revision||null;const r=await persist([x],'editar');if(await load())status(savedMessage(r));});}catch(err){status(err.message,true);}}
function openGenerate(){areaOptions('admAreaGenerar');if($('admArea').value)$('admAreaGenerar').value=$('admArea').value;$('admDesdeGenerar').value=app.period.start;$('admHastaGenerar').value=app.period.end;errorBox('admErrorGenerar');generateOptions();modals.Generar.show();}
function generateOptions(){const id=$('admAreaGenerar').value;setOptions($('admTurnoGenerar'),app.data.turnos.filter(t=>t.proceso_id===id&&t.activo).map(t=>({value:t.id,label:`${t.codigo} · ${t.nombre}`})));$('admPersonasGenerar').innerHTML=app.data.personal.filter(e=>e.proceso_id===id).map(e=>`<label class="adm-person"><input type="checkbox" value="${esc(rowKey(e))}"><span>${esc(name(e))}<small>${esc(e.cargo||'')}</small></span></label>`).join('');$('admTodosGenerar').checked=false;generatePreview();}
function generatePreview(){try{const ds=dates($('admDesdeGenerar').value,$('admHastaGenerar').value,14),t=app.data.turnos.find(t=>t.id===$('admTurnoGenerar').value);if(!t)throw Error('El área no tiene turnos activos. Crea uno en Turnos / códigos.');let min=0,unknown=0;for(const f of ds){const d=resolveTemplate(t,f,app.data.festivos);if(!d)unknown++;else if(d.tipo==='laboral')min+=net(d.inicio,d.fin,d.descanso).net;}$('admPreviewGenerar').textContent=`Plantilla: ${duration(min)} netas por colaborador en este rango. ${unknown?`${unknown} fecha(s) por definir no se rellenarán.`:'Los descansos y compensatorios del código también se guardan.'}`;}catch(e){$('admPreviewGenerar').textContent=e.message;}}
async function saveGenerate(ev){ev.preventDefault();errorBox('admErrorGenerar');try{const people=[...$('admPersonasGenerar').querySelectorAll('input:checked')].map(x=>findPerson(x.value));if(!people.length)throw Error('Selecciona al menos un colaborador');const ds=dates($('admDesdeGenerar').value,$('admHastaGenerar').value,14),t=app.data.turnos.find(t=>t.id===$('admTurnoGenerar').value);if(!t)throw Error('Selecciona un turno');const items=people.flatMap(e=>ds.map(f=>({empleado_id:e.empleado_id,proceso_id:e.proceso_id,fecha:f,tipo_registro:'turno',horario_base_id:t.id,turno_revision:t.revision,personalizado:false})));await mutate(async()=>{$('admGuardarGenerar').disabled=true;try{const r=await persist(items);modals.Generar.hide();if(await load())status(savedMessage(r));}finally{$('admGuardarGenerar').disabled=false;}});}catch(e){errorBox('admErrorGenerar',e);}}
async function copyPeriod(){const len=app.days.length,a=add(app.period.start,-len),b=add(app.period.end,-len),ps=visiblePeople();if(!ps.length)return;if(!confirm(`Copiar del ${short(a)} al ${short(b)} para ${ps.length} colaboradores visibles. Solo se llenarán celdas vacías; no se prolongarán incapacidades ni otras novedades del periodo anterior. ¿Continuar?`))return;try{await mutate(async()=>{const prev=await rpc('consultar_programacion_administracion_v740',{p_desde:a,p_hasta:b});const items=[];for(const r of prev.programacion){if(r.tipo_registro==='novedad')continue;const e=ps.find(e=>e.empleado_id===r.empleado_id&&e.proceso_id===r.proceso_id);if(!e)continue;const f=add(r.fecha,len);if(row(e,f))continue;items.push(copyItem(r,e,f,app.data.turnos,prev.festivos));}if(!items.length)return status('No hay jornadas copiables para los días vacíos del filtro. No se cambió la programación.');const r=await persist(items);if(await load())status(savedMessage(r));});}catch(e){status(`No se completó la copia: ${e.message}`,true);}}

function listCodes(){const pid=$('admAreaCodigos').value,ts=app.data.turnos.filter(t=>t.proceso_id===pid);$('admListaCodigos').innerHTML=`<table class="table adm-code-table"><thead><tr><th>Código</th><th>Nombre</th><th>Neto semanal calculado</th><th>Estado</th><th></th></tr></thead><tbody>${ts.map(t=>{let total;try{total=duration(weeklyTotal(t));}catch{total='Revisar detalle';}return `<tr><td>${esc(t.codigo)}</td><td>${esc(t.nombre)}</td><td>${total}</td><td>${t.activo?'Vigente':'Inactivo'}</td><td><button type="button" class="btn btn-sm btn-outline-primary" data-edit-code="${t.id}">Editar</button></td></tr>`;}).join('')}</tbody></table>`;}
function editCode(t=null){app.code=t?structuredClone(t):null;$('admFormCodigo').reset();$('admFormCodigo').hidden=false;errorBox('admErrorCodigo');$('admTituloCodigo').textContent=t?'Editar turno existente':'Crear turno';$('admCodigo').value=t?.codigo||'';$('admCodigo').readOnly=!!t;$('admNombreCodigo').value=t?.nombre||'';$('admDescripcionCodigo').value=t?.descripcion||'';$('admCodigoActivo').checked=t?.activo??true;const days=Array.from({length:7},(_,i)=>t?.dias.find(d=>Number(d.dia)===i+1)||{dia:i+1,tipo:'descanso',inicio:null,fin:null,descanso:0});days.push({...t?.festivo,dia:8,tipo:t?.festivo?.tipo||'confirmar'});$('admDiasCodigo').innerHTML=days.map(d=>`<tr data-day="${d.dia}"><th>${d.dia===8?'Festivos':DIAS[d.dia-1]}</th><td><select class="form-select" data-field="tipo">${[...(d.dia===8?['confirmar']:[]),'laboral','descanso','compensatorio'].map(k=>`<option value="${k}" ${k===d.tipo?'selected':''}>${({confirmar:'Definir al programar',laboral:'Laboral',descanso:'Descanso',compensatorio:'Compensatorio'})[k]}</option>`).join('')}</select></td><td><input type="time" class="form-control" data-field="inicio" value="${d.inicio?.slice(0,5)||''}"></td><td><input type="time" class="form-control" data-field="fin" value="${d.fin?.slice(0,5)||''}"></td><td><input type="number" class="form-control" data-field="descanso" min="0" max="240" step="1" value="${d.descanso||0}"></td><td data-net></td></tr>`).join('');previewCode();$('admFormCodigo').scrollIntoView({block:'start',behavior:'smooth'});}
function readCodeDays(){return [...$('admDiasCodigo').querySelectorAll('[data-day]')].map(tr=>{const type=tr.querySelector('[data-field=tipo]').value;return {dia:+tr.dataset.day,tipo:type,inicio:type==='laboral'?tr.querySelector('[data-field=inicio]').value:null,fin:type==='laboral'?tr.querySelector('[data-field=fin]').value:null,descanso:type==='laboral'?Number(tr.querySelector('[data-field=descanso]').value):0};});}
function previewCode(){let total=0;for(const d of readCodeDays()){const tr=$('admDiasCodigo').querySelector(`[data-day="${d.dia}"]`);tr.querySelectorAll('input').forEach(i=>{i.disabled=d.tipo!=='laboral';i.required=d.tipo==='laboral';});try{const n=d.tipo==='laboral'?net(d.inicio,d.fin,d.descanso).net:0;tr.querySelector('[data-net]').textContent=d.tipo==='confirmar'?'Por definir':duration(n);if(d.dia<=7)total+=n;}catch{tr.querySelector('[data-net]').textContent='Revisar horas';}}$('admTotalCodigo').textContent=`Neto semanal de esta plantilla: ${duration(total)}. No se fuerza un total fijo ni se cambia la programación guardada.`;}
async function saveCode(ev){ev.preventDefault();errorBox('admErrorCodigo');try{const ds=readCodeDays();for(const d of ds)if(d.tipo==='laboral')net(d.inicio,d.fin,d.descanso);const payload={id:app.code?.id||null,revision:app.code?.revision||null,proceso_id:app.code?.proceso_id||$('admAreaCodigos').value,codigo:$('admCodigo').value.toUpperCase().trim(),nombre:$('admNombreCodigo').value.trim(),descripcion:$('admDescripcionCodigo').value.trim(),activo:$('admCodigoActivo').checked,dias:ds.slice(0,7),festivo:ds[7]};if(app.code&&!confirm('¿Guardar los cambios de esta plantilla? Las jornadas existentes no se reescribirán. La referencia vigente de esta área se actualizará.'))return;await mutate(async()=>{$('admGuardarCodigo').disabled=true;try{await rpc('guardar_turno_administracion_v740',{p_payload:payload});const refreshed=await load();$('admFormCodigo').hidden=true;if(refreshed){listCodes();status('Turno guardado. No se modificaron jornadas existentes.');}}finally{$('admGuardarCodigo').disabled=false;}});}catch(e){errorBox('admErrorCodigo',e);}}
function renderPeople(){const pid=$('admAreaPersonal').value,q=normalize($('admBuscarPersonal').value);const list=app.data.candidatos.filter(e=>normalize(`${name(e)} ${e.cedula} ${e.codigo} ${e.cargo}`).includes(q));$('admListaPersonal').innerHTML=list.map(e=>{const current=app.data.personal.find(p=>p.empleado_id===e.empleado_id);return `<div class="adm-person"><div class="adm-person-name"><strong>${esc(name(e))}</strong><small>${esc(e.codigo||e.cedula)} · ${esc(e.cargo||'')}</small>${current?`<small>${esc(current.proceso_nombre)}</small>`:''}</div>${!current?`<button type="button" class="btn btn-sm btn-outline-primary" data-person="${e.empleado_id}" data-action="agregar">Añadir</button>`:current.proceso_id===pid?`<button type="button" class="btn btn-sm btn-outline-secondary" data-person="${e.empleado_id}" data-action="retirar">Retirar de la vista</button>`:'<span class="adm-note">Ya vinculado</span>'}</div>`;}).join('')||'<p class="adm-note">No hay candidatos disponibles para ese filtro.</p>';}
async function managePeople(ev){const b=ev.target.closest('[data-person]');if(!b)return;const action=b.dataset.action;if(action==='retirar'&&!confirm('Se retirará de la vista para periodos sin programación. No se borran jornadas ni marcaciones y se conserva su horario de referencia. ¿Continuar?'))return;try{await mutate(async()=>{await rpc('gestionar_personal_administracion_v740',{p_empleado_id:b.dataset.person,p_proceso_id:$('admAreaPersonal').value,p_accion:action});await load();renderPeople();});}catch(e){errorBox('admErrorPersonal',e);}}

function calendarPdf(){
 if(!app.ready)return;const people=visiblePeople();if(!people.length)return status('No hay colaboradores visibles para exportar.',true);if(!window.jspdf?.jsPDF)return printCalendar(people);
 const doc=new window.jspdf.jsPDF({orientation:'landscape',unit:'mm',format:'a4'});if(!doc.autoTable)return printCalendar(people);
 const chunks=[];for(let i=0;i<app.days.length;i+=7)chunks.push(app.days.slice(i,i+7));
 chunks.forEach((ds,ix)=>{
  if(ix)doc.addPage();const groups=new Map();for(const e of people){if(!groups.has(e.proceso_nombre))groups.set(e.proceso_nombre,[]);groups.get(e.proceso_nombre).push(e);}const body=[];
  for(const [g,list] of groups){body.push([{content:g,colSpan:ds.length+2,styles:{fillColor:[225,237,250],textColor:[0,64,133],fontStyle:'bold'}}]);for(const e of list){body.push([`${name(e)}\n${e.codigo||e.cedula} · ${e.cargo||''}`,...ds.map(f=>{const r=row(e,f),n=notice(e,f);if(!r)return n?`${NOVEDADES[n.codigo]||n.codigo}\nBienestar`:'Sin asignación';if(r.tipo_registro!=='turno')return dayText(r);return `${r.turno_codigo||'Personalizado'}\n${r.hora_inicio.slice(0,5)}-${r.hora_fin.slice(0,5)}${planned(r).overnight?' (+1)':''}\nDesc. ${r.minutos_descanso} min\nNeto ${duration(planned(r).net)}`;}),duration(ds.reduce((s,f)=>s+planned(row(e,f)).net,0))]);}}
  const cols={0:{cellWidth:48},[ds.length+1]:{cellWidth:21}};for(let n=1;n<=ds.length;n++)cols[n]={cellWidth:(277-69)/ds.length};
  doc.autoTable({startY:32,margin:{top:32,left:10,right:10,bottom:18},head:[['Colaborador / área',...ds.map(f=>`${DIAS[dow(f)-1]} ${short(f).slice(0,5)}${app.data.festivos.some(h=>h.fecha===f)?' · F':''}`),'Neto prog.']],body,styles:{font:'helvetica',fontSize:7,cellPadding:2,overflow:'linebreak',valign:'middle'},headStyles:{fillColor:[0,74,161],fontSize:7.4},columnStyles:cols,showHead:'everyPage',rowPageBreak:'avoid',didParseCell:x=>{if(x.section==='head'&&x.column.index>0&&x.column.index<=ds.length){const f=ds[x.column.index-1];if(dow(f)===7||app.data.festivos.some(h=>h.fecha===f))x.cell.styles.fillColor=[150,58,35];}},didDrawPage:()=>{doc.setFont('helvetica','bold');doc.setFontSize(14);doc.text('Programación Administración - Calendario',10,14);doc.setFont('helvetica','normal');doc.setFontSize(9);doc.text(`Club Campestre de Pereira · ${short(ds[0])} al ${short(ds.at(-1))}`,10,21);doc.setFontSize(7.5);doc.text('Sin asignación: conserva la referencia de nómina; no significa ausencia. Horas programadas, no pagos aprobados.',10,27);}});
 });
 for(let i=1;i<=doc.getNumberOfPages();i++){doc.setPage(i);doc.setFontSize(8);doc.setTextColor(90);doc.text(`Página ${i} de ${doc.getNumberOfPages()} · Programación Administración`,10,203);}
 doc.save(`programacion_administracion_calendario_${app.period.start}.pdf`);
}

// Native fallback: the calendar remains printable when the external PDF CDN is unavailable.
function printCalendar(people){
 const w=window.open('', '_blank');
 if(!w)return status('Permite abrir la ventana del calendario para guardarlo como PDF.',true);
 const sections=[];
 for(let i=0;i<app.days.length;i+=7){
  const ds=app.days.slice(i,i+7);const groups=new Map();
  for(const e of people){if(!groups.has(e.proceso_nombre))groups.set(e.proceso_nombre,[]);groups.get(e.proceso_nombre).push(e);}
  let body='';
  for(const [g,list] of groups){
   body+=`<tr class="group"><th colspan="${ds.length+2}">${esc(g)}</th></tr>`;
   for(const e of list){body+=`<tr><th class="person">${esc(name(e))}<small>${esc(e.codigo||e.cedula)} · ${esc(e.cargo||'')}</small></th>${ds.map(f=>{
    const r=row(e,f),n=notice(e,f);let cell=!r?(n?`${NOVEDADES[n.codigo]||n.codigo} · Bienestar`:'Sin asignación'):r.tipo_registro!=='turno'?dayText(r):`${r.turno_codigo||'Personalizado'}\n${r.hora_inicio.slice(0,5)}–${r.hora_fin.slice(0,5)}${planned(r).overnight?' (+1 día)':''}\nDesc. ${r.minutos_descanso} min\nNeto ${duration(planned(r).net)}`;
    return `<td>${esc(cell).replaceAll('\n','<br>')}</td>`;
   }).join('')}<td class="total">${esc(duration(ds.reduce((s,f)=>s+planned(row(e,f)).net,0)))}</td></tr>`;}
  }
  sections.push(`<section class="sheet"><h1>Programación Administración</h1><p class="meta">Club Campestre de Pereira · Calendario del ${esc(short(ds[0]))} al ${esc(short(ds.at(-1)))}</p><p class="note">Sin asignación no significa ausencia: conserva la referencia vigente en nómina. Horas programadas, no pagos aprobados.</p><table><colgroup><col style="width:18%">${ds.map(()=>'<col>').join('')}<col style="width:8%"></colgroup><thead><tr><th>Colaborador / área</th>${ds.map(f=>`<th class="${dow(f)===7||app.data.festivos.some(h=>h.fecha===f)?'holiday':''}">${esc(DIAS[dow(f)-1])}<br>${esc(short(f))}${app.data.festivos.some(h=>h.fecha===f)?'<br>Festivo':''}</th>`).join('')}<th>Neto programado</th></tr></thead><tbody>${body}</tbody></table></section>`);
 }
 w.document.open();
 w.document.write(`<!doctype html><html lang="es"><head><meta charset="UTF-8"><title>Calendario_Administracion_${app.period.start}</title><style>
 @page{size:A4 landscape;margin:10mm}*{box-sizing:border-box}body{font:10px Arial,sans-serif;color:#172437;margin:0}h1{font-size:19px;margin:0 0 4px;color:#004aa1}.meta{font-size:12px;margin:0 0 5px}.note{font-size:9px;margin:0 0 10px;color:#43576c}table{width:100%;border-collapse:collapse;table-layout:fixed}thead{display:table-header-group}th,td{border:1px solid #cbd4df;padding:6px 4px;vertical-align:middle;overflow-wrap:anywhere;text-align:center;line-height:1.3}thead th{background:#004aa1;color:#fff;font-weight:600;font-size:10px}.holiday{background:#8e402c}.group th{background:#e1edfa;color:#004085;text-align:left}.group{break-after:avoid}.person{text-align:left;font-weight:bold}.person small{display:block;font-size:8px;font-weight:normal;margin-top:3px}.total{font-weight:bold}tr{break-inside:avoid}.sheet+.sheet{break-before:page}.bar{font:14px Arial;padding:12px;background:#edf4fb;border-bottom:1px solid #cbd4df;margin-bottom:14px}button{padding:8px 14px;background:#004aa1;color:white;border:0;border-radius:4px;cursor:pointer}@media print{.bar{display:none}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}@media screen{body{padding:16px}.sheet{max-width:1300px;margin:0 auto 30px}}
 </style></head><body><div class="bar"><button id="print">Guardar como PDF / Imprimir</button> Selecciona «Guardar como PDF» en la ventana de impresión.</div>${sections.join('')}</body></html>`);
 w.document.close();w.opener=null;
 w.document.getElementById('print').addEventListener('click',()=>w.print());
 status('Calendario abierto. Puedes guardarlo como PDF desde la ventana de impresión.');
 w.setTimeout(()=>{if(!w.closed)w.print();},350);
}
