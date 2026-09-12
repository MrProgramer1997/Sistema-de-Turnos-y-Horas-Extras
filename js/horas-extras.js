import { supabase } from "../supabase/supabaseClient.js";
import { asegurarSesion, rpcConSesion, consultaConSesion, esErrorAcceso, mostrarErrorAcceso, observarSesion, ErrorSesion } from "./sesion-protegida.js?v=sesion-6-2-1";
import { cargarFuentesNomina, leerPaginas, diasEntre, recalcularPorDias } from "./nomina-carga.js?v=nomina-6-2-4";
import { resumenTrabajoDia, duracionTexto, instanteLocal, explicarTurno, resumenConceptosNocturnos, coberturaPorArea } from "./nomina-detalle-jornada.js?v=7-1";
let heCargando=false,heCargaId=0,heAbort=null,heDisponible=false;
let heGuardando=false,heRecalculando=false,heLecturaValida=false,heRango=null;
let heMarcasFuente=[],heEmpleadosDetalle=[];
let heTiempoTimer=null,heInicioTiempo=0,heCanceladaPorUsuario=false;


const CONCEPTOS=[["P003","EXTRA DIURNA"],["P004","EXTRA NOCTURNA"],["P005","RECARGO NOCTURNO"],["P006","DOMINICAL COMPENSADO"],["P007","FESTIVO"],["P008","EXTRA FESTIVA DIURNA"],["P009","EXTRA FESTIVA NOCTURNA"],["P100","RECARGO NOCTURNO DOMINICAL O FESTIVO"]];
const HEADERS=["Empleado","Concepto","Fecha","Dias","FechaInici","Horas","Valor","LiquidarEnPrima","Centro de costos"];
let sesion=null,base=[],jornadas=[],catalogo=[],responsables=[],vista="jornadas",pagina=0;
const TAMANO_PAGINA=350;
const $=id=>document.getElementById(id),texto=v=>String(v??"").trim(),num=v=>Number(v||0);
const html=v=>texto(v).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
const fechaCorta=v=>{if(!v)return "-";const s=texto(v).slice(0,10).split("-");return s.length===3?`${s[2]}/${s[1]}/${s[0]}`:texto(v)};
const hora=v=>texto(v).match(/(?:T|\s)(\d{2}:\d{2})/)?.[1]||texto(v).slice(0,5)||"-";
const estado=v=>texto((v&&typeof v==="object")?(v.estado_revision??v.estado??"pendiente"):(v||"pendiente")).toLowerCase();
const area=v=>texto(v.proceso_nombre||v.area||v.grupo_nombre||v.proceso_codigo||v.grupo_codigo||"SIN ÁREA");
const empleado=v=>texto(v.empleado||v.nombre_completo||`${v.nombres||""} ${v.apellidos||""}`);
const codigoErp=v=>texto(v.codigo_erp||v.Empleado||v.codigo_empleado||v.codigo||"");
const concepto=v=>texto(v.concepto_codigo||v.Concepto||"");
const horasCalculadas=v=>num(v.horas_calculadas??v.horas_candidatas??v.Horas);
const horasAprobadas=v=>v.horas_aprobadas==null?null:num(v.horas_aprobadas);

document.addEventListener("DOMContentLoaded",iniciar);
async function iniciar(){
  try{sesion=JSON.parse(localStorage.getItem("ccp_sesion")||"null");}catch{sesion=null;}
  if(!sesion){location.href="login.html";return}
  const rol=texto(sesion.rol).toLowerCase(),modulos=Array.isArray(sesion.modulos_permitidos)?sesion.modulos_permitidos:[];
  const permitido=sesion.puede_ver_todo===true||["admin","administrador","gerencia","nomina","auditor","aprobador","ayb","servicios_generales","direccion_financiera"].includes(rol)||modulos.includes("horas-extras");
  if(!permitido){alert("No tienes autorización para ingresar al módulo de horas extras.");location.href="login.html";return}
  $("heUsuario").textContent=sesion.nombre_completo||sesion.usuario||"Usuario";$("heRol").textContent=sesion.rol||"-";
  const hoy=new Date(),inicioBiometricos=new Date(2026,7,23);$("heDesde").value=iso(inicioBiometricos);$("heHasta").value=iso(hoy);
  $("heActualizar").addEventListener("click",cargar);
  $("heCancelarCarga").addEventListener("click",()=>{if(heCargando){heCanceladaPorUsuario=true;heAbort?.abort();$("heCancelarCarga").disabled=true;}});
  $("heRecalcular").addEventListener("click",recalcularCandidatos);
  ["heDesde","heHasta"].forEach(id=>$(id).addEventListener("change",()=>{
    heLecturaValida=false;actualizarAcciones();
    avisoCarga("Fechas modificadas. Pulsa Actualizar para consultar el nuevo periodo.","warning");
    if(heDisponible)render();
  }));["heArea","heEstado","heTurnoEstado"].forEach(id=>$(id).addEventListener("change",()=>{pagina=0;render()}));$("heBuscar").addEventListener("input",()=>{pagina=0;render()});
  document.querySelectorAll("[data-he-vista]").forEach(b=>b.addEventListener("click",()=>cambiarVista(b.dataset.heVista)));
  $("heAnterior").addEventListener("click",()=>{if(pagina>0){pagina--;render()}});$("heSiguiente").addEventListener("click",()=>{pagina++;render()});
  $("heXlsx").addEventListener("click",descargarRevision);$("heXls").addEventListener("click",descargarProsof);
  $("heConfigResponsables").addEventListener("click",()=>bootstrap.Modal.getOrCreateInstance($("heModalResponsables")).show());
  observarSesion(()=>{
    heCargaId++;heAbort?.abort();clearInterval(heTiempoTimer);heTiempoTimer=null;$("heTiempoCarga").textContent="Sesion finalizada";$("heDetalleCargaBody").replaceChildren();heCargando=false;heRecalculando=false;heGuardando=false;actualizarAcciones();
    limpiarNominaPorSesion();
    mostrarErrorAcceso($('heIntegridad'),new ErrorSesion('AUTH_REQUIRED','Tu sesion cambio o termino. Vuelve a ingresar para consultar Nomina.'),cargar);
  });
  await cargar();
}
function iso(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`}
function datosUtilizables(){return heDisponible&&heLecturaValida&&!heCargando&&!heGuardando&&!heRecalculando&&heRango?.desde===$("heDesde").value&&heRango?.hasta===$("heHasta").value;}
function actualizarAcciones(){
  const ocupado=heCargando||heGuardando||heRecalculando;
  $("heActualizar").disabled=ocupado;$("heRecalcular").disabled=ocupado;
  $("heCancelarCarga").hidden=!heCargando;$("heCancelarCarga").disabled=!heCargando||heAbort?.signal.aborted;
  $("heDesde").disabled=ocupado;$("heHasta").disabled=ocupado;
  $("heXlsx").disabled=!datosUtilizables();$("heXls").disabled=!datosUtilizables();
  $("heBody").querySelectorAll("button[data-action]").forEach(b=>b.disabled=!datosUtilizables());
}
function avisoCarga(mensaje,tipo="info"){
  $("heEstadoCarga").className=`alert alert-${tipo} py-2 small`;
  $("heEstadoCarga").textContent=mensaje;
}
function progresoCarga(p){
  const activas=p.enCurso?.length?p.enCurso.join(' + '):(p.etapa||'Verificando datos');
  const completas=p.totalFuentes?` | ${p.fuentesCompletas}/${p.totalFuentes} fuentes completas`:'';
  const rango=p.desde?` | ${fechaCorta(p.desde)} - ${fechaCorta(p.hasta)}`:'';
  avisoCarga(`${activas}${completas}${rango}${p.reducido?' | Tramo reducido automaticamente por tiempo de respuesta.':''}`);
  if(p.detalle){
    $("heDetalleCargaBody").innerHTML=p.detalle.map(x=>`<tr><td>${html(x.etapa)}</td><td>${html(({pendiente:'En espera',leyendo:'Consultando',completa:'Completa',error:'Error',cancelada:'Cancelada'})[x.estado]||x.estado)}</td><td>${num(x.peticiones)}</td><td>${x.estado==='completa'?num(x.filas):'\u2014'}</td><td>${(num(x.ms)/1000).toFixed(1)} s</td></tr>`).join('');
  }
}
function iniciarTiempoCarga(){
  clearInterval(heTiempoTimer);heInicioTiempo=performance.now();heCanceladaPorUsuario=false;
  const tick=()=>{$("heTiempoCarga").textContent=`${((performance.now()-heInicioTiempo)/1000).toFixed(1)} s transcurridos`;};
  tick();heTiempoTimer=setInterval(tick,500);
}
function terminarTiempoCarga(){
  clearInterval(heTiempoTimer);heTiempoTimer=null;
  $("heTiempoCarga").textContent=`${((performance.now()-heInicioTiempo)/1000).toFixed(1)} s en esta consulta`;
}
function detalleError(e){
  const fn=e.fuenteNomina?` Fuente: ${e.fuenteNomina}.`:"";
  const rango=e.desdeNomina?` Tramo: ${fechaCorta(e.desdeNomina)} - ${fechaCorta(e.hastaNomina)}.`:"";
  return `${e.message||e}${fn}${rango}`;
}
// The shared session control remains unchanged. Counts allow us to detect
// a truncated response even when the API caps the number of returned rows.
const lecturaRpc=(nombre,args,opts={})=>consultaConSesion(
  ()=>supabase.rpc(nombre,args,opts.count?{count:opts.count}:undefined),
  {read:true,signal:opts.signal,range:opts.range,name:nombre}
);
async function leerRevisiones(desde,hasta,signal,onProgress=()=>{}){
  try{
    const request=(nombre,args,opts)=>consultaConSesion(()=>supabase.from("turnos_conceptos_revision")
      .select("*",opts.count?{count:opts.count}:undefined).gte("fecha",desde).lte("fecha",hasta)
      .order("id",{ascending:true}),{signal,read:true,range:opts.range});
    const filas=await leerPaginas(request,{nombre:"turnos_conceptos_revision",signal,pageSize:1000,onProgress});
    if(new Set(filas.map(r=>r.id)).size!==filas.length)throw new Error("Se repitieron decisiones durante la paginacion. Actualiza nuevamente.");
    return filas;
  }catch(e){e.fuenteNomina="turnos_conceptos_revision";throw e;}
}
async function completarDatosEmpleados(revisiones,conocidos,signal){
  const mapa=new Map(conocidos.filter(e=>texto(e.cedula)).map(e=>[texto(e.cedula),e]));
  const faltantes=[...new Set(revisiones.map(r=>texto(r.cedula)).filter(c=>c&&!mapa.has(c)))];
  for(let i=0;i<faltantes.length;i+=80){
    const r=await consultaConSesion(()=>supabase.from("empleados")
      .select("cedula,nombres,apellidos,cargo,centro_costos,area,codigo").in("cedula",faltantes.slice(i,i+80)),{signal,read:true});
    if(r.error)throw r.error;
    for(const e of r.data||[])mapa.set(texto(e.cedula),e);
  }
  return [...mapa.values()];
}
function limpiarNominaPorSesion(){
  heDisponible=false;heLecturaValida=false;heRango=null;heMarcasFuente=[];heEmpleadosDetalle=[];base=[];jornadas=[];catalogo=[];responsables=[];
  $('heAreasBody').replaceChildren();$('hePaginaInfo').textContent='';
  document.querySelectorAll('[id^="heKpi"]').forEach(el=>el.textContent='\u2014');
  $('heBody').innerHTML='<tr><td colspan="12" class="text-center py-4">Inicia sesion nuevamente para consultar los datos.</td></tr>';
  $('heResponsablesBody').textContent='Se requiere una sesion verificada.';
  for(const id of ['heXlsx','heXls','heAnterior','heSiguiente'])$(id).disabled=true;
}
async function cargar(){
  if(heCargando||heGuardando||heRecalculando)return;
  heCargando=true;heLecturaValida=false;const cargaId=++heCargaId;heAbort=new AbortController();
  const signal=heAbort.signal;iniciarTiempoCarga();actualizarAcciones();
  if(!heDisponible){
    document.querySelectorAll('[id^="heKpi"]').forEach(el=>el.textContent="\u2014");
    $("heBody").innerHTML='<tr><td colspan="12" class="text-center text-muted py-4">Leyendo el periodo por tramos...</td></tr>';
  }
  avisoCarga("Verificando sesion e iniciando lectura. No se recalculan conceptos al abrir.");
  try{
    await asegurarSesion();
    const desde=$("heDesde").value,hasta=$("heHasta").value;diasEntre(desde,hasta);
    const r=await cargarFuentesNomina({request:lecturaRpc,readReviews:leerRevisiones,desde,hasta,signal,
      onProgress:p=>{if(cargaId===heCargaId)progresoCarga(p);}});
    if(cargaId!==heCargaId)return;
    const nuevoCatalogo=desenvolverEmpleados(r.empleados);
    const marcasFuente=desenvolver(r.marcas);
    if(new Set(marcasFuente.map(claveDia)).size!==marcasFuente.length)throw new Error("La fuente de marcaciones contiene jornadas repetidas. No se habilita Nomina.");
    const nuevasJornadas=completarUniversoEmpleados(combinarJornadas(r.general,r.ayb,r.inferidos,r.marcas),nuevoCatalogo,desde,hasta);
    const conocidos=[...nuevoCatalogo,...marcasFuente.filter(e=>!nuevoCatalogo.some(c=>texto(c.cedula)===texto(e.cedula)))];
    const detalleEmpleados=await completarDatosEmpleados(r.revisiones,conocidos,signal);
    const nuevaBase=completarBandeja(r.revisiones,detalleEmpleados,marcasFuente);
    let nuevosResponsables=[],avisoResponsables="";
    try{
      const rr=await consultaConSesion(()=>supabase.from("vw_turnos_responsables_activos").select("*"),{signal,read:true});
      if(rr.error)throw rr.error;
      nuevosResponsables=Array.isArray(rr.data)?rr.data:[];
    }catch(e){
      if((esErrorAcceso(e)&&e.code!=="AUTH_FORBIDDEN")||signal.aborted)throw e;
      avisoResponsables=" No se pudo consultar la configuracion de responsables; se mantienen los responsables guardados en los conceptos.";
    }
    if(cargaId!==heCargaId)return;
    verificarIntegridadMarcaciones(marcasFuente,nuevasJornadas);
    // Commit only after every mandatory read and the integrity check succeed.
    catalogo=nuevoCatalogo;jornadas=nuevasJornadas;base=nuevaBase;responsables=nuevosResponsables;
    heMarcasFuente=marcasFuente;heEmpleadosDetalle=detalleEmpleados;
    heRango={desde,hasta};pagina=0;heDisponible=true;heLecturaValida=true;
    poblarAreas();render();
    avisoCarga(`Lectura completa del ${fechaCorta(desde)} al ${fechaCorta(hasta)}. Se muestran decisiones y candidatos guardados. Usa Recalcular candidatos solo para actualizar los calculos.${avisoResponsables}`,avisoResponsables?"warning":"success");
  }catch(e){
    if(cargaId!==heCargaId)return;
    heAbort.abort();heLecturaValida=false;console.error("Carga Nomina:",detalleError(e));
    if(heCanceladaPorUsuario)e=new Error("Consulta cancelada. No se modificaron registros. Puedes elegir las fechas y volver a consultar.");
    if(esErrorAcceso(e)){
      limpiarNominaPorSesion();
      mostrarErrorAcceso($("heIntegridad"),e,cargar);
    }else{
      $("heIntegridad").className="alert alert-warning py-2 small";
      $("heIntegridad").textContent=heDisponible
        ?`Actualizacion no completada. La tabla conserva la ultima lectura completa (${fechaCorta(heRango.desde)} - ${fechaCorta(heRango.hasta)}), sin permitir decisiones ni exportacion.`
        :"Lectura no completada. No hay datos verificados para decidir o exportar.";
      if(!heDisponible)$("heBody").innerHTML=`<tr><td colspan="12" class="text-center text-danger py-4">${html(detalleError(e))}</td></tr>`;
    }
    avisoCarga(`No se completo la lectura: ${detalleError(e)}`,heCanceladaPorUsuario?"warning":"danger");
  }finally{
    if(cargaId===heCargaId){terminarTiempoCarga();heCargando=false;actualizarAcciones();if(heDisponible)render();actualizarAcciones();}
  }
}
async function recalcularCandidatos(){
  if(heCargando||heGuardando||heRecalculando)return;
  const desde=$("heDesde").value,hasta=$("heHasta").value;
  try{diasEntre(desde,hasta);}catch(e){avisoCarga(e.message,"warning");return;}
  if(!confirm(`Recalcular candidatos del ${fechaCorta(desde)} al ${fechaCorta(hasta)}? Se ejecutan las reglas existentes por dia, sin aprobar pagos. Esto puede tardar mas que consultar.`))return;
  const id=++heCargaId;heAbort=new AbortController();heRecalculando=true;heLecturaValida=false;actualizarAcciones();
  let completado=false;
  try{
    await asegurarSesion();
    await recalcularPorDias(rpcConSesion,{desde,hasta,signal:heAbort.signal,onProgress:p=>{
      if(id===heCargaId)avisoCarga(`Recalculando ${p.etapa}: ${fechaCorta(p.fecha)} | ${p.completadas}/${p.total} operaciones completas. No se aprueban pagos automaticamente.`);
    }});
    if(id!==heCargaId)return;
    completado=true;
  }catch(e){
    if(id!==heCargaId)return;
    avisoCarga(`Recalculo detenido. ${e.operacionesCompletadas||0} operaciones anteriores completadas; no se repite el envio fallido. ${detalleError(e)} Pulsa Actualizar para consultar lo guardado.`,"warning");
    if(esErrorAcceso(e)){limpiarNominaPorSesion();mostrarErrorAcceso($("heIntegridad"),e,cargar);}
  }finally{
    if(id===heCargaId){heRecalculando=false;actualizarAcciones();}
  }
  if(completado)await cargar();
}

function desenvolver(datos){return (Array.isArray(datos)?datos:[]).map(x=>x?.jornada||x).filter(Boolean)}
function desenvolverEmpleados(datos){return (Array.isArray(datos)?datos:[]).map(x=>x?.empleado||x).filter(Boolean)}
function claveDia(x){return `${texto(x.cedula)}|${texto(x.fecha).slice(0,10)}`}
function minutosHora(v){const h=hora(v);if(!/^\d{2}:\d{2}$/.test(h))return null;const [a,b]=h.split(":").map(Number);return a*60+b}
function compararConMarcaciones(x){
  const total=num(x.total_marcaciones),tipo=texto(x.programacion_tipo).toLowerCase();
  const confirmada=tipo==="confirmada",inferida=["inferida_alta","inferida_media"].includes(tipo),comparable=confirmada||inferida;
  if(!total)return {...x,primera_marcacion:null,ultima_marcacion:null,minutos_tarde:0,minutos_salida_anticipada:0,minutos_posteriores_turno:0,estado_comparacion:confirmada?"sin_marcaciones":"sin_programacion_sin_marcaciones"};
  if(total===1)return {...x,ultima_marcacion:null,minutos_tarde:null,minutos_salida_anticipada:null,minutos_posteriores_turno:null,estado_comparacion:"marcacion_unica"};
  if(!comparable)return {...x,minutos_tarde:null,minutos_salida_anticipada:null,minutos_posteriores_turno:null,estado_comparacion:tipo==="inferida_ambigua"?"turno_ambiguo":"sin_programacion"};
  if(total===1)return {...x,minutos_tarde:0,minutos_salida_anticipada:0,minutos_posteriores_turno:0,estado_comparacion:"marcacion_unica"};
  const ini=minutosHora(x.hora_inicio),fin=minutosHora(x.hora_fin_2||x.hora_fin);
  const entrada=minutosHora(x.primera_marcacion),salida=minutosHora(x.ultima_marcacion);
  if([ini,fin,entrada,salida].some(v=>v===null))return {...x,estado_comparacion:"incompleta"};
  // Use actual dates: an early mark is not automatically tomorrow's exit.
  const fechaBase=instanteLocal(`${texto(x.fecha).slice(0,10)}T00:00:00`);
  const entradaReal=instanteLocal(x.primera_marcacion,x.fecha),salidaReal=instanteLocal(x.ultima_marcacion,x.fecha);
  if(fechaBase===null||entradaReal===null||salidaReal===null||salidaReal<entradaReal||fin===ini)
    return {...x,estado_comparacion:"incompleta",minutos_tarde:null,minutos_salida_anticipada:null,minutos_posteriores_turno:null};
  const inicioProgramado=fechaBase+ini,finProgramado=fechaBase+fin+(fin<ini?1440:0);
  return {...x,
    minutos_tarde:Math.max(Math.floor(entradaReal-inicioProgramado),0),
    minutos_salida_anticipada:Math.max(Math.floor(finProgramado-salidaReal),0),
    minutos_posteriores_turno:Math.max(Math.floor(salidaReal-finProgramado),0),
    estado_comparacion:confirmada?"comparable":"comparable_inferida"
  };
}
function combinarJornadas(generales,ayb,inferidos,marcas){
  const confirmadas=[...desenvolver(generales),...desenvolver(ayb)];
  const diasConfirmados=new Set(confirmadas.map(claveDia));
  const inferidas=desenvolver(inferidos).filter(x=>!diasConfirmados.has(claveDia(x)));
  const programadas=[...confirmadas,...inferidas];
  // La RPC de marcaciones es la fuente autoritativa para presencia. Se superpone
  // a la programación porque algunas vistas históricas conservan el turno pero
  // no todas las marcas del día (especialmente alrededor del corte del 26/08).
  const marcasPorDia=new Map(desenvolver(marcas).map(x=>[claveDia(x),x]));
  const programadasConMarcas=programadas.map(x=>{
    const m=marcasPorDia.get(claveDia(x));
    if(!m)return compararConMarcaciones(x);

    return compararConMarcaciones({...x,
      recorrido_fuente_jornada:x.recorrido,
      total_marcaciones:m.total_marcaciones,
      primera_marcacion:m.primera_marcacion,
      ultima_marcacion:m.ultima_marcacion,
      recorrido:m.recorrido
    });
  });
  const patron=new Map();
  for(const x of programadasConMarcas)if(!patron.has(texto(x.cedula))&&texto(x.turno))patron.set(texto(x.cedula),x);
  const clavesProgramadas = new Set(programadasConMarcas.map(claveDia));
  const sueltas=[...marcasPorDia.values()].filter(x=>!clavesProgramadas.has(claveDia(x))).map(x=>{
    const p=patron.get(texto(x.cedula));
    return compararConMarcaciones({...x,turno:p?.turno||"",turno_2:p?.turno_2||"",hora_inicio:p?.hora_inicio||"",hora_fin:p?.hora_fin||"",
      hora_inicio_2:p?.hora_inicio_2||"",hora_fin_2:p?.hora_fin_2||"",
      programacion_tipo:p?"Probable; solo referencia":"Sin programación",estado_comparacion:"sin_programacion"});
  });
  return [...programadasConMarcas,...sueltas].sort((a,b)=>texto(b.fecha).localeCompare(texto(a.fecha))||empleado(a).localeCompare(empleado(b),"es"));
}
function fechasRango(desde,hasta){const r=[],d=new Date(`${desde}T12:00:00`),f=new Date(`${hasta}T12:00:00`);while(d<=f){r.push(iso(d));d.setDate(d.getDate()+1)}return r}
function completarUniversoEmpleados(encontradas,empleados,desde,hasta){
  const porDia=new Map();for(const x of encontradas){const k=claveDia(x);if(!porDia.has(k)||x.programacion_tipo==="confirmada")porDia.set(k,x)}
  const fechas=fechasRango(desde,hasta),todo=[];
  for(const e of empleados)for(const fecha of fechas){const x=porDia.get(`${texto(e.cedula)}|${fecha}`);todo.push(x||{...e,fecha,turno:"",hora_inicio:"",hora_fin:"",total_marcaciones:0,primera_marcacion:null,ultima_marcacion:null,recorrido:[],programacion_tipo:"Sin programación",estado_comparacion:"sin_programacion_sin_marcaciones",origen:"catalogo"})}
  // Ninguna marcación puede desaparecer por no pertenecer al catálogo activo.
  // Conserva códigos sin vincular y empleados retirados como filas auditables.
  const catalogadas=new Set(empleados.map(e=>texto(e.cedula)));
  for(const x of encontradas){
    if(num(x.total_marcaciones)>0&&!catalogadas.has(texto(x.cedula))){
      todo.push({...x,empleado:empleado(x)||`Código biométrico ${texto(x.cedula)} sin vincular`,area:area(x)||"SIN VINCULAR",estado_comparacion:"marcacion_sin_empleado_vinculado"});
    }
  }
  return todo.sort((a,b)=>texto(b.fecha).localeCompare(texto(a.fecha))||empleado(a).localeCompare(empleado(b),"es"));
}
function verificarIntegridadMarcaciones(fuente,resultado){
  const clavesFuente=new Set(fuente.filter(x=>num(x.total_marcaciones)>0).map(claveDia));
  const clavesResultado=new Set(resultado.filter(x=>num(x.total_marcaciones)>0).map(claveDia));
  const faltantes=[...clavesFuente].filter(k=>!clavesResultado.has(k));
  const totalFuente=fuente.reduce((s,x)=>s+num(x.total_marcaciones),0);
  const totalResultado=resultado.reduce((s,x)=>s+num(x.total_marcaciones),0);
  const aviso=$("heIntegridad");
  const recuentos=new Map(resultado.filter(x=>num(x.total_marcaciones)>0).map(x=>[claveDia(x),num(x.total_marcaciones)]));
  const diferencias=fuente.filter(x=>num(x.total_marcaciones)!==(recuentos.get(claveDia(x))||0));
  if(faltantes.length||diferencias.length||totalFuente!==totalResultado){
    aviso.className="alert alert-danger py-2 small";
    aviso.textContent=`ALERTA DE INTEGRIDAD: Supabase entregó ${totalFuente} marcaciones en ${clavesFuente.size} empleado/día, pero la bandeja conserva ${totalResultado} en ${clavesResultado.size}. No usar para Nómina.`;
    throw new Error(`Control de integridad falló: ${faltantes.length} jornadas con marcaciones quedaron fuera.`);
  }
  aviso.className="alert alert-success py-2 small";
  aviso.textContent=`Integridad verificada: ${totalFuente} marcaciones cargadas en ${clavesFuente.size} combinaciones empleado/día. No se omitieron registros recibidos desde Supabase.`;
}

function completarBandeja(revisiones,empleados,marcas){
  const porCedula=new Map(empleados.map(x=>[texto(x.cedula),x]));
  const porDia=new Map(marcas.map(m=>[claveDia(m),m]));
  return revisiones.map(r=>{
    const d=r.detalle||{},e=porCedula.get(texto(r.cedula))||{};
    const m=porDia.get(claveDia(r));
    return {...r,
      empleado:empleado(e)||r.cedula,
      cargo:e.cargo||"",centro_costos:e.centro_costos||"",area:e.area||"",
      grupo_nombre:r.grupo_codigo==="ALIMENTOS_BEBIDAS"?"Alimentos y Bebidas":r.grupo_codigo,
      turno:d.turno||"",turno_2:d.turno_2||"",hora_inicio:d.hora_inicio||"",hora_fin:d.hora_fin||"",hora_inicio_2:d.hora_inicio_2||"",hora_fin_2:d.hora_fin_2||"",
      horas_programadas_netas:d.horas_programadas_netas??d.horas_programadas,
      horas_reales:d.horas_reales,horas_candidatas:r.horas_calculadas,
      primera_marcacion:m?.primera_marcacion||null,ultima_marcacion:m?.ultima_marcacion||null,total_marcaciones:num(m?.total_marcaciones),
      revision_id:r.id,estado_revision:r.estado,permite_revision:!["aprobado","rechazado"].includes(estado(r.estado))
    };
  });
}
function poblarAreas(){const actual=$("heArea").value;const areas=[...new Set([...base,...jornadas].map(area))].sort((a,b)=>a.localeCompare(b,"es"));$("heArea").innerHTML='<option value="">Todas</option>'+areas.map(x=>`<option ${x===actual?"selected":""}>${html(x)}</option>`).join("")}
// Fase temporal confirmada: todos los usuarios administrativos autorizados
// pueden revisar el consolidado completo, independientemente de su área base.
function dentroAlcance(){return true}
function filtrados(){const a=$("heArea").value,e=$("heEstado").value,b=texto($("heBuscar").value).toLowerCase();return base.filter(x=>dentroAlcance(x)&&(!a||area(x)===a)&&(!e||estado(x)===e)&&(!b||`${empleado(x)} ${x.cedula||""} ${codigoErp(x)} ${concepto(x)}`.toLowerCase().includes(b)))}
function esNocturnoObservado(x){
  if(num(x.total_marcaciones)<2||!x.ultima_marcacion)return false;
  const salida=minutosHora(x.ultima_marcacion);
  return salida!==null&&salida>=19*60;
}
function etiquetaNocturno(x){
  return esNocturnoObservado(x)?'<span class="he-nocturno">◐ Revisar nocturno</span>':'<span class="text-muted small">-</span>';
}
function jornadasFiltradas(){const a=$("heArea").value,t=$("heTurnoEstado").value,n=$("heNocturno")?.value||"",b=texto($("heBuscar").value).toLowerCase();return jornadas.filter(x=>(!a||area(x)===a)&&(!t||tipoTurno(x)===t)&&(!n||(n==="si"?esNocturnoObservado(x):!esNocturnoObservado(x)))&&(!b||`${empleado(x)} ${x.cedula||""} ${codigoErp(x)} ${x.turno||""}`.toLowerCase().includes(b)))}
function puedeDecidir(){return datosUtilizables()}

function tipoTurno(x){
  const tipo=texto(x.programacion_tipo).toLowerCase();
  const estadoComp=texto(x.estado_comparacion).toLowerCase();
  if(tipo==="confirmada")return "confirmada";
  if(tipo==="inferida_alta")return "inferida_alta";
  if(tipo==="inferida_media")return "inferida_media";
  if(tipo==="inferida_ambigua"||estadoComp==="turno_ambiguo")return "inferida_ambigua";
  return "sin_programacion";
}
function etiquetaTurno(x){
  const t=tipoTurno(x);
  return ({confirmada:"Confirmado",inferida_alta:"Inferido · alta",inferida_media:"Inferido · media",inferida_ambigua:"Turno por confirmar",sin_programacion:"Sin programación"})[t]||"Sin programación";
}
function badgeTurno(x){return `<span class="he-turno-state" title="${html(explicarTurno(x))}">${html(etiquetaTurno(x))}</span>`}
function resumenAuditoriaTurnos(rows){
  const conMarca=rows.filter(x=>num(x.total_marcaciones)>0);
  return {
    conMarca:conMarca.length,
    confirmada:conMarca.filter(x=>tipoTurno(x)==="confirmada").length,
    alta:conMarca.filter(x=>tipoTurno(x)==="inferida_alta").length,
    media:conMarca.filter(x=>tipoTurno(x)==="inferida_media").length,
    ambigua:conMarca.filter(x=>tipoTurno(x)==="inferida_ambigua").length,
    sinTurno:conMarca.filter(x=>tipoTurno(x)==="sin_programacion").length
  };
}
function responsableDe(x){return texto(x.responsable_nombre||x.aprobador_nombre||responsables.find(r=>texto(r.proceso_codigo)&&texto(r.proceso_codigo)===texto(x.proceso_codigo))?.responsable_nombre||"Sin asignar")}
function badge(e){
  const nombres={turno_ambiguo:"Turno por confirmar",marcacion_unica:"Una marca; falta salida",sin_programacion:"Sin horario confirmado",sin_programacion_sin_marcaciones:"Sin registros recibidos",sin_marcaciones:"Sin registros recibidos",comparable:"Horario comparable",comparable_inferida:"Horario sugerido",marcacion_sin_empleado_vinculado:"Marca sin vinculo confirmado"};
  return `<span class="he-state he-${html(e)}">${html(nombres[e]||e)}</span>`;
}
function cambiarVista(nueva){vista=nueva;pagina=0;document.querySelectorAll("[data-he-vista]").forEach(b=>{const activa=b.dataset.heVista===vista;b.classList.toggle("active",activa);b.classList.toggle("btn-primary",activa);b.classList.toggle("btn-outline-primary",!activa)});$("heEstadoWrap").classList.toggle("d-none",vista==="jornadas");$("heTurnoWrap").classList.toggle("d-none",vista!=="jornadas");render()}
function render(){
  if(!heDisponible)return;const conceptos=filtrados(),jfs=jornadasFiltradas(),rows=vista==="jornadas"?jfs:conceptos;$("heKpiRegistros").textContent=rows.length;$("heKpiPendientes").textContent=conceptos.filter(x=>estado(x)==="pendiente").length;$("heKpiAprobados").textContent=conceptos.filter(x=>estado(x)==="aprobado").length;$("heKpiHoras").textContent=conceptos.filter(x=>estado(x)==="aprobado").reduce((s,x)=>s+num(x.horas_aprobadas),0).toFixed(2);renderAreas(conceptos);vista==="jornadas"?renderJornadas(rows):renderTabla(rows)}
function resumenAreas(rows){const map=new Map();for(const x of rows){const a=area(x),o=map.get(a)||{p:0,o:0,a:0,r:new Set()};const e=estado(x);if(e==="pendiente")o.p++;if(e==="observado")o.o++;if(e==="aprobado")o.a++;o.r.add(responsableDe(x));map.set(a,o)}return map}
function renderAreas(rows){const map=resumenAreas(rows);$("heKpiAreas").textContent=[...map.values()].filter(x=>x.p+x.o>0).length;$("heAreasBody").innerHTML=[...map].sort().map(([a,x])=>`<tr class="he-area-row ${x.p+x.o===0?"cerrada":""}"><td><strong>${html(a)}</strong></td><td>${html([...x.r].join(", "))}</td><td>${x.p}</td><td>${x.o}</td><td>${x.a}</td><td>${x.p+x.o?badge("pendiente"):badge("aprobado")}</td></tr>`).join("")||'<tr><td colspan="6" class="text-center text-muted">Sin datos.</td></tr>'}
function renderTabla(rows){$("hePaginacion").classList.add("d-none");$("heHead").innerHTML="<tr><th>Área</th><th>Empleado</th><th>Fecha</th><th>Turno</th><th>Salida real</th><th>Concepto</th><th>Calculadas</th><th>Aprobadas</th><th>Estado</th><th>Responsable</th><th>Acciones</th></tr>";$("heBody").innerHTML=rows.map(x=>`<tr><td>${html(area(x))}</td><td><strong>${html(empleado(x))}</strong><div class="small text-muted">${html(codigoErp(x)||"Sin código ERP")} · ${html(x.cedula||"")}</div></td><td>${html(fechaCorta(x.fecha))}</td><td>${html(x.turno||"")}<div class="small text-muted">${html(hora(x.hora_inicio))}–${html(hora(x.hora_fin))}</div></td><td>${html(hora(x.ultima_marcacion))}</td><td><strong>${html(concepto(x))}</strong><div class="small">${html(x.concepto_nombre||"")}</div></td><td>${horasCalculadas(x).toFixed(2)}</td><td>${horasAprobadas(x)==null?"-":horasAprobadas(x).toFixed(2)}</td><td>${badge(estado(x))}</td><td>${html(responsableDe(x))}</td><td>${puedeDecidir()&&x.permite_revision&&!["aprobado","rechazado"].includes(estado(x))?`<div class="d-flex flex-wrap gap-1"><button class="btn btn-success btn-sm" data-action="aprobar" data-id="${html(x.revision_id)}">Aprobar</button><button class="btn btn-outline-primary btn-sm" data-action="ajustar" data-id="${html(x.revision_id)}">Ajustar</button><button class="btn btn-outline-warning btn-sm" data-action="observar" data-id="${html(x.revision_id)}">Observar</button><button class="btn btn-outline-danger btn-sm" data-action="rechazar" data-id="${html(x.revision_id)}">Rechazar</button></div>`:`<span class="small text-muted">${datosUtilizables()?'Decisión cerrada':'Actualizar para decidir'}</span>`}</td></tr>`).join("")||'<tr><td colspan="11" class="text-center text-muted py-4">No hay resultados.</td></tr>';$("heBody").querySelectorAll("button[data-action]").forEach(b=>b.addEventListener("click",()=>resolver(b.dataset.id,b.dataset.action)))}
function diferenciaLlegada(x){if(!x.primera_marcacion)return "Sin entrada";const m=num(x.minutos_tarde);if(m>0)return `Llegó ${m} min tarde`;if(texto(x.hora_inicio)&&["confirmada","inferida_alta","inferida_media"].includes(texto(x.programacion_tipo).toLowerCase())){const ini=new Date(`${texto(x.fecha).slice(0,10)}T${hora(x.hora_inicio)}:00`),real=new Date(x.primera_marcacion);const antes=Math.max(0,Math.round((ini-real)/60000));return antes?`Llegó ${antes} min antes`:"A tiempo"}return "Sin comparación"}
function diferenciaSalida(x){if(num(x.total_marcaciones)===1)return "Sin salida verificable";if(!x.ultima_marcacion)return "Sin salida";const a=num(x.minutos_salida_anticipada),p=num(x.minutos_posteriores_turno);if(a>0)return `Salió ${a} min antes`;if(p>0)return `Salió ${p} min después`;return x.programacion_tipo==="confirmada"?"A tiempo":"Sin comparación"}
function marcasTexto(x){const r=Array.isArray(x.recorrido)?x.recorrido:[];return r.length?r.map(m=>hora(m.hora)).join(", "):`${num(x.total_marcaciones)} marcación(es)`}
function renderJornadas(rows){
  $("heHead").innerHTML="<tr><th>Área</th><th>Empleado</th><th>Fecha</th><th>Turno</th><th>Programado</th><th>Marcaciones</th><th>Entrada</th><th>Salida</th><th>Total diario</th><th>Llegada</th><th>Salida vs. turno</th><th>Estado</th></tr>";
  const totalPaginas=Math.max(1,Math.ceil(rows.length/TAMANO_PAGINA));if(pagina>=totalPaginas)pagina=totalPaginas-1;const desde=pagina*TAMANO_PAGINA,visibles=rows.slice(desde,desde+TAMANO_PAGINA);
  $("heBody").innerHTML=visibles.map(x=>`<tr><td>${html(area(x))}</td><td><strong>${html(empleado(x)||"Sin nombre")}</strong><div class="small text-muted">${html(x.cedula||"")}</div></td><td>${fechaCorta(x.fecha)}</td><td>${html(x.turno||((x.total_marcaciones>0)?"Horario observado; sin turno asignado":"Sin programación"))}<div class="mt-1">${badgeTurno(x)}</div></td><td>${html(hora(x.hora_inicio))}–${html(hora(x.hora_fin))}${x.turno_2?`<div class="small">${html(hora(x.hora_inicio_2))}–${html(hora(x.hora_fin_2))}</div>`:""}</td><td><strong>${num(x.total_marcaciones)}</strong><div class="small text-muted">${html(marcasTexto(x))}</div></td><td>${html(hora(x.primera_marcacion))}</td><td>${html(hora(x.ultima_marcacion))}</td><td>${celdaTrabajo(x)}</td><td>${html(diferenciaLlegada(x))}</td><td>${html(diferenciaSalida(x))}</td><td>${badge(texto(x.estado_comparacion||"sin_programacion"))}</td></tr>`).join("")||'<tr><td colspan="12" class="text-center text-muted py-4">No hay jornadas ni marcaciones para los filtros seleccionados.</td></tr>';
  $("heBody").querySelectorAll("button[data-detalle-dia]").forEach(b=>b.addEventListener("click",()=>abrirDetalleDia(b.dataset.detalleDia)));
  $("hePaginacion").classList.remove("d-none");$("hePaginaInfo").textContent=`Mostrando ${rows.length?desde+1:0}–${Math.min(desde+TAMANO_PAGINA,rows.length)} de ${rows.length} jornadas · ${catalogo.length} empleados activos`;
  $("heAnterior").disabled=pagina===0;$("heSiguiente").disabled=pagina>=totalPaginas-1;
}
function celdaTrabajo(x){
  const r=resumenTrabajoDia(x);
  const valor=r.minutosNetos===null ? (r.minutosBrutos===null ? "No calculable" : duracionTexto(r.minutosBrutos)) : duracionTexto(r.minutosNetos);
  const nota=r.minutosNetos===null ? (r.cantidad===1?"Marca incompleta":"Tiempo entre marcas") : (r.estado==="TOTAL DEL MOTOR"?"Total del motor":"Neto estimado");
  return `<strong>${html(valor)}</strong><div class="he-note">${html(nota)}</div><button class="btn btn-link btn-sm p-0" data-detalle-dia="${html(claveDia(x))}">Ver detalle</button>`;
}
function abrirDetalleDia(clave){
  const x=jornadas.find(x=>claveDia(x)===clave);if(!x)return;
  const r=resumenTrabajoDia(x),n=resumenConceptosNocturnos(x,base);
  $("heDiaTitulo").textContent=`${empleado(x)} | ${fechaCorta(x.fecha)}`;
  const dato=(titulo,valor)=>`<div><dt>${html(titulo)}</dt><dd>${html(valor)}</dd></div>`;
  $("heDiaContenido").innerHTML=`<p>${html(explicarTurno(x))}</p><dl class="he-dia-grid">
    ${dato("Marcaciones recibidas",r.cantidad)}
    ${dato("Tiempo entre primera y ultima marca",duracionTexto(r.minutosBrutos))}
    ${dato("Descanso / diferencia descontada",duracionTexto(r.minutosDescontados))}
    ${dato("Total diario calculado",duracionTexto(r.minutosNetos))}
    ${dato("Estado del total",r.estado)}
    ${dato("Tiempo posterior al turno (informativo)",duracionTexto(r.minutosDespues))}
    ${dato("De ese tiempo, tramo nocturno (informativo)",duracionTexto(r.minutosDespuesNocturnos))}
    ${dato("Extras nocturnas registradas para revisar",n.registros?n.pendiente.toFixed(2)+" h":"No hay concepto registrado")}
    ${dato("Extras nocturnas aprobadas",n.registros?n.aprobada.toFixed(2)+" h":"No hay concepto registrado")}
    </dl><p class="alert alert-light border small">${html(r.criterio)}</p>
    <p class="small">El tiempo nocturno observado no se convierte automaticamente en horas extra. La aprobacion y PROSOF utilizan solo conceptos registrados. Una jornada que cruza medianoche requiere validar tambien el dia siguiente.</p>
    <h3 class="h6">Marcas originales del dia</h3><div class="table-responsive"><table class="table table-sm"><thead><tr><th>Fecha y hora</th><th>Punto / terminal</th></tr></thead><tbody>${r.eventos.map(m=>`<tr><td>${html(m.hora||m.punch_time)}</td><td>${html(m.terminal||m.terminal_alias||m.area||m.terminal_sn||"Sin punto informado")}</td></tr>`).join("")||'<tr><td colspan="2">Sin detalle recibido.</td></tr>'}</tbody></table></div>`;
  bootstrap.Modal.getOrCreateInstance($("heModalDia")).show();
}

async function resolver(id,accion){
  if(!datosUtilizables())return;
  const x=base.find(v=>texto(v.revision_id)===texto(id));if(!x)return;
  let h=horasCalculadas(x),obs=null;
  if(accion==="ajustar"){
    const raw=prompt("Horas aprobadas:",h.toFixed(2));if(raw===null)return;
    h=Number(String(raw).replace(",","."));if(!Number.isFinite(h)||h<=0)return alert("Horas inválidas.");
    obs=prompt("Justificación obligatoria:");if(!texto(obs))return alert("La justificación es obligatoria.");
  }else if(accion==="observar"||accion==="rechazar"){
    obs=prompt(accion==="observar"?"Observación obligatoria:":"Motivo obligatorio del rechazo:");
    if(!texto(obs))return alert("Debes registrar el motivo.");
    h=null;
  }else if(!confirm(`Aprobar ${h.toFixed(2)} horas de ${concepto(x)} para ${empleado(x)}?`))return;
  heGuardando=true;actualizarAcciones();avisoCarga("Guardando decision...");
  const carga=id+"|"+heCargaId;
  try{
    const {data,error}=await rpcConSesion("resolver_concepto_revision_general_v2",{p_revision_id:id,p_accion:accion,p_horas_aprobadas:h,p_observacion:obs},{read:false});
    if(error)throw error;
    if(carga!==id+"|"+heCargaId)return;
    let fila=Array.isArray(data)?data[0]:data;
    if(!fila||texto(fila.id)!==texto(id)){
      const r=await consultaConSesion(()=>supabase.from("turnos_conceptos_revision").select("*").eq("id",id).single(),{read:true});
      if(r.error)throw r.error;fila=r.data;
    }
    if(carga!==id+"|"+heCargaId)return;
    if(!fila||texto(fila.id)!==texto(id))throw new Error("No se pudo confirmar el registro guardado.");
    const actualizado=completarBandeja([fila],heEmpleadosDetalle,heMarcasFuente)[0];
    base=base.map(r=>texto(r.revision_id)===texto(id)?actualizado:r);
    avisoCarga("Decision confirmada por Supabase. Se actualizo solo el registro afectado.","success");
  }catch(e){
    heLecturaValida=false;
    if(esErrorAcceso(e)){limpiarNominaPorSesion();mostrarErrorAcceso($("heIntegridad"),e,cargar);}
    avisoCarga(`No se pudo confirmar la decision. No se repetira automaticamente. Pulsa Actualizar antes de otro intento. ${e.message||e}`,"warning");
  }finally{
    heGuardando=false;if(heDisponible)render();actualizarAcciones();
  }
}

function filasProsof(rows){return rows.filter(x=>estado(x)==="aprobado").map(x=>({Empleado:codigoErp(x),Concepto:concepto(x),Fecha:texto(x.fecha||x.Fecha).slice(0,10),Dias:"",FechaInici:"",Horas:num(x.horas_aprobadas??x.Horas),Valor:"",LiquidarEnPrima:"N","Centro de costos":texto(x["Centro de costos"]||x.centro_costos||"")}))}
function validarProsof(rows){const errores=[];rows.forEach((x,i)=>{if(!x.Empleado)errores.push(`Fila ${i+2}: empleado sin código PROSOF`);if(!CONCEPTOS.some(c=>c[0]===x.Concepto))errores.push(`Fila ${i+2}: concepto ${x.Concepto||"vacío"} no permitido`);if(!/^\d{4}-\d{2}-\d{2}$/.test(x.Fecha))errores.push(`Fila ${i+2}: fecha inválida`);if(!(x.Horas>0))errores.push(`Fila ${i+2}: horas inválidas`)});return errores}
function hojaProsof(rows){const ws=XLSX.utils.json_to_sheet(rows,{header:HEADERS});ws["!cols"]=[{wch:14},{wch:12},{wch:12},{wch:8},{wch:12},{wch:10},{wch:10},{wch:18},{wch:18}];for(let r=2;r<=rows.length+1;r++){if(ws[`A${r}`])ws[`A${r}`].t="s";if(ws[`B${r}`])ws[`B${r}`].t="s";const d=rows[r-2].Fecha.split("-").map(Number);ws[`C${r}`]={t:"d",v:new Date(d[0],d[1]-1,d[2]),z:"mm-dd-yy"};if(ws[`F${r}`])ws[`F${r}`].z="#,##0.00"}return ws}
function hojaConceptos(){return XLSX.utils.aoa_to_sheet([["",""],["",""],...CONCEPTOS])}
function descargarProsof(){if(!datosUtilizables())return alert("Actualiza el periodo completo antes de exportar.");if(!window.XLSX)return alert("No se cargó el componente Excel.");const rows=filasProsof(filtrados()),errores=validarProsof(rows);if(!rows.length)return alert("No hay conceptos aprobados para exportar.");if(errores.length)return alert(`No se generó el archivo porque debe corregirse:\n\n${errores.slice(0,12).join("\n")}`);const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,hojaProsof(rows),"Hoja1");XLSX.utils.book_append_sheet(wb,hojaConceptos(),"conceptos");XLSX.writeFile(wb,`NOMINA_EXTRAS_${$("heDesde").value}_${$("heHasta").value}.xls`,{bookType:"biff8"})}
function descargarRevision(){
  if(!datosUtilizables())return alert("Actualiza el periodo completo antes de exportar.");
  if(!window.XLSX)return alert("No se cargo el componente Excel.");
  const rows=filtrados(),js=jornadasFiltradas(),wb=XLSX.utils.book_new();
  const asistencia=js.map(x=>{
    const d=resumenTrabajoDia(x),n=resumenConceptosNocturnos(x,base);
    return {Area:area(x),Empleado:empleado(x),Cedula:x.cedula||"","Codigo PROSOF":codigoErp(x),Fecha:texto(x.fecha).slice(0,10),
      Turno:x.turno||"Sin programacion","Tipo programacion":x.programacion_tipo||"","Inicio programado":hora(x.hora_inicio),
      "Salida programada":hora(x.hora_fin),"Inicio bloque 2":hora(x.hora_inicio_2),"Salida bloque 2":hora(x.hora_fin_2),
      "Total marcaciones":num(x.total_marcaciones),Marcaciones:marcasTexto(x),"Entrada real":hora(x.primera_marcacion),
      "Salida real":num(x.total_marcaciones)>1?hora(x.ultima_marcacion):"Sin salida verificable",
      "Tiempo entre marcas (h)":d.minutosBrutos===null?null:Math.round(d.minutosBrutos/60*100)/100,
      "Descanso o diferencia descontada (min)":d.minutosDescontados===null?null:Math.round(d.minutosDescontados*100)/100,
      "Total horas trabajadas (h)":d.horasNetas,"Total diario (h:mm)":d.minutosNetos===null?"NO CALCULABLE":duracionTexto(d.minutosNetos),
      "Estado del total":d.estado,"Criterio del total":d.criterio,
      "Tiempo nocturno despues del turno (h; no aprobado)":d.minutosDespuesNocturnos===null?null:Math.round(d.minutosDespuesNocturnos/60*100)/100,
      "Extra nocturna registrada por revisar (h)":n.registros?n.pendiente:null,"Extra nocturna aprobada (h)":n.registros?n.aprobada:null,
      Llegada:diferenciaLlegada(x),"Salida vs turno":diferenciaSalida(x),"Estado comparacion":x.estado_comparacion||""};
  });
  const sh=XLSX.utils.json_to_sheet(asistencia);
  sh["!cols"]=Object.keys(asistencia[0]||{}).map(k=>({wch:k.includes("Criterio")?75:k.includes("Empleado")?32:k.includes("Estado")?30:24}));
  if(asistencia.length)sh["!autofilter"]={ref:sh["!ref"]};
  XLSX.utils.book_append_sheet(wb,sh,"Jornadas y marcaciones");
  const detalle=rows.map(x=>({Area:area(x),Empleado:empleado(x),Cedula:x.cedula||"","Codigo PROSOF":codigoErp(x),Fecha:texto(x.fecha).slice(0,10),Turno:x.turno||"","Inicio programado":hora(x.hora_inicio),"Salida programada":hora(x.hora_fin),"Salida real":hora(x.ultima_marcacion),Concepto:concepto(x),"Horas calculadas":horasCalculadas(x),"Horas aprobadas":horasAprobadas(x),Estado:estado(x),Responsable:responsableDe(x),Observacion:x.observacion||""}));
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(detalle),"Conceptos para aprobación");
  const areas=[];for(const [a,x] of resumenAreas(rows))areas.push({Area:a,Responsable:[...x.r].join(", "),Pendientes:x.p,Observados:x.o,Aprobados:x.a,Estado:x.p+x.o?"PENDIENTE":"CERRADO"});
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(areas),"Estado por área");
  XLSX.utils.book_append_sheet(wb,hojaProsof(filasProsof(rows)),"Aprobados PROSOF");
  XLSX.utils.book_append_sheet(wb,hojaConceptos(),"conceptos");
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(coberturaPorArea(js,area)),"Cobertura de turnos");
  XLSX.writeFile(wb,`REVISION_NOMINA_COMPLETA_${$("heDesde").value}_${$("heHasta").value}.xlsx`);
}
