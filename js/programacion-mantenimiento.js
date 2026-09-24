import { supabase } from '../supabase/supabaseClient.js';
import { exigirModulo } from './permisos-modulos.js?v=735';

const DIAS=['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
let sesion=null;
let data={procesos:[],turnos:[],personal:[],candidatos:[],programacion:[],festivos:[]};
let desde=null,hasta=null;
let diaActivo=null;
let candidatoSeleccionado=null;
let modalDia,modalTurnos,modalPersonal,modalVisual;

const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
const norm=v=>String(v??'').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const iso=d=>{const x=new Date(d);const y=x.getFullYear(),m=String(x.getMonth()+1).padStart(2,'0'),day=String(x.getDate()).padStart(2,'0');return `${y}-${m}-${day}`;};
const addDays=(s,n)=>{const d=new Date(`${s}T12:00:00`);d.setDate(d.getDate()+n);return iso(d);};
const mondayOf=s=>{const d=new Date(`${s}T12:00:00`),dow=d.getDay()||7;d.setDate(d.getDate()-(dow-1));return iso(d);};
const fmtDate=s=>new Intl.DateTimeFormat('es-CO',{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'UTC'}).format(new Date(`${s}T00:00:00Z`));
const fmtRange=(a,b)=>`${fmtDate(a)} – ${fmtDate(b)}`;
const dowIso=s=>{const d=new Date(`${s}T00:00:00Z`).getUTCDay();return d===0?7:d;};
const minTime=t=>{if(!t)return null;const [h,m]=String(t).slice(0,5).split(':').map(Number);return h*60+m;};
const netMinutes=(a,b,desc=0)=>{let x=minTime(a),y=minTime(b);if(x==null||y==null)return 0;if(y<=x)y+=1440;return Math.max(0,y-x-Number(desc||0));};
const hhmm=mins=>{mins=Math.round(Number(mins||0));return `${Math.floor(mins/60)} h ${String(mins%60).padStart(2,'0')} min`;};
const esNocturno=(inicio,fin,cruza)=>{const a=minTime(inicio),b=minTime(fin);return !!cruza||(a!=null&&a>=19*60)||(b!=null&&b>19*60);};
const rpc=async(name,args={})=>{const {data:out,error}=await supabase.rpc(name,args);if(error)throw error;return out;};

function alertBox(tipo,msg){const box=$('alertaMantenimiento');if(!box)return;box.innerHTML=`<div class="alert alert-${tipo} py-2 mb-0">${msg}</div>`;}
function clearAlert(){if($('alertaMantenimiento'))$('alertaMantenimiento').innerHTML='';}
function weekDates(){return Array.from({length:7},(_,i)=>addDays(desde,i));}
function festivo(fecha){return data.festivos.find(x=>x.fecha===fecha);}
function proceso(id){return data.procesos.find(x=>x.id===id);}
function turnosProceso(pid){return data.turnos.filter(x=>x.proceso_id===pid);}
function detalleTurno(turnoId,fecha){const t=data.turnos.find(x=>x.id===turnoId);return t?.dias?.find(d=>Number(d.dia)===dowIso(fecha))||null;}
function programacion(emp,fecha,pid){return data.programacion.find(x=>x.empleado_id===emp&&x.fecha===fecha&&x.proceso_id===pid)||null;}
function obsParts(text=''){const m=String(text||'').match(/^EVENTO:\s*([^|]+?)(?:\s*\|\s*(.*))?$/i);return m?{evento:m[1].trim(),nota:(m[2]||'').trim()}:{evento:'',nota:String(text||'')};}
function obsBuild(evento,nota){const e=String(evento||'').trim(),n=String(nota||'').trim();return e?`EVENTO: ${e}${n?` | ${n}`:''}`:(n||null);}

async function init(){
  sesion=await exigirModulo('programacion-mantenimiento');
  if(!sesion)return;
  modalDia=bootstrap.Modal.getOrCreateInstance($('modalDiaMantenimiento'));
  modalTurnos=bootstrap.Modal.getOrCreateInstance($('modalTurnosMantenimiento'));
  modalPersonal=bootstrap.Modal.getOrCreateInstance($('modalPersonalMantenimiento'));
  modalVisual=bootstrap.Modal.getOrCreateInstance($('modalVisualMantenimiento'));
  bind();
  const hoy=iso(new Date());
  $('fechaBaseMantenimiento').value=hoy;
  setWeek(hoy);
  await load();
}

function bind(){
  $('btnSemanaAnterior').onclick=async()=>{setWeek(addDays(desde,-7));await load();};
  $('btnSemanaSiguiente').onclick=async()=>{setWeek(addDays(desde,7));await load();};
  $('fechaBaseMantenimiento').onchange=async e=>{setWeek(e.target.value);await load();};
  $('btnActualizarMantenimiento').onclick=load;
  $('filtroProcesoMantenimiento').onchange=render;
  $('filtroPersonaMantenimiento').oninput=render;
  $('btnGestionTurnos').onclick=()=>{renderTurnos();modalTurnos.show();};
  $('btnGestionPersonal').onclick=()=>{renderPersonal();modalPersonal.show();};
  $('btnVisualMantenimiento').onclick=()=>{renderVisual();modalVisual.show();};
  $('btnImprimirMantenimiento').onclick=()=>{renderVisual();printVisual();};
  $('btnExportarMantenimiento').onclick=exportXlsx;
  $('btnExcelVisualMantenimiento').onclick=exportXlsx;
  $('btnPrintVisualMantenimiento').onclick=printVisual;
  $('btnCopiarSemana').onclick=copiarSemanaAnterior;
  $('bodyMantenimiento').addEventListener('click',e=>{const b=e.target.closest('[data-cell]');if(b)openDay(b.dataset.emp,b.dataset.proc,b.dataset.fecha);});
  $('diaTipoMantenimiento').onchange=syncDayType;
  $('diaTurnoMantenimiento').onchange=syncTurno;
  ['diaInicioMantenimiento','diaFinMantenimiento','diaDescansoMantenimiento'].forEach(id=>$(id).onchange=calcDayNet);
  $('btnGuardarDiaMantenimiento').onclick=saveDay;
  $('btnAplicarTurnoSemana').onclick=applyTurnoWeek;
  $('btnNuevoTurnoMantenimiento').onclick=()=>openTurnoEditor();
  $('btnCancelarTurnoMantenimiento').onclick=()=>hideTurnoEditor();
  $('btnGuardarTurnoMantenimiento').onclick=saveTurno;
  $('listaTurnosMantenimiento').addEventListener('click',e=>{
    const edit=e.target.closest('[data-edit-turno]');if(edit)openTurnoEditor(edit.dataset.editTurno);
    const del=e.target.closest('[data-del-turno]');if(del)deactivateTurno(del.dataset.delTurno);
  });
  $('turnoDiasMantenimiento').addEventListener('change',e=>{if(e.target.matches('select[data-tipo-dia]'))syncTurnoDayRow(e.target.closest('tr'));});
  $('buscarPersonalMantenimiento').oninput=renderCandidates;
  $('candidatosMantenimiento').addEventListener('click',e=>{const c=e.target.closest('[data-candidato]');if(c){candidatoSeleccionado=c.dataset.candidato;renderCandidates();}});
  $('btnAgregarPersonalMantenimiento').onclick=assignPersonal;
  $('personalActualMantenimiento').addEventListener('click',e=>{const b=e.target.closest('[data-quitar-personal]');if(b)removePersonal(b.dataset.quitarPersonal);});
}

function setWeek(base){desde=mondayOf(base);hasta=addDays(desde,6);$('fechaBaseMantenimiento').value=base;$('rangoSemanaMantenimiento').textContent=fmtRange(desde,hasta);}

async function load(){
  clearAlert();
  $('bodyMantenimiento').innerHTML='<tr><td colspan="8" class="p-4 text-center text-muted">Cargando programación...</td></tr>';
  try{
    data=await rpc('consultar_programacion_mantenimiento_v735',{p_desde:desde,p_hasta:hasta});
    fillFilters();render();
  }catch(e){console.error(e);alertBox('danger',`No se pudo cargar Mantenimiento: ${esc(e.message||e)}`);}
}

function fillFilters(){
  const cur=$('filtroProcesoMantenimiento').value;
  $('filtroProcesoMantenimiento').innerHTML='<option value="">Todos</option>'+data.procesos.map(p=>`<option value="${p.id}">${esc(p.nombre)}</option>`).join('');
  if(data.procesos.some(p=>p.id===cur))$('filtroProcesoMantenimiento').value=cur;
  const opts=data.procesos.map(p=>`<option value="${p.id}">${esc(p.nombre)}</option>`).join('');
  $('personalProcesoMantenimiento').innerHTML=opts;$('turnoProcesoMantenimiento').innerHTML=opts;
}

function visiblePersonal(){
  const pid=$('filtroProcesoMantenimiento').value,q=norm($('filtroPersonaMantenimiento').value);
  return data.personal.filter(p=>(!pid||p.proceso_id===pid)&&(!q||norm([p.nombres,p.apellidos,p.cedula,p.codigo,p.cargo,p.proceso_nombre].join(' ')).includes(q)));
}

function render(){renderHeader();renderBody();renderKpis();}
function renderHeader(){
  $('headerMantenimiento').innerHTML='<th class="empleado-col">Empleado / proceso</th>'+weekDates().map((f,i)=>{
    const fest=festivo(f),dom=dowIso(f)===7,cls=fest?'mant-festivo':dom?'mant-domingo':'';
    return `<th class="${cls}"><span class="mant-dia-nombre">${DIAS[i]}</span><span class="mant-dia-fecha">${fmtDate(f)}${fest?` · ${esc(fest.nombre)}`:''}</span></th>`;
  }).join('');
}

function renderBody(){
  const persons=visiblePersonal();
  if(!persons.length){$('bodyMantenimiento').innerHTML='<tr><td colspan="8" class="p-4 text-center text-muted">No hay personal para los filtros actuales.</td></tr>';return;}
  let html='',last='';
  for(const p of persons){
    if(p.proceso_id!==last){html+=`<tr class="mantenimiento-proceso-row"><td colspan="8">${esc(p.proceso_nombre)}</td></tr>`;last=p.proceso_id;}
    html+=`<tr><th><div class="mant-empleado-nombre">${esc(p.nombres)} ${esc(p.apellidos)}</div><div class="mant-empleado-meta">${esc(p.codigo||p.cedula||'')} · ${esc(p.cargo||'')}</div></th>`;
    for(const fecha of weekDates())html+=renderCell(p,fecha);
    html+='</tr>';
  }
  $('bodyMantenimiento').innerHTML=html;
}

function renderCell(p,fecha){
  const r=programacion(p.empleado_id,fecha,p.proceso_id);
  if(!r)return `<td class="mantenimiento-cell"><button data-cell data-emp="${p.empleado_id}" data-proc="${p.proceso_id}" data-fecha="${fecha}"><span class="cell-empty">+ Programar</span></button></td>`;
  const parts=obsParts(r.observacion),code=r.turno_codigo||'PERSONALIZADO';
  if(r.tipo_registro==='turno'){
    return `<td class="mantenimiento-cell"><button data-cell data-emp="${p.empleado_id}" data-proc="${p.proceso_id}" data-fecha="${fecha}"><span class="cell-code">${esc(code)}</span><div class="cell-time">${esc(r.hora_inicio)} – ${esc(r.hora_fin)} · descanso ${r.minutos_descanso||0} min</div>${r.cruza_medianoche||esNocturno(r.hora_inicio,r.hora_fin,r.cruza_medianoche)?'<div class="cell-night">Nocturno / madrugada</div>':''}${parts.evento?`<div class="cell-event">${esc(parts.evento)}</div>`:''}${parts.nota?`<div class="cell-note">${esc(parts.nota)}</div>`:''}</button></td>`;
  }
  const label=r.tipo_registro==='novedad'?(r.novedad_codigo||'NOVEDAD'):r.tipo_registro.toUpperCase();
  return `<td class="mantenimiento-cell"><button data-cell data-emp="${p.empleado_id}" data-proc="${p.proceso_id}" data-fecha="${fecha}"><span class="cell-code">${esc(label)}</span>${r.novedad_descripcion?`<div class="cell-note">${esc(r.novedad_descripcion)}</div>`:''}${parts.evento?`<div class="cell-event">${esc(parts.evento)}</div>`:''}</button></td>`;
}

function renderKpis(){
  const persons=visiblePersonal(),ids=new Set(persons.map(p=>p.empleado_id)),pid=$('filtroProcesoMantenimiento').value;
  const rows=data.programacion.filter(r=>ids.has(r.empleado_id)&&(!pid||r.proceso_id===pid));
  let mins=0,night=0;for(const r of rows)if(r.tipo_registro==='turno'){mins+=netMinutes(r.hora_inicio,r.hora_fin,r.minutos_descanso);if(esNocturno(r.hora_inicio,r.hora_fin,r.cruza_medianoche))night++;}
  $('kpiPersonalMantenimiento').textContent=persons.length;$('kpiJornadasMantenimiento').textContent=rows.length;$('kpiHorasMantenimiento').textContent=hhmm(mins);$('kpiNocturnasMantenimiento').textContent=night;
}

function openDay(emp,pid,fecha){
  const p=data.personal.find(x=>x.empleado_id===emp&&x.proceso_id===pid);if(!p)return;
  const r=programacion(emp,fecha,pid);diaActivo={emp,pid,fecha};
  $('diaPersonaMantenimiento').textContent=`${p.nombres} ${p.apellidos} · ${p.proceso_nombre} · ${fmtDate(fecha)}`;
  $('diaTurnoMantenimiento').innerHTML='<option value="">Horario personalizado</option>'+turnosProceso(pid).map(t=>`<option value="${t.id}">${esc(t.codigo)} · ${esc(t.nombre)}</option>`).join('');
  const parts=obsParts(r?.observacion||'');$('diaEventoMantenimiento').value=parts.evento;$('diaObservacionMantenimiento').value=parts.nota;
  if(!r){$('diaTipoMantenimiento').value='turno';$('diaTurnoMantenimiento').value='';$('diaInicioMantenimiento').value='';$('diaFinMantenimiento').value='';$('diaDescansoMantenimiento').value='0';}
  else if(r.tipo_registro==='turno'){$('diaTipoMantenimiento').value='turno';$('diaTurnoMantenimiento').value=r.horario_base_id||'';$('diaInicioMantenimiento').value=r.hora_inicio||'';$('diaFinMantenimiento').value=r.hora_fin||'';$('diaDescansoMantenimiento').value=String(r.minutos_descanso||0);}
  else if(r.tipo_registro==='descanso'||r.tipo_registro==='compensatorio'){$('diaTipoMantenimiento').value=r.tipo_registro;$('diaTurnoMantenimiento').value='';}
  else {$('diaTipoMantenimiento').value=['VAC','INC','DF'].includes(r.novedad_codigo)?r.novedad_codigo:'OTRA';$('diaTurnoMantenimiento').value='';}
  syncDayType();calcDayNet();modalDia.show();
}

function syncDayType(){const tipo=$('diaTipoMantenimiento').value,isTurn=tipo==='turno';$('grupoTurnoBaseMantenimiento').classList.toggle('d-none',!isTurn);document.querySelectorAll('.grupo-hora-mant').forEach(x=>x.classList.toggle('d-none',!isTurn));$('btnAplicarTurnoSemana').classList.toggle('d-none',!isTurn);$('diaAvisoMantenimiento').textContent=isTurn?'Puedes usar un código base o modificar solo esta jornada por un evento. Las horas guardadas alimentan Horas extras y nómina.':'La jornada queda registrada como novedad/descanso y no inventa marcaciones.';calcDayNet();}
function syncTurno(){const id=$('diaTurnoMantenimiento').value;if(!id||!diaActivo)return;const d=detalleTurno(id,diaActivo.fecha);if(!d)return;if(d.tipo!=='laboral'){$('diaTipoMantenimiento').value=d.tipo;syncDayType();return;}$('diaInicioMantenimiento').value=d.inicio||'';$('diaFinMantenimiento').value=d.fin||'';$('diaDescansoMantenimiento').value=String(d.descanso||0);calcDayNet();}
function calcDayNet(){$('diaNetoMantenimiento').textContent=$('diaTipoMantenimiento').value==='turno'?hhmm(netMinutes($('diaInicioMantenimiento').value,$('diaFinMantenimiento').value,$('diaDescansoMantenimiento').value)):'—';}

function buildDayPayload(fecha=diaActivo?.fecha){
  const tipoSel=$('diaTipoMantenimiento').value;let tipo='turno',nov=null,novDesc=null;
  if(tipoSel==='descanso'||tipoSel==='compensatorio')tipo=tipoSel;else if(tipoSel!=='turno'){tipo='novedad';nov=tipoSel==='OTRA'?'OTRA':tipoSel;novDesc=tipoSel==='VAC'?'Vacaciones':tipoSel==='INC'?'Incapacidad':tipoSel==='DF'?'Día libre':'Novedad';}
  const horario=$('diaTurnoMantenimiento').value||null;
  const selectedDetail=horario?detalleTurno(horario,fecha):null;
  const personalizado=tipo==='turno'&&(!horario||!selectedDetail||selectedDetail.tipo!=='laboral'||selectedDetail.inicio!==$('diaInicioMantenimiento').value||selectedDetail.fin!==$('diaFinMantenimiento').value||Number(selectedDetail.descanso||0)!==Number($('diaDescansoMantenimiento').value||0));
  return {empleado_id:diaActivo.emp,proceso_id:diaActivo.pid,fecha,tipo_registro:tipo,horario_base_id:tipo==='turno'?horario:null,personalizado,hora_inicio:tipo==='turno'?$('diaInicioMantenimiento').value:null,hora_fin:tipo==='turno'?$('diaFinMantenimiento').value:null,minutos_descanso:tipo==='turno'?Number($('diaDescansoMantenimiento').value||0):0,novedad_codigo:nov,novedad_descripcion:novDesc,observacion:obsBuild($('diaEventoMantenimiento').value,$('diaObservacionMantenimiento').value)};
}

async function saveDay(){try{const p=buildDayPayload();if(p.tipo_registro==='turno'&&(!p.hora_inicio||!p.hora_fin))throw Error('Indica entrada y salida.');$('btnGuardarDiaMantenimiento').disabled=true;await rpc('guardar_programacion_mantenimiento_v735',{p_payload:p});modalDia.hide();await load();alertBox('success','Jornada guardada. Horas extras y nómina utilizarán este horario guardado como referencia.');}catch(e){alert(e.message||e);}finally{$('btnGuardarDiaMantenimiento').disabled=false;}}

async function applyTurnoWeek(){
  try{const turno=$('diaTurnoMantenimiento').value;if(!turno)throw Error('Selecciona un código base antes de aplicarlo a toda la semana.');if(!confirm('Se aplicará este código a los 7 días según la definición de cada día. Los descansos/compensatorios del código también se respetarán. ¿Continuar?'))return;
    const items=weekDates().map(fecha=>{const d=detalleTurno(turno,fecha);if(!d)return null;if(d.tipo==='laboral')return {empleado_id:diaActivo.emp,proceso_id:diaActivo.pid,fecha,tipo_registro:'turno',horario_base_id:turno,personalizado:false,observacion:obsBuild($('diaEventoMantenimiento').value,$('diaObservacionMantenimiento').value)};return {empleado_id:diaActivo.emp,proceso_id:diaActivo.pid,fecha,tipo_registro:d.tipo,horario_base_id:null,personalizado:false,observacion:obsBuild($('diaEventoMantenimiento').value,$('diaObservacionMantenimiento').value)};}).filter(Boolean);
    await rpc('guardar_programacion_mantenimiento_v735',{p_payload:items});modalDia.hide();await load();alertBox('success','Código aplicado a la semana completa.');
  }catch(e){alert(e.message||e);}
}

function renderTurnos(){
  $('listaTurnosMantenimiento').innerHTML=data.procesos.map(p=>{const ts=turnosProceso(p.id);return `<section class="mb-3"><h6>${esc(p.nombre)}</h6>${ts.length?ts.map(t=>`<div class="mant-turno-card"><div class="d-flex justify-content-between gap-2"><div><strong>${esc(t.codigo)} · ${esc(t.nombre)}</strong><div class="mant-turno-dias">${esc(turnoSummary(t))}</div></div><div class="d-flex gap-2"><button class="btn btn-sm btn-outline-primary" data-edit-turno="${t.id}">Editar</button><button class="btn btn-sm btn-outline-danger" data-del-turno="${t.id}">Desactivar</button></div></div></div>`).join(''):'<div class="text-muted small">Sin códigos.</div>'}</section>`;}).join('');hideTurnoEditor();
}
function turnoSummary(t){return (t.dias||[]).map((d,i)=>`${DIAS[i]}: ${d.tipo==='laboral'?`${d.inicio}-${d.fin} / ${d.descanso||0}m`:d.tipo}`).join(' · ');}
function openTurnoEditor(id=''){
  const t=data.turnos.find(x=>x.id===id);$('editorTurnoMantenimiento').classList.remove('d-none');$('tituloEditorTurno').textContent=t?'Editar turno':'Nuevo turno';$('turnoIdMantenimiento').value=t?.id||'';$('turnoProcesoMantenimiento').value=t?.proceso_id||data.procesos[0]?.id||'';$('turnoCodigoMantenimiento').value=t?.codigo||'';$('turnoNombreMantenimiento').value=t?.nombre||'';$('turnoDescripcionMantenimiento').value=t?.descripcion||'';
  $('turnoDiasMantenimiento').innerHTML=DIAS.map((name,i)=>{const d=t?.dias?.find(x=>Number(x.dia)===i+1)||{tipo:'descanso',inicio:'',fin:'',descanso:0};return `<tr data-dia="${i+1}"><td><strong>${name}</strong></td><td><select class="form-select form-select-sm" data-tipo-dia><option value="laboral" ${d.tipo==='laboral'?'selected':''}>Laboral</option><option value="descanso" ${d.tipo==='descanso'?'selected':''}>Descanso</option><option value="compensatorio" ${d.tipo==='compensatorio'?'selected':''}>Compensatorio</option></select></td><td><input type="time" class="form-control form-control-sm" data-inicio value="${d.inicio||''}"></td><td><input type="time" class="form-control form-control-sm" data-fin value="${d.fin||''}"></td><td><select class="form-select form-select-sm" data-descanso><option value="0" ${Number(d.descanso||0)===0?'selected':''}>0 min</option><option value="30" ${Number(d.descanso||0)===30?'selected':''}>30 min</option><option value="60" ${Number(d.descanso||0)===60?'selected':''}>1 hora</option><option value="90" ${Number(d.descanso||0)===90?'selected':''}>1 h 30</option></select></td></tr>`;}).join('');$('turnoDiasMantenimiento').querySelectorAll('tr').forEach(syncTurnoDayRow);
}
function hideTurnoEditor(){$('editorTurnoMantenimiento').classList.add('d-none');}
function syncTurnoDayRow(tr){if(!tr)return;const work=tr.querySelector('[data-tipo-dia]').value==='laboral';tr.querySelector('[data-inicio]').disabled=!work;tr.querySelector('[data-fin]').disabled=!work;tr.querySelector('[data-descanso]').disabled=!work;if(!work){tr.querySelector('[data-inicio]').value='';tr.querySelector('[data-fin]').value='';tr.querySelector('[data-descanso]').value='0';}}
async function saveTurno(){
  try{const dias=[...$('turnoDiasMantenimiento').querySelectorAll('tr')].map(tr=>({dia:Number(tr.dataset.dia),tipo:tr.querySelector('[data-tipo-dia]').value,inicio:tr.querySelector('[data-inicio]').value||null,fin:tr.querySelector('[data-fin]').value||null,descanso:Number(tr.querySelector('[data-descanso]').value||0)}));const payload={id:$('turnoIdMantenimiento').value||null,proceso_id:$('turnoProcesoMantenimiento').value,codigo:$('turnoCodigoMantenimiento').value,nombre:$('turnoNombreMantenimiento').value,descripcion:$('turnoDescripcionMantenimiento').value,dias};await rpc('guardar_turno_mantenimiento_v735',{p_payload:payload});await load();renderTurnos();alertBox('success','Turno guardado. Los cambios futuros no alteran jornadas ya guardadas.');}catch(e){alert(e.message||e);}
}
async function deactivateTurno(id){if(!confirm('El turno dejará de estar disponible para nuevas programaciones. El histórico se conserva. ¿Continuar?'))return;try{await rpc('desactivar_turno_mantenimiento_v735',{p_horario_id:id});await load();renderTurnos();}catch(e){alert(e.message||e);}}

function renderPersonal(){candidatoSeleccionado=null;$('buscarPersonalMantenimiento').value='';renderCandidates();renderCurrentPersonal();}
function renderCandidates(){const q=norm($('buscarPersonalMantenimiento').value);const rows=data.candidatos.filter(x=>!q||norm([x.nombres,x.apellidos,x.cedula,x.codigo,x.cargo,x.centro_costos].join(' ')).includes(q)).slice(0,30);$('candidatosMantenimiento').innerHTML=rows.map(x=>`<div class="mant-candidato ${candidatoSeleccionado===x.empleado_id?'seleccionado':''}" data-candidato="${x.empleado_id}"><strong>${esc(x.nombres)} ${esc(x.apellidos)}</strong><div class="small text-muted">${esc(x.codigo||x.cedula||'')} · ${esc(x.cargo||'')}</div>${x.ya_asignado?'<span class="badge text-bg-info mt-1">Ya está en Mantenimiento</span>':''}</div>`).join('')||'<div class="text-muted">Sin coincidencias.</div>';}
function renderCurrentPersonal(){$('personalActualMantenimiento').innerHTML=`<div class="table-responsive"><table class="table table-sm"><thead><tr><th>Empleado</th><th>Proceso</th><th></th></tr></thead><tbody>${data.personal.map(p=>`<tr><td><strong>${esc(p.nombres)} ${esc(p.apellidos)}</strong><div class="small text-muted">${esc(p.cargo||'')}</div></td><td>${esc(p.proceso_nombre)}</td><td class="text-end"><button class="btn btn-sm btn-outline-danger" data-quitar-personal="${p.vinculacion_id}">Retirar</button></td></tr>`).join('')}</tbody></table></div>`;}
async function assignPersonal(){if(!candidatoSeleccionado)return alert('Selecciona un empleado.');const pid=$('personalProcesoMantenimiento').value;if(!pid)return alert('Selecciona el proceso.');try{await rpc('asignar_personal_mantenimiento_v735',{p_empleado_id:candidatoSeleccionado,p_proceso_id:pid});await load();renderPersonal();alertBox('success','Personal actualizado.');}catch(e){alert(e.message||e);}}
async function removePersonal(id){if(!confirm('Se retirará del programador de Mantenimiento. El histórico no se borra. ¿Continuar?'))return;try{await rpc('quitar_personal_mantenimiento_v735',{p_vinculacion_id:id});await load();renderPersonal();}catch(e){alert(e.message||e);}}

async function copiarSemanaAnterior(){
  if(!confirm(`Se copiará la programación de ${fmtRange(addDays(desde,-7),addDays(hasta,-7))} sobre ${fmtRange(desde,hasta)}. Las jornadas existentes del destino serán reemplazadas por la copia. ¿Continuar?`))return;
  try{const prev=await rpc('consultar_programacion_mantenimiento_v735',{p_desde:addDays(desde,-7),p_hasta:addDays(hasta,-7)});if(!prev.programacion?.length)throw Error('La semana anterior no tiene jornadas guardadas.');const items=prev.programacion.map(r=>({empleado_id:r.empleado_id,proceso_id:r.proceso_id,fecha:addDays(r.fecha,7),tipo_registro:r.tipo_registro,horario_base_id:r.horario_base_id||null,personalizado:r.tipo_registro==='turno',hora_inicio:r.hora_inicio,hora_fin:r.hora_fin,minutos_descanso:r.minutos_descanso,novedad_codigo:r.novedad_codigo,novedad_descripcion:r.novedad_descripcion,observacion:r.observacion}));await rpc('guardar_programacion_mantenimiento_v735',{p_payload:items});await load();alertBox('success',`Se copiaron ${items.length} jornadas.`);}catch(e){alert(e.message||e);}
}

function visualRows(){const rows=[];for(const p of visiblePersonal()){for(const fecha of weekDates()){const r=programacion(p.empleado_id,fecha,p.proceso_id);rows.push({Proceso:p.proceso_nombre,Codigo:p.codigo||'',Empleado:`${p.nombres} ${p.apellidos}`,Fecha:fecha,Dia:DIAS[dowIso(fecha)-1],Turno:r?.turno_codigo||'',Tipo:r?.tipo_registro||'Sin programar',Entrada:r?.hora_inicio||'',Salida:r?.hora_fin||'',Descanso:r?.tipo_registro==='turno'?`${r.minutos_descanso||0} min`:'',Neto:r?.tipo_registro==='turno'?hhmm(netMinutes(r.hora_inicio,r.hora_fin,r.minutos_descanso)):'',Novedad:r?.novedad_codigo||'',Observacion:r?.observacion||''});}}return rows;}
function renderVisual(){const persons=visiblePersonal();let html=`<div class="mant-print-title">Programación semanal de Mantenimiento</div><div class="mb-3">${fmtRange(desde,hasta)}</div><div class="table-responsive"><table class="table table-bordered mant-visual-table"><thead><tr><th>Empleado</th>${weekDates().map((f,i)=>`<th>${DIAS[i]}<br><small>${fmtDate(f)}</small></th>`).join('')}</tr></thead><tbody>`;let last='';for(const p of persons){if(p.proceso_id!==last){html+=`<tr class="mant-visual-proceso"><td colspan="8">${esc(p.proceso_nombre)}</td></tr>`;last=p.proceso_id;}html+=`<tr><td><strong>${esc(p.nombres)} ${esc(p.apellidos)}</strong><br><small>${esc(p.cargo||'')}</small></td>`;for(const f of weekDates()){const r=programacion(p.empleado_id,f,p.proceso_id);if(!r){html+='<td>—</td>';continue;}if(r.tipo_registro==='turno')html+=`<td><strong>${esc(r.turno_codigo||'PERSONALIZADO')}</strong><br>${esc(r.hora_inicio)}–${esc(r.hora_fin)}<br><small>Desc. ${r.minutos_descanso||0} min</small>${r.observacion?`<br><small>${esc(r.observacion)}</small>`:''}</td>`;else html+=`<td><strong>${esc(r.novedad_codigo||r.tipo_registro.toUpperCase())}</strong>${r.observacion?`<br><small>${esc(r.observacion)}</small>`:''}</td>`;}html+='</tr>';}html+='</tbody></table></div>';$('visualMantenimientoContenido').innerHTML=html;}
function printVisual(){renderVisual();const w=window.open('','_blank','width=1400,height=900');if(!w)return alert('Permite ventanas emergentes para imprimir.');w.document.write(`<!doctype html><html><head><title>Programación Mantenimiento</title><style>@page{size:landscape;margin:10mm}body{font-family:Arial,sans-serif;color:#111}h1{color:#004AA1}table{width:100%;border-collapse:collapse;font-size:10px}th,td{border:1px solid #777;padding:5px;vertical-align:top}th{background:#004AA1;color:#fff}.proc td{background:#eaf4ff;color:#004AA1;font-weight:bold}</style></head><body><h1>Programación semanal de Mantenimiento</h1><p>${fmtRange(desde,hasta)}</p>${$('visualMantenimientoContenido').querySelector('table').outerHTML.replaceAll('mant-visual-proceso','proc')}</body></html>`);w.document.close();w.focus();setTimeout(()=>w.print(),250);}
function exportXlsx(){if(!window.XLSX)return alert('No se pudo cargar la librería de Excel.');const rows=visualRows();const ws=XLSX.utils.json_to_sheet(rows);ws['!cols']=[{wch:24},{wch:12},{wch:32},{wch:12},{wch:12},{wch:18},{wch:16},{wch:10},{wch:10},{wch:12},{wch:14},{wch:12},{wch:40}];const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Programacion');XLSX.writeFile(wb,`Programacion_Mantenimiento_${desde}_${hasta}.xlsx`);}

document.addEventListener('DOMContentLoaded',init);
