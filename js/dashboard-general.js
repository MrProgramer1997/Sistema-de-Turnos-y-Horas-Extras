import { supabase } from "../supabase/supabaseClient.js";

const REPETIDA_MIN = 5;
const HOY = fechaIso(new Date());
let empleadosHoy=[], areasHoy=[], cumplimiento=[], diasIngreso=[], diasAnterior=[];
let recorridos=[], auditoria=[], personalAyb=[], novedades=[], charts={};

const $=id=>document.getElementById(id);
const text=(id,v)=>{if($(id))$(id).textContent=v??""};
const esc=v=>String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");
const norm=v=>String(v??"").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
const key=(cedula,fecha)=>`${cedula||""}|${String(fecha||"").slice(0,10)}`;

function fechaIso(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`}
function fechaTxt(v){if(!v)return "—";return new Date(`${String(v).slice(0,10)}T00:00:00`).toLocaleDateString("es-CO",{day:"2-digit",month:"short",year:"numeric"})}
function hora(v){const m=String(v??"").match(/(\d{2}:\d{2})(?::\d{2})?/);return m?m[1]:"—"}
function mins(v){const m=String(v??"").match(/(\d{2}):(\d{2})/);return m?Number(m[1])*60+Number(m[2]):null}
function numero(v,d=1){return Number(v||0).toLocaleString("es-CO",{minimumFractionDigits:d,maximumFractionDigits:d})}
function rango(){return{desde:$("filtroFechaDesde")?.value||HOY,hasta:$("filtroFechaHasta")?.value||HOY}}
function area(x){return x.proceso_nombre||x.grupo_nombre||x.area_operativa||x.area||x.centro_costos||x.area_ultima_marcacion||x.area_primera_marcacion||x.area_biometrico||"Sin clasificar"}
function punto(x){return x.area_biometrico||x.terminal_alias||"Punto sin identificar"}
function cedula(x){return String(x.cedula||x.documento||x.numero_documento||x.emp_code||"").trim()}
function nombre(x){return x.empleado||x.nombre_empleado||x.nombre_completo||x.nombre||x.colaborador||cedula(x)||"Sin identificar"}
function sesion(){try{return JSON.parse(localStorage.getItem("ccp_sesion")||"null")}catch{return null}}

function iniciarUsuario(){const s=sesion();if(!s){location.href="login.html";return false}text("nombreUsuario",s.nombre_completo||`${s.nombres||""} ${s.apellidos||""}`.trim()||s.usuario||"Usuario");text("rolUsuario",s.rol||"Sin rol");text("fechaDashboard",new Date().toLocaleDateString("es-CO",{weekday:"long",year:"numeric",month:"long",day:"numeric"}));return true}
function iniciarRango(){const h=new Date(),d=new Date(h);d.setDate(h.getDate()-6);$("filtroFechaDesde").value=fechaIso(d);$("filtroFechaHasta").value=fechaIso(h)}
function rangoAnterior(r){const a=new Date(`${r.desde}T00:00:00`),b=new Date(`${r.hasta}T00:00:00`),dias=Math.round((b-a)/86400000)+1;const fin=new Date(a);fin.setDate(fin.getDate()-1);const ini=new Date(fin);ini.setDate(ini.getDate()-dias+1);return{desde:fechaIso(ini),hasta:fechaIso(fin)}}

async function consultaSegura(nombreConsulta,promesa,obligatoria=false){const resultado=await promesa;if(resultado.error){console.warn(`${nombreConsulta}:`,resultado.error);if(obligatoria)throw new Error(`${nombreConsulta}: ${resultado.error.message}`);return[]}return resultado.data||[]}

async function cargar(){
  text("ultimaActualizacion","Actualizando…");
  const r=rango(),ant=rangoAnterior(r);
  const resultados=await Promise.all([
    consultaSegura("Marcaciones de hoy",supabase.from("vw_centro_control_salidas_hoy").select("*").order("primera_marcacion"),true),
    consultaSegura("Áreas de hoy",supabase.from("vw_centro_control_areas_hoy").select("*").order("area_operativa")),
    consultaSegura("Cumplimiento",supabase.from("vw_centro_control_cumplimiento_semanal").select("*").lte("semana_inicio",r.hasta).gte("semana_fin",r.desde)),
    consultaSegura("Movimiento actual",supabase.from("vw_centro_control_dias_mayor_ingreso").select("*").gte("fecha",r.desde).lte("fecha",r.hasta).order("fecha")),
    consultaSegura("Movimiento anterior",supabase.from("vw_centro_control_dias_mayor_ingreso").select("*").gte("fecha",ant.desde).lte("fecha",ant.hasta).order("fecha")),
    consultaSegura("Recorridos",supabase.from("vw_asistencia_recorrido_frontend").select("*").gte("fecha",r.desde).lte("fecha",r.hasta).order("fecha").order("punch_time").limit(10000)),
    consultaSegura("Auditoría",supabase.from("vw_centro_control_auditoria_semanal").select("*").gte("fecha",r.desde).lte("fecha",r.hasta).order("fecha")),
    consultaSegura("Personal AyB",supabase.from("vw_ayb_personal_disponible").select("*").eq("agregado_ayb",true)),
    consultaSegura("Novedades",supabase.from("programacion_turnos").select("*").gte("fecha",r.desde).lte("fecha",r.hasta).order("fecha"))
  ]);
  [empleadosHoy,areasHoy,cumplimiento,diasIngreso,diasAnterior,recorridos,auditoria,personalAyb,novedades]=resultados;
  procesarSalidasSinPerderBase();poblarAreas();renderTodo();
  text("ultimaActualizacion",`Actualizado ${new Date().toLocaleTimeString("es-CO",{hour:"2-digit",minute:"2-digit"})}`);
}

function gruposRecorrido(){
  const mapa=new Map();
  recorridos.forEach(e=>{const k=key(cedula(e),e.fecha);if(!mapa.has(k))mapa.set(k,[]);mapa.get(k).push({...e,marca_repetida:false})});
  mapa.forEach(eventos=>{eventos.sort((a,b)=>String(a.punch_time||a.hora_marcacion).localeCompare(String(b.punch_time||b.hora_marcacion)));let ultima=null;eventos.forEach(e=>{if(!ultima){ultima=e;return}const dif=(new Date(e.punch_time)-new Date(ultima.punch_time))/60000;if(norm(punto(e))===norm(punto(ultima))&&dif>=0&&dif<=REPETIDA_MIN)e.marca_repetida=true;else ultima=e})});
  return mapa;
}

function procesarSalidasSinPerderBase(){
  const grupos=gruposRecorrido();
  const turnosHoy=new Map(auditoria.filter(x=>String(x.fecha).slice(0,10)===HOY).map(x=>[cedula(x),x]));
  const ahora=new Date().getHours()*60+new Date().getMinutes();
  empleadosHoy=empleadosHoy.map(base=>{
    const eventos=grupos.get(key(cedula(base),HOY));
    if(!eventos?.length)return{...base,marcas_repetidas:0,total_marcaciones_validas:Number(base.total_marcaciones||0),fuente_salida:"vista_base"};
    const validas=eventos.filter(x=>!x.marca_repetida),primera=validas[0]?.punch_time||base.primera_marcacion,ultima=validas.at(-1)?.punch_time||base.ultima_marcacion;
    const turno=turnosHoy.get(cedula(base)),fin=mins(turno?.hora_fin),ultimaM=mins(ultima);
    const puedeConfirmar=Boolean(turno)&&validas.length>1&&fin!==null&&(ahora>=fin||ultimaM>=fin);
    return{...base,primera_marcacion:primera,ultima_marcacion:puedeConfirmar?ultima:null,salida_registrada:puedeConfirmar,total_marcaciones_validas:validas.length,marcas_repetidas:eventos.length-validas.length,ultima_marca_provisional:!puedeConfirmar&&validas.length>1?ultima:null,turno_programado:turno||null,fuente_salida:"recorrido_turno"};
  });
}

function coincide(x){const a=$("filtroAreaGeneral")?.value||"",q=norm($("filtroEmpleadoGeneral")?.value||"");if(a&&!norm(area(x)).includes(norm(a)))return false;if(q&&!norm(`${nombre(x)} ${cedula(x)} ${x.cargo||""}`).includes(q))return false;return true}
function poblarAreas(){const s=$("filtroAreaGeneral"),actual=s.value;const lista=[...new Set([...empleadosHoy,...auditoria,...novedades].map(area).filter(x=>x&&x!=="Sin clasificar"))].sort();s.innerHTML='<option value="">Todos</option>'+lista.map(x=>`<option>${esc(x)}</option>`).join("");if(lista.includes(actual))s.value=actual}
function aybSet(){return new Set(personalAyb.map(cedula).filter(Boolean))}
function jornadasAyb(){const set=aybSet();return auditoria.filter(x=>set.has(cedula(x))&&coincide(x))}
function comparablesAyb(){return jornadasAyb().filter(x=>mins(x.hora_inicio)!==null&&mins(x.primera_marcacion)!==null)}

function renderKpis(){
  const hoyFiltrados=empleadosHoy.filter(coincide),jornadas=jornadasAyb(),comparables=comparablesAyb();
  const programadas=jornadas.filter(x=>x.hora_inicio||Number(x.horas_programadas_netas)>0),asistidas=programadas.filter(x=>x.primera_marcacion),puntuales=comparables.filter(x=>mins(x.primera_marcacion)<=mins(x.hora_inicio));
  text("kpiEmpleados",new Set(hoyFiltrados.map(cedula).filter(Boolean)).size);
  text("kpiAsistencia",programadas.length?`${numero(asistidas.length/programadas.length*100,1)}%`:"—");text("hintAsistencia",programadas.length?`${asistidas.length} de ${programadas.length} jornadas`:"No calculable con los datos disponibles");
  text("kpiPuntualidad",comparables.length?`${numero(puntuales.length/comparables.length*100,1)}%`:"—");text("hintPuntualidad",comparables.length?`${puntuales.length} de ${comparables.length} entradas`:"No hay jornadas comparables");
  text("kpiEnCurso",hoyFiltrados.filter(x=>!x.salida_registrada).length);text("kpiSalidas",hoyFiltrados.filter(x=>x.salida_registrada).length);
  const repetidas=[...gruposRecorrido().values()].flat().filter(x=>x.marca_repetida).length,incompletas=hoyFiltrados.filter(x=>!x.salida_registrada).length,tardias=comparables.filter(x=>mins(x.primera_marcacion)>mins(x.hora_inicio)).length;
  text("kpiAlertasAltas",repetidas+incompletas+tardias);text("kpiAreas",`${new Set(hoyFiltrados.map(area)).size} áreas`);
}

function renderHoy(){
  const filas=empleadosHoy.filter(coincide);text("contadorEmpleadosFiltrados",`${filas.length} resultados`);
  $("tablaAreasReal").innerHTML=areasHoy.length?areasHoy.map(x=>`<tr><td><strong>${esc(x.area_operativa)}</strong></td><td>${x.empleados||0}</td><td>${x.marcaciones||0}</td><td>${x.jornadas_en_curso||0}</td></tr>`).join(""):'<tr><td colspan="4" class="text-center text-muted">Sin actividad hoy.</td></tr>';
  $("tablaEmpleadosReal").innerHTML=filas.length?filas.map(x=>{const estado=x.salida_registrada?'<span class="cc-badge cc-ok">Salida confirmada</span>':x.ultima_marca_provisional?`<span class="cc-badge cc-info">Provisional ${hora(x.ultima_marca_provisional)}</span>`:x.marcas_repetidas?'<span class="cc-badge cc-warn">Abierta · repetición</span>':'<span class="cc-badge cc-warn">Jornada abierta</span>';return`<tr><td><strong>${esc(nombre(x))}</strong><div class="cc-muted">${esc(cedula(x))} · ${esc(x.cargo||"")}</div></td><td>${esc(area(x))}</td><td>${hora(x.primera_marcacion)}</td><td>${x.salida_registrada?hora(x.ultima_marcacion):"—"}</td><td>${x.total_marcaciones_validas??x.total_marcaciones??0}${x.marcas_repetidas?` <small class="text-warning">+${x.marcas_repetidas} rep.</small>`:""}</td><td>${estado}</td></tr>`}).join(""):'<tr><td colspan="6" class="text-center text-muted">Sin resultados.</td></tr>';
}

function resumenPuntualidad(){
  const mapa=new Map();comparablesAyb().forEach(j=>{const id=cedula(j);if(!mapa.has(id))mapa.set(id,{cedula:id,empleado:nombre(j),area:area(j),programadas:0,tempranas:0,exactas:0,tardias:0,minTarde:0,salidas:0,minSalida:0});const m=mapa.get(id),d=mins(j.primera_marcacion)-mins(j.hora_inicio);m.programadas++;if(d<0)m.tempranas++;else if(d===0)m.exactas++;else{m.tardias++;m.minTarde+=d}const f=mins(j.hora_fin),s=mins(j.ultima_marcacion);if(f!==null&&s!==null&&s<f){m.salidas++;m.minSalida+=f-s}});return[...mapa.values()]}
function renderPuntualidad(){
  const lista=resumenPuntualidad().sort((a,b)=>b.tardias-a.tardias||b.minTarde-a.minTarde),total=lista.reduce((s,x)=>s+x.programadas,0);text("contadorJornadasComparables",`${total} jornadas`);
  const click=x=>`onclick="window.abrirDetallePuntualidad('${esc(x.cedula)}','${esc(x.empleado)}')" style="cursor:pointer"`;
  $("tablaPuntualidadGeneral").innerHTML=lista.length?lista.map(x=>`<tr ${click(x)}><td><strong>${esc(x.empleado)}</strong><div class="cc-muted">${esc(x.area)}</div></td><td>${x.programadas}</td><td>${x.tempranas}</td><td>${x.exactas}</td><td>${x.tardias}</td><td>${x.minTarde}</td></tr>`).join(""):'<tr><td colspan="6" class="text-center text-muted">No calculable con los datos disponibles.</td></tr>';
  const tard=lista.filter(x=>x.tardias).slice(0,8),sal=[...lista].filter(x=>x.salidas).sort((a,b)=>b.salidas-a.salidas||b.minSalida-a.minSalida).slice(0,8);
  $("tablaTardanzas").innerHTML=tard.length?tard.map(x=>`<tr ${click(x)}><td>${esc(x.empleado)}</td><td>${x.tardias}</td><td>${x.minTarde}</td></tr>`).join(""):'<tr><td colspan="3" class="text-center text-muted">Sin tardanzas.</td></tr>';
  $("tablaSalidasAnticipadas").innerHTML=sal.length?sal.map(x=>`<tr ${click(x)}><td>${esc(x.empleado)}</td><td>${x.salidas}</td><td>${x.minSalida}</td></tr>`).join(""):'<tr><td colspan="3" class="text-center text-muted">Sin casos calculables.</td></tr>';
}

function renderTrayectos(){
  const grupos=[...gruposRecorrido().values()].filter(g=>g.length&&coincide(g[0])),rep=grupos.flat().filter(x=>x.marca_repetida).length; text("contadorMarcasRepetidas",`${rep} repetida${rep===1?"":"s"}`);
  $("resumenTrayectos").innerHTML=[["Jornadas",grupos.length],["Marcas",grupos.flat().length],["Repetidas",rep],["Con recorrido",grupos.filter(g=>g.filter(x=>!x.marca_repetida).length>1).length]].map(([a,b])=>`<div class="cc-mini"><span>${a}</span><strong>${b}</strong></div>`).join("");
  $("tablaTrayectos").innerHTML=grupos.length?grupos.sort((a,b)=>String(b[0].fecha).localeCompare(String(a[0].fecha))).map(g=>{const validas=g.filter(x=>!x.marca_repetida),repetidas=g.length-validas.length,camino=g.map((x,i)=>`${i?'<span class="cc-arrow">→</span>':""}<span class="cc-point ${x.marca_repetida?"repetida":""}">${hora(x.punch_time||x.hora_marcacion)} · ${esc(punto(x))}</span>`).join("");return`<tr><td>${fechaTxt(g[0].fecha)}</td><td><strong>${esc(nombre(g[0]))}</strong></td><td><div class="cc-trayecto">${camino}</div></td><td>${validas.length}</td><td>${repetidas}</td><td><span class="cc-badge ${validas.length>1?"cc-ok":"cc-info"}">${validas.length>1?"Recorrido":"Una marca"}</span></td></tr>`}).join(""):'<tr><td colspan="6" class="text-center text-muted">No hay recorridos para el período.</td></tr>';
}

function renderCumplimiento(){const lista=cumplimiento.filter(coincide),cumplen=lista.filter(x=>x.estado_cumplimiento==="cumplio").length;text("kpiCumplimientoResumen",`${cumplen} cumplen · ${lista.length} evaluados`);$("tablaCumplimientoSemanal").innerHTML=lista.length?lista.map(x=>{const dif=Number(x.horas_reales_consolidadas||0)-Number(x.horas_programadas_netas||0),estado=x.estado_cumplimiento==="datos_incompletos"?'<span class="cc-badge cc-warn">Datos incompletos</span>':x.estado_cumplimiento==="cumplio"?'<span class="cc-badge cc-ok">Cumplió</span>':'<span class="cc-badge cc-bad">Por revisar</span>';return`<tr><td><strong>${esc(nombre(x))}</strong></td><td>${fechaTxt(x.semana_inicio)} – ${fechaTxt(x.semana_fin)}</td><td>${numero(x.horas_programadas_netas)}</td><td>${numero(x.horas_reales_consolidadas)}</td><td>${numero(x.porcentaje_cumplimiento)}%</td><td>${dif>0?"+":""}${numero(dif)}</td><td>${estado}</td><td><button class="btn btn-outline-secondary btn-sm" onclick="window.abrirAuditoriaSemanal('${esc(cedula(x))}','${esc(x.semana_inicio)}','${esc(x.semana_fin)}','${esc(nombre(x))}')">Abrir</button></td></tr>`}).join(""):'<tr><td colspan="8" class="text-center text-muted">No hay semanas comparables.</td></tr>'}

function tipoNovedad(x){const t=norm(`${x.novedad_codigo||""} ${x.novedad||""} ${x.tipo_novedad||""} ${x.tipo_registro||""} ${x.observacion||""}`);if(t.includes("incap"))return"Incapacidad";if(t.includes("vacac"))return"Vacaciones";if(t.includes("perm")||t.includes("licen"))return"Permiso/licencia";if(t.includes("descanso")||t.includes("libre"))return"Descanso";return"Otra novedad"}
function esNovedad(x){return norm(x.tipo_registro).includes("novedad")||Boolean(x.novedad_codigo||x.tipo_novedad||x.novedad)}
function fechaFinNovedad(x){return String(x.fecha_fin||x.hasta||x.fecha||"").slice(0,10)}
function diasNovedad(x){const a=new Date(`${String(x.fecha||"").slice(0,10)}T00:00:00`),b=new Date(`${fechaFinNovedad(x)}T00:00:00`);return Number.isNaN(a.getTime())||Number.isNaN(b.getTime())?1:Math.max(1,Math.round((b-a)/86400000)+1)}
function renderNovedades(){
  const lista=novedades.filter(esNovedad).filter(coincide),conteos={"Incapacidad":0,"Vacaciones":0,"Permiso/licencia":0,"Descanso":0,"Otra novedad":0};lista.forEach(x=>conteos[tipoNovedad(x)]++);
  $("resumenNovedades").innerHTML=Object.entries(conteos).slice(0,4).map(([k,v])=>`<div class="cc-mini"><span>${k}</span><strong>${v}</strong></div>`).join("");
  $("tablaNovedadesActivas").innerHTML=lista.length?lista.slice(0,100).map(x=>`<tr><td><strong>${esc(nombre(x))}</strong><div class="cc-muted">${esc(cedula(x))}</div></td><td>${esc(area(x))}</td><td>${esc(tipoNovedad(x))}</td><td>${fechaTxt(x.fecha)}</td><td>${fechaTxt(fechaFinNovedad(x))}</td><td><span class="cc-badge cc-info">Registrada</span></td></tr>`).join(""):'<tr><td colspan="6" class="text-center text-muted">No hay novedades registradas en el período.</td></tr>';
  const criticas=lista.filter(x=>diasNovedad(x)>=5);$("tablaNovedadesCriticas").innerHTML=criticas.length?criticas.map(x=>`<tr><td>${esc(nombre(x))}</td><td>${esc(tipoNovedad(x))}</td><td>${diasNovedad(x)} días</td><td>Duración de 5 días o más; requiere revisión de contexto.</td></tr>`).join(""):'<tr><td colspan="4" class="text-center text-muted">Sin novedades de 5 días o más.</td></tr>';
  crearGrafica("graficaNovedades","doughnut",Object.keys(conteos),[{data:Object.values(conteos),backgroundColor:["#b84d4d","#315fbd","#d49028","#25845b","#819087"]}]);
}

function crearGrafica(id,tipo,labels,datasets,extra={}){if(!$(id)||typeof Chart==="undefined")return;charts[id]?.destroy();charts[id]=new Chart($(id),{type:tipo,data:{labels,datasets},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:"index",intersect:false},plugins:{legend:{position:"bottom",labels:{boxWidth:11,font:{size:10}}}},scales:tipo==="doughnut"?undefined:{x:{grid:{display:false}},y:{beginAtZero:true,grid:{color:"#edf1ef"}}},...extra}})}
function renderGraficas(){
  const dias=[...diasIngreso].sort((a,b)=>String(a.fecha).localeCompare(String(b.fecha)));crearGrafica("graficaMovimientoDiario","line",dias.map(x=>fechaTxt(x.fecha)),[{label:"Personas",data:dias.map(x=>Number(x.empleados_con_marcacion||0)),borderColor:"#23835b",backgroundColor:"#23835b20",fill:true,tension:.3},{label:"Marcaciones",data:dias.map(x=>Number(x.total_marcaciones||0)),borderColor:"#315fbd",tension:.3}]);
  const j=comparablesAyb(),tem=j.filter(x=>mins(x.primera_marcacion)<mins(x.hora_inicio)).length,exact=j.filter(x=>mins(x.primera_marcacion)===mins(x.hora_inicio)).length,tarde=j.length-tem-exact;crearGrafica("graficaPuntualidad","doughnut",["Tempranas","Hora exacta","Tardías"],[{data:[tem,exact,tarde],backgroundColor:["#25845b","#315fbd","#c95555"]}]);
  const puntos=new Map();recorridos.filter(coincide).forEach(x=>puntos.set(punto(x),(puntos.get(punto(x))||0)+1));const top=[...puntos].sort((a,b)=>b[1]-a[1]).slice(0,10);crearGrafica("graficaPuntos","bar",top.map(x=>x[0]),[{label:"Marcaciones",data:top.map(x=>x[1]),backgroundColor:"#257254"}],{indexAxis:"y"});
  const semana=["domingo","lunes","martes","miércoles","jueves","viernes","sábado"],agg=semana.map(()=>({t:0,n:0}));dias.forEach(x=>{const i=new Date(`${x.fecha}T00:00:00`).getDay();agg[i].t+=Number(x.empleados_con_marcacion||0);agg[i].n++});crearGrafica("graficaDiasSemana","bar",semana.map(x=>x[0].toUpperCase()+x.slice(1)),[{label:"Promedio de personas",data:agg.map(x=>x.n?Number((x.t/x.n).toFixed(1)):0),backgroundColor:"#315fbd"}]);
}

function renderResumen(){
  const topDia=[...diasIngreso].sort((a,b)=>Number(b.empleados_con_marcacion)-Number(a.empleados_con_marcacion))[0],topArea=[...areasHoy].sort((a,b)=>Number(b.marcaciones)-Number(a.marcaciones))[0];const puntos=new Map();recorridos.forEach(x=>puntos.set(punto(x),(puntos.get(punto(x))||0)+1));const topPunto=[...puntos].sort((a,b)=>b[1]-a[1])[0];const rep=[...gruposRecorrido().values()].flat().filter(x=>x.marca_repetida).length;
  $("resumenAnalitico").innerHTML=[["Día con mayor ingreso",topDia?fechaTxt(topDia.fecha):"No calculable"],["Área más activa",topArea?.area_operativa||"No calculable"],["Punto más usado",topPunto?.[0]||"No calculable"],["Marcas repetidas",rep]].map(([a,b])=>`<div class="cc-mini"><span>${a}</span><strong>${esc(b)}</strong></div>`).join("");
  const insights=[];if(topDia)insights.push(`Mayor ingreso: <strong>${fechaTxt(topDia.fecha)}</strong>, con <strong>${topDia.empleados_con_marcacion}</strong> personas.`);if(topArea)insights.push(`<strong>${esc(topArea.area_operativa)}</strong> registró el mayor movimiento de hoy: <strong>${topArea.marcaciones}</strong> marcas.`);if(rep)insights.push(`Se conservaron <strong>${rep}</strong> repeticiones en el mismo punto dentro de 5 minutos; no se usaron como salida.`);const comp=comparablesAyb(),tarde=comp.filter(x=>mins(x.primera_marcacion)>mins(x.hora_inicio)).length;if(comp.length)insights.push(`AyB: <strong>${tarde}</strong> de <strong>${comp.length}</strong> entradas comparables fueron posteriores al turno.`);if(!insights.length)insights.push("No hay datos suficientes para generar insights verificables.");$("insightsAutomaticos").innerHTML=insights.map(x=>`<div class="cc-insight">${x}</div>`).join("");
}

function renderTendencias(){
  const actual=diasIngreso.reduce((s,x)=>s+Number(x.total_marcaciones||0),0),anterior=diasAnterior.reduce((s,x)=>s+Number(x.total_marcaciones||0),0),dif=actual-anterior,pct=anterior?dif/anterior*100:null;$("comparativoPeriodo").innerHTML=`<div class="cc-mini mb-2"><span>Marcaciones actuales</span><strong>${actual}</strong></div><div class="cc-mini mb-2"><span>Período anterior</span><strong>${anterior||"No calculable"}</strong></div><div class="cc-mini"><span>Variación</span><strong>${pct===null?"No calculable":`${dif>=0?"+":""}${numero(pct)}%`}</strong></div>`;
  const asistencia=new Map();recorridos.filter(x=>!x.marca_repetida&&coincide(x)).forEach(x=>{const id=cedula(x);if(!id)return;if(!asistencia.has(id))asistencia.set(id,{empleado:nombre(x),area:area(x),dias:new Set});asistencia.get(id).dias.add(String(x.fecha).slice(0,10))});const prog=new Map();jornadasAyb().forEach(x=>{const id=cedula(x);prog.set(id,(prog.get(id)||0)+1)});const ranking=[...asistencia].map(([id,x])=>({...x,cedula:id,total:x.dias.size,programados:prog.get(id)||0})).sort((a,b)=>b.total-a.total).slice(0,15);$("tablaMasAsistencia").innerHTML=ranking.length?ranking.map(x=>`<tr><td>${esc(x.empleado)}</td><td>${esc(x.area)}</td><td><strong>${x.total}</strong></td><td>${x.programados?`${numero(x.total/x.programados*100)}%`:"No calculable"}</td></tr>`).join(""):'<tr><td colspan="4" class="text-center text-muted">No hay datos.</td></tr>';
  const rep=[...gruposRecorrido().values()].flat().filter(x=>x.marca_repetida).length,incompletas=empleadosHoy.filter(x=>!x.salida_registrada).length,sinId=recorridos.filter(x=>!cedula(x)||nombre(x)==="Sin identificar").length,sinTurno=empleadosHoy.filter(x=>!x.turno_programado).length;const filas=[["Marcas repetidas",rep],["Jornadas sin salida confirmada",incompletas],["Marcaciones sin identidad",sinId],["Personas sin turno comparable",sinTurno]];text("nivelConfiabilidadDatos",filas.some(x=>x[1])?"Requiere revisión":"Sin hallazgos");$("tablaCalidadDatos").innerHTML=filas.map(([a,b])=>`<tr><td>${a}</td><td>${b}</td><td><span class="cc-badge ${b?"cc-warn":"cc-ok"}">${b?"Revisar":"Correcto"}</span></td></tr>`).join("");
}

function renderTodo(){renderKpis();renderHoy();renderPuntualidad();renderTrayectos();renderCumplimiento();renderNovedades();renderGraficas();renderResumen();renderTendencias()}
function tablaPersonas(lista){return`<div class="table-responsive"><table class="table cc-table"><thead><tr><th>Empleado</th><th>Área</th><th>Entrada</th><th>Salida válida</th><th>Estado</th></tr></thead><tbody>${lista.map(x=>`<tr><td><strong>${esc(nombre(x))}</strong><div class="cc-muted">${esc(cedula(x))}</div></td><td>${esc(area(x))}</td><td>${hora(x.primera_marcacion)}</td><td>${x.salida_registrada?hora(x.ultima_marcacion):"—"}</td><td>${x.salida_registrada?"Confirmada":"Por revisar"}</td></tr>`).join("")}</tbody></table></div>`}
function detalleKpi(tipo){const base=empleadosHoy.filter(coincide);let titulo="Detalle",contenido="";if(tipo==="personas"){titulo="Personas con marcación";contenido=tablaPersonas(base)}if(tipo==="abiertas"){titulo="Jornadas sin salida confirmada";contenido=tablaPersonas(base.filter(x=>!x.salida_registrada))}if(tipo==="salidas"){titulo="Salidas confirmadas";contenido=tablaPersonas(base.filter(x=>x.salida_registrada))}if(tipo==="puntualidad"||tipo==="asistencia"){titulo="Puntualidad y asistencia programada AyB";contenido='<p>Abre la pestaña <strong>Puntualidad</strong> para consultar cada jornada y su horario real.</p>'}if(tipo==="alertas"){titulo="Alertas para revisión";contenido='<p>Las alertas reúnen jornadas abiertas, tardanzas y marcas repetidas. No constituyen sanción ni aprobación automática.</p>'}text("detalleControlTitulo",titulo);text("detalleControlSubtitulo",`${fechaTxt(rango().desde)} – ${fechaTxt(rango().hasta)}`);$("detalleControlContenido").innerHTML=contenido||'<div class="alert alert-info">Sin detalle.</div>';bootstrap.Modal.getOrCreateInstance($("modalDetalleControl")).show()}

window.abrirDetallePuntualidad=async(c,n)=>{const r=rango(),tabla=$("tablaPuntualidadEmpleado");text("puntualidadEmpleadoTitulo",`Puntualidad · ${n}`);text("puntualidadEmpleadoSubtitulo",`${fechaTxt(r.desde)} – ${fechaTxt(r.hasta)}`);bootstrap.Modal.getOrCreateInstance($("modalPuntualidadEmpleado")).show();const{data,error}=await supabase.from("vw_centro_control_auditoria_semanal").select("*").eq("cedula",c).gte("fecha",r.desde).lte("fecha",r.hasta).order("fecha");if(error){tabla.innerHTML=`<tr><td colspan="7" class="text-danger">${esc(error.message)}</td></tr>`;return}tabla.innerHTML=(data||[]).map(x=>{const i=mins(x.hora_inicio),e=mins(x.primera_marcacion),d=i!==null&&e!==null?e-i:null,estado=d===null?"No calculable":d<0?"Llegó temprano":d===0?"Hora exacta":"Llegó tarde",dif=d===null?"No calculable":d===0?"0 min":d>0?`${d} min tarde`:`${Math.abs(d)} min temprano`;return`<tr><td>${fechaTxt(x.fecha)}</td><td>${esc(x.turno||"—")}</td><td>${esc(x.hora_inicio||"—")}–${esc(x.hora_fin||"—")}</td><td>${hora(x.primera_marcacion)}</td><td>${dif}</td><td>${hora(x.ultima_marcacion)}</td><td>${estado}</td></tr>`}).join("")||'<tr><td colspan="7">No calculable con los datos disponibles.</td></tr>'};
window.abrirAuditoriaSemanal=async(c,d,h,n)=>{const tabla=$("tablaAuditoriaSemanal");text("auditoriaSubtitulo",`${n} · ${fechaTxt(d)} – ${fechaTxt(h)}`);bootstrap.Modal.getOrCreateInstance($("modalAuditoriaSemanal")).show();const{data,error}=await supabase.from("vw_centro_control_auditoria_semanal").select("*").eq("cedula",c).gte("fecha",d).lte("fecha",h).order("fecha");if(error){tabla.innerHTML=`<tr><td colspan="9">${esc(error.message)}</td></tr>`;return}tabla.innerHTML=(data||[]).map(x=>`<tr><td>${fechaTxt(x.fecha)}</td><td>${esc(x.turno||"—")}</td><td>${numero(x.horas_programadas_netas)}</td><td>${x.horas_reales_pareadas==null?"—":numero(x.horas_reales_pareadas)}</td><td>${hora(x.primera_marcacion)}</td><td>${hora(x.ultima_marcacion)}</td><td>${esc(x.estado_comparacion||"—")}</td><td>${x.total_alertas||0}</td><td>${numero(x.horas_conceptos_aprobadas||0)}</td></tr>`).join("")};

function eventos(){$("btnActualizarDashboard")?.addEventListener("click",()=>cargar().catch(mostrarError));$("btnAplicarFiltros")?.addEventListener("click",()=>cargar().catch(mostrarError));$("filtroAreaGeneral")?.addEventListener("change",renderTodo);$("filtroEmpleadoGeneral")?.addEventListener("input",renderTodo);document.querySelectorAll("[data-kpi]").forEach(x=>x.addEventListener("click",()=>detalleKpi(x.dataset.kpi)));document.querySelectorAll('[data-bs-toggle="pill"]').forEach(x=>x.addEventListener("shown.bs.tab",()=>Object.values(charts).forEach(c=>c.resize())))}
function mostrarError(e){console.error(e);text("ultimaActualizacion","Error al actualizar");alert(`No fue posible cargar el Centro de Control: ${e.message||e}`)}
document.addEventListener("DOMContentLoaded",async()=>{if(!iniciarUsuario())return;iniciarRango();eventos();try{await cargar()}catch(e){mostrarError(e)}});
