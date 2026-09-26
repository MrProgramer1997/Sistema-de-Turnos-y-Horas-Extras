import { supabase } from '../supabase/supabaseClient.js';
import { exigirModulo, filtrarEnlaces } from './permisos-modulos.js?v=735';

const VERSION = '738.1';
const STORAGE_COPIA = 'ccp_turno_copiado_operaciones_v738';
const MAX_DIAS = 14;
const META_HORAS = 42;
const NOVEDADES_LABEL = {
  VAC:'Vacaciones',INC:'Incapacidad',F:'Día de la familia',LR:'Licencia no remunerada',NC:'No compensatorio',
  SP:'Suspensión',CITA:'Cita',COMP:'Compensatorio',PASA:'Pasa a otro puesto',NNJ:'Novedad no justificada'
};

let sesion = null;
let estado = { procesos:[], personal:[], candidatos:[], turnos_oficios:[], turnos_coordinador:[], programacion:[], festivos:[] };
let periodo = { inicio:'', fin:'' };
let dias = [];
let copia = null;
let modalAsignacion = null;
let modalPersonal = null;
let modalTurnos = null;
let cargando = false;

const $ = (id) => document.getElementById(id);
const texto = (v) => String(v ?? '').trim();

window.addEventListener('DOMContentLoaded', iniciar);

async function iniciar(){
  sesion = await exigirModulo('programacion-operaciones');
  if(!sesion) return;
  filtrarEnlaces(sesion);
  modalAsignacion = new bootstrap.Modal($('modalAsignacionOps'));
  modalPersonal = new bootstrap.Modal($('modalPersonalOps'));
  modalTurnos = new bootstrap.Modal($('modalTurnosBaseOps'));
  cargarCopiaLocal();
  periodo = periodoActualOperaciones();
  sincronizarPeriodo();
  configurarEventos();
  $('textoUsuarioOperaciones').textContent = sesion.nombre_completo || sesion.correo || '';
  await cargarDatos();
}

function configurarEventos(){
  $('btnCargarPeriodoOps').addEventListener('click', async()=>{
    const inicio=$('fechaInicioOps').value,fin=$('fechaFinOps').value;
    if(!validarPeriodo(inicio,fin)) return;
    periodo={inicio,fin}; await cargarDatos();
  });
  $('btnPeriodoAnteriorOps').addEventListener('click',()=>desplazarPeriodo(-longitudPeriodo()));
  $('btnPeriodoSiguienteOps').addEventListener('click',()=>desplazarPeriodo(longitudPeriodo()));
  $('btnPeriodoActualOps').addEventListener('click',async()=>{periodo=periodoActualOperaciones();sincronizarPeriodo();await cargarDatos();});
  $('btnNuevaAsignacionOps').addEventListener('click',()=>abrirAsignacion());
  $('btnGestionPersonalOps').addEventListener('click',()=>{renderGestionPersonal();modalPersonal.show();});
  $('btnTurnosBaseOps').addEventListener('click',()=>{renderTurnosBase();modalTurnos.show();});
  $('btnCopiarPeriodoOps').addEventListener('click',copiarPeriodoAnterior);
  $('btnPantallaCompletaOps').addEventListener('click',alternarPantallaCompleta);
  $('btnLimpiarCopiaOps').addEventListener('click',limpiarCopia);
  $('formAsignacionOps').addEventListener('submit',guardarAsignacion);
  $('btnEliminarAsignacionOps').addEventListener('click',eliminarAsignacionActual);
  $('empleadoAsignacionOps').addEventListener('change',()=>{renderTurnosSelect();actualizarPreviewTurno();});
  $('fechaAsignacionOps').addEventListener('change',()=>{renderTurnosSelect();actualizarPreviewTurno();});
  $('tipoRegistroOps').addEventListener('change',actualizarFormularioTipo);
  $('turnoBaseOps').addEventListener('change',actualizarPreviewTurno);
  $('checkPersonalizadoOps').addEventListener('change',actualizarPersonalizado);
  $('buscarPersonalOps').addEventListener('input',renderGestionPersonal);
  $('filtroEmpleadoOps').addEventListener('input',renderTodo);
  $('filtroProcesoOps').addEventListener('change',renderTodo);
  $('filtroEstadoOps').addEventListener('change',renderTodo);
  $('btnLimpiarFiltrosOps').addEventListener('click',()=>{ $('filtroEmpleadoOps').value='';$('filtroProcesoOps').value='';$('filtroEstadoOps').value='todos';renderTodo(); });
  $('selectEmpleadoRevisionOps').addEventListener('change',renderDetalleEmpleado);
  $('btnPdfGeneralOps').addEventListener('click',pdfGeneral);
  $('btnPdfCalendarioOps').addEventListener('click',pdfCalendario);
  $('btnPdfOperativoOps').addEventListener('click',pdfOperativo);
  $('btnPdfEmpleadoOps').addEventListener('click',()=>pdfEmpleado(false));
  $('btnPdfFichaOps').addEventListener('click',()=>pdfEmpleado(true));
}

function periodoActualOperaciones(){
  const hoy=new Date(); hoy.setHours(0,0,0,0);
  const diff=(hoy.getDay()+6)%7; // lunes = inicio; domingo = cierre de semana
  const inicio=new Date(hoy); inicio.setDate(hoy.getDate()-diff);
  const fin=new Date(inicio); fin.setDate(inicio.getDate()+6);
  return {inicio:iso(inicio),fin:iso(fin)};
}
function iso(fecha){return `${fecha.getFullYear()}-${String(fecha.getMonth()+1).padStart(2,'0')}-${String(fecha.getDate()).padStart(2,'0')}`;}
function fechaLocal(s){return new Date(`${s}T00:00:00`);}
function sumarDias(s,n){const d=fechaLocal(s);d.setDate(d.getDate()+n);return iso(d);}
function rangoFechas(inicio,fin){const out=[];let d=fechaLocal(inicio),f=fechaLocal(fin);while(d<=f){out.push(iso(d));d.setDate(d.getDate()+1);}return out;}
function longitudPeriodo(){return rangoFechas(periodo.inicio,periodo.fin).length||7;}
function validarPeriodo(inicio,fin){
  const arr=rangoFechas(inicio,fin);
  if(!inicio||!fin||!arr.length){alert('Selecciona un periodo válido.');return false;}
  if(arr.length>MAX_DIAS){alert(`El periodo visible puede tener máximo ${MAX_DIAS} días.`);return false;}
  return true;
}
async function desplazarPeriodo(n){periodo={inicio:sumarDias(periodo.inicio,n),fin:sumarDias(periodo.fin,n)};sincronizarPeriodo();await cargarDatos();}
function sincronizarPeriodo(){ $('fechaInicioOps').value=periodo.inicio;$('fechaFinOps').value=periodo.fin;dias=rangoFechas(periodo.inicio,periodo.fin); }

async function cargarDatos(){
  if(cargando) return;
  cargando=true;document.body.classList.add('ops-loading');sincronizarPeriodo();
  try{
    const {data,error}=await supabase.rpc('consultar_programacion_operaciones_v738',{p_desde:periodo.inicio,p_hasta:periodo.fin});
    if(error) throw error;
    estado={...estado,...(data||{})};
    dias=rangoFechas(periodo.inicio,periodo.fin);
    actualizarCabeceraPeriodo();
    llenarFiltros();
    llenarSelectEmpleados();
    renderTodo();
  }catch(e){console.error(e);alert(`No se pudo cargar Programación Operaciones: ${e.message||e}`);}
  finally{cargando=false;document.body.classList.remove('ops-loading');}
}

function actualizarCabeceraPeriodo(){
  const a=fechaLocal(periodo.inicio),b=fechaLocal(periodo.fin);
  $('textoPeriodoOperaciones').textContent=`${formatoFechaCorta(periodo.inicio)} al ${formatoFechaCorta(periodo.fin)}`;
  $('subtituloOperaciones').textContent=`Servicios Generales · Vestier · Coordinación | ${a.toLocaleDateString('es-CO',{month:'long'})}${a.getMonth()!==b.getMonth()?` – ${b.toLocaleDateString('es-CO',{month:'long'})}`:''}`;
}
function formatoFechaCorta(s){const [y,m,d]=s.split('-');return `${d}/${m}/${y}`;}
function nombreDia(s){return fechaLocal(s).toLocaleDateString('es-CO',{weekday:'short'}).replace('.','');}
function esFestivo(s){return estado.festivos.some(f=>f.fecha===s);}
function festivoDe(s){return estado.festivos.find(f=>f.fecha===s)||null;}
function esDomingo(s){return fechaLocal(s).getDay()===0;}
function esLunes(s){return fechaLocal(s).getDay()===1;}

function llenarFiltros(){
  const actual=$('filtroProcesoOps').value;
  $('filtroProcesoOps').innerHTML='<option value="">Todos</option>'+estado.procesos.map(p=>`<option value="${esc(p.codigo)}">${esc(p.nombre)}</option>`).join('');
  if([...$('filtroProcesoOps').options].some(o=>o.value===actual)) $('filtroProcesoOps').value=actual;
}
function llenarSelectEmpleados(){
  const html='<option value="">Seleccione</option>'+estado.personal.map(e=>`<option value="${e.empleado_id}">${esc(nombreEmpleado(e))} · ${esc(e.cargo||'')}</option>`).join('');
  const rev=$('selectEmpleadoRevisionOps').value,asg=$('empleadoAsignacionOps').value;
  $('selectEmpleadoRevisionOps').innerHTML=html;$('empleadoAsignacionOps').innerHTML=html;
  if([...$('selectEmpleadoRevisionOps').options].some(o=>o.value===rev)) $('selectEmpleadoRevisionOps').value=rev;
  if([...$('empleadoAsignacionOps').options].some(o=>o.value===asg)) $('empleadoAsignacionOps').value=asg;
}
function nombreEmpleado(e){return `${e.nombres||''} ${e.apellidos||''}`.replace(/\s+/g,' ').trim();}
function empleadoPorId(id){return estado.personal.find(e=>e.empleado_id===id)||null;}
function registroDe(empleadoId,fecha){return estado.programacion.find(r=>r.empleado_id===empleadoId&&r.fecha===fecha)||null;}
function registrosEmpleado(id){return estado.programacion.filter(r=>r.empleado_id===id&&dias.includes(r.fecha));}

function renderTodo(){renderMatriz();renderKPIs();renderResumen();renderDetalleEmpleado();renderBannerCopia();}

function empleadosFiltrados(){
  const q=normalizar($('filtroEmpleadoOps').value),proc=$('filtroProcesoOps').value,st=$('filtroEstadoOps').value;
  return estado.personal.filter(e=>{
    if(proc&&e.proceso_codigo!==proc)return false;
    if(q&&!normalizar([nombreEmpleado(e),e.cedula,e.codigo,e.cargo].join(' ')).includes(q))return false;
    const regs=registrosEmpleado(e.empleado_id);const resumen=resumenEmpleado(e.empleado_id);
    if(st==='con-programacion'&&!regs.length)return false;
    if(st==='sin-programacion'&&regs.length)return false;
    if(st==='con-novedad'&&!regs.some(r=>r.tipo_registro==='novedad'))return false;
    if(st==='sobre-meta'&&resumen.netoMin<=META_HORAS*60)return false;
    return true;
  });
}

function renderMatriz(){
  const head=$('trEncabezadoOps');
  head.innerHTML='<th class="ops-sticky-col">Empleado / cargo</th>'+dias.map(d=>{
    const fest=festivoDe(d),especial=fest||esDomingo(d);
    return `<th class="${especial?'ops-festivo-header':''}">${cap(nombreDia(d))}<br><span class="small">${formatoFechaCorta(d).slice(0,5)}</span>${fest?`<span class="ops-festivo-mark">${esc(fest.nombre||'FESTIVO')}</span>`:esDomingo(d)?'<span class="ops-festivo-mark">DOMINGO</span>':''}</th>`;
  }).join('');
  const emps=empleadosFiltrados();
  $('textoResultadoOps').textContent=`${emps.length} de ${estado.personal.length} colaboradores visibles`;
  $('tbodyOperaciones').innerHTML=emps.length?emps.map(e=>filaEmpleado(e)).join(''):'<tr><td colspan="20" class="text-center text-muted py-4">No hay colaboradores para los filtros seleccionados.</td></tr>';
}
function filaEmpleado(e){
  const res=resumenEmpleado(e.empleado_id);
  return `<tr><th class="ops-sticky-col"><div class="ops-employee-name">${esc(nombreEmpleado(e))}</div><div class="ops-employee-meta">${esc(e.cargo||'')} · ${esc(e.codigo||e.cedula||'')}</div><span class="ops-process-pill">${esc(e.proceso_nombre||'')}</span><div><span class="ops-hours-badge">${fmtHoras(res.netoMin)} netas</span></div></th>${dias.map(d=>celda(e,d)).join('')}</tr>`;
}
function celda(e,fecha){
  const r=registroDe(e.empleado_id,fecha),especial=esFestivo(fecha)||esDomingo(fecha);
  if(!r){return `<td class="${especial?'ops-festivo-cell':''}"><div class="ops-cell ops-cell-empty" onclick="window.opsNuevaCelda('${e.empleado_id}','${fecha}')"><span>+ Programar</span>${copia?`<button class="ops-paste-btn" type="button" onclick="event.stopPropagation();window.opsPegarCelda('${e.empleado_id}','${fecha}')">Pegar</button>`:''}</div></td>`;}
  const clase=r.tipo_registro==='turno'?'ops-cell-turno':r.tipo_registro==='novedad'?'ops-cell-novedad':r.tipo_registro==='compensatorio'?'ops-cell-compensatorio':'ops-cell-descanso';
  const titulo=r.tipo_registro==='turno'?(r.turno_codigo||'Personalizado'):r.tipo_registro==='novedad'?(r.novedad_codigo||'Novedad'):cap(r.tipo_registro);
  const horario=r.tipo_registro==='turno'?`${hh(r.hora_inicio)}–${hh(r.hora_fin)}${r.cruza_medianoche?' +1':''}`:'';
  const n=netoRegistro(r);
  return `<td class="${especial?'ops-festivo-cell':''}"><div class="ops-cell ${clase}" onclick="window.opsEditarCelda('${r.id}')"><div class="ops-cell-code">${esc(titulo)}</div>${horario?`<div class="ops-cell-time">${esc(horario)} · ${fmtHoras(n.netoMin)}</div>`:''}${r.novedad_descripcion?`<div class="ops-cell-note">${esc(r.novedad_descripcion)}</div>`:''}${r.observacion?`<div class="ops-cell-note">${esc(r.observacion)}</div>`:''}<div class="ops-cell-actions"><button type="button" onclick="event.stopPropagation();window.opsCopiarCelda('${r.id}')">C</button>${copia?`<button class="ops-paste-btn" type="button" onclick="event.stopPropagation();window.opsPegarCelda('${e.empleado_id}','${fecha}')">P</button>`:''}</div></div></td>`;
}

function renderKPIs(){
  let net=0,pro=0;
  estado.programacion.filter(r=>dias.includes(r.fecha)).forEach(r=>{const x=netoRegistro(r);net+=x.netoMin;pro+=x.prolongacionMin;});
  const sin=estado.personal.filter(e=>!registrosEmpleado(e.empleado_id).length).length;
  $('kpiPersonalOps').textContent=estado.personal.length;
  $('kpiHorasNetasOps').textContent=fmtHoras(net);
  $('kpiProlongacionOps').textContent=fmtHoras(pro);
  $('kpiSinProgramacionOps').textContent=sin;
}
function renderResumen(){
  const rows=estado.personal.map(e=>({e,...resumenEmpleado(e.empleado_id)}));
  $('tbodyResumenOps').innerHTML=rows.map(x=>{
    const diff=x.netoMin-META_HORAS*60,cl=diff>0?'ops-diff-over':diff===0?'ops-diff-ok':'ops-diff-under';
    return `<tr><td><strong>${esc(nombreEmpleado(x.e))}</strong><div class="small text-muted">${esc(x.e.cargo||'')}</div></td><td>${esc(x.e.proceso_nombre||'')}</td><td>${x.diasProg}</td><td>${fmtHoras(x.ordinariasMin)}</td><td>${fmtHoras(x.prolongacionMin)}</td><td><strong>${fmtHoras(x.netoMin)}</strong></td><td class="${cl}">${diff===0?'En meta':`${diff>0?'+':'−'}${fmtHoras(Math.abs(diff))}`}</td></tr>`;
  }).join('');
}
function resumenEmpleado(id){
  let netoMin=0,prolongacionMin=0,diasProg=0;
  registrosEmpleado(id).forEach(r=>{if(r.tipo_registro==='turno'){const x=netoRegistro(r);netoMin+=x.netoMin;prolongacionMin+=x.prolongacionMin;diasProg++;}});
  return {netoMin,prolongacionMin,ordinariasMin:Math.max(0,netoMin-prolongacionMin),diasProg};
}
function netoRegistro(r){
  if(r.tipo_registro!=='turno'||!r.hora_inicio||!r.hora_fin)return {netoMin:0,prolongacionMin:0};
  let a=minutosHora(r.hora_inicio),b=minutosHora(r.hora_fin);if(r.cruza_medianoche||b<=a)b+=1440;
  const net=Math.max(0,b-a-Number(r.minutos_descanso||0));
  const pro=Math.min(net,Number(r.prolongacion_minutos||prolongacionPorCodigo(r.turno_codigo)||0));
  return {netoMin:net,prolongacionMin:pro};
}
function prolongacionPorCodigo(c){return estado.turnos_oficios.find(t=>t.codigo===c)?.prolongacion||0;}
function minutosHora(v){const [h,m]=hh(v).split(':').map(Number);return h*60+m;}
function fmtHoras(min){const h=Math.floor(min/60),m=Math.round(min%60);return m?`${h} h ${m} min`:`${h} h`;}
function hh(v){return texto(v).slice(0,5);}

function renderDetalleEmpleado(){
  const id=$('selectEmpleadoRevisionOps').value,e=empleadoPorId(id),box=$('detalleEmpleadoRevisionOps');
  if(!e){box.className='ops-employee-detail mb-3 text-muted';box.textContent='Selecciona un colaborador para revisar su programación.';return;}
  const r=resumenEmpleado(id),regs=registrosEmpleado(id).sort((a,b)=>a.fecha.localeCompare(b.fecha));
  const diff=r.netoMin-META_HORAS*60;
  box.className='ops-employee-detail mb-3';
  box.innerHTML=`<strong>${esc(nombreEmpleado(e))}</strong><div>${esc(e.cargo||'')} · ${esc(e.proceso_nombre||'')}</div><hr class="my-2"><div><strong>${fmtHoras(r.netoMin)}</strong> netas · ${fmtHoras(r.prolongacionMin)} prolongación</div><div>${diff===0?'Cumple referencia de 42 h':diff>0?`${fmtHoras(diff)} sobre la referencia`:`${fmtHoras(Math.abs(diff))} por debajo de la referencia`}</div><div class="small text-muted mt-1">${regs.length} registros en el periodo visible.</div>`;
}

function abrirAsignacion(empleadoId='',fecha='',registro=null){
  $('formAsignacionOps').reset();$('errorAsignacionOps').classList.add('d-none');$('registroIdOps').value=registro?.id||'';
  $('tituloModalOps').textContent=registro?'Editar asignación':'Nueva asignación';
  $('btnEliminarAsignacionOps').classList.toggle('d-none',!registro);
  $('empleadoAsignacionOps').value=empleadoId||registro?.empleado_id||estado.personal[0]?.empleado_id||'';
  $('fechaAsignacionOps').value=fecha||registro?.fecha||periodo.inicio;
  $('tipoRegistroOps').value=registro?.tipo_registro||'turno';
  $('observacionOps').value=registro?.observacion||'';
  $('novedadCodigoOps').value=registro?.novedad_codigo||'';
  $('novedadDescripcionOps').value=registro?.novedad_descripcion||'';
  const custom=registro?.tipo_registro==='turno'&&!registro?.turno_codigo;
  $('checkPersonalizadoOps').checked=!!custom;
  $('horaInicioOps').value=registro?.hora_inicio?hh(registro.hora_inicio):'';
  $('horaFinOps').value=registro?.hora_fin?hh(registro.hora_fin):'';
  $('descansoOps').value=String(registro?.minutos_descanso??30);
  renderTurnosSelect(registro?.turno_codigo||'');
  actualizarFormularioTipo();actualizarPersonalizado();actualizarPreviewTurno();modalAsignacion.show();
}
function renderTurnosSelect(valor=''){
  const e=empleadoPorId($('empleadoAsignacionOps').value),fecha=$('fechaAsignacionOps').value;
  let list=[];
  if(e?.proceso_codigo==='OPS_COORDINADOR') list=estado.turnos_coordinador;
  else if(e?.proceso_codigo==='OPS_AUX_VESTIER') list=estado.turnos_oficios.filter(t=>t.proceso_catalogo==='OPS_AUX_VESTIER');
  else if(e?.proceso_codigo==='OPS_SERVICIOS_GENERALES') list=estado.turnos_oficios;
  list=list.filter(t=>aplicaTurnoFecha(t,fecha));
  $('turnoBaseOps').innerHTML='<option value="">Seleccione</option>'+list.map(t=>`<option value="${esc(t.codigo)}">${esc(t.nombre)} · ${esc(previewTurnoTexto(t,fecha))}</option>`).join('');
  const objetivo=valor||$('turnoBaseOps').dataset.valor||'';
  if([...$('turnoBaseOps').options].some(o=>o.value===objetivo)) $('turnoBaseOps').value=objetivo;
  $('turnoBaseOps').dataset.valor='';
}
function aplicaTurnoFecha(t,fecha){
  if(!fecha)return true;
  if(t.tipo_catalogo==='coordinador')return true;
  const esp=esDomingo(fecha)||esFestivo(fecha);
  if(t.solo_lunes&&(!esLunes(fecha)||esp))return false;
  if(esp)return !!(t.inicio_especial&&t.fin_especial);
  return !!(t.inicio&&t.fin);
}
function previewTurnoTexto(t,fecha){
  if(t.tipo_catalogo==='coordinador'){
    const isoDay=((fechaLocal(fecha||periodo.inicio).getDay()+6)%7)+1,d=t.dias?.find(x=>Number(x.dia)===isoDay);
    return d?.tipo==='laboral'?`${d.inicio}–${d.fin} · descanso ${d.descanso} min`:(d?.tipo||'No aplica');
  }
  const esp=fecha&&(esDomingo(fecha)||esFestivo(fecha)),a=esp?t.inicio_especial:t.inicio,b=esp?t.fin_especial:t.fin;
  return a&&b?`${a}–${b} · alimentación ${t.pausa} min${t.prolongacion?` · prolongación ref. ${t.prolongacion} min`:''}`:'No aplica';
}
function actualizarPreviewTurno(){
  const e=empleadoPorId($('empleadoAsignacionOps').value),fecha=$('fechaAsignacionOps').value,codigo=$('turnoBaseOps').value;
  const t=(e?.proceso_codigo==='OPS_COORDINADOR'?estado.turnos_coordinador:estado.turnos_oficios).find(x=>x.codigo===codigo);
  $('previewTurnoOps').textContent=t?previewTurnoTexto(t,fecha):'Selecciona un turno.';
}
function actualizarFormularioTipo(){
  const tipo=$('tipoRegistroOps').value,isTurno=tipo==='turno',isNov=tipo==='novedad';
  $('bloqueTurnoBaseOps').classList.toggle('d-none',!isTurno);$('bloquePersonalizadoOps').classList.toggle('d-none',!isTurno);
  $('bloqueNovedadCodigoOps').classList.toggle('d-none',!isNov);$('bloqueNovedadDescripcionOps').classList.toggle('d-none',!isNov);
  document.querySelectorAll('.ops-custom-time').forEach(el=>el.classList.toggle('d-none',!(isTurno&&$('checkPersonalizadoOps').checked)));
}
function actualizarPersonalizado(){actualizarFormularioTipo();$('turnoBaseOps').disabled=$('checkPersonalizadoOps').checked;}

async function guardarAsignacion(ev){
  ev.preventDefault();
  const emp=empleadoPorId($('empleadoAsignacionOps').value);if(!emp)return mostrarError('Selecciona un empleado.');
  const tipo=$('tipoRegistroOps').value,custom=$('checkPersonalizadoOps').checked;
  const payload={empleado_id:emp.empleado_id,proceso_id:emp.proceso_id,fecha:$('fechaAsignacionOps').value,tipo_registro:tipo,observacion:texto($('observacionOps').value)||null};
  if(tipo==='turno'){
    payload.personalizado=custom;
    if(custom){payload.hora_inicio=$('horaInicioOps').value;payload.hora_fin=$('horaFinOps').value;payload.minutos_descanso=Number($('descansoOps').value||0);if(!payload.hora_inicio||!payload.hora_fin)return mostrarError('Entrada y salida son obligatorias para un horario personalizado.');}
    else{payload.turno_codigo=$('turnoBaseOps').value;if(!payload.turno_codigo)return mostrarError('Selecciona un turno base.');}
  }
  if(tipo==='novedad'){payload.novedad_codigo=$('novedadCodigoOps').value;payload.novedad_descripcion=texto($('novedadDescripcionOps').value)||null;if(!payload.novedad_codigo)return mostrarError('Selecciona la novedad.');}
  try{
    $('btnGuardarAsignacionOps').disabled=true;
    const {error}=await supabase.rpc('guardar_programacion_operaciones_v738',{p_payload:payload});if(error)throw error;
    modalAsignacion.hide();await cargarDatos();
  }catch(e){mostrarError(e.message||String(e));}
  finally{$('btnGuardarAsignacionOps').disabled=false;}
}
function mostrarError(msg){const el=$('errorAsignacionOps');el.textContent=msg;el.classList.remove('d-none');return false;}
async function eliminarAsignacionActual(){
  const id=$('registroIdOps').value;if(!id)return;if(!confirm('¿Quitar esta programación del día? Las marcaciones no se eliminan.'))return;
  try{const {error}=await supabase.rpc('cancelar_programacion_operaciones_v738',{p_id:id});if(error)throw error;modalAsignacion.hide();await cargarDatos();}catch(e){mostrarError(e.message||String(e));}
}

function cargarCopiaLocal(){try{copia=JSON.parse(localStorage.getItem(STORAGE_COPIA)||'null');}catch{copia=null;}}
function copiarRegistro(r){copia={tipo_registro:r.tipo_registro,turno_codigo:r.turno_codigo||null,personalizado:r.tipo_registro==='turno'&&!r.turno_codigo,hora_inicio:r.hora_inicio,hora_fin:r.hora_fin,minutos_descanso:r.minutos_descanso,novedad_codigo:r.novedad_codigo,novedad_descripcion:r.novedad_descripcion,observacion:r.observacion||null,nombre:r.turno_nombre||r.turno_codigo||r.novedad_codigo||r.tipo_registro};localStorage.setItem(STORAGE_COPIA,JSON.stringify(copia));renderTodo();}
function limpiarCopia(){copia=null;localStorage.removeItem(STORAGE_COPIA);renderTodo();}
function renderBannerCopia(){const b=$('bannerCopiadoOps');b.classList.toggle('d-none',!copia);if(copia)$('textoCopiadoOps').textContent=`${copia.nombre||'Registro'}${copia.hora_inicio?` · ${hh(copia.hora_inicio)}–${hh(copia.hora_fin)}`:''}`;}
async function pegarCopia(empleadoId,fecha){
  if(!copia)return alert('Primero copia un registro.');const emp=empleadoPorId(empleadoId);if(!emp)return;
  const payload={...copia,empleado_id:emp.empleado_id,proceso_id:emp.proceso_id,fecha};delete payload.nombre;
  try{const {error}=await supabase.rpc('guardar_programacion_operaciones_v738',{p_payload:payload});if(error)throw error;await cargarDatos();}catch(e){alert(`No se pudo pegar: ${e.message||e}`);}
}
window.opsNuevaCelda=(id,fecha)=>abrirAsignacion(id,fecha);
window.opsEditarCelda=(id)=>{const r=estado.programacion.find(x=>x.id===id);if(r)abrirAsignacion(r.empleado_id,r.fecha,r);};
window.opsCopiarCelda=(id)=>{const r=estado.programacion.find(x=>x.id===id);if(r)copiarRegistro(r);};
window.opsPegarCelda=pegarCopia;

async function copiarPeriodoAnterior(){
  const n=longitudPeriodo(),srcInicio=sumarDias(periodo.inicio,-n),srcFin=sumarDias(periodo.fin,-n);
  if(!confirm(`¿Copiar la programación de ${formatoFechaCorta(srcInicio)}–${formatoFechaCorta(srcFin)} al periodo actual? Los turnos de domingo/festivo se ajustarán automáticamente.`))return;
  try{
    const {data,error}=await supabase.rpc('consultar_programacion_operaciones_v738',{p_desde:srcInicio,p_hasta:srcFin});if(error)throw error;
    const actuales=new Set(estado.personal.map(e=>e.empleado_id));
    const payload=(data?.programacion||[]).filter(r=>actuales.has(r.empleado_id)).map(r=>{
      const offset=Math.round((fechaLocal(r.fecha)-fechaLocal(srcInicio))/86400000),fecha=sumarDias(periodo.inicio,offset);
      return {empleado_id:r.empleado_id,proceso_id:r.proceso_id,fecha,tipo_registro:r.tipo_registro,turno_codigo:r.turno_codigo||null,personalizado:r.tipo_registro==='turno'&&!r.turno_codigo,hora_inicio:r.hora_inicio,hora_fin:r.hora_fin,minutos_descanso:r.minutos_descanso,novedad_codigo:r.novedad_codigo,novedad_descripcion:r.novedad_descripcion,observacion:r.observacion};
    }).filter(x=>dias.includes(x.fecha));
    if(!payload.length)return alert('El periodo anterior no tiene programación para copiar.');
    const {error:saveError}=await supabase.rpc('guardar_programacion_operaciones_v738',{p_payload:payload});if(saveError)throw saveError;
    await cargarDatos();alert(`${payload.length} registros copiados al periodo actual.`);
  }catch(e){alert(`No se pudo copiar el periodo: ${e.message||e}`);}
}

function renderGestionPersonal(){
  const q=normalizar($('buscarPersonalOps').value),procesosAsignables=estado.procesos.filter(p=>['OPS_SERVICIOS_GENERALES','OPS_AUX_VESTIER'].includes(p.codigo));
  const actuales=estado.personal.filter(e=>e.proceso_codigo!=='OPS_COORDINADOR').map(e=>({...e,actual:true}));
  const candidatos=estado.candidatos.filter(c=>!c.ya_asignado).map(c=>({...c,actual:false}));
  const lista=[...actuales,...candidatos].filter(e=>!q||normalizar([nombreEmpleado(e),e.cedula,e.codigo,e.cargo,e.centro_costos].join(' ')).includes(q));
  $('tbodyPersonalOps').innerHTML=lista.length?lista.map(e=>{
    if(e.actual)return `<tr><td><strong>${esc(nombreEmpleado(e))}</strong><div class="small text-muted">${esc(e.cedula||'')}</div></td><td>${esc(e.cargo||'')}</td><td>${esc(e.centro_costos||'')}</td><td>${esc(e.proceso_nombre||'')}</td><td class="text-end"><button class="btn btn-sm btn-outline-danger" type="button" onclick="window.opsQuitarPersonal('${e.vinculacion_id}')">Quitar</button></td></tr>`;
    const def=String(e.cargo||'').toUpperCase().includes('VESTIER')?'OPS_AUX_VESTIER':'OPS_SERVICIOS_GENERALES';
    return `<tr><td><strong>${esc(nombreEmpleado(e))}</strong><div class="small text-muted">${esc(e.cedula||'')}</div></td><td>${esc(e.cargo||'')}</td><td>${esc(e.centro_costos||'')}</td><td><select class="form-select form-select-sm" id="proc_${e.empleado_id}">${procesosAsignables.map(p=>`<option value="${p.id}" ${p.codigo===def?'selected':''}>${esc(p.nombre)}</option>`).join('')}</select></td><td class="text-end"><button class="btn btn-sm btn-primary" type="button" onclick="window.opsAgregarPersonal('${e.empleado_id}')">Agregar</button></td></tr>`;
  }).join(''):'<tr><td colspan="5" class="text-center text-muted py-4">Sin resultados.</td></tr>';
}
window.opsAgregarPersonal=async(id)=>{const proceso=$(`proc_${id}`)?.value;if(!proceso)return;try{const {error}=await supabase.rpc('asignar_personal_operaciones_v738',{p_empleado_id:id,p_proceso_id:proceso});if(error)throw error;await cargarDatos();renderGestionPersonal();}catch(e){alert(e.message||e);}};
window.opsQuitarPersonal=async(id)=>{if(!confirm('¿Quitar este colaborador del módulo de Programación Operaciones? Su programación histórica no se elimina.'))return;try{const {error}=await supabase.rpc('quitar_personal_operaciones_v738',{p_vinculacion_id:id});if(error)throw error;await cargarDatos();renderGestionPersonal();}catch(e){alert(e.message||e);}};

function renderTurnosBase(){
  $('tbodyTurnosBaseOps').innerHTML=estado.turnos_oficios.map(t=>`<tr><td><strong>${esc(t.nombre)}</strong><div class="small text-muted">${esc(t.codigo)}</div></td><td>${esc(t.inicio||'No aplica')}–${esc(t.fin||'')}</td><td>${t.inicio_especial?`${esc(t.inicio_especial)}–${esc(t.fin_especial)}`:'No aplica'}</td><td>${t.pausa||0} min</td><td>${t.prolongacion||0} min</td></tr>`).join('');
  const turno=estado.turnos_coordinador[0];
  $('tbodyTurnoGerardoOps').innerHTML=(turno?.dias||[]).map(d=>`<tr><td>${['','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'][Number(d.dia)]}</td><td>${d.inicio?`${d.inicio}–${d.fin}`:'—'}</td><td>${d.descanso||0} min</td><td>${cap(d.tipo||'')}</td></tr>`).join('');
}

async function alternarPantallaCompleta(){const card=$('cardMatrizOperaciones');try{if(!document.fullscreenElement){card.classList.add('ops-fullscreen');await card.requestFullscreen();}else await document.exitFullscreen();}catch{card.classList.toggle('ops-fullscreen');}}
document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement)$('cardMatrizOperaciones')?.classList.remove('ops-fullscreen');});

function pdfDoc(orientation='landscape'){if(!window.jspdf?.jsPDF){alert('La librería PDF no está disponible.');return null;}return new window.jspdf.jsPDF({orientation,unit:'mm',format:'a4'});}
function encabezadoPdf(doc,titulo,sub=''){doc.setFontSize(15);doc.text(titulo,14,14);doc.setFontSize(9);doc.text(`Club Campestre de Pereira · ${formatoFechaCorta(periodo.inicio)} al ${formatoFechaCorta(periodo.fin)}`,14,20);if(sub)doc.text(sub,14,25);}
function textoRegistroPdf(r){if(!r)return '';if(r.tipo_registro==='turno')return `${r.turno_codigo||'Personalizado'} ${hh(r.hora_inicio)}-${hh(r.hora_fin)}`;if(r.tipo_registro==='novedad')return `${r.novedad_codigo||'NOV'} ${r.novedad_descripcion||''}`;return cap(r.tipo_registro);}
function pdfGeneral(){const doc=pdfDoc('landscape');if(!doc)return;encabezadoPdf(doc,'Programación general de Operaciones');const emps=empleadosFiltrados();doc.autoTable({startY:28,head:[['Empleado',...dias.map(d=>`${cap(nombreDia(d))} ${formatoFechaCorta(d).slice(0,5)}`)]],body:emps.map(e=>[`${nombreEmpleado(e)}\n${e.cargo||''}`,...dias.map(d=>textoRegistroPdf(registroDe(e.empleado_id,d)))]),styles:{fontSize:6,cellPadding:1.4,valign:'middle'},headStyles:{fontSize:6.5},columnStyles:{0:{cellWidth:38}}});doc.save(`programacion_operaciones_general_${periodo.inicio}.pdf`);}
function pdfCalendario(){const doc=pdfDoc('portrait');if(!doc)return;dias.forEach((d,i)=>{if(i)doc.addPage();encabezadoPdf(doc,`Operaciones · ${cap(nombreDia(d))} ${formatoFechaCorta(d)}`,festivoDe(d)?.nombre||'');const rows=estado.personal.map(e=>({e,r:registroDe(e.empleado_id,d)})).filter(x=>x.r).map(x=>[nombreEmpleado(x.e),x.e.cargo||'',textoRegistroPdf(x.r),x.r.observacion||'']);doc.autoTable({startY:30,head:[['Empleado','Cargo','Programación','Observación']],body:rows,styles:{fontSize:8}});});doc.save(`programacion_operaciones_calendario_${periodo.inicio}.pdf`);}
function pdfOperativo(){const doc=pdfDoc('landscape');if(!doc)return;encabezadoPdf(doc,'Plan operativo de turnos','Agrupado por fecha y puesto');let y=30;dias.forEach(d=>{const regs=estado.programacion.filter(r=>r.fecha===d&&r.tipo_registro==='turno');if(!regs.length)return;const grupos=new Map();regs.forEach(r=>{const k=`${r.turno_codigo||'Personalizado'}|${hh(r.hora_inicio)}-${hh(r.hora_fin)}`;if(!grupos.has(k))grupos.set(k,[]);grupos.get(k).push(r);});const rows=[...grupos.entries()].map(([k,arr])=>{const [puesto,horario]=k.split('|');return [puesto,horario,String(arr.length),arr.map(r=>`${r.nombres} ${r.apellidos}`).join(', ')];});if(y>170){doc.addPage();y=18;}doc.setFontSize(10);doc.text(`${cap(nombreDia(d))} ${formatoFechaCorta(d)}${festivoDe(d)?` · ${festivoDe(d).nombre}`:''}`,14,y);doc.autoTable({startY:y+3,head:[['Puesto/turno','Horario','Cantidad','Colaboradores']],body:rows,styles:{fontSize:7},columnStyles:{3:{cellWidth:125}}});y=doc.lastAutoTable.finalY+8;});doc.save(`programacion_operaciones_operativa_${periodo.inicio}.pdf`);}
function pdfEmpleado(mejorado=false){const id=$('selectEmpleadoRevisionOps').value,e=empleadoPorId(id);if(!e)return alert('Selecciona un empleado.');const doc=pdfDoc('portrait');if(!doc)return;encabezadoPdf(doc,mejorado?'Ficha semanal de Operaciones':'Programación individual',`${nombreEmpleado(e)} · ${e.cargo||''}`);const regs=dias.map(d=>registroDe(id,d));doc.autoTable({startY:31,head:[['Fecha','Día','Programación','Neto','Observación']],body:dias.map((d,i)=>{const r=regs[i],n=r?netoRegistro(r):{netoMin:0};return [formatoFechaCorta(d),cap(nombreDia(d)),textoRegistroPdf(r)||'Sin programación',r?.tipo_registro==='turno'?fmtHoras(n.netoMin):'',r?.observacion||r?.novedad_descripcion||''];}),styles:{fontSize:8},columnStyles:{4:{cellWidth:55}}});if(mejorado){const res=resumenEmpleado(id),y=doc.lastAutoTable.finalY+10;doc.setFontSize(11);doc.text(`Total neto: ${fmtHoras(res.netoMin)}`,14,y);doc.text(`Horas ordinarias de referencia: ${fmtHoras(res.ordinariasMin)}`,14,y+6);doc.text(`Prolongación prevista: ${fmtHoras(res.prolongacionMin)}`,14,y+12);doc.text(`Diferencia frente a 42 h: ${res.netoMin-META_HORAS*60>=0?'+':'-'}${fmtHoras(Math.abs(res.netoMin-META_HORAS*60))}`,14,y+18);}doc.save(`${mejorado?'ficha':'programacion'}_operaciones_${e.cedula}_${periodo.inicio}.pdf`);}

function normalizar(v){return texto(v).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');}
function esc(v){return texto(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function cap(v){const s=texto(v);return s?s.charAt(0).toUpperCase()+s.slice(1):'';}
