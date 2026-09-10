import { supabase } from "../supabase/supabaseClient.js";

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
  sesion=JSON.parse(localStorage.getItem("ccp_sesion")||"null");
  if(!sesion){location.href="login.html";return}
  const rol=texto(sesion.rol).toLowerCase(),modulos=Array.isArray(sesion.modulos_permitidos)?sesion.modulos_permitidos:[];
  const permitido=sesion.puede_ver_todo===true||["admin","administrador","gerencia","nomina","auditor","aprobador","ayb","servicios_generales","direccion_financiera"].includes(rol)||modulos.includes("horas-extras");
  if(!permitido){alert("No tienes autorización para ingresar al módulo de horas extras.");location.href="login.html";return}
  $("heUsuario").textContent=sesion.nombre_completo||sesion.usuario||"Usuario";$("heRol").textContent=sesion.rol||"-";
  const hoy=new Date(),inicioBiometricos=new Date(2026,7,23);$("heDesde").value=iso(inicioBiometricos);$("heHasta").value=iso(hoy);
  $("heActualizar").addEventListener("click",cargar);["heArea","heEstado"].forEach(id=>$(id).addEventListener("change",()=>{pagina=0;render()}));$("heBuscar").addEventListener("input",()=>{pagina=0;render()});
  document.querySelectorAll("[data-he-vista]").forEach(b=>b.addEventListener("click",()=>cambiarVista(b.dataset.heVista)));
  $("heAnterior").addEventListener("click",()=>{if(pagina>0){pagina--;render()}});$("heSiguiente").addEventListener("click",()=>{pagina++;render()});
  $("heXlsx").addEventListener("click",descargarRevision);$("heXls").addEventListener("click",descargarProsof);
  $("heConfigResponsables").addEventListener("click",()=>bootstrap.Modal.getOrCreateInstance($("heModalResponsables")).show());
  await cargar();
}
function iso(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`}
async function rpcPaginada(nombre,parametros,tamano=1000){
  const data=[];
  for(let desde=0;;desde+=tamano){
    const r=await supabase.rpc(nombre,parametros).range(desde,desde+tamano-1);
    if(r.error)return {data:null,error:r.error};
    const lote=Array.isArray(r.data)?r.data:[];
    data.push(...lote);
    if(lote.length<tamano)break;
  }
  return {data,error:null};
}
async function cargar(){
  $("heBody").innerHTML='<tr><td colspan="11" class="text-center text-muted py-4">Actualizando información...</td></tr>';
  try{
    const desde=$("heDesde").value,hasta=$("heHasta").value;
    const [preparacionAyb,preparacionGeneral,rGeneral,rAyb,rInferidos,rMarcas,rEmpleados]=await Promise.all([
      supabase.rpc("preparar_conceptos_revision",{p_fecha_desde:desde,p_fecha_hasta:hasta,p_grupo_codigo:null,p_proceso_codigo:null}),
      supabase.rpc("preparar_conceptos_revision_generales_v2",{p_fecha_desde:desde,p_fecha_hasta:hasta}),
      rpcPaginada("consultar_jornadas_generales_nomina_v3",{p_fecha_desde:desde,p_fecha_hasta:hasta}),
      rpcPaginada("consultar_jornadas_ayb_nomina_v3",{p_fecha_desde:desde,p_fecha_hasta:hasta}),
      rpcPaginada("consultar_turnos_inferidos_nomina_v5",{p_fecha_desde:desde,p_fecha_hasta:hasta}),
      rpcPaginada("consultar_marcaciones_nomina_v3",{p_fecha_desde:desde,p_fecha_hasta:hasta}),
      supabase.rpc("consultar_empleados_nomina_v4")
    ]);
    if(preparacionAyb.error)console.warn("No fue posible actualizar candidatos AyB; se mostrarán los ya calculados:",preparacionAyb.error.message);
    if(preparacionGeneral.error)console.warn("No fue posible actualizar candidatos generales; se mostrarán los ya calculados:",preparacionGeneral.error.message);
    [rGeneral,rAyb,rInferidos,rMarcas,rEmpleados].forEach(r=>{if(r.error)throw r.error});

    catalogo=desenvolverEmpleados(rEmpleados.data);
    const marcasFuente=desenvolver(rMarcas.data);
    jornadas=completarUniversoEmpleados(combinarJornadas(rGeneral.data,rAyb.data,rInferidos.data,rMarcas.data),catalogo,desde,hasta);
    verificarIntegridadMarcaciones(marcasFuente,jornadas);
    pagina=0;

    let q=supabase.from("turnos_conceptos_revision").select("*").order("fecha",{ascending:false});
    if(desde)q=q.gte("fecha",desde);if(hasta)q=q.lte("fecha",hasta);
    const {data,error}=await q;if(error)throw error;
    base=await completarBandeja(Array.isArray(data)?data:[],desde,hasta);
    const r=await supabase.from("vw_turnos_responsables_activos").select("*");responsables=Array.isArray(r.data)?r.data:[];
    poblarAreas();render();
  }catch(e){console.error(e);$("heBody").innerHTML=`<tr><td colspan="11" class="text-center text-danger py-4">No fue posible cargar la bandeja: ${html(e.message||e)}</td></tr>`}
}

function desenvolver(datos){return (Array.isArray(datos)?datos:[]).map(x=>x?.jornada||x).filter(Boolean)}
function desenvolverEmpleados(datos){return (Array.isArray(datos)?datos:[]).map(x=>x?.empleado||x).filter(Boolean)}
function claveDia(x){return `${texto(x.cedula)}|${texto(x.fecha).slice(0,10)}`}
function minutosHora(v){const h=hora(v);if(!/^\d{2}:\d{2}$/.test(h))return null;const [a,b]=h.split(":").map(Number);return a*60+b}
function compararConMarcaciones(x){
  const total=num(x.total_marcaciones),tipo=texto(x.programacion_tipo).toLowerCase();
  const confirmada=tipo==="confirmada",inferida=["inferida_alta","inferida_media"].includes(tipo),comparable=confirmada||inferida;
  if(!total)return {...x,primera_marcacion:null,ultima_marcacion:null,minutos_tarde:0,minutos_salida_anticipada:0,minutos_posteriores_turno:0,estado_comparacion:confirmada?"sin_marcaciones":"sin_programacion_sin_marcaciones"};
  if(!comparable)return {...x,estado_comparacion:tipo==="inferida_ambigua"?"turno_ambiguo":"sin_programacion"};
  if(total===1)return {...x,minutos_tarde:0,minutos_salida_anticipada:0,minutos_posteriores_turno:0,estado_comparacion:"marcacion_unica"};
  const ini=minutosHora(x.hora_inicio),fin=minutosHora(x.hora_fin_2||x.hora_fin);
  const entrada=minutosHora(x.primera_marcacion),salida=minutosHora(x.ultima_marcacion);
  if([ini,fin,entrada,salida].some(v=>v===null))return {...x,estado_comparacion:"incompleta"};
  const finAjustado=fin<=ini?fin+1440:fin;
  const salidaAjustada=salida<ini?salida+1440:salida;
  return {...x,
    minutos_tarde:Math.max(entrada-ini,0),
    minutos_salida_anticipada:Math.max(finAjustado-salidaAjustada,0),
    minutos_posteriores_turno:Math.max(salidaAjustada-finAjustado,0),
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
    marcasPorDia.delete(claveDia(x));
    return compararConMarcaciones({...x,
      total_marcaciones:m.total_marcaciones,
      primera_marcacion:m.primera_marcacion,
      ultima_marcacion:m.ultima_marcacion,
      recorrido:m.recorrido
    });
  });
  const patron=new Map();
  for(const x of programadasConMarcas)if(!patron.has(texto(x.cedula))&&texto(x.turno))patron.set(texto(x.cedula),x);
  const sueltas=[...marcasPorDia.values()].map(x=>{
    const p=patron.get(texto(x.cedula));
    return {...x,turno:p?.turno||"",turno_2:p?.turno_2||"",hora_inicio:p?.hora_inicio||"",hora_fin:p?.hora_fin||"",
      hora_inicio_2:p?.hora_inicio_2||"",hora_fin_2:p?.hora_fin_2||"",
      programacion_tipo:p?"Probable; solo referencia":"Sin programación",estado_comparacion:"sin_programacion"};
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
  if(faltantes.length||totalFuente!==totalResultado){
    aviso.className="alert alert-danger py-2 small";
    aviso.textContent=`ALERTA DE INTEGRIDAD: Supabase entregó ${totalFuente} marcaciones en ${clavesFuente.size} empleado/día, pero la bandeja conserva ${totalResultado} en ${clavesResultado.size}. No usar para Nómina.`;
    throw new Error(`Control de integridad falló: ${faltantes.length} jornadas con marcaciones quedaron fuera.`);
  }
  aviso.className="alert alert-success py-2 small";
  aviso.textContent=`Integridad verificada: ${totalFuente} marcaciones cargadas en ${clavesFuente.size} combinaciones empleado/día. No se omitieron registros recibidos desde Supabase.`;
}

async function completarBandeja(revisiones,desde,hasta){
  if(!revisiones.length)return [];
  const cedulas=[...new Set(revisiones.map(x=>texto(x.cedula)).filter(Boolean))];
  const empleados=[];
  const marcas=[];
  const fin=new Date(`${hasta}T00:00:00`);fin.setDate(fin.getDate()+1);
  const finExclusivo=iso(fin);
  for(let i=0;i<cedulas.length;i+=80){
    const lote=cedulas.slice(i,i+80);
    const [re,rm]=await Promise.all([
      supabase.from("empleados").select("cedula,nombres,apellidos,cargo,centro_costos,area,codigo").in("cedula",lote),
      supabase.from("biotime_marcaciones").select("emp_code,punch_time,is_attendance").in("emp_code",lote).gte("punch_time",`${desde}T00:00:00`).lt("punch_time",`${finExclusivo}T00:00:00`).order("punch_time")
    ]);
    if(re.error)console.warn("Empleados:",re.error.message);else empleados.push(...(re.data||[]));
    if(rm.error)console.warn("Marcaciones:",rm.error.message);else marcas.push(...(rm.data||[]));
  }
  const porCedula=new Map(empleados.map(x=>[texto(x.cedula),x]));
  const porDia=new Map();
  for(const m of marcas){
    if(m.is_attendance===false)continue;
    const k=`${texto(m.emp_code)}|${texto(m.punch_time).slice(0,10)}`;
    const a=porDia.get(k)||[];a.push(m.punch_time);porDia.set(k,a);
  }
  return revisiones.map(r=>{
    const d=r.detalle||{},e=porCedula.get(texto(r.cedula))||{};
    const a=porDia.get(`${texto(r.cedula)}|${texto(r.fecha).slice(0,10)}`)||[];
    return {...r,
      empleado:`${e.nombres||""} ${e.apellidos||""}`.trim()||r.cedula,
      cargo:e.cargo||"",centro_costos:e.centro_costos||"",area:e.area||"",
      grupo_nombre:r.grupo_codigo==="ALIMENTOS_BEBIDAS"?"Alimentos y Bebidas":r.grupo_codigo,
      turno:d.turno||"",turno_2:d.turno_2||"",hora_inicio:d.hora_inicio||"",hora_fin:d.hora_fin||"",hora_inicio_2:d.hora_inicio_2||"",hora_fin_2:d.hora_fin_2||"",
      horas_programadas_netas:d.horas_programadas_netas??d.horas_programadas,
      horas_reales:d.horas_reales,
      horas_candidatas:r.horas_calculadas,
      primera_marcacion:a[0]||null,ultima_marcacion:a.at(-1)||null,total_marcaciones:a.length,
      revision_id:r.id,estado_revision:r.estado,permite_revision:!["aprobado","rechazado"].includes(estado(r.estado))
    };
  });
}
function poblarAreas(){const actual=$("heArea").value;const areas=[...new Set([...base,...jornadas].map(area))].sort((a,b)=>a.localeCompare(b,"es"));$("heArea").innerHTML='<option value="">Todas</option>'+areas.map(x=>`<option ${x===actual?"selected":""}>${html(x)}</option>`).join("")}
// Fase temporal confirmada: todos los usuarios administrativos autorizados
// pueden revisar el consolidado completo, independientemente de su área base.
function dentroAlcance(){return true}
function filtrados(){const a=$("heArea").value,e=$("heEstado").value,b=texto($("heBuscar").value).toLowerCase();return base.filter(x=>dentroAlcance(x)&&(!a||area(x)===a)&&(!e||estado(x)===e)&&(!b||`${empleado(x)} ${x.cedula||""} ${codigoErp(x)} ${concepto(x)}`.toLowerCase().includes(b)))}
function jornadasFiltradas(){const a=$("heArea").value,b=texto($("heBuscar").value).toLowerCase();return jornadas.filter(x=>(!a||area(x)===a)&&(!b||`${empleado(x)} ${x.cedula||""} ${codigoErp(x)} ${x.turno||""}`.toLowerCase().includes(b)))}
function puedeDecidir(){return true}
function responsableDe(x){return texto(x.responsable_nombre||x.aprobador_nombre||responsables.find(r=>texto(r.proceso_codigo)&&texto(r.proceso_codigo)===texto(x.proceso_codigo))?.responsable_nombre||"Sin asignar")}
function badge(e){return `<span class="he-state he-${html(e)}">${html(e)}</span>`}
function cambiarVista(nueva){vista=nueva;pagina=0;document.querySelectorAll("[data-he-vista]").forEach(b=>{const activa=b.dataset.heVista===vista;b.classList.toggle("active",activa);b.classList.toggle("btn-success",activa);b.classList.toggle("btn-outline-success",!activa)});$("heEstadoWrap").classList.toggle("d-none",vista==="jornadas");render()}
function render(){const conceptos=filtrados(),rows=vista==="jornadas"?jornadasFiltradas():conceptos;$("heKpiRegistros").textContent=rows.length;$("heKpiPendientes").textContent=conceptos.filter(x=>estado(x)==="pendiente").length;$("heKpiAprobados").textContent=conceptos.filter(x=>estado(x)==="aprobado").length;$("heKpiHoras").textContent=conceptos.filter(x=>estado(x)==="aprobado").reduce((s,x)=>s+num(x.horas_aprobadas),0).toFixed(2);renderAreas(conceptos);vista==="jornadas"?renderJornadas(rows):renderTabla(rows)}
function resumenAreas(rows){const map=new Map();for(const x of rows){const a=area(x),o=map.get(a)||{p:0,o:0,a:0,r:new Set()};const e=estado(x);if(e==="pendiente")o.p++;if(e==="observado")o.o++;if(e==="aprobado")o.a++;o.r.add(responsableDe(x));map.set(a,o)}return map}
function renderAreas(rows){const map=resumenAreas(rows);$("heKpiAreas").textContent=[...map.values()].filter(x=>x.p+x.o>0).length;$("heAreasBody").innerHTML=[...map].sort().map(([a,x])=>`<tr class="he-area-row ${x.p+x.o===0?"cerrada":""}"><td><strong>${html(a)}</strong></td><td>${html([...x.r].join(", "))}</td><td>${x.p}</td><td>${x.o}</td><td>${x.a}</td><td>${x.p+x.o?badge("pendiente"):badge("aprobado")}</td></tr>`).join("")||'<tr><td colspan="6" class="text-center text-muted">Sin datos.</td></tr>'}
function renderTabla(rows){$("hePaginacion").classList.add("d-none");$("heHead").innerHTML="<tr><th>Área</th><th>Empleado</th><th>Fecha</th><th>Turno</th><th>Salida real</th><th>Concepto</th><th>Calculadas</th><th>Aprobadas</th><th>Estado</th><th>Responsable</th><th>Acciones</th></tr>";$("heBody").innerHTML=rows.map(x=>`<tr><td>${html(area(x))}</td><td><strong>${html(empleado(x))}</strong><div class="small text-muted">${html(codigoErp(x)||"Sin código ERP")} · ${html(x.cedula||"")}</div></td><td>${html(fechaCorta(x.fecha))}</td><td>${html(x.turno||"")}<div class="small text-muted">${html(hora(x.hora_inicio))}–${html(hora(x.hora_fin))}</div></td><td>${html(hora(x.ultima_marcacion))}</td><td><strong>${html(concepto(x))}</strong><div class="small">${html(x.concepto_nombre||"")}</div></td><td>${horasCalculadas(x).toFixed(2)}</td><td>${horasAprobadas(x)==null?"-":horasAprobadas(x).toFixed(2)}</td><td>${badge(estado(x))}</td><td>${html(responsableDe(x))}</td><td>${puedeDecidir()&&x.permite_revision&&!["aprobado","rechazado"].includes(estado(x))?`<div class="d-flex flex-wrap gap-1"><button class="btn btn-success btn-sm" data-action="aprobar" data-id="${html(x.revision_id)}">Aprobar</button><button class="btn btn-outline-primary btn-sm" data-action="ajustar" data-id="${html(x.revision_id)}">Ajustar</button><button class="btn btn-outline-warning btn-sm" data-action="observar" data-id="${html(x.revision_id)}">Observar</button><button class="btn btn-outline-danger btn-sm" data-action="rechazar" data-id="${html(x.revision_id)}">Rechazar</button></div>`:'<span class="small text-muted">Decisión cerrada</span>'}</td></tr>`).join("")||'<tr><td colspan="11" class="text-center text-muted py-4">No hay resultados.</td></tr>';$("heBody").querySelectorAll("button[data-action]").forEach(b=>b.addEventListener("click",()=>resolver(b.dataset.id,b.dataset.action)))}
function diferenciaLlegada(x){if(!x.primera_marcacion)return "Sin entrada";const m=num(x.minutos_tarde);if(m>0)return `Llegó ${m} min tarde`;if(texto(x.hora_inicio)&&["confirmada","inferida_alta","inferida_media"].includes(texto(x.programacion_tipo).toLowerCase())){const ini=new Date(`${texto(x.fecha).slice(0,10)}T${hora(x.hora_inicio)}:00`),real=new Date(x.primera_marcacion);const antes=Math.max(0,Math.round((ini-real)/60000));return antes?`Llegó ${antes} min antes`:"A tiempo"}return "Sin comparación"}
function diferenciaSalida(x){if(!x.ultima_marcacion)return "Sin salida";const a=num(x.minutos_salida_anticipada),p=num(x.minutos_posteriores_turno);if(a>0)return `Salió ${a} min antes`;if(p>0)return `Salió ${p} min después`;return x.programacion_tipo==="confirmada"?"A tiempo":"Sin comparación"}
function marcasTexto(x){const r=Array.isArray(x.recorrido)?x.recorrido:[];return r.length?r.map(m=>hora(m.hora)).join(", "):`${num(x.total_marcaciones)} marcación(es)`}
function renderJornadas(rows){
  $("heHead").innerHTML="<tr><th>Área</th><th>Empleado</th><th>Fecha</th><th>Turno</th><th>Programado</th><th>Marcaciones</th><th>Entrada</th><th>Salida</th><th>Llegada</th><th>Salida vs. turno</th><th>Estado</th></tr>";
  const totalPaginas=Math.max(1,Math.ceil(rows.length/TAMANO_PAGINA));if(pagina>=totalPaginas)pagina=totalPaginas-1;const desde=pagina*TAMANO_PAGINA,visibles=rows.slice(desde,desde+TAMANO_PAGINA);
  $("heBody").innerHTML=visibles.map(x=>`<tr><td>${html(area(x))}</td><td><strong>${html(empleado(x)||"Sin nombre")}</strong><div class="small text-muted">${html(x.cedula||"")}</div></td><td>${fechaCorta(x.fecha)}</td><td>${html(x.turno||((x.total_marcaciones>0)?"Horario observado; sin turno asignado":"Sin programación"))}<div class="small text-muted">${html(x.programacion_tipo||"")}</div></td><td>${html(hora(x.hora_inicio))}–${html(hora(x.hora_fin))}${x.turno_2?`<div class="small">${html(hora(x.hora_inicio_2))}–${html(hora(x.hora_fin_2))}</div>`:""}</td><td><strong>${num(x.total_marcaciones)}</strong><div class="small text-muted">${html(marcasTexto(x))}</div></td><td>${html(hora(x.primera_marcacion))}</td><td>${html(hora(x.ultima_marcacion))}</td><td>${html(diferenciaLlegada(x))}</td><td>${html(diferenciaSalida(x))}</td><td>${badge(texto(x.estado_comparacion||"sin_programacion"))}</td></tr>`).join("")||'<tr><td colspan="11" class="text-center text-muted py-4">No hay jornadas ni marcaciones para los filtros seleccionados.</td></tr>';
  $("hePaginacion").classList.remove("d-none");$("hePaginaInfo").textContent=`Mostrando ${rows.length?desde+1:0}–${Math.min(desde+TAMANO_PAGINA,rows.length)} de ${rows.length} jornadas · ${catalogo.length} empleados activos`;
  $("heAnterior").disabled=pagina===0;$("heSiguiente").disabled=pagina>=totalPaginas-1;
}
async function resolver(id,accion){
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
  const {error}=await supabase.rpc("resolver_concepto_revision_general_v2",{p_revision_id:id,p_accion:accion,p_horas_aprobadas:h,p_observacion:obs});
  if(error)return alert("No se pudo guardar: "+error.message);await cargar();
}
function filasProsof(rows){return rows.filter(x=>estado(x)==="aprobado").map(x=>({Empleado:codigoErp(x),Concepto:concepto(x),Fecha:texto(x.fecha||x.Fecha).slice(0,10),Dias:"",FechaInici:"",Horas:num(x.horas_aprobadas??x.Horas),Valor:"",LiquidarEnPrima:"N","Centro de costos":texto(x["Centro de costos"]||x.centro_costos||"")}))}
function validarProsof(rows){const errores=[];rows.forEach((x,i)=>{if(!x.Empleado)errores.push(`Fila ${i+2}: empleado sin código PROSOF`);if(!CONCEPTOS.some(c=>c[0]===x.Concepto))errores.push(`Fila ${i+2}: concepto ${x.Concepto||"vacío"} no permitido`);if(!/^\d{4}-\d{2}-\d{2}$/.test(x.Fecha))errores.push(`Fila ${i+2}: fecha inválida`);if(!(x.Horas>0))errores.push(`Fila ${i+2}: horas inválidas`)});return errores}
function hojaProsof(rows){const ws=XLSX.utils.json_to_sheet(rows,{header:HEADERS});ws["!cols"]=[{wch:14},{wch:12},{wch:12},{wch:8},{wch:12},{wch:10},{wch:10},{wch:18},{wch:18}];for(let r=2;r<=rows.length+1;r++){if(ws[`A${r}`])ws[`A${r}`].t="s";if(ws[`B${r}`])ws[`B${r}`].t="s";const d=rows[r-2].Fecha.split("-").map(Number);ws[`C${r}`]={t:"d",v:new Date(d[0],d[1]-1,d[2]),z:"mm-dd-yy"};if(ws[`F${r}`])ws[`F${r}`].z="#,##0.00"}return ws}
function hojaConceptos(){return XLSX.utils.aoa_to_sheet([["",""],["",""],...CONCEPTOS])}
function descargarProsof(){if(!window.XLSX)return alert("No se cargó el componente Excel.");const rows=filasProsof(filtrados()),errores=validarProsof(rows);if(!rows.length)return alert("No hay conceptos aprobados para exportar.");if(errores.length)return alert(`No se generó el archivo porque debe corregirse:\n\n${errores.slice(0,12).join("\n")}`);const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,hojaProsof(rows),"Hoja1");XLSX.utils.book_append_sheet(wb,hojaConceptos(),"conceptos");XLSX.writeFile(wb,`NOMINA_EXTRAS_${$("heDesde").value}_${$("heHasta").value}.xls`,{bookType:"biff8"})}
function descargarRevision(){if(!window.XLSX)return alert("No se cargó el componente Excel.");const rows=filtrados(),js=jornadasFiltradas(),wb=XLSX.utils.book_new();const asistencia=js.map(x=>({Área:area(x),Empleado:empleado(x),Cédula:x.cedula||"","Código PROSOF":codigoErp(x),Fecha:texto(x.fecha).slice(0,10),Turno:x.turno||"Sin programación","Tipo programación":x.programacion_tipo||"","Inicio programado":hora(x.hora_inicio),"Salida programada":hora(x.hora_fin),"Total marcaciones":num(x.total_marcaciones),Marcaciones:marcasTexto(x),"Entrada real":hora(x.primera_marcacion),"Salida real":hora(x.ultima_marcacion),Llegada:diferenciaLlegada(x),"Salida vs turno":diferenciaSalida(x),"Estado comparación":x.estado_comparacion||""}));XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(asistencia),"Jornadas y marcaciones");const detalle=rows.map(x=>({Área:area(x),Empleado:empleado(x),Cédula:x.cedula||"","Código PROSOF":codigoErp(x),Fecha:texto(x.fecha).slice(0,10),Turno:x.turno||"","Inicio programado":hora(x.hora_inicio),"Salida programada":hora(x.hora_fin),"Salida real":hora(x.ultima_marcacion),Concepto:concepto(x),"Horas calculadas":horasCalculadas(x),"Horas aprobadas":horasAprobadas(x),Estado:estado(x),Responsable:responsableDe(x),Observación:x.observacion||""}));XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(detalle),"Conceptos para aprobación");const areas=[];for(const [a,x] of resumenAreas(rows))areas.push({Área:a,Responsable:[...x.r].join(", "),Pendientes:x.p,Observados:x.o,Aprobados:x.a,Estado:x.p+x.o?"PENDIENTE":"CERRADO"});XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(areas),"Estado por área");XLSX.utils.book_append_sheet(wb,hojaProsof(filasProsof(rows)),"Aprobados PROSOF");XLSX.utils.book_append_sheet(wb,hojaConceptos(),"conceptos");XLSX.writeFile(wb,`REVISION_NOMINA_COMPLETA_${$("heDesde").value}_${$("heHasta").value}.xlsx`)}
