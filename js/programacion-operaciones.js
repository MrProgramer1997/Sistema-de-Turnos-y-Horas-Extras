import { supabase } from '../supabase/supabaseClient.js';
import { exigirModulo, filtrarEnlaces } from './permisos-modulos.js?v=735';

const VERSION = '739';
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
// Independent position assignments: never transfer an employee's saved schedule.
let organizacion = {puestos:[],asignaciones:[],semanas:[],horarios:[],horarios_aplicados:[]};
let organizacionLista = false;
let guardandoPuesto = false;
let modalPuestos = null;
let modalHorario = null;

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
  modalPuestos = new bootstrap.Modal($('modalPuestosOps'));
  modalHorario = new bootstrap.Modal($('modalHorarioNuevoOps'));
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
  $('btnGestionPuestosOps').addEventListener('click',()=>{renderPuestos();modalPuestos.show();});
  $('formPuestoOps').addEventListener('submit',guardarPuesto);
  $('btnNuevoPuestoOps').addEventListener('click',limpiarFormularioPuesto);
  $('btnCrearHorarioOps').addEventListener('click',abrirCrearHorario);
  $('formHorarioNuevoOps').addEventListener('submit',crearHorario);
  $('horarioMismoEspecialOps').addEventListener('change',()=>{
    $('horarioEspecialCamposOps').classList.toggle('d-none',$('horarioMismoEspecialOps').checked);
  });
  $('tbodyOperaciones').addEventListener('change',async ev=>{
    const el=ev.target.closest('[data-puesto-select]');
    if(el) await cambiarPersonaPuesto(el);
  });

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
async function desplazarPeriodo(n){if(cargando||guardandoPuesto)return;periodo={inicio:sumarDias(periodo.inicio,n),fin:sumarDias(periodo.fin,n)};sincronizarPeriodo();await cargarDatos();}
function sincronizarPeriodo(){ $('fechaInicioOps').value=periodo.inicio;$('fechaFinOps').value=periodo.fin;dias=rangoFechas(periodo.inicio,periodo.fin); }

async function cargarDatos(){
  if(cargando || guardandoPuesto) return;
  cargando=true;document.body.classList.add('ops-loading');sincronizarPeriodo();
  const consulta={p_desde:periodo.inicio,p_hasta:periodo.fin};
  try{
    const [principal,org]=await Promise.all([
      supabase.rpc('consultar_programacion_operaciones_v738',consulta),
      Promise.resolve(supabase.rpc('consultar_organizacion_operaciones_v739',consulta)).catch(error=>({error}))
    ]);
    if(principal.error) throw principal.error;
    estado={...estado,...(principal.data||{})};
    organizacionLista=!org.error && !!org.data;
    organizacion=organizacionLista?org.data:{puestos:[],asignaciones:[],semanas:[],horarios:[],horarios_aplicados:[]};
    if(org.error) console.warn('No se cargo la organizacion de puestos:',org.error);
    enriquecerHorarios();
    dias=rangoFechas(periodo.inicio,periodo.fin);
    actualizarCabeceraPeriodo();llenarFiltros();llenarSelectEmpleados();renderTodo();
    $('btnGestionPuestosOps').disabled=!organizacionLista;
  }catch(e){console.error(e);alert(`No se pudo cargar Programacion Operaciones: ${e.message||e}`);}
  finally{cargando=false;document.body.classList.remove('ops-loading');}
}
async function cargarOrganizacion(){
  const {data,error}=await supabase.rpc('consultar_organizacion_operaciones_v739',{p_desde:periodo.inicio,p_hasta:periodo.fin});
  if(error) throw error;
  organizacion=data;organizacionLista=true;enriquecerHorarios();
}
function enriquecerHorarios(){
  const meta=new Map((organizacion.horarios_aplicados||[]).map(x=>[x.programacion_id,x]));
  estado.programacion.forEach(r=>{
    const m=meta.get(r.id);
    r.horario_reutilizable_id=m?.horario_id||null;
    r.horario_nombre=m?`${m.codigo} - ${m.nombre}`:null;
  });
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

function semanaDe(fecha){const d=fechaLocal(fecha);d.setDate(d.getDate()-((d.getDay()+6)%7));return iso(d);}
function semanasDe(fechas=dias){return [...new Set(fechas.map(semanaDe))];}
function asignacionPuesto(puestoId,semana){return organizacion.asignaciones.find(a=>a.puesto_id===puestoId&&a.semana===semana)||null;}
function asignacionPersona(empleadoId,semana){return organizacion.asignaciones.find(a=>a.empleado_id===empleadoId&&a.semana===semana)||null;}
function puestoDePersona(id,fecha){const a=asignacionPersona(id,semanaDe(fecha));return organizacion.puestos.find(p=>p.id===a?.puesto_id)||null;}
function personaEnFila(fila,fecha){
  const semana=semanaDe(fecha);
  if(fila.puesto) return empleadoPorId(asignacionPuesto(fila.puesto.id,semana)?.empleado_id);
  return !asignacionPersona(fila.empleado.empleado_id,semana)?fila.empleado:null;
}
function coincideEstado(e){
 const st=$('filtroEstadoOps').value,regs=registrosEmpleado(e.empleado_id);
 if(st==='con-programacion')return regs.length>0;
 if(st==='sin-programacion')return !regs.length;
 if(st==='con-novedad')return regs.some(r=>r.tipo_registro==='novedad');
 if(st==='sobre-meta')return resumenEmpleado(e.empleado_id).netoMin>META_HORAS*60;
 return true;
}
function filasPlanilla(fechas=dias){
  const permitidos=new Set(empleadosFiltrados().map(e=>e.empleado_id));
  const q=normalizar($('filtroEmpleadoOps').value),proc=$('filtroProcesoOps').value,st=$('filtroEstadoOps').value;
  const semanas=semanasDe(fechas);
  const filas=[...organizacion.puestos].sort((a,b)=>a.orden-b.orden||a.clave.localeCompare(b.clave)).map(puesto=>({puesto}));
  estado.personal.forEach(empleado=>{if(semanas.some(s=>!asignacionPersona(empleado.empleado_id,s)))filas.push({empleado});});
  return filas.filter(f=>{
    const ids=[...new Set(fechas.map(d=>personaEnFila(f,d)?.empleado_id).filter(Boolean))];
    if(!f.puesto)return permitidos.has(f.empleado.empleado_id);
    if(q&&normalizar(f.puesto.nombre).includes(q)){
      return ids.length?ids.some(id=>{const e=empleadoPorId(id);return (!proc||e?.proceso_codigo===proc)&&coincideEstado(e);}):!proc&&(st==='todos'||st==='sin-programacion');
    }
    if(ids.length)return ids.some(id=>permitidos.has(id));
    return !q&&!proc&&(st==='todos'||st==='sin-programacion');
  });
}
function opcionesPersona(semana,seleccion){
  return '<option value="">Sin asignar</option>'+estado.personal.filter(e=>
    (!e.fecha_inicio||e.fecha_inicio<=sumarDias(semana,6))&&(!e.fecha_fin||e.fecha_fin>=semana)
  ).map(e=>{
    const a=asignacionPersona(e.empleado_id,semana),p=organizacion.puestos.find(p=>p.id===a?.puesto_id);
    return `<option value="${esc(e.empleado_id)}" ${e.empleado_id===seleccion?'selected':''}>${esc(nombreEmpleado(e))}${p&&e.empleado_id!==seleccion?` [${esc(p.nombre)} #${p.orden}]`:''}</option>`;
  }).join('');
}
function selectorPersona(fila){
  if(!fila.puesto){
    const e=fila.empleado,res=resumenEmpleado(e.empleado_id);
    return `<div class="ops-employee-name">${esc(nombreEmpleado(e))}</div><div class="ops-employee-meta">${esc(e.cargo||'')} &middot; ${esc(e.codigo||e.cedula||'')}</div><span class="ops-hours-badge">${fmtHoras(res.netoMin)} netas</span>`;
  }
  const semanas=semanasDe();
  return semanas.map(s=>{
    const a=asignacionPuesto(fila.puesto.id,s),id=a?.empleado_id||'',e=empleadoPorId(id);
    const etiqueta=semanas.length>1?`<div class="ops-week-label">Semana ${formatoFechaCorta(s)}</div>`:'';
    return `${etiqueta}<select class="form-select form-select-sm ops-assign-position" data-puesto-select="${esc(fila.puesto.id)}" data-semana="${s}" aria-label="Colaborador para ${esc(fila.puesto.nombre)} ${s}">${opcionesPersona(s,id)}</select>${e?`<div class="ops-employee-meta">${esc(e.cargo||'')} &middot; ${esc(e.codigo||e.cedula||'')}</div><span class="ops-hours-badge">${fmtHoras(resumenEmpleado(e.empleado_id).netoMin)} netas</span>`:''}`;
  }).join('');
}
function renderMatriz(){
  $('trEncabezadoOps').innerHTML='<th class="ops-sticky-col ops-fixed-slot">Turno fijo / puesto</th><th class="ops-sticky-col ops-person-column">Colaborador</th>'+dias.map(d=>{
    const fest=festivoDe(d),especial=fest||esDomingo(d);
    return `<th class="${especial?'ops-festivo-header':''}">${cap(nombreDia(d))}<br><span class="small">${formatoFechaCorta(d).slice(0,5)}</span>${fest?`<span class="ops-festivo-mark">${esc(fest.nombre||'FESTIVO')}</span>`:esDomingo(d)?'<span class="ops-festivo-mark">DOMINGO</span>':''}</th>`;
  }).join('');
  const filas=filasPlanilla();
  const sinPuesto=estado.personal.filter(e=>semanasDe().some(s=>!asignacionPersona(e.empleado_id,s))).length;
  $('textoResultadoOps').textContent=organizacionLista?`${organizacion.puestos.length} turnos fijos | ${sinPuesto} colaboradores sin puesto en el periodo; su programacion sigue al final de la planilla.`:'La programacion sigue disponible. No se pudieron cargar los puestos; vuelve a cargar el periodo.';
  let separador=false;
  $('tbodyOperaciones').innerHTML=filas.map(f=>{
    let prefijo='';
    if(!f.puesto&&!separador){separador=true;prefijo=`<tr class="ops-unassigned-heading"><th colspan="${dias.length+2}">Sin puesto asignado &middot; programaci&#243;n conservada por colaborador</th></tr>`;}
    const nombre=f.puesto?esc(f.puesto.nombre):'Sin puesto asignado';
    const nota=f.puesto?`<div class="ops-slot-order">#${String(f.puesto.orden).padStart(2,'0')}</div>`:'';
    return prefijo+`<tr data-puesto-row="${f.puesto?.id||''}" data-empleado-row="${f.empleado?.empleado_id||''}"><th class="ops-sticky-col ops-fixed-slot">${nota}<div class="ops-slot-name">${nombre}</div></th><td class="ops-sticky-col ops-person-column">${selectorPersona(f)}</td>${dias.map(d=>{
      const e=personaEnFila(f,d);
      if(e)return celda(e,d);
      const msg=f.puesto?'Asigna un colaborador':'Ubicado en su turno fijo';
      return `<td class="${esFestivo(d)||esDomingo(d)?'ops-festivo-cell':''}"><div class="ops-slot-empty" title="${msg}">&mdash;</div></td>`;
    }).join('')}</tr>`;
  }).join('')||`<tr><td colspan="${dias.length+2}" class="text-center text-muted py-4">No hay filas para los filtros seleccionados.</td></tr>`;
}

function celda(e,fecha){
  const r=registroDe(e.empleado_id,fecha),especial=esFestivo(fecha)||esDomingo(fecha);
  if(!r){return `<td class="${especial?'ops-festivo-cell':''}"><div class="ops-cell ops-cell-empty" onclick="window.opsNuevaCelda('${e.empleado_id}','${fecha}')"><span>+ Programar</span>${copia?`<button class="ops-paste-btn" type="button" onclick="event.stopPropagation();window.opsPegarCelda('${e.empleado_id}','${fecha}')">Pegar</button>`:''}</div></td>`;}
  const clase=r.tipo_registro==='turno'?'ops-cell-turno':r.tipo_registro==='novedad'?'ops-cell-novedad':r.tipo_registro==='compensatorio'?'ops-cell-compensatorio':'ops-cell-descanso';
  const titulo=r.tipo_registro==='turno'?(r.turno_codigo||r.horario_nombre||'Personalizado'):r.tipo_registro==='novedad'?(r.novedad_codigo||'Novedad'):cap(r.tipo_registro);
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
  const custom=registro?.tipo_registro==='turno'&&!registro?.turno_codigo&&!registro?.horario_reutilizable_id;
  $('checkPersonalizadoOps').checked=!!custom;
  $('horaInicioOps').value=registro?.hora_inicio?hh(registro.hora_inicio):'';
  $('horaFinOps').value=registro?.hora_fin?hh(registro.hora_fin):'';
  $('descansoOps').value=String(registro?.minutos_descanso??30);
  renderTurnosSelect(registro?.horario_reutilizable_id?`reutilizable:${registro.horario_reutilizable_id}`:registro?.turno_codigo||'');
  actualizarFormularioTipo();actualizarPersonalizado();actualizarPreviewTurno();modalAsignacion.show();
}
function renderTurnosSelect(valor=''){
  const e=empleadoPorId($('empleadoAsignacionOps').value),fecha=$('fechaAsignacionOps').value;
  let list=horariosDisponibles(e);
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
  return a&&b?`${a}–${b} · alimentación ${esp?(t.pausa_especial??t.pausa):t.pausa} min${t.prolongacion?` · prolongación ref. ${t.prolongacion} min`:''}`:'No aplica';
}
function actualizarPreviewTurno(){
  const e=empleadoPorId($('empleadoAsignacionOps').value),fecha=$('fechaAsignacionOps').value,codigo=$('turnoBaseOps').value;
  const t=horariosDisponibles(e).find(x=>x.codigo===codigo);
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
    else{payload.turno_codigo=$('turnoBaseOps').value;if(!payload.turno_codigo)return mostrarError('Selecciona un turno base.');if(payload.turno_codigo.startsWith('reutilizable:')){payload.horario_reutilizable_id=payload.turno_codigo.slice(13);payload.turno_codigo=null;}}
  }
  if(tipo==='novedad'){payload.novedad_codigo=$('novedadCodigoOps').value;payload.novedad_descripcion=texto($('novedadDescripcionOps').value)||null;if(!payload.novedad_codigo)return mostrarError('Selecciona la novedad.');}
  try{
    $('btnGuardarAsignacionOps').disabled=true;
    const {error}=await supabase.rpc('guardar_programacion_operaciones_v739',{p_payload:payload});if(error)throw error;
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
function copiarRegistro(r){copia={tipo_registro:r.tipo_registro,turno_codigo:r.turno_codigo||null,personalizado:r.tipo_registro==='turno'&&!r.turno_codigo,horario_reutilizable_id:r.horario_reutilizable_id||null,hora_inicio:r.hora_inicio,hora_fin:r.hora_fin,minutos_descanso:r.minutos_descanso,novedad_codigo:r.novedad_codigo,novedad_descripcion:r.novedad_descripcion,observacion:r.observacion||null,nombre:r.turno_nombre||r.turno_codigo||r.horario_nombre||r.novedad_codigo||r.tipo_registro};localStorage.setItem(STORAGE_COPIA,JSON.stringify(copia));renderTodo();}
function limpiarCopia(){copia=null;localStorage.removeItem(STORAGE_COPIA);renderTodo();}
function renderBannerCopia(){const b=$('bannerCopiadoOps');b.classList.toggle('d-none',!copia);if(copia)$('textoCopiadoOps').textContent=`${copia.nombre||'Registro'}${copia.hora_inicio?` · ${hh(copia.hora_inicio)}–${hh(copia.hora_fin)}`:''}`;}
async function pegarCopia(empleadoId,fecha){
  if(!copia)return alert('Primero copia un registro.');const emp=empleadoPorId(empleadoId);if(!emp)return;
  if(registroDe(empleadoId,fecha)&&!confirm('Esta celda ya tiene programacion. Reemplazarla con la copia?'))return;
  const payload={...copia,empleado_id:emp.empleado_id,proceso_id:emp.proceso_id,fecha};delete payload.nombre;
  try{const {error}=await supabase.rpc('guardar_programacion_operaciones_v739',{p_payload:payload});if(error)throw error;await cargarDatos();}catch(e){alert(`No se pudo pegar: ${e.message||e}`);}
}
window.opsNuevaCelda=(id,fecha)=>abrirAsignacion(id,fecha);
window.opsEditarCelda=(id)=>{const r=estado.programacion.find(x=>x.id===id);if(r)abrirAsignacion(r.empleado_id,r.fecha,r);};
window.opsCopiarCelda=(id)=>{const r=estado.programacion.find(x=>x.id===id);if(r)copiarRegistro(r);};
window.opsPegarCelda=pegarCopia;

async function copiarPeriodoAnterior(){
  const n=longitudPeriodo(),srcInicio=sumarDias(periodo.inicio,-n),srcFin=sumarDias(periodo.fin,-n);
  if(!confirm(`¿Copiar la programación de ${formatoFechaCorta(srcInicio)}–${formatoFechaCorta(srcFin)} al periodo actual? Solo se completaran celdas vacias; lo ya guardado no se reemplaza.`))return;
  try{
    const [lectura,extra]=await Promise.all([
      supabase.rpc('consultar_programacion_operaciones_v738',{p_desde:srcInicio,p_hasta:srcFin}),
      supabase.rpc('consultar_organizacion_operaciones_v739',{p_desde:srcInicio,p_hasta:srcFin})
    ]);
    if(lectura.error)throw lectura.error;if(extra.error)throw extra.error;
    const data=lectura.data;
    const anteriores=new Map((extra.data?.horarios_aplicados||[]).map(x=>[x.programacion_id,x.horario_id]));
    (data?.programacion||[]).forEach(r=>{r.horario_reutilizable_id=anteriores.get(r.id)||null;});
    const actuales=new Set(estado.personal.map(e=>e.empleado_id));
    const payload=(data?.programacion||[]).filter(r=>actuales.has(r.empleado_id)).map(r=>{
      const offset=Math.round((fechaLocal(r.fecha)-fechaLocal(srcInicio))/86400000),fecha=sumarDias(periodo.inicio,offset);
      return {empleado_id:r.empleado_id,proceso_id:r.proceso_id,fecha,tipo_registro:r.tipo_registro,turno_codigo:r.turno_codigo||null,personalizado:r.tipo_registro==='turno'&&!r.turno_codigo,horario_reutilizable_id:r.horario_reutilizable_id||null,hora_inicio:r.hora_inicio,hora_fin:r.hora_fin,minutos_descanso:r.minutos_descanso,novedad_codigo:r.novedad_codigo,novedad_descripcion:r.novedad_descripcion,observacion:r.observacion};
    }).filter(x=>dias.includes(x.fecha)&&!registroDe(x.empleado_id,x.fecha));
    if(!payload.length)return alert('No hay celdas vacias para copiar. Lo ya guardado permanece intacto.');
    const {error:saveError}=await supabase.rpc('guardar_programacion_operaciones_v739',{p_payload:payload});if(saveError)throw saveError;
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
  renderHorariosCreados();
  $('tbodyTurnosBaseOps').innerHTML=estado.turnos_oficios.map(t=>`<tr><td><strong>${esc(t.nombre)}</strong><div class="small text-muted">${esc(t.codigo)}</div></td><td>${esc(t.inicio||'No aplica')}–${esc(t.fin||'')}</td><td>${t.inicio_especial?`${esc(t.inicio_especial)}–${esc(t.fin_especial)}`:'No aplica'}</td><td>${t.pausa||0} min</td><td>${t.prolongacion||0} min</td></tr>`).join('');
  const turno=estado.turnos_coordinador[0];
  $('tbodyTurnoGerardoOps').innerHTML=(turno?.dias||[]).map(d=>`<tr><td>${['','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'][Number(d.dia)]}</td><td>${d.inicio?`${d.inicio}–${d.fin}`:'—'}</td><td>${d.descanso||0} min</td><td>${cap(d.tipo||'')}</td></tr>`).join('');
}

async function alternarPantallaCompleta(){const card=$('cardMatrizOperaciones');try{if(!document.fullscreenElement){card.classList.add('ops-fullscreen');await card.requestFullscreen();}else await document.exitFullscreen();}catch{card.classList.toggle('ops-fullscreen');}}
document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement)$('cardMatrizOperaciones')?.classList.remove('ops-fullscreen');});

function pdfDoc(orientation='landscape'){if(!window.jspdf?.jsPDF){alert('La librería PDF no está disponible.');return null;}return new window.jspdf.jsPDF({orientation,unit:'mm',format:'a4'});}
function encabezadoPdf(doc,titulo,sub=''){doc.setFontSize(15);doc.text(titulo,14,14);doc.setFontSize(9);doc.text(`Club Campestre de Pereira · ${formatoFechaCorta(periodo.inicio)} al ${formatoFechaCorta(periodo.fin)}`,14,20);if(sub)doc.text(sub,14,25);}
function textoRegistroPdf(r){if(!r)return '';if(r.tipo_registro==='turno')return `${r.turno_codigo||r.horario_nombre||'Personalizado'} ${hh(r.hora_inicio)}-${hh(r.hora_fin)}`;if(r.tipo_registro==='novedad')return `${r.novedad_codigo||'NOV'} ${r.novedad_descripcion||''}`;return cap(r.tipo_registro);}
function pdfGeneral(){
  const doc=pdfDoc('landscape');if(!doc)return;
  // One section per week: readable day columns and a single collaborator per position.
  semanasDe().forEach((s,i)=>{
    if(i)doc.addPage();
    const ds=dias.filter(d=>semanaDe(d)===s),filas=filasPlanilla(ds);
    encabezadoPdf(doc,'Programacion general de Operaciones',`Semana ${formatoFechaCorta(s)}`);
    doc.autoTable({startY:29,head:[['Turno fijo / puesto','Colaborador',...ds.map(d=>`${cap(nombreDia(d))} ${formatoFechaCorta(d).slice(0,5)}`)]],
      body:filas.map(f=>[f.puesto?`${f.puesto.nombre}\n#${String(f.puesto.orden).padStart(2,'0')}`:'Sin puesto asignado',
        [...new Set(ds.map(d=>{const e=personaEnFila(f,d);return e?nombreEmpleado(e):'Sin asignar';}))].join('\n'),
        ...ds.map(d=>{const e=personaEnFila(f,d);return e?textoRegistroPdf(registroDe(e.empleado_id,d)):'';})]),
      styles:{fontSize:6.7,cellPadding:1.5,valign:'middle',overflow:'linebreak'},headStyles:{fontSize:7},columnStyles:{0:{cellWidth:31},1:{cellWidth:39}},margin:{left:10,right:10},rowPageBreak:'avoid'});
  });
  doc.save(`programacion_operaciones_general_${periodo.inicio}.pdf`);
}
function pdfCalendario(){
 const doc=pdfDoc('portrait');if(!doc)return;
 dias.forEach((d,i)=>{
  if(i)doc.addPage();encabezadoPdf(doc,`Operaciones - ${cap(nombreDia(d))} ${formatoFechaCorta(d)}`,festivoDe(d)?.nombre||'');
  const rows=filasPlanilla([d]).map(f=>({f,e:personaEnFila(f,d)})).filter(x=>x.e&&registroDe(x.e.empleado_id,d)).map(x=>{
   const r=registroDe(x.e.empleado_id,d);return [x.f.puesto?.nombre||'Sin puesto asignado',`${nombreEmpleado(x.e)}\n${x.e.cargo||''}`,textoRegistroPdf(r),r.observacion||''];
  });
  doc.autoTable({startY:30,head:[['Turno fijo','Colaborador','Programacion','Observacion']],body:rows,styles:{fontSize:8,overflow:'linebreak'},rowPageBreak:'avoid'});
 });doc.save(`programacion_operaciones_calendario_${periodo.inicio}.pdf`);
}

function pdfOperativo(){const doc=pdfDoc('landscape');if(!doc)return;encabezadoPdf(doc,'Plan operativo de turnos','Agrupado por fecha y puesto');let y=30;dias.forEach(d=>{const regs=estado.programacion.filter(r=>r.fecha===d&&r.tipo_registro==='turno');if(!regs.length)return;const grupos=new Map();regs.forEach(r=>{const fijo=puestoDePersona(r.empleado_id,r.fecha);const k=`${fijo?fijo.nombre+' (#'+fijo.orden+')':r.turno_codigo||r.horario_nombre||'Personalizado'}|${hh(r.hora_inicio)}-${hh(r.hora_fin)}`;if(!grupos.has(k))grupos.set(k,[]);grupos.get(k).push(r);});const rows=[...grupos.entries()].map(([k,arr])=>{const [puesto,horario]=k.split('|');return [puesto,horario,String(arr.length),arr.map(r=>`${r.nombres} ${r.apellidos}`).join(', ')];});if(y>170){doc.addPage();y=18;}doc.setFontSize(10);doc.text(`${cap(nombreDia(d))} ${formatoFechaCorta(d)}${festivoDe(d)?` · ${festivoDe(d).nombre}`:''}`,14,y);doc.autoTable({startY:y+3,head:[['Puesto/turno','Horario','Cantidad','Colaboradores']],body:rows,styles:{fontSize:7},columnStyles:{3:{cellWidth:125}}});y=doc.lastAutoTable.finalY+8;});doc.save(`programacion_operaciones_operativa_${periodo.inicio}.pdf`);}
function pdfEmpleado(mejorado=false){const id=$('selectEmpleadoRevisionOps').value,e=empleadoPorId(id);if(!e)return alert('Selecciona un empleado.');const doc=pdfDoc('portrait');if(!doc)return;encabezadoPdf(doc,mejorado?'Ficha semanal de Operaciones':'Programación individual',`${nombreEmpleado(e)} · ${e.cargo||''}`);const regs=dias.map(d=>registroDe(id,d));doc.autoTable({startY:31,head:[['Fecha','Día','Programación','Neto','Observación']],body:dias.map((d,i)=>{const r=regs[i],n=r?netoRegistro(r):{netoMin:0};return [formatoFechaCorta(d),cap(nombreDia(d)),textoRegistroPdf(r)||'Sin programación',r?.tipo_registro==='turno'?fmtHoras(n.netoMin):'',r?.observacion||r?.novedad_descripcion||''];}),styles:{fontSize:8},columnStyles:{4:{cellWidth:55}}});if(mejorado){const res=resumenEmpleado(id),y=doc.lastAutoTable.finalY+10;doc.setFontSize(11);doc.text(`Total neto: ${fmtHoras(res.netoMin)}`,14,y);doc.text(`Horas ordinarias de referencia: ${fmtHoras(res.ordinariasMin)}`,14,y+6);doc.text(`Prolongación prevista: ${fmtHoras(res.prolongacionMin)}`,14,y+12);doc.text(`Diferencia frente a 42 h: ${res.netoMin-META_HORAS*60>=0?'+':'-'}${fmtHoras(Math.abs(res.netoMin-META_HORAS*60))}`,14,y+18);}doc.save(`${mejorado?'ficha':'programacion'}_operaciones_${e.cedula}_${periodo.inicio}.pdf`);}

function normalizar(v){return texto(v).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');}
function esc(v){return texto(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function cap(v){const s=texto(v);return s?s.charAt(0).toUpperCase()+s.slice(1):'';}


// Position changes only call the isolated assignment endpoint, never the payroll writer.
async function cambiarPersonaPuesto(el){
  const puestoId=el.dataset.puestoSelect,semana=el.dataset.semana,nuevo=el.value||null;
  const previo=asignacionPuesto(puestoId,semana)?.empleado_id||null;
  if(guardandoPuesto||cargando){el.value=previo||'';return;}
  if(nuevo===previo)return;
  const origen=nuevo?asignacionPersona(nuevo,semana):null;
  const n=nombreEmpleado(empleadoPorId(nuevo)||{}),p=nombreEmpleado(empleadoPorId(previo)||{});
  let pregunta='';
  if(origen&&previo)pregunta=`Intercambiar los puestos de ${n} y ${p} en la semana del ${formatoFechaCorta(semana)}? Sus horarios seguiran con cada persona.`;
  else if(previo)pregunta=`${p} quedara sin puesto asignado esa semana, conservando toda su programacion. Continuar?`;
  else if(origen)pregunta=`Mover a ${n} a este turno fijo para la semana del ${formatoFechaCorta(semana)}? No se modificaran sus horarios.`;
  if(pregunta&&!confirm(pregunta)){el.value=previo||'';return;}
  guardandoPuesto=true;document.body.classList.add('ops-loading');let guardado=false;
  document.querySelectorAll('.ops-assign-position').forEach(x=>x.disabled=true);
  try{
    const revision=Number(organizacion.semanas.find(s=>s.semana===semana)?.revision||0);
    const {error}=await supabase.rpc('asignar_puesto_operaciones_v739',{p_semana:semana,p_puesto_id:puestoId,p_empleado_id:nuevo,p_revision:revision});
    if(error)throw error;
    guardado=true;await cargarOrganizacion();renderTodo();
  }catch(e){
    el.value=previo||'';
    alert(guardado?'El puesto se guardo, pero no se pudo refrescar la planilla. Pulsa Cargar periodo.':(e.message||String(e)));
    if(e.code==='40001'){try{await cargarOrganizacion();renderTodo();}catch{}}
  }finally{guardandoPuesto=false;document.body.classList.remove('ops-loading');document.querySelectorAll('.ops-assign-position').forEach(x=>x.disabled=false);}
}
function limpiarFormularioPuesto(){
  $('formPuestoOps').reset();$('puestoIdOps').value='';$('puestoRevisionOps').value='';
  $('errorPuestoOps').classList.add('d-none');$('btnGuardarPuestoOps').textContent='Crear turno fijo';
}
function renderPuestos(){
  $('tbodyPuestosOps').innerHTML=[...organizacion.puestos].sort((a,b)=>a.orden-b.orden||a.clave.localeCompare(b.clave)).map(p=>
    `<tr><td>${p.orden}</td><td>${esc(p.nombre)}</td><td class="text-end"><button class="btn btn-sm btn-outline-primary" type="button" onclick="window.opsEditarPuesto('${p.id}')">Editar nombre</button></td></tr>`
  ).join('');
  limpiarFormularioPuesto();
}
window.opsEditarPuesto=id=>{
  const p=organizacion.puestos.find(x=>x.id===id);if(!p)return;
  $('puestoIdOps').value=p.id;$('puestoRevisionOps').value=p.revision;$('nombrePuestoOps').value=p.nombre;
  $('btnGuardarPuestoOps').textContent='Guardar nombre';$('nombrePuestoOps').focus();
};
async function guardarPuesto(ev){
  ev.preventDefault();$('errorPuestoOps').classList.add('d-none');
  const payload={nombre:texto($('nombrePuestoOps').value)};
  if($('puestoIdOps').value){payload.id=$('puestoIdOps').value;payload.revision=Number($('puestoRevisionOps').value);}
  $('btnGuardarPuestoOps').disabled=true;
  try{
    const {error}=await supabase.rpc('guardar_puesto_operaciones_v739',{p_payload:payload});if(error)throw error;
    await cargarOrganizacion();renderTodo();renderPuestos();
  }catch(e){$('errorPuestoOps').textContent=e.message||String(e);$('errorPuestoOps').classList.remove('d-none');}
  finally{$('btnGuardarPuestoOps').disabled=false;}
}
function horariosDisponibles(e){
  let base=[];
  if(e?.proceso_codigo==='OPS_COORDINADOR')base=estado.turnos_coordinador;
  else if(e?.proceso_codigo==='OPS_AUX_VESTIER')base=estado.turnos_oficios.filter(t=>t.proceso_catalogo==='OPS_AUX_VESTIER');
  else if(e?.proceso_codigo==='OPS_SERVICIOS_GENERALES')base=estado.turnos_oficios;
  if(!e)return [];
  return [...base,...organizacion.horarios.map(h=>({...h,codigo:`reutilizable:${h.id}`,nombre:`${h.codigo} - ${h.nombre}`,
    inicio:hh(h.inicio),fin:hh(h.fin),inicio_especial:hh(h.inicio_especial),fin_especial:hh(h.fin_especial),
    tipo_catalogo:'reutilizable',reutilizable_id:h.id,prolongacion:0}))];
}
function renderHorariosCreados(){
 const box=$('listaHorariosCreadosOps');if(!box)return;
 box.innerHTML=organizacion.horarios.length?`<div class="table-responsive"><table class="table table-sm"><thead><tr><th>Codigo / nombre</th><th>Entre semana</th><th>Domingo / festivo</th></tr></thead><tbody>${organizacion.horarios.map(h=>`<tr><td><strong>${esc(h.codigo)}</strong> ${esc(h.nombre)}</td><td>${hh(h.inicio)}-${hh(h.fin)}; ${h.pausa} min descanso</td><td>${hh(h.inicio_especial)}-${hh(h.fin_especial)}; ${h.pausa_especial} min descanso</td></tr>`).join('')}</tbody></table></div>`:'<div class="small text-muted">Puedes crear horarios reutilizables sin modificar los turnos base aprobados.</div>';
 $('btnCrearHorarioOps').disabled=!organizacionLista;
}
function abrirCrearHorario(){
 $('formHorarioNuevoOps').reset();$('errorHorarioNuevoOps').classList.add('d-none');
 $('horarioEspecialCamposOps').classList.add('d-none');
 $('modalTurnosBaseOps').addEventListener('hidden.bs.modal',()=>modalHorario.show(),{once:true});modalTurnos.hide();
}
async function crearHorario(ev){
 ev.preventDefault();$('errorHorarioNuevoOps').classList.add('d-none');
 const payload={codigo:texto($('horarioCodigoOps').value).toUpperCase(),nombre:texto($('horarioNombreOps').value),
   inicio:$('horarioInicioNuevoOps').value,fin:$('horarioFinNuevoOps').value,pausa:Number($('horarioPausaNuevaOps').value)};
 if(!$('horarioMismoEspecialOps').checked){
  payload.inicio_especial=$('horarioInicioEspecialOps').value;payload.fin_especial=$('horarioFinEspecialOps').value;
  payload.pausa_especial=Number($('horarioPausaEspecialOps').value);
  if(!payload.inicio_especial||!payload.fin_especial){$('errorHorarioNuevoOps').textContent='Completa entrada y salida de domingo / festivo.';$('errorHorarioNuevoOps').classList.remove('d-none');return;}
 }
 $('btnGuardarHorarioNuevoOps').disabled=true;
 try{
  const {error}=await supabase.rpc('crear_horario_operaciones_v739',{p_payload:payload});if(error)throw error;
  await cargarOrganizacion();renderTurnosBase();
  $('modalHorarioNuevoOps').addEventListener('hidden.bs.modal',()=>modalTurnos.show(),{once:true});modalHorario.hide();
 }catch(e){$('errorHorarioNuevoOps').textContent=e.message||String(e);$('errorHorarioNuevoOps').classList.remove('d-none');}
 finally{$('btnGuardarHorarioNuevoOps').disabled=false;}
}
