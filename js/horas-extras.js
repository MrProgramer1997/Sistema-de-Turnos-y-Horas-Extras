import { crearCorreccionesNomina722 } from './nomina-correcciones.js?v=722';
import { construirEvidenciasLocales721 } from './nomina-evidencia-local.js?v=721';
import { modeloParaNomina721 as modeloRevision, agregarCandidatosAyB721, usaRevisionAyB721, esAyB721 } from './nomina-ayb-candidatos.js?v=721';
import { exigirModulo } from "./permisos-modulos.js?v=720";
import { aplicarCruces719, agregarSugerencias719, usaRevision719, sumarDia719 } from './nomina-candidatos.js?v=719';
import { crearRevisionSugerida719 } from './nomina-revision-sugerida.js?v=721';
import { crearVisorComentariosNomina } from './nomina-comentarios.js?v=715';
import { completarDescansosNomina, horasMinutosNomina, alertaAlmuerzoConcepto } from './nomina-neto.js?v=714';
import { agruparAprobacionDiaria, pedirDecisionNomina, cerrarDialogosNomina, verDetalleDiario, hoyNomina, accionesConceptoDiario } from './nomina-aprobacion-diaria.js?v=722';
import { fechaDiaRevision, diaSemanaRevision, ordenCronologicoRevision } from './revision-punto.js?v=713';
import { esDomingoRevision, textoCalculoDomingo, incorporarDomingos, pedirValidacionDomingo, cerrarDomingoRevision } from './nomina-dominicales.js?v=713';
import { cargarDocumentados, fusionarEvidenciasDocumentales, resumenDocumento } from './horarios-documentados-api.js?v=711';
import { superponerDocumentados, columnasDocumentales } from './horarios-documentados-core.js?v=711';
import { areaConsulta, coincideAreaConsulta, domingosSinConcepto, prepararDomingoSeleccionado, controlExtraVigente } from './nomina-control-pendientes.js?v=713';
import { intervaloDiario, duracionMarcaciones, fechaHoraMarcacion, descansoReferencia, estadoMarcacion, coincideMarcacion, columnasIntervalo, hojaIntervalos, CRITERIO_INTERVALO } from './nomina-marcaciones.js?v=714';
import { construirCalendario, calendarioDia, diagnosticoHorario, diagnosticoHorarioHtml, fechaHtml, resumenCalidad, filaCalidadExcel, filaControlExcel, controlConceptoHtml, revisarConcepto } from "./nomina-calidad.js?v=713";
import { duracionRevision, nocturnoPosteriorRevision, calculadasCeldaRevision, comparacionCelda, programacionCelda, marcadoCelda, totalCelda, advertenciaNocturna, requiereRevisionNocturna, crearVisorRevision, columnasRevisionExcel } from "./revision-evidencia.js?v=721";
import { supabase } from "../supabase/supabaseClient.js";
import { asegurarSesion, rpcConSesion, consultaConSesion, esErrorAcceso, mostrarErrorAcceso, observarSesion, ErrorSesion } from "./nomina-sesion.js?v=717";
import { cargarFuentesNomina, leerPaginas, diasEntre, recalcularPorDias, prepararCortePorTramos, leerEvidenciasNomina, prepararOConsultarGuardado } from "./nomina-carga.js?v=721";
import { resumenTrabajoDia, duracionTexto, instanteLocal, explicarTurno, resumenConceptosNocturnos, coberturaPorArea } from "./nomina-detalle-jornada.js?v=7-1";
let heCargando=false,heCargaId=0,heAbort=null,heDisponible=false;
let heGuardando=false,heRecalculando=false,heLecturaValida=false,heRango=null,heErrorSesion=null;
let heMarcasFuente=[],heEmpleadosDetalle=[];
let heEvidencias=new Map();
let heCalendario=null;
let heDocumentados=null;
let heTiempoTimer=null,heInicioTiempo=0,heCanceladaPorUsuario=false;


const CONCEPTOS=[["P003","EXTRA DIURNA"],["P004","EXTRA NOCTURNA"],["P005","RECARGO NOCTURNO"],["P006","DOMINICAL COMPENSADO"],["P007","FESTIVO"],["P008","EXTRA FESTIVA DIURNA"],["P009","EXTRA FESTIVA NOCTURNA"],["P100","RECARGO NOCTURNO DOMINICAL O FESTIVO"]];
const HEADERS=["Empleado","Concepto","Fecha","Dias","FechaInici","Horas","Valor","LiquidarEnPrima","Centro de costos"];
let sesion=null,base=[],jornadas=[],catalogo=[],responsables=[],vista="diaria",pagina=0;
const TAMANO_PAGINA=350;
const TAMANO_DIARIA=100;
const $=id=>document.getElementById(id),texto=v=>String(v??"").trim(),num=v=>Number(v||0);
const html=v=>texto(v).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
const fechaCorta=v=>{if(!v)return "-";const s=texto(v).slice(0,10).split("-");return s.length===3?`${s[2]}/${s[1]}/${s[0]}`:texto(v)};
const hora=v=>texto(v).match(/(?:T|\s)(\d{2}:\d{2})/)?.[1]||texto(v).slice(0,5)||"-";
const estado=v=>texto((v&&typeof v==="object")?(v.estado_revision??v.estado??"pendiente"):(v||"pendiente")).toLowerCase();
const area=v=>texto(v.area_consulta||v.proceso_nombre||v.area||v.grupo_nombre||v.proceso_codigo||v.grupo_codigo||"SIN ÁREA");
const empleado=v=>texto(v.empleado||v.nombre_completo||`${v.nombres||""} ${v.apellidos||""}`);
const codigoErp=v=>texto(v.codigo_erp||v.Empleado||v.codigo_empleado||v.codigo||"");
const concepto=v=>texto(v.concepto_codigo||v.Concepto||"");
const horasCalculadas=v=>num(v.horas_calculadas??v.horas_candidatas??v.Horas);
const horasAprobadas=v=>v.horas_aprobadas==null?null:num(v.horas_aprobadas);

document.addEventListener("DOMContentLoaded",iniciar);
async function iniciar(){
  sesion=await exigirModulo("horas-extras");
  if(!sesion)return;
  $("heUsuario").textContent=sesion.nombre_completo||sesion.usuario||"Usuario";$("heRol").textContent=sesion.rol||"-";
  const hoy=new Date(),inicioBiometricos=new Date(2026,7,23);$("heDesde").value=iso(inicioBiometricos);$("heHasta").value=iso(hoy);
  $("heActualizar").addEventListener("click",cargar);
  $("heOpcionesTecnicas").addEventListener("toggle",()=>{
    if($("heOpcionesTecnicas").open&&heDisponible){mostrarEstadoDocumental();render();}
  });
  $("heCancelarCarga").addEventListener("click",()=>{if(heCargando){heCanceladaPorUsuario=true;heAbort?.abort();$("heCancelarCarga").disabled=true;}});
  $("heRecalcular").addEventListener("click",recalcularCandidatos);
  ["heDesde","heHasta"].forEach(id=>$(id).addEventListener("change",()=>{
    heLecturaValida=false;actualizarAcciones();
    avisoCarga("Fechas modificadas. Pulsa Actualizar para consultar el nuevo periodo.","warning");
    if(heDisponible)render();
  }));["heArea","heEstado","heTurnoEstado","heDiaCalendario","heEstadoMarcacion"].forEach(id=>$(id).addEventListener("change",()=>{pagina=0;render()}));$("heBuscar").addEventListener("input",()=>{pagina=0;render()});
  document.querySelectorAll("[data-he-vista]").forEach(b=>b.addEventListener("click",()=>cambiarVista(b.dataset.heVista)));
  $("heAnterior").addEventListener("click",()=>{if(pagina>0){pagina--;render()}});$("heSiguiente").addEventListener("click",()=>{pagina++;render()});
  $("heXlsx").addEventListener("click",descargarRevision);$("heExportarIncidencias").addEventListener("click",descargarIncidencias);$("heXls").addEventListener("click",descargarProsof);
  $("heConfigResponsables").addEventListener("click",()=>bootstrap.Modal.getOrCreateInstance($("heModalResponsables")).show());
  observarSesion(()=>{
    heCargaId++;heAbort?.abort();clearInterval(heTiempoTimer);heTiempoTimer=null;$("heTiempoCarga").textContent="Sesion finalizada";$("heDetalleCargaBody").replaceChildren();heCargando=false;heRecalculando=false;heGuardando=false;actualizarAcciones();
    limpiarNominaPorSesion();actualizarAcciones();avisoCarga("La sesion segura termino. Inicia sesion nuevamente.","warning");
    mostrarErrorAcceso($('heIntegridad'),new ErrorSesion('AUTH_REQUIRED','Tu sesion cambio o termino. Vuelve a ingresar para consultar Nomina.'),cargar);
  });
  await cargar();
}
function iso(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`}
function datosUtilizables(){return heDisponible&&heLecturaValida&&!heCargando&&!heGuardando&&!heRecalculando&&heRango?.desde===$("heDesde").value&&heRango?.hasta===$("heHasta").value;}
function actualizarAcciones(){
  const ocupado=heCargando||heGuardando||heRecalculando;
  $("heActualizar").disabled=ocupado;$("heRecalcular").disabled=ocupado||!datosUtilizables();
  $("heCancelarCarga").hidden=!heCargando;$("heCancelarCarga").disabled=!heCargando||heAbort?.signal.aborted;
  $("heDesde").disabled=ocupado;$("heHasta").disabled=ocupado;
  $("heXlsx").disabled=!datosUtilizables();$("heExportarIncidencias").disabled=!datosUtilizables();$("heXls").disabled=!datosUtilizables();
  $("heBody").querySelectorAll("button[data-action]").forEach(b=>b.disabled=!datosUtilizables());
  $("heDomingosBody")?.querySelectorAll("[data-preparar-domingo]").forEach(b=>b.disabled=!datosUtilizables());
  actualizarAccionesDiarias();
}
function avisoCarga(mensaje,tipo="info"){
  $("heEstadoCarga").className=`alert alert-${tipo} py-2 small`;
  $("heEstadoCarga").textContent=mensaje;
  const resumen=$("heEstadoResumen");
  if(resumen){
    resumen.className=`nd-estado ${tipo}`;
    resumen.textContent=tipo==='danger'?(heErrorSesion?'La sesion segura no esta disponible. Inicia sesion nuevamente.':heGuardando?'No se confirmo la decision. Actualiza antes de reintentar.':'No se pudo completar el corte. Pulsa Actualizar.'):tipo==='warning'?
      (heErrorSesion?'La sesion segura no esta disponible. Inicia sesion nuevamente.':heLecturaValida?'Consulta lista con avisos. Ver auditoria.':heDisponible?'Consulta de solo lectura. Pulsa Actualizar antes de decidir.':'No se completo la consulta. Pulsa Actualizar.'):
      tipo==='success'?(/^(Decision|Decisión|Aprobacion|Aprobación|Comentario|Candidato actualizado)/.test(mensaje)?mensaje:heRango?`Periodo consultado: ${fechaCorta(heRango.desde)} al ${fechaCorta(heRango.hasta)}.`:'Operacion confirmada.'):
      (heGuardando?'Guardando la decisión...':'Cargando el corte...');
    resumen.title=mensaje;
  }
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
  heErrorSesion=true;
  cerrarDialogosNomina();
  visorSugerencias719.cerrar();
  visorCorrecciones722.cerrar();
  visorComentariosNomina.cerrar();
  cerrarDomingoRevision();
  document.querySelectorAll('.rev-dialog').forEach(d=>{d.close();d.querySelector('[data-body]')?.replaceChildren();});
  if($("heDomingosPendientes"))$("heDomingosPendientes").hidden=true; if($("heDomingosBody"))$("heDomingosBody").replaceChildren();
  heDiariasVisibles.clear();heConceptosElegidos.clear();
  heDocumentados=null;if($("heDocumentalEstado"))$("heDocumentalEstado").textContent="Inicia sesion para consultar las plantillas.";heCalendario=null; if($("heCalidadContenido"))$("heCalidadContenido").textContent="Inicia sesion para consultar el diagnostico.";
  heDisponible=false;heLecturaValida=false;heRango=null;heMarcasFuente=[];heEmpleadosDetalle=[];heEvidencias.clear();base=[];jornadas=[];catalogo=[];responsables=[];
  $('heAreasBody').replaceChildren();$('hePaginaInfo').textContent='';
  document.querySelectorAll('[id^="heKpi"]').forEach(el=>el.textContent='\u2014');
  $('heBody').innerHTML='<tr><td colspan="12" class="text-center py-4">La sesion segura no esta disponible. <a href="login.html?sesion=verificada&amp;volver=horas-extras.html">Iniciar sesion nuevamente</a></td></tr>';
  $('heResponsablesBody').textContent='Se requiere una sesion verificada.';
  for(const id of ['heXlsx','heXls','heAnterior','heSiguiente','heExportarIncidencias'])$(id).disabled=true;
}
async function cargar({soloConsulta=false,advertencia=""}={}){
  if(heCargando||heGuardando||heRecalculando)return;
  visorSugerencias719.cerrar();
  visorCorrecciones722.cerrar();
  heCargando=true;heLecturaValida=false;const cargaId=++heCargaId;heAbort=new AbortController();
  const signal=heAbort.signal;iniciarTiempoCarga();actualizarAcciones();
  if(!heDisponible){
    document.querySelectorAll('[id^="heKpi"]').forEach(el=>el.textContent="\u2014");
    $("heBody").innerHTML='<tr><td colspan="12" class="text-center text-muted py-4">Cargando el corte...</td></tr>';
  }
  avisoCarga("Verificando sesion e iniciando lectura. No se recalculan conceptos al abrir.");
  try{
    await asegurarSesion();heErrorSesion=null;
    const desde=$("heDesde").value,hasta=$("heHasta").value;diasEntre(desde,hasta);
    // Consultation no longer performs any writes or waits for all-cut preparation.
    // Missing special days remain visible and retain their on-demand preparation.
    const preparacion={completa:!soloConsulta,cobertura:{insertados:0,actualizados:0},aviso:advertencia||'Consulta guardada despues de un recalculo incompleto.'};
    const coberturaDomingos=preparacion.cobertura;
    const r=await cargarFuentesNomina({request:lecturaRpc,readReviews:leerRevisiones,desde,hasta,signal,
      onProgress:p=>{if(cargaId===heCargaId)progresoCarga(p);},
      extras:[
        {key:'extra_cruces',label:'Extremos del corte',run:async(request,signal)=>{
          const rows=[];const horarios=[];
          for(const d of [sumarDia719(desde,-1),sumarDia719(hasta,1)]){
            const r=await request('consultar_fuente_nomina_v721',{p_fuente:'marcas',p_desde:d,p_hasta:d},{signal});
            if(r.error)throw r.error;
            if(!r.data?.completa||r.data.desde!==d||r.data.hasta!==d||r.data.total!==r.data.filas?.length)throw new Error('No se completo el contexto del extremo del corte.');
            rows.push(...r.data.filas);
            const p=await request('consultar_fuente_nomina_v721',{p_fuente:'ayb',p_desde:d,p_hasta:d},{signal});
            if(p.error)throw p.error;
            if(!p.data?.completa||p.data.desde!==d||p.data.hasta!==d||p.data.total!==p.data.filas?.length)throw new Error('No se completo el horario del extremo del corte.');
            horarios.push(...p.data.filas);
          }
          return {marcas:rows,horarios};
        }},
        {key:'extra_calendario',label:'Calendario',run:async(request,signal)=>{
          // Include the civil date of an overnight exit at the end of the cut.
          const finCalendario=sumarDia719(hasta,1);
          const r=await request('consultar_calendario_nomina_v78',{p_desde:desde,p_hasta:finCalendario},{signal});
          if(r.error)throw r.error;
          if(r.data?.desde!==desde||r.data?.hasta!==finCalendario)throw new Error('El calendario no corresponde al corte.');
          return construirCalendario(r.data);
        }},
        {key:'extra_documentos',label:'Horarios documentados',run:(request,signal)=>cargarDocumentados(request,{desde,hasta,signal})}
      ]});
    if(cargaId!==heCargaId)return;
    const nuevoCalendario=r.extra_calendario[0];
    const nuevoCatalogo=desenvolverEmpleados(r.empleados);
    const marcasFuente=desenvolver(r.marcas);
    if(new Set(marcasFuente.map(claveDia)).size!==marcasFuente.length)throw new Error("La fuente de marcaciones contiene jornadas repetidas. No se habilita Nomina.");
    const jornadasPrevias=completarUniversoEmpleados(combinarJornadas(r.general,r.ayb,r.inferidos,r.marcas),nuevoCatalogo,desde,hasta);
    const nuevaDocumentacion=r.extra_documentos[0];
    const conDocumentacion=nuevaDocumentacion.disponible?superponerDocumentados(jornadasPrevias,nuevaDocumentacion.resuelto):jornadasPrevias;
    const jornadasCrudas=completarDescansosNomina(conDocumentacion,nuevaDocumentacion.paquete);
    verificarIntegridadMarcaciones(marcasFuente,jornadasCrudas);
    const extremos=r.extra_cruces[0]||{marcas:[],horarios:[]};
    const evidenciasLocales=construirEvidenciasLocales721(jornadasCrudas,[...marcasFuente,...extremos.marcas],
      [...desenvolver(r.general),...desenvolver(r.ayb),...extremos.horarios]);
    const nuevasJornadas=aplicarCruces719(jornadasCrudas.map(x=>({...x,evidencia_revision:evidenciasLocales.get(claveDia(x))})),[...marcasFuente,...extremos.marcas]);
    const conocidos=[...nuevoCatalogo,...marcasFuente.filter(e=>!nuevoCatalogo.some(c=>texto(c.cedula)===texto(e.cedula)))];
    const detalleEmpleados=await completarDatosEmpleados(r.revisiones,conocidos,signal);
    const nuevasEvidencias=new Map(nuevasJornadas.map(j=>[claveDia(j),j.evidencia_revision]));
    const baseGeneral=agregarSugerencias719(completarBandeja(r.revisiones,detalleEmpleados,marcasFuente,nuevasJornadas,nuevasEvidencias),nuevasJornadas.filter(j=>!esAyB721(j)),nuevoCalendario);
    const nuevaBase=agregarCandidatosAyB721(baseGeneral,nuevasJornadas,nuevoCalendario);
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
    // Raw integrity was checked before midnight association; original events remain unchanged.
    // Commit only after every mandatory read and the integrity check succeed.
    catalogo=nuevoCatalogo;jornadas=nuevasJornadas.map(x=>({...x,evidencia_revision:nuevasEvidencias.get(claveDia(x))||x.evidencia_revision}));base=nuevaBase.sort(ordenCronologicoRevision);responsables=nuevosResponsables;
    heMarcasFuente=marcasFuente;heEmpleadosDetalle=detalleEmpleados;heEvidencias=nuevasEvidencias;
    heCalendario=nuevoCalendario;heDocumentados=nuevaDocumentacion;
    if($("heOpcionesTecnicas").open)mostrarEstadoDocumental();
    heRango={desde,hasta};pagina=0;heDisponible=true;heLecturaValida=preparacion.completa;
    poblarAreas();render();
    if(preparacion.completa){
      avisoCarga(`Lectura completa del ${fechaCorta(desde)} al ${fechaCorta(hasta)}. Lectura sin recalculos automaticos. Conceptos guardados y sugerencias independientes disponibles para revisar.${avisoResponsables}${!nuevaDocumentacion.disponible?" "+nuevaDocumentacion.motivo:" Horarios documentales consultados; la deteccion semanal no aprueba pagos."}`,avisoResponsables||!nuevaDocumentacion.disponible?"warning":"success");
    }else{
      avisoCarga(`${preparacion.aviso} ${preparacion.error?detalleError(preparacion.error):advertencia} No se repite el envio. Pulsa Actualizar para verificar el corte.`,"warning");
      $("heIntegridad").textContent='Marcaciones recibidas y verificadas. Preparacion de conceptos no confirmada: consulta solamente; decisiones y exportaciones deshabilitadas.';
    }
  }catch(e){
    if(cargaId!==heCargaId)return;
    heAbort.abort();heLecturaValida=false;console.error("Carga Nomina:",detalleError(e));
    if(heCanceladaPorUsuario)e=new Error("Consulta cancelada. La incorporacion de pendientes pudo terminar en el servidor; no se aprobaron pagos. Actualiza antes de repetir.");
    if(esErrorAcceso(e)){
      limpiarNominaPorSesion();
      mostrarErrorAcceso($("heIntegridad"),e,cargar);
    }else{
      $("heIntegridad").className="alert alert-warning py-2 small";
      $("heIntegridad").textContent=heDisponible
        ?`Actualizacion no completada. La tabla conserva la ultima lectura completa (${fechaCorta(heRango.desde)} - ${fechaCorta(heRango.hasta)}), sin permitir decisiones ni exportacion.`
        :"Lectura no completada. No hay datos verificados para decidir o exportar.";
      if(!heDisponible)$("heBody").innerHTML=`<tr><td colspan="12" class="text-center text-danger py-4">No se pudo completar la carga. Los detalles quedan en auditoría.</td></tr>`;
    }
    avisoCarga(`No se completo la lectura: ${detalleError(e)}`,heCanceladaPorUsuario?"warning":"danger");
  }finally{
    if(cargaId===heCargaId){terminarTiempoCarga();heCargando=false;actualizarAcciones();if(heDisponible)render();actualizarAcciones();}
  }
}
async function recalcularCandidatos(){
  if(!datosUtilizables())return;
  const desde=$("heDesde").value,hasta=$("heHasta").value;
  try{diasEntre(desde,hasta);}catch(e){avisoCarga(e.message,"warning");return;}
  if(!confirm(`Recalcular candidatos del ${fechaCorta(desde)} al ${fechaCorta(hasta)}? Se ejecutan las reglas existentes por bloques del corte, sin aprobar pagos. Esto puede tardar mas que consultar.`))return;
  const id=++heCargaId;heAbort=new AbortController();heRecalculando=true;heLecturaValida=false;actualizarAcciones();
  let completado=false,fallo=null;
  try{
    await asegurarSesion();
    await recalcularPorDias(rpcConSesion,{desde,hasta,signal:heAbort.signal,onProgress:p=>{
      if(id===heCargaId)avisoCarga(`Recalculando ${p.etapa}: ${fechaCorta(p.desde)} - ${fechaCorta(p.hasta)} | ${p.completadas}/${p.total} operaciones completas. No se aprueban pagos automaticamente.`);
    }});
    if(id!==heCargaId)return;
    // Preparation is explicit, not repeated on every load or approval.
    await prepararCortePorTramos((a,b,opts)=>incorporarDomingos(rpcConSesion,a,b,opts),desde,hasta,{signal:heAbort.signal});
    if(id!==heCargaId)return;
    completado=true;
  }catch(e){
    if(id!==heCargaId)return;
    fallo=e;
    avisoCarga(`Recalculo detenido. ${e.operacionesCompletadas||0} operaciones anteriores completadas; no se repite el envio fallido. ${detalleError(e)} Pulsa Actualizar para consultar lo guardado.`,"warning");
    if(esErrorAcceso(e)){limpiarNominaPorSesion();mostrarErrorAcceso($("heIntegridad"),e,cargar);}
  }finally{
    if(id===heCargaId){heRecalculando=false;actualizarAcciones();}
  }
  if(id!==heCargaId)return;
  if(completado)await cargar();
  else if(fallo&&!esErrorAcceso(fallo))await cargar({soloConsulta:true,
    advertencia:`Recalculo no completado; ${fallo.operacionesCompletadas||0} operaciones previas confirmadas. ${detalleError(fallo)}`});
}

function mostrarEstadoDocumental(){
  if(!$("heOpcionesTecnicas").open)return;
  const box=$("heDocumentalEstado");if(!box)return;
  if(!heDocumentados?.disponible){box.textContent=heDocumentados?.motivo||"Servicio documental pendiente de verificar.";return;}
  const d=heDocumentados.resuelto,z=resumenDocumento(d);
  const semanas=d.semanas.filter(s=>s.tipo==='rotativa');
  box.innerHTML=`<p>Vigencia desde <strong>23/08/2026</strong>. Breaks de 15 minutos incluidos en la jornada. Esta lectura no modifica marcaciones, asignaciones ni decisiones guardadas.</p><p>${z.documentadas} jornadas documentadas; ${z.inferidas} detectadas por semana; ${z.guardadas} guardadas o con novedad; ${z.pendientes} pendientes; ${z.conflictos} conflictos.</p><div class="hd-scroll"><table class="table table-sm"><thead><tr><th>Persona</th><th>Semana</th><th>Plantilla</th><th>Evidencia</th><th>Resultado</th></tr></thead><tbody>${semanas.map(s=>`<tr><td>${html(s.nombre)}</td><td>${html(s.semana)}</td><td>${html(s.elegida||"Por confirmar")}</td><td>${s.dias_evidencia} dias completos</td><td>${html(s.motivo)}</td></tr>`).join('')}</tbody></table></div>${d.pendientes_vinculo.length?`<p class="hd-warning">${d.pendientes_vinculo.length} cedulas documentales necesitan comprobar su vinculo. No se crearon personas ni se emparejaron por parecido de nombre.</p>`:''}`;
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
  const clavesProgramadas = new Set(programadasConMarcas.map(claveDia));
  const sueltas=[...marcasPorDia.values()].filter(x=>!clavesProgramadas.has(claveDia(x))).map(x=>compararConMarcaciones({...x,
    turno:"",turno_2:"",hora_inicio:"",hora_fin:"",hora_inicio_2:"",hora_fin_2:"",
    programacion_tipo:"Sin programaci\u00f3n",estado_comparacion:"sin_programacion",
    diagnostico_turno:"No hay horario asignado para esta fecha. No se copia el turno de otro dia."
  }));
  return [...programadasConMarcas,...sueltas].sort((a,b)=>texto(b.fecha).localeCompare(texto(a.fecha))||empleado(a).localeCompare(empleado(b),"es"));
}
function fechasRango(desde,hasta){const r=[],d=new Date(`${desde}T12:00:00`),f=new Date(`${hasta}T12:00:00`);while(d<=f){r.push(iso(d));d.setDate(d.getDate()+1)}return r}
function completarUniversoEmpleados(encontradas,empleados,desde,hasta){
  const porDia=new Map();for(const x of encontradas){const k=claveDia(x);if(!porDia.has(k)||x.programacion_tipo==="confirmada")porDia.set(k,x)}
  const fechas=fechasRango(desde,hasta),todo=[];
  for(const e of empleados)for(const fecha of fechas){const x=porDia.get(`${texto(e.cedula)}|${fecha}`);todo.push(x?{...e,...x,codigo_erp:codigoErp(x)||codigoErp(e),empleado:empleado(x)||empleado(e)}:{...e,fecha,turno:"",hora_inicio:"",hora_fin:"",total_marcaciones:0,primera_marcacion:null,ultima_marcacion:null,recorrido:[],programacion_tipo:"Sin programación",estado_comparacion:"sin_programacion_sin_marcaciones",origen:"catalogo"})}
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

async function leerEvidenciasRevision(revisiones,signal){
  return leerEvidenciasNomina(lecturaRpc,revisiones,{signal,chunkSize:80});
}
function completarBandeja(revisiones,empleados,marcas,actuales=jornadas,evidencias=heEvidencias){
  const porCedula=new Map(empleados.map(x=>[texto(x.cedula),x]));
  const porDia=new Map(marcas.map(m=>[claveDia(m),m]));
  const porJornada=new Map(actuales.map(m=>[claveDia(m),m]));
  return revisiones.map(r=>{
    const d=r.detalle||{},e=porCedula.get(texto(r.cedula))||{},m=porDia.get(claveDia(r)),j=porJornada.get(claveDia(r));
    const p=j&&j.programacion_tipo==='confirmada'?j:d;
    return {...r,
      empleado:empleado(e)||r.cedula,cargo:e.cargo||'',centro_costos:e.centro_costos||'',area:e.area||'',
      area_consulta:areaConsulta(r,j,e),
      grupo_nombre:r.grupo_codigo==='ALIMENTOS_BEBIDAS'?'Alimentos y Bebidas':r.grupo_codigo,
      turno:p.turno||'',turno_2:p.turno_2||'',hora_inicio:p.hora_inicio||'',hora_fin:p.hora_fin||'',hora_inicio_2:p.hora_inicio_2||'',hora_fin_2:p.hora_fin_2||'',
      horas_programadas_netas:p.horas_programadas_netas??p.horas_programadas,
      horas_reales:undefined,horas_candidatas:r.horas_calculadas,minutos_descanso:j?.minutos_descanso,
      primera_marcacion:m?.primera_marcacion||null,ultima_marcacion:num(m?.total_marcaciones)>1?m?.ultima_marcacion:null,total_marcaciones:num(m?.total_marcaciones),recorrido:m?.recorrido||[],
      programacion_tipo:j?.programacion_tipo||'Sin programacion',jornada_actual:j,evidencia_revision:evidencias.get(claveDia(r)),
      revision_id:r.id,estado_revision:r.estado,permite_revision:!['aprobado','rechazado'].includes(estado(r.estado))
    };
  });
}
const mostrarRevisionEvidencia=crearVisorRevision({
  totalEntreMarcas:true,confirmacionExplicita:false,
  canWrite:()=>datosUtilizables(),
  onBusy:valor=>{heGuardando=valor;actualizarAcciones();},
  onError:e=>{heLecturaValida=false;if(esErrorAcceso(e))limpiarNominaPorSesion();avisoCarga(`No se confirmo la decision: ${e.message||e}. Actualiza antes de reintentar.`,"danger");},
  rpc:(name,args)=>rpcConSesion(name,args,{read:!['actualizar_recargo_nocturno_v77','aprobar_recargo_nocturno_v713'].includes(name)}),
  onChanged:(fila,e)=>{heEvidencias.set(claveDia(fila),e);const nueva=completarBandeja([fila],heEmpleadosDetalle,heMarcasFuente)[0];base=base.map(r=>r.revision_id===fila.id?nueva:r);render();avisoCarga(fila.estado==='aprobado'?'Aprobación confirmada con evidencia y auditoría.':'Candidato actualizado con evidencia; no se aprobó ningún pago.','success');}
});
window.heVerRevision=(id,nocturno=false)=>{if(!datosUtilizables())return;const fila=base.find(r=>r.revision_id===id);if((usaRevision719(fila)||usaRevisionAyB721(fila))&&nocturno){visorSugerencias719.mostrar(fila,'aprobar');return;}if(usaRevision719(fila)||usaRevisionAyB721(fila)){verDetalleDiario(fila.jornada_actual||fila,modeloRevision(fila));return;}if(fila)mostrarRevisionEvidencia(fila,{nocturno});};

const visorSugerencias719=crearRevisionSugerida719({
  rpc:(name,args,opts)=>rpcConSesion(name,args,opts),canWrite:()=>datosUtilizables(),
  onBusy:valor=>{heGuardando=valor;actualizarAcciones();},
  onError:e=>{heLecturaValida=false;if(esErrorAcceso(e))limpiarNominaPorSesion();avisoCarga('No se confirmo la decision. Actualiza antes de reintentar. '+(e.message||e),'warning');},
  onSaved:(fila,anterior,accion)=>{
    const actual=completarBandeja([fila],heEmpleadosDetalle,heMarcasFuente)[0];
    base=base.filter(x=>x.revision_id!==anterior.revision_id&&x.revision_id!==fila.id);
    base.push(actual);heConceptosElegidos.set(claveDia(fila),fila.id);base.sort(ordenCronologicoRevision);render();
    avisoCarga(accion==='comentar'?'Comentario guardado sin aprobar horas.':'Decision confirmada para el concepto seleccionado.','success');
  }
});

const visorCorrecciones722=crearCorreccionesNomina722({
  rpc:(name,args,opts)=>rpcConSesion(name,args,opts),canWrite:()=>datosUtilizables(),
  onBusy:valor=>{heGuardando=valor;actualizarAcciones();},
  onError:e=>{heLecturaValida=false;if(esErrorAcceso(e))limpiarNominaPorSesion();avisoCarga('No se confirmo la correccion. Actualiza antes de reintentar. '+(e.message||e),'warning');},
  onSaved:(fila,anterior,accion)=>{
    const actual=completarBandeja([fila],heEmpleadosDetalle,heMarcasFuente)[0];
    base=base.map(x=>texto(x.revision_id)===texto(fila.id)?actual:x);
    heConceptosElegidos.set(claveDia(fila),fila.id);render();
    avisoCarga(accion==='recalcular'?'Concepto recalculado y pendiente de nueva aprobacion.':accion==='rechazar'?'Decision corregida: concepto rechazado.':'Decision corregida: horas aprobadas actualizadas.','success');
  }
});

// Notes have their own audited storage: no UPDATE of the decision or its hours.
const visorComentariosNomina=crearVisorComentariosNomina({
  canWrite:()=>datosUtilizables(),
  rpc:(name,args)=>rpcConSesion(name,args,{read:name==='consultar_comentarios_nomina_v715'}),
  onBusy:valor=>{heGuardando=valor;actualizarAcciones();},
  onSaved:()=>avisoCarga('Comentario guardado. Las horas y la decision no cambiaron.','success'),
  onError:e=>{if(esErrorAcceso(e)){limpiarNominaPorSesion();mostrarErrorAcceso($('heIntegridad'),e,cargar);}}
});
async function comentarConcepto(id){
  if(!datosUtilizables())return;
  const x=base.find(r=>texto(r.revision_id)===texto(id));
  if(x?.sugerencia_719||x?.sugerencia_721){await visorSugerencias719.mostrar(x,'comentar');return;}
  if(x)await visorComentariosNomina.mostrar(x);
}

function poblarAreas(){const actual=$("heArea").value;const areas=[...new Set([...base,...jornadas].map(area))].sort((a,b)=>a.localeCompare(b,"es"));$("heArea").innerHTML='<option value="">Todas</option>'+areas.map(x=>`<option ${x===actual?"selected":""}>${html(x)}</option>`).join("")}
// Fase temporal confirmada: todos los usuarios administrativos autorizados
// pueden revisar el consolidado completo, independientemente de su área base.
function dentroAlcance(){return true}
function coincideDia(x){const d=$("heDiaCalendario")?.value||"";const c=calendarioDia(texto(x.fecha).slice(0,10),heCalendario);return !d||c.tipo===d;}
function filtrados({ignorarEstado=false}={}){const a=$("heArea").value,e=ignorarEstado?"":$("heEstado").value,b=texto($("heBuscar").value).toLowerCase();return base.filter(x=>coincideDia(x)&&dentroAlcance(x)&&coincideAreaConsulta(x,a)&&(!e||estado(x)===e)&&(!b||`${empleado(x)} ${x.cedula||""} ${codigoErp(x)} ${concepto(x)}`.toLowerCase().includes(b))).sort(ordenCronologicoRevision)}
function esNocturnoObservado(x){
  if(num(x.total_marcaciones)<2||!x.ultima_marcacion)return false;
  const salida=minutosHora(x.ultima_marcacion);
  return salida!==null&&salida>=19*60;
}
function etiquetaNocturno(x){
  return esNocturnoObservado(x)?'<span class="he-nocturno">◐ Revisar nocturno</span>':'<span class="text-muted small">-</span>';
}
function jornadasFiltradas({ignorarEstadoMarcacion=false,ignorarTurno=vista!=="jornadas"}={}){const a=$("heArea").value,t=ignorarTurno?"":$("heTurnoEstado").value,n=$("heNocturno")?.value||"",b=texto($("heBuscar").value).toLowerCase();return jornadas.filter(x=>(ignorarEstadoMarcacion||coincideMarcacion(x,$("heEstadoMarcacion").value))&&coincideDia(x)&&coincideAreaConsulta(x,a)&&(!t||tipoTurno(x)===t)&&(!n||(n==="si"?esNocturnoObservado(x):!esNocturnoObservado(x)))&&(!b||`${empleado(x)} ${x.cedula||""} ${codigoErp(x)} ${x.turno||""}`.toLowerCase().includes(b))).sort(ordenCronologicoRevision)}
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
  return ({confirmada:"Confirmado",inferida_alta:"Sugerido · alta",inferida_media:"Sugerido · media",inferida_ambigua:"Turno por confirmar",sin_programacion:"Sin programación"})[t]||"Sin programación";
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
function cambiarVista(nueva){
  if(!['jornadas','conceptos','diaria'].includes(nueva))return;
  vista=nueva;pagina=0;
  $("heMarcacionHerramientas").hidden=vista!=="jornadas";
  document.querySelectorAll("[data-he-vista]").forEach(b=>{
    const activa=b.dataset.heVista===vista;
    b.classList.toggle("active",activa);b.classList.toggle("btn-primary",activa);b.classList.toggle("btn-outline-primary",!activa);
    b.setAttribute('aria-pressed',String(activa));
  });
  $("heEstadoWrap").classList.toggle("d-none",vista==="jornadas");
  $("heTurnoWrap").classList.toggle("d-none",vista!=="jornadas");render();
}
function jornadaConEvidencia(x){const e=heEvidencias.get(claveDia(x));return e?{...x,evidencia_revision:e}:x;}
function renderCalidad(rows){
  const cont=$("heCalidadContenido");if(!cont)return;
  const grupos=resumenCalidad(rows,area),total=grupos.reduce((a,b)=>a+b.jornadas,0),cal=heCalendario;
  const fs=cal?[...cal.festivos].filter(([d])=>d>=heRango.desde&&d<=heRango.hasta):[];
  const calendario=cal?(fs.length?"Festivos registrados: "+fs.map(([d,n])=>fechaCorta(d)+" - "+n).join("; "):"El calendario activo no registra festivos en este periodo. Los domingos se identifican por separado."):"Calendario pendiente de verificar.";
  const headers=['Area','Personas','Dias con marcas','Guardados','Sugerencia alta','Sugerencia media','Por confirmar','Sin horario','Una marca'];
  cont.innerHTML=`<p>${html(calendario)}</p><p>${total} jornadas con marcaciones en los filtros actuales. No se cuentan como faltantes los empleados/dias sin marcas. Guardado no significa trabajado ni aprobado. Las sugerencias no reemplazan la programacion oficial.</p><div class="nc-tabla"><table><thead><tr>${headers.map(h=>`<th scope="col">${html(h)}</th>`).join('')}</tr></thead><tbody>${grupos.map(g=>`<tr>${[g.area,g.personas,g.jornadas,g.guardados,g.alta,g.media,g.porConfirmar,g.sinHorario,g.unaMarca].map(v=>`<td>${html(v)}</td>`).join('')}</tr>`).join('')||'<tr><td colspan="9">Sin marcaciones para estos filtros.</td></tr>'}</tbody></table></div><p class="mb-0 mt-2">El Excel de revision incluye el origen del horario, alternativas y controles de cada concepto. Un festivo sin plantilla especifica requiere programacion o validacion, no se asume como un dia laboral ordinario.</p>`;
}
function filasDiarias(){
  return agruparAprobacionDiaria(jornadasFiltradas({ignorarEstadoMarcacion:true,ignorarTurno:true}),
    filtrados({ignorarEstado:true}),{estado:$("heEstado").value,calendario:heCalendario});
}
function render(){
  if(!heDisponible)return;
  const conceptos=filtrados(),jfs=jornadasFiltradas({ignorarEstadoMarcacion:vista!=="jornadas"});
  const rows=vista==="diaria"?filasDiarias():vista==="jornadas"?jfs:conceptos;
  if($("heOpcionesTecnicas").open){renderAreas(conceptos);renderCalidad(jfs);}
  renderDomingosPendientes();
  $("heHead").closest('table').classList.toggle('nd-table',vista==='diaria');
  if(vista==='diaria')renderDiaria(rows);else if(vista==='jornadas')renderJornadas(rows);else renderTabla(rows);
  actualizarAcciones();
}
function resumenAreas(rows){const map=new Map();for(const x of rows){const a=area(x),o=map.get(a)||{p:0,o:0,a:0,r:new Set()};const e=estado(x);if(e==="pendiente")o.p++;if(e==="observado")o.o++;if(e==="aprobado")o.a++;o.r.add(responsableDe(x));map.set(a,o)}return map}
function renderAreas(rows){const map=resumenAreas(rows);$("heKpiAreas").textContent=[...map.values()].filter(x=>x.p+x.o>0).length;$("heAreasBody").innerHTML=[...map].sort().map(([a,x])=>`<tr class="he-area-row ${x.p+x.o===0?"cerrada":""}"><td><strong>${html(a)}</strong></td><td>${html([...x.r].join(", "))}</td><td>${x.p}</td><td>${x.o}</td><td>${x.a}</td><td>${x.p+x.o?badge("pendiente"):badge("aprobado")}</td></tr>`).join("")||'<tr><td colspan="6" class="text-center text-muted">Sin datos.</td></tr>'}
function renderDomingosPendientes(){
  const panel=$('heDomingosPendientes');
  if(!panel)return;
  panel.hidden=vista!=='conceptos'||!heDisponible;
  if(panel.hidden)return;
  const selectedArea=$('heArea').value,busqueda=texto($('heBuscar').value).toLowerCase();
  const universo=jornadas.filter(x=>coincideDia(x)&&coincideAreaConsulta(x,selectedArea)&&(!busqueda||`${empleado(x)} ${x.cedula||''} ${codigoErp(x)}`.toLowerCase().includes(busqueda)));
  const faltantes=domingosSinConcepto(universo,base,{calendario:heCalendario,oficiales:new Set(catalogo.map(x=>texto(x.cedula)))});
  $('heDomingosResumen').textContent=`Domingos y festivos con marcaciones sin concepto: ${faltantes.length}`;
  $('heDomingosBody').innerHTML=faltantes.map(x=>`<tr><td>${html(fechaCorta(x.fecha))}</td><td><strong>${html(empleado(x.jornada))}</strong><div class="small">${html(area(x.jornada))}</div></td><td>${num(x.jornada.total_marcaciones)}</td><td class="small">${html(x.motivo)}</td><td>${x.preparable?`<button type="button" class="btn btn-outline-primary btn-sm he-domingo-btn" data-preparar-domingo="${html(x.fecha)}" ${datosUtilizables()?'':'disabled'}>Preparar revisión del ${html(fechaCorta(x.fecha))}</button>`:'<span class="small">Completar revision primero</span>'}</td></tr>`).join('')||'<tr><td colspan="5" class="small">No hay domingos o festivos con marcas sin P006/P007 para el empleado y area consultados. Esto no certifica que todos los conceptos existentes sean correctos.</td></tr>';
  $('heDomingosBody').querySelectorAll('[data-preparar-domingo]').forEach(b=>b.addEventListener('click',()=>prepararDomingoDesdeBandeja(b.dataset.prepararDomingo)));
}
async function prepararDomingoDesdeBandeja(fecha){
  if(!datosUtilizables())return;
  const encontrados=domingosSinConcepto(jornadas,base,{calendario:heCalendario,oficiales:new Set(catalogo.map(x=>texto(x.cedula)))});
  if(!encontrados.some(x=>x.fecha===fecha&&x.preparable))return;
  if(!confirm(`Preparar revisión del ${fechaCorta(fecha)}?\n\nLa preparación revisará TODOS los empleados de esa fecha, no solo la persona o area filtrada. Incorpora casos por revisar sin descontar descansos ni inventar horas pagables. No confirma turnos ni aprueba pagos.\n\nRevisa pausas, turnos nocturnos y la evidencia antes de aprobar. Deseas ejecutar esta preparacion?`))return;
  const id=++heCargaId;heAbort=new AbortController();heRecalculando=true;heLecturaValida=false;actualizarAcciones();
  let resultado=null;
  try{
    await asegurarSesion();
    avisoCarga(`Preparando solamente los dominicales del ${fechaCorta(fecha)}. No se aprueban pagos.`);
    resultado=await prepararDomingoSeleccionado(rpcConSesion,fecha,{calendario:heCalendario,signal:heAbort.signal});
  }catch(e){
    if(id!==heCargaId)return;
    if(esErrorAcceso(e)){limpiarNominaPorSesion();mostrarErrorAcceso($('heIntegridad'),e,cargar);}
    avisoCarga(`No se pudo confirmar la preparacion. No se repite el envio automaticamente. Pulsa Actualizar para comprobar el estado antes de otro intento. ${e.message||e}`,'warning');
  }finally{
    if(id===heCargaId){heRecalculando=false;actualizarAcciones();}
  }
  if(resultado&&id===heCargaId){
    const versionAntesDeCargar=heCargaId;
    await cargar();
    if(heCargaId!==versionAntesDeCargar+1||!datosUtilizables())return;
    $('heEstado').value='';render();
    avisoCarga(`Dominicales del ${fechaCorta(fecha)}: ${resultado.insertados} creados y ${resultado.actualizados} actualizados, segun respuesta del servidor. Sin aprobacion automatica. Revisa los candidatos y cualquier jornada que siga sin concepto.`,'success');
  }
}

// One calendar row, with decisions attached by employee/date (not by row index).
let heDiariasVisibles=new Map();
const heConceptosElegidos=new Map();
function conceptoDiarioTexto(c){
  const cerrado=estado(c)==='aprobado',h=cerrado?horasAprobadas(c):horasCalculadas(c);
  const cantidad=(esDomingoRevision(c)||c.detalle?.calculo_pendiente)&&!cerrado?'Por validar':horasMinutosNomina(Math.round(num(h)*60));
  return `${concepto(c)} ${c.concepto_nombre||''} \u00b7 ${cantidad} \u00b7 ${c.sugerencia_719||c.sugerencia_721?'sugerido':estado(c)}`;
}
function horaDiariaCelda(t,fecha){
  const f=fechaHoraMarcacion(t);if(!f)return '\u2014';
  return `<span class="nd-clock" title="${html(f)}">${html(f.slice(11,16))}</span>${f.slice(0,10)!==texto(fecha).slice(0,10)?`<small class="nd-small">${html(fechaCorta(f))}</small>`:''}`;
}
function renderDiaria(rows){
  $('heHead').closest('table').classList.remove('he-revision-comparable');
  $('heHead').innerHTML='<tr><th>Fecha</th><th>C\u00f3digo</th><th>Nombres y apellidos</th><th>Ingreso</th><th>Salida</th><th>Almuerzo</th><th>Total neto</th><th>Tipo de d\u00eda</th><th>Concepto / estado</th><th>Acciones</th></tr>';
  const paginas=Math.max(1,Math.ceil(rows.length/TAMANO_DIARIA));pagina=Math.min(pagina,paginas-1);
  const inicio=pagina*TAMANO_DIARIA,visibles=rows.slice(inicio,inicio+TAMANO_DIARIA);
  heDiariasVisibles=new Map(visibles.map(f=>[f.clave,f]));
  $('heBody').innerHTML=visibles.map((f,i)=>{
    const x=f.jornada,m=modeloRevision(x),cal=calendarioDia(texto(x.fecha).slice(0,10),heCalendario);
    const filtro=$('heEstado').value;
    const elegido=heConceptosElegidos.get(f.clave);
    const preferido=f.conceptos.find(c=>texto(c.revision_id)===elegido&&(!filtro||estado(c)===filtro))||f.conceptos.find(c=>filtro?estado(c)===filtro:!['aprobado','rechazado'].includes(estado(c)))||f.conceptos[0];
    const selector=f.conceptos.length?`<select class="form-select form-select-sm" data-nd-concepto aria-label="Concepto para ${html(empleado(x))} el ${html(fechaCorta(x.fecha))}">${f.conceptos.map(c=>`<option value="${html(c.revision_id)}" ${c===preferido?'selected':''}>${html(conceptoDiarioTexto(c))}</option>`).join('')}</select>`:
      `<span class="nd-small">${f.sinConceptoEspecial?'Domingo / festivo por revisar':num(x.total_marcaciones)?'Sin conceptos para aprobar':'Sin marcaciones'}</span>`;
    const prepara=f.sinConceptoEspecial&&!f.abierta?`<button type="button" class="btn btn-link btn-sm p-0" data-nd-action="preparar" data-fecha="${html(x.fecha)}">Preparar revisi\u00f3n</button>`:'';
    return `<tr data-nd-row="${html(f.clave)}" class="${f.especial?'nd-especial ':''}${!num(x.total_marcaciones)?'nd-sin-marcas':''}">
      <td><span class="nd-clock">${html(fechaCorta(x.fecha))}</span><small class="nd-small">${html(diaSemanaRevision(x.fecha))}</small></td>
      <td>${html(codigoErp(x)||'Sin c\u00f3digo')}</td>
      <td class="nd-persona"><strong>${html(empleado(x)||'Sin nombre')}</strong><small class="nd-small">${html(area(x))}</small></td>
      <td>${horaDiariaCelda(m.entrada,x.fecha)}${m.entrada!==null?`<small class="nd-small" title="${html(m.base)}">${html(m.punto||'Punto por verificar')}</small>`:''}</td>
      <td>${horaDiariaCelda(m.salida,x.fecha)}</td>
      <td class="nd-clock" title="${html(m.fuenteAlmuerzo)}">${m.descuentoAplicado!==null?horasMinutosNomina(m.descuentoAplicado):num(x.total_marcaciones)?'<span class="nd-small">Por confirmar</span>':'\u2014'}</td>
      <td title="${html(m.criterio)}"><strong class="nd-neto nd-clock">${m.neto===null?(num(x.total_marcaciones)?'Por revisar':'\u2014'):horasMinutosNomina(m.neto)}</strong>${f.abierta?'<small class="nd-small">Jornada abierta</small>':m.neto===null&&num(x.total_marcaciones)===1?'<small class="nd-small">Una sola marca</small>':''}</td>
      <td><span class="nd-day ${html(cal.tipo)}" title="${html(cal.nombre||cal.texto)}">${html(cal.texto)}</span></td>
      <td class="nd-concepto">${selector}${f.conceptos.length?'<div class="nd-concepto-estado" data-nd-estado></div>':''}${f.conceptos.length>1?`<small class="nd-small">${f.conceptos.length} conceptos en este d\u00eda</small>`:''}${prepara}</td>
      <td class="nd-acciones">${f.conceptos.length?'<div><button type="button" class="btn btn-success" data-nd-action="aprobar">Aprobar</button><button type="button" class="btn btn-outline-primary" data-nd-action="revisar" hidden>Revisar</button><button type="button" class="btn btn-outline-danger" data-nd-action="rechazar">Rechazar</button><button type="button" class="btn btn-outline-primary" data-nd-action="recalcular" hidden>Recalcular</button></div><button type="button" class="btn btn-outline-primary nd-comentar" data-nd-action="comentar">Comentar</button><small class="nd-small nd-accion-motivo" data-nd-motivo></small>':''}<button type="button" class="btn btn-link btn-sm nd-detalle" data-nd-action="detalle">Ver detalle</button></td>
    </tr>`;
  }).join('')||'<tr><td colspan="10" class="text-center text-muted py-4">No hay jornadas para los filtros seleccionados.</td></tr>';
  $('heBody').querySelectorAll('[data-nd-concepto]').forEach(el=>el.addEventListener('change',()=>{heConceptosElegidos.set(el.closest('[data-nd-row]').dataset.ndRow,el.value);actualizarAccionesDiarias();}));
  $('heBody').querySelectorAll('[data-nd-action]').forEach(b=>b.addEventListener('click',()=>accionDiaria(b)));
  $('hePaginacion').classList.remove('d-none');
  $('hePaginaInfo').textContent=`${rows.length?inicio+1:0}\u2013${Math.min(inicio+TAMANO_DIARIA,rows.length)} de ${rows.length} jornadas del corte`;
  $('heAnterior').disabled=pagina===0;$('heSiguiente').disabled=pagina>=paginas-1;
  actualizarAccionesDiarias();
}
function actualizarAccionesDiarias(){
  if(vista!=='diaria')return;
  $('heBody')?.querySelectorAll('[data-nd-row]').forEach(tr=>{
    const f=heDiariasVisibles.get(tr.dataset.ndRow);
    const id=tr.querySelector('[data-nd-concepto]')?.value;
    const c=f?.conceptos.find(x=>texto(x.revision_id)===id);
    const label=tr.querySelector('[data-nd-estado]'),select=tr.querySelector('[data-nd-concepto]');
    if(c&&label){
      const e=estado(c),cantidad=e==='aprobado'?horasMinutosNomina(Math.round(num(horasAprobadas(c))*60)):
        e==='rechazado'?'':(esDomingoRevision(c)||c.detalle?.calculo_pendiente)?'Por validar':horasMinutosNomina(Math.round(horasCalculadas(c)*60));
      label.innerHTML=badge(c.sugerencia_719||c.sugerencia_721?'sugerido':e)+(cantidad?`<span>${html(cantidad)}${e==='aprobado'?' aprobadas':''}</span>`:'');
      select.title=conceptoDiarioTexto(c);
    }
    const opciones=accionesConceptoDiario(c,{disponible:datosUtilizables(),abierta:f?.abierta});
    const aviso=tr.querySelector('[data-nd-motivo]');
    if(aviso){aviso.textContent=opciones.motivo;aviso.hidden=!opciones.motivo;}
    if(select)select.disabled=!datosUtilizables();
    tr.querySelectorAll('[data-nd-action]').forEach(b=>{
      const action=b.dataset.ndAction,decision=['aprobar','rechazar','revisar','recalcular'].includes(action);
      b.hidden=action==='aprobar'?opciones.cerrado:action==='revisar'||action==='recalcular'?!opciones.cerrado:decision&&!opciones.mostrarDecision;
      b.disabled=decision?!opciones[action]:action==='comentar'?!opciones.comentar:!datosUtilizables();
      if(action==='aprobar')b.textContent=c&&requiereRevisionNocturna(c)?'Revisar y aprobar':'Aprobar';
      b.title=decision?opciones.motivo:action==='comentar'?'Agregar o consultar comentarios sin cambiar las horas ni el estado.':'';
    });
  });
}
async function accionDiaria(b){
  if(!datosUtilizables()||b.disabled)return;
  const tr=b.closest('[data-nd-row]'),f=heDiariasVisibles.get(tr?.dataset.ndRow);if(!f)return;
  const accion=b.dataset.ndAction;
  if(accion==='detalle'){verDetalleDiario(f.jornada,modeloRevision(f.jornada));return;}
  if(accion==='preparar'){await prepararDomingoDesdeBandeja(b.dataset.fecha);return;}
  const id=tr.querySelector('[data-nd-concepto]')?.value;
  const c=f.conceptos.find(x=>texto(x.revision_id)===id);
  if(accion==='comentar'){if(c)await comentarConcepto(id);return;}
  const opciones=accionesConceptoDiario(c,{disponible:datosUtilizables(),abierta:f.abierta});
  if(!opciones[accion])return;
  await resolver(id,accion);
}

function renderTabla(rows){
  $('hePaginacion').classList.remove('d-none');
  $('heHead').closest('table').classList.add('he-revision-comparable');
  $('heHead').innerHTML='<tr><th>Empleado</th><th>Fecha</th><th>Programado</th><th>Marcado</th><th>Ingreso</th><th>Salida</th><th>Total neto</th><th>Concepto</th><th>Calculadas</th><th>Aprobadas</th><th>Estado y observación</th><th>Acciones</th></tr>';
  const totalPaginas=Math.max(1,Math.ceil(rows.length/TAMANO_PAGINA));if(pagina>=totalPaginas)pagina=totalPaginas-1;
  const desde=pagina*TAMANO_PAGINA,visibles=rows.slice(desde,desde+TAMANO_PAGINA);
  $('heBody').innerHTML=visibles.map(x=>{
    const m=modeloRevision(x),riesgo=requiereRevisionNocturna(x),desfase=riesgo||usaRevision719(x)||usaRevisionAyB721(x)?null:controlExtraVigente(x,m),abierta=puedeDecidir()&&x.permite_revision&&!['aprobado','rechazado'].includes(estado(x));
    const boton=(accion,nombre,estilo)=>`<button class="btn btn-${estilo} btn-sm" data-action="${accion}" data-id="${html(x.revision_id)}">${nombre}</button>`;
    const domingo=esDomingoRevision(x);
    const acciones=abierta&&(usaRevision719(x)||usaRevisionAyB721(x))?`<div class="rev-actions">${boton('aprobar','Revisar y aprobar','outline-primary')}${boton('rechazar','Rechazar','outline-danger')}</div>`:abierta?`<div class="rev-actions">${domingo?boton('validarDomingo','Revisar y aprobar','outline-primary'):desfase?`<button class="btn btn-outline-primary btn-sm" onclick="window.heVerRevision('${html(x.revision_id)}')">Revisar horario y calculo</button>`:riesgo?`<button class="btn btn-outline-primary btn-sm" onclick="window.heVerRevision('${html(x.revision_id)}',true)">Revisar y aprobar nocturno</button>`:boton('aprobar','Aprobar '+horasCalculadas(x).toFixed(2)+' h','success')+boton('ajustar','Ajustar','outline-primary')}${boton('rechazar','Rechazar','outline-danger')}</div>`:['aprobado','rechazado'].includes(estado(x))?`<div class="rev-actions">${boton('revisar','Revisar','outline-primary')}${boton('rechazar','Rechazar','outline-danger')}${boton('recalcular','Recalcular','outline-primary')}</div>`:'<span class="text-muted small">Actualiza la consulta</span>';
    return `<tr><td><strong>${html(empleado(x))}</strong><small class="rev-small">${html(codigoErp(x))} · ${html(x.cedula)}<br>${html(area(x))}</small></td><td>${fechaDiaRevision(x.fecha)}${fechaHtml(x,heCalendario)}</td><td>${programacionCelda(m)}${diagnosticoHorarioHtml(x)}</td><td>${marcadoCelda(m)}<button class="rev-detail-button" onclick="window.heVerRevision('${html(x.revision_id)}')">Ver todas las marcas</button></td><td>${comparacionCelda(m,'entrada')}</td><td>${comparacionCelda(m,'salida')}</td><td>${celdaNeto(x,m)}</td><td><strong>${html(concepto(x))}</strong><div class="rev-small">${html(x.concepto_nombre)}</div></td><td>${domingo?`<strong class="dom712-pendiente">${textoCalculoDomingo(x)}</strong><div class="rev-small">Validar trabajo y pausas. No significa cero trabajado.</div>`:calculadasCeldaRevision(x,m)}${advertenciaNocturna(x)}${desfase?`<div class="he-candidato-desfasado">${html(desfase)}</div>`:""}${controlConceptoHtml(x,heCalendario,m)}${texto(x.origen_calculo)==='dominical_marcaciones_v1'?'<div class="rev-small">Dominical estimado; revisar antes de aprobar</div>':''}</td><td>${horasAprobadas(x)===null?'—':horasAprobadas(x).toFixed(2)+' h'}</td><td>${badge(estado(x))}<div class="rev-small">${html(x.observacion||'Sin observación registrada')}</div></td><td>${acciones}<div class="rev-actions">${boton('comentar','Comentar','outline-primary')}</div></td></tr>`;
  }).join('')||'<tr><td colspan="12" class="text-center py-4">No hay conceptos para los filtros seleccionados.</td></tr>';
  $('heBody').querySelectorAll('button[data-action]').forEach(b=>b.addEventListener('click',()=>resolver(b.dataset.id,b.dataset.action)));
  $('hePaginaInfo').textContent=`Mostrando ${rows.length?desde+1:0}-${Math.min(desde+TAMANO_PAGINA,rows.length)} de ${rows.length} conceptos. La busqueda y Excel incluyen todas las paginas.`;
  $('heAnterior').disabled=pagina===0;$('heSiguiente').disabled=pagina>=totalPaginas-1;
}

function diferenciaLlegada(x){const m=modeloRevision(x);if(m.deltaEntrada===null)return 'Sin comparación';const n=Math.floor(Math.abs(m.deltaEntrada));return n?`Llegó ${n} min ${m.deltaEntrada>0?'tarde':'antes'}`:'En el minuto previsto';}
function diferenciaSalida(x){const m=modeloRevision(x);if(m.deltaSalida===null)return 'Sin comparación';const n=Math.floor(Math.abs(m.deltaSalida));return n?`Salió ${n} min ${m.deltaSalida>0?'después':'antes'}`:'En el minuto previsto';}
function marcasTexto(x){const r=Array.isArray(x.recorrido)?x.recorrido:[];return r.length?r.map(m=>hora(m.hora)).join(", "):`${num(x.total_marcaciones)} marcación(es)`}
function renderJornadas(rows){
  $("heHead").closest("table").classList.remove("he-revision-comparable");
  $("heHead").innerHTML="<tr><th>Área</th><th>Empleado</th><th>Fecha</th><th>Turno</th><th>Programado</th><th>Marcaciones</th><th>Entrada</th><th>Salida</th><th>Total neto</th><th>Llegada</th><th>Salida vs. turno</th><th>Estado</th></tr>";
  const totalPaginas=Math.max(1,Math.ceil(rows.length/TAMANO_PAGINA));if(pagina>=totalPaginas)pagina=totalPaginas-1;const desde=pagina*TAMANO_PAGINA,visibles=rows.slice(desde,desde+TAMANO_PAGINA);
  $("heBody").innerHTML=visibles.map(x=>`<tr><td>${html(area(x))}</td><td><strong>${html(empleado(x)||"Sin nombre")}</strong><div class="small text-muted">${html(x.cedula||"")}</div></td><td>${fechaDiaRevision(x.fecha)}${fechaHtml(x,heCalendario)}</td><td>${html(x.turno||((x.total_marcaciones>0)?"Horario observado; sin turno asignado":"Sin programación"))}<div class="mt-1">${badgeTurno(x)}</div>${diagnosticoHorarioHtml(x)}</td><td>${html(hora(x.hora_inicio))}–${html(hora(x.hora_fin))}${x.turno_2?`<div class="small">${html(hora(x.hora_inicio_2))}–${html(hora(x.hora_fin_2))}</div>`:""}</td><td><strong>${num(x.total_marcaciones)}</strong><div class="small text-muted">${html(marcasTexto(x))}</div></td><td>${celdaExtremo(x,"entrada")}</td><td>${celdaExtremo(x,"salida")}</td><td>${celdaTrabajo(x)}</td><td>${comparacionCelda(modeloRevision(x),'entrada')}</td><td>${comparacionCelda(modeloRevision(x),'salida')}</td><td>${badge(texto(x.estado_comparacion||"sin_programacion"))}${etiquetaEstadoMarcacion(x)}</td></tr>`).join("")||'<tr><td colspan="12" class="text-center text-muted py-4">No hay jornadas ni marcaciones para los filtros seleccionados.</td></tr>';
  $("heBody").querySelectorAll("button[data-detalle-dia]").forEach(b=>b.addEventListener("click",()=>abrirDetalleDia(b.dataset.detalleDia)));
  $("hePaginacion").classList.remove("d-none");$("hePaginaInfo").textContent=`Mostrando ${rows.length?desde+1:0}–${Math.min(desde+TAMANO_PAGINA,rows.length)} de ${rows.length} jornadas · ${catalogo.length} empleados activos`;
  $("heAnterior").disabled=pagina===0;$("heSiguiente").disabled=pagina>=totalPaginas-1;
}
function celdaExtremo(x,lado){
  const r=intervaloDiario(x),valor=fechaHoraMarcacion(r[lado]);
  if(!valor)return "-";
  return `<span title="${html(valor)}">${html(valor.slice(11,16))}</span>${valor.slice(0,10)!==texto(x.fecha).slice(0,10)?`<small class="he-total-criterio">${html(fechaCorta(valor))}</small>`:""}`;
}
function celdaIntervalo(r){
  return `<strong class="he-total-intervalo" title="${html(duracionMarcaciones(r.minutos,true))}">${html(duracionMarcaciones(r.minutos))}</strong><small class="he-total-criterio">${r.minutos===null?'Sin intervalo completo':'Entre ingreso y salida; sin descuentos'}</small>`;
}
function etiquetaEstadoMarcacion(x){
  const e=estadoMarcacion(x);
  return `<span class="he-marca-estado ${e.incidencia?'alerta':''}" title="${html(e.detalle)}">${html(e.etiqueta)}${e.pendiente?' \u00b7 por cerrar':''}</span>`;
}
function celdaNeto(x,m=modeloRevision(x)){
  return `<strong class="nd-neto" title="${html(m.criterio)}">${m.neto===null?'Por revisar':horasMinutosNomina(m.neto)}</strong><small class="he-total-criterio">${m.descuentoAplicado===null?'Almuerzo / intervalo por verificar':`Almuerzo: ${horasMinutosNomina(m.descuentoAplicado)}`}</small>`;
}
function celdaTrabajo(x){
  return `${celdaNeto(x)}<button class="btn btn-link btn-sm p-0" data-detalle-dia="${html(claveDia(x))}">Ver detalle</button>`;
}
function abrirDetalleDia(clave){
  const x=jornadas.find(r=>claveDia(r)===clave);if(!x||!datosUtilizables())return;
  verDetalleDiario(x,modeloRevision(x));
}

async function validarDomingoRevision(x){
  if(!datosUtilizables())return;
  heGuardando=true;actualizarAcciones();const id=texto(x.revision_id),carga=heCargaId;
  try{
    const preview=await rpcConSesion('previsualizar_especial_nomina_v721',{p_revision_id:id},{read:true});
    if(preview.error)throw preview.error;
    const actual=preview.data;
    if(actual?.id!==id||!actual.evidencia||!actual.huella)throw new Error('No se recibio la revision actual.');
    const filaActual={...x,evidencia_revision:actual.evidencia};
    const decision=await pedirDecisionNomina(filaActual,{accion:"validarDomingo",modelo:modeloRevision(filaActual)});
    if(!decision||carga!==heCargaId)return;
    avisoCarga("Guardando las horas verificadas...");
    const {data,error}=await rpcConSesion('resolver_especial_nomina_v721',{
      p_revision_id:id,p_horas:decision.horas,p_comentario:decision.motivo||null,
      p_version:actual.version,p_huella:actual.huella
    },{read:false});
    if(error)throw error;if(carga!==heCargaId)return;
    const fila=Array.isArray(data)?data[0]:data;
    if(!fila||texto(fila.id)!==id||fila.estado!=='aprobado')throw new Error('No se pudo confirmar la aprobacion. Actualiza antes de reintentar.');
    const actualizado=completarBandeja([fila],heEmpleadosDetalle,heMarcasFuente)[0];
    base=base.map(r=>texto(r.revision_id)===id?actualizado:r);heConceptosElegidos.set(claveDia(fila),fila.id);
    avisoCarga('Aprobacion confirmada por Supabase y registrada en auditoria.','success');
  }catch(e){
    if(carga!==heCargaId)return;
    heLecturaValida=false;
    if(esErrorAcceso(e)){limpiarNominaPorSesion();mostrarErrorAcceso($("heIntegridad"),e,cargar);}
    avisoCarga(`No se confirmo la decision: ${e.message||e}. Actualiza antes de reintentar; no se repite automaticamente.`,'danger');
  }finally{heGuardando=false;if(heDisponible)render();actualizarAcciones();}
}

async function resolver(id,accion){
  if(!datosUtilizables())return;
  if(accion==='comentar'){await comentarConcepto(id);return;}
  const x=base.find(v=>texto(v.revision_id)===texto(id));if(!x)return;
  if(['aprobado','rechazado'].includes(estado(x))||['revisar','recalcular'].includes(accion)||x.detalle?.correccion_reabierta_722){
    await visorCorrecciones722.mostrar(x,['rechazar','recalcular'].includes(accion)?accion:'revisar');return;
  }
  if(usaRevision719(x)||usaRevisionAyB721(x)){await visorSugerencias719.mostrar(x,accion);return;}
  if(esDomingoRevision(x)&&['validarDomingo','aprobar','ajustar'].includes(accion)){await validarDomingoRevision(x);return;}
  if(['aprobar','ajustar'].includes(accion)&&requiereRevisionNocturna(x)){await mostrarRevisionEvidencia(x,{nocturno:true});return;}
  const desfase=controlExtraVigente(x,modeloRevision(x));
  if(['aprobar','ajustar'].includes(accion)&&desfase){alert(desfase);return;}
  const m=modeloRevision(x),control=revisarConcepto(x,heCalendario,m),almuerzo=alertaAlmuerzoConcepto(x,m);
  const versionAntes=heCargaId;
  const decision=await pedirDecisionNomina(x,{
    accion:almuerzo&&accion==='aprobar'?'ajustar':accion,modelo:m,
    aviso:[almuerzo,...control.avisos.map(a=>a.texto)].filter(Boolean).join(' ')
  });
  if(!decision||versionAntes!==heCargaId||!datosUtilizables())return;
  accion=decision.accion;const h=decision.horas,obs=decision.motivo||null;
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
    const esperado=accion==='observar'?'observado':accion==='rechazar'?'rechazado':'aprobado';
    if(fila.estado!==esperado)throw new Error("El servidor devolvió un estado distinto al solicitado. Actualiza antes de reintentar.");
    const actualizado=completarBandeja([fila],heEmpleadosDetalle,heMarcasFuente)[0];
    base=base.map(r=>texto(r.revision_id)===texto(id)?actualizado:r);heConceptosElegidos.set(claveDia(fila),fila.id);
    avisoCarga("Decision confirmada por Supabase. Se actualizo solo el registro afectado.","success");
  }catch(e){
    heLecturaValida=false;
    if(esErrorAcceso(e)){limpiarNominaPorSesion();mostrarErrorAcceso($("heIntegridad"),e,cargar);}
    avisoCarga(`No se pudo confirmar la decision. No se repetira automaticamente. Pulsa Actualizar antes de otro intento. ${e.message||e}`,"danger");
  }finally{
    heGuardando=false;if(heDisponible)render();actualizarAcciones();
  }
}

function filasProsof(rows){return rows.filter(x=>estado(x)==="aprobado").map(x=>({Empleado:codigoErp(x),Concepto:concepto(x),Fecha:texto(x.fecha||x.Fecha).slice(0,10),Dias:"",FechaInici:"",Horas:num(x.horas_aprobadas??x.Horas),Valor:"",LiquidarEnPrima:"N","Centro de costos":texto(x["Centro de costos"]||x.centro_costos||"")}))}
function validarProsof(rows){const errores=[];rows.forEach((x,i)=>{if(!x.Empleado)errores.push(`Fila ${i+2}: empleado sin código PROSOF`);if(!CONCEPTOS.some(c=>c[0]===x.Concepto))errores.push(`Fila ${i+2}: concepto ${x.Concepto||"vacío"} no permitido`);if(!/^\d{4}-\d{2}-\d{2}$/.test(x.Fecha))errores.push(`Fila ${i+2}: fecha inválida`);if(!(x.Horas>0))errores.push(`Fila ${i+2}: horas inválidas`)});return errores}
function hojaProsof(rows){const ws=XLSX.utils.json_to_sheet(rows,{header:HEADERS});ws["!cols"]=[{wch:14},{wch:12},{wch:12},{wch:8},{wch:12},{wch:10},{wch:10},{wch:18},{wch:18}];for(let r=2;r<=rows.length+1;r++){if(ws[`A${r}`])ws[`A${r}`].t="s";if(ws[`B${r}`])ws[`B${r}`].t="s";const d=rows[r-2].Fecha.split("-").map(Number);ws[`C${r}`]={t:"d",v:new Date(d[0],d[1]-1,d[2]),z:"mm-dd-yy"};if(ws[`F${r}`])ws[`F${r}`].z="#,##0.00"}return ws}
function hojaConceptos(){return XLSX.utils.aoa_to_sheet([["",""],["",""],...CONCEPTOS])}
function descargarProsof(){if(!datosUtilizables())return alert("Actualiza el periodo completo antes de exportar.");if(!window.XLSX)return alert("No se cargó el componente Excel.");const rows=filasProsof(filtrados()),errores=validarProsof(rows);if(!rows.length)return alert("No hay conceptos aprobados para exportar.");if(errores.length)return alert(`No se generó el archivo porque debe corregirse:\n\n${errores.slice(0,12).join("\n")}`);const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,hojaProsof(rows),"Hoja1");XLSX.utils.book_append_sheet(wb,hojaConceptos(),"conceptos");XLSX.writeFile(wb,`NOMINA_EXTRAS_${$("heDesde").value}_${$("heHasta").value}.xls`,{bookType:"biff8"})}
function filaAsistenciaRevision(x){
  const r=intervaloDiario(x),n=resumenConceptosNocturnos(x,base),np=nocturnoPosteriorRevision(modeloRevision(x)),e=estadoMarcacion(x);
  return {Area:area(x),Empleado:empleado(x),Cedula:texto(x.cedula),"Codigo PROSOF":codigoErp(x),Fecha:texto(x.fecha).slice(0,10),
    Turno:x.turno||"Sin programacion","Tipo programacion":x.programacion_tipo||"","Inicio programado":hora(x.hora_inicio),
    "Salida programada":hora(x.hora_fin),"Inicio bloque 2":hora(x.hora_inicio_2),"Salida bloque 2":hora(x.hora_fin_2),
    "Total marcaciones":num(x.total_marcaciones),Marcaciones:marcasTexto(x),"Entrada real":r.entrada===null?"Sin entrada":fechaHoraMarcacion(r.entrada).slice(11),
    "Salida real":r.salida===null?"Sin salida verificable":fechaHoraMarcacion(r.salida).slice(11),
    ...columnasIntervalo(x),
    "Estado de marcacion":e.etiqueta,"Detalle de marcacion":e.detalle,"Incidencia para revisar":e.incidencia?"SI":"NO",
    "Jornada en curso o futura":e.pendiente?"SI":"NO",
    "Tiempo nocturno despues del turno (h; no aprobado)":np===null?null:Math.round(np/60*100)/100,
    "Extra nocturna registrada por revisar (h)":n.registros?n.pendiente:null,"Extra nocturna aprobada (h)":n.registros?n.aprobada:null,
    Llegada:diferenciaLlegada(x),"Salida vs turno":diferenciaSalida(x),"Estado comparacion":x.estado_comparacion||"",...filaCalidadExcel(x,heCalendario),...columnasDocumentales(x)};
}
function descargarRevision(){
  if(!datosUtilizables())return alert("Actualiza el periodo completo antes de exportar.");
  if(!window.XLSX)return alert("No se cargo el componente Excel.");
  const rows=filtrados(),diarias=filasDiarias(),js=vista==='diaria'?diarias.map(f=>f.jornada):jornadasFiltradas({ignorarEstadoMarcacion:vista!=="jornadas"}),wb=XLSX.utils.book_new();
  const revisionDiaria=diarias.map(f=>({
    Fecha:texto(f.jornada.fecha).slice(0,10),Codigo:codigoErp(f.jornada),Empleado:empleado(f.jornada),Area:area(f.jornada),
    ...columnasIntervalo(f.jornada),
    'Tipo de dia':calendarioDia(texto(f.jornada.fecha).slice(0,10),heCalendario).texto,
    Conceptos:f.conceptos.map(c=>`${concepto(c)} - ${estado(c)}${horasAprobadas(c)!==null?' - '+horasAprobadas(c)+' h aprobadas':''}`).join(' | '),
    'Pendiente de revision':f.sinConceptoEspecial?'Domingo/festivo con marcas sin concepto base':f.abierta?'Jornada abierta':''
  }));
  XLSX.utils.book_append_sheet(wb,hojaIntervalos(XLSX,revisionDiaria),'Aprobacion del corte');
  XLSX.utils.book_append_sheet(wb,hojaIntervalos(XLSX,js.map(filaAsistenciaRevision)),"Jornadas y marcaciones");
  const detalle=rows.map(x=>{
    const comparacion={...columnasRevisionExcel(x),...columnasDocumentales(x)};
    delete comparacion['Total jornada estimado (h)'];
    return {Area:area(x),Empleado:empleado(x),Cedula:x.cedula||"","Codigo PROSOF":codigoErp(x),Fecha:texto(x.fecha).slice(0,10),Dia:diaSemanaRevision(x.fecha),Turno:x.turno||"","Inicio programado":hora(x.hora_inicio),"Salida programada":hora(x.hora_fin),"Ultima marca recibida (contexto)":hora(x.ultima_marcacion),Concepto:concepto(x),"Horas calculadas":(esDomingoRevision(x)||x.detalle?.calculo_pendiente)?null:horasCalculadas(x),"Criterio de calculo":esDomingoRevision(x)?textoCalculoDomingo(x):"Calculo existente","Horas aprobadas":horasAprobadas(x),Estado:estado(x),Responsable:responsableDe(x),Observacion:x.observacion||"",...comparacion,...columnasIntervalo(x,modeloRevision(x)),...filaControlExcel(x,heCalendario)};
  });
  XLSX.utils.book_append_sheet(wb,hojaIntervalos(XLSX,detalle),"Conceptos para aprobaci\u00f3n");
  const areas=[];for(const [a,x] of resumenAreas(rows))areas.push({Area:a,Responsable:[...x.r].join(", "),Pendientes:x.p,Observados:x.o,Aprobados:x.a,Estado:x.p+x.o?"PENDIENTE":"CERRADO"});
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(areas),"Estado por \u00e1rea");
  XLSX.utils.book_append_sheet(wb,hojaProsof(filasProsof(rows)),"Aprobados PROSOF");
  XLSX.utils.book_append_sheet(wb,hojaConceptos(),"conceptos");
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(coberturaPorArea(js,area)),"Cobertura de turnos");
  XLSX.writeFile(wb,`REVISION_NOMINA_COMPLETA_${$("heDesde").value}_${$("heHasta").value}.xlsx`);
}
function descargarIncidencias(){
  if(!datosUtilizables())return alert("Actualiza el periodo completo antes de exportar.");
  if(!window.XLSX)return alert("No se cargo el componente Excel.");
  // All pages, but only closed exceptions in the current attendance filters.
  const filas=jornadasFiltradas().filter(x=>estadoMarcacion(x).incidencia);
  if(!filas.length)return alert("No hay incidencias cerradas para estos filtros. Las jornadas en curso, fechas futuras y descansos sin marcas no se incluyen.");
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,hojaIntervalos(XLSX,filas.map(filaAsistenciaRevision)),"Incidencias");
  const marcas=filas.flatMap(x=>(Array.isArray(x.recorrido)?x.recorrido:[]).map(m=>({Empleado:empleado(x),Cedula:texto(x.cedula),"Fecha de la fila":texto(x.fecha).slice(0,10),"Día":diaSemanaRevision(x.fecha),"Fecha y hora original":m.hora||m.punch_time||"","Punto / terminal":m.punto||m.area_alias||m.terminal||m.terminal_alias||m.terminal_sn||"","Id original":texto(m.id??m.biotime_id)})));
  const ws=XLSX.utils.json_to_sheet(marcas.length?marcas:[{"Aviso":"No hay marcaciones originales en las incidencias seleccionadas."}]);
  ws['!cols']=[{wch:36},{wch:16},{wch:18},{wch:26},{wch:30},{wch:18}];if(marcas.length)ws['!autofilter']={ref:ws['!ref']};
  XLSX.utils.book_append_sheet(wb,ws,"Marcas de incidencias");
  const criterios=[['Campo','Detalle'],['Periodo',`${heRango.desde} a ${heRango.hasta}`],['Area',$("heArea").value||'Todas'],['Busqueda',$("heBuscar").value||'Sin busqueda'],['Tipo de turno',$("heTurnoEstado").selectedOptions[0].textContent],['Tipo de dia',$("heDiaCalendario").selectedOptions[0].textContent],['Estado de marcacion',$("heEstadoMarcacion").selectedOptions[0].textContent],['Alcance','Todas las filas de los filtros, no solo la pagina visible. Se excluyen jornadas en curso, fechas futuras y descansos/novedades sin marcas.'],['Sin marcacion','Significa sin registro recibido. No demuestra inasistencia: verificar programacion, novedades y sincronizacion.'],['Total diario',CRITERIO_INTERVALO],['Pagos','Este archivo no aprueba ni modifica horas, conceptos o PROSOF.']];
  const nota=XLSX.utils.aoa_to_sheet(criterios);nota['!cols']=[{wch:25},{wch:110}];XLSX.utils.book_append_sheet(wb,nota,"Criterios");
  XLSX.writeFile(wb,`INCIDENCIAS_MARCACIONES_${heRango.desde}_${heRango.hasta}.xlsx`);
}
