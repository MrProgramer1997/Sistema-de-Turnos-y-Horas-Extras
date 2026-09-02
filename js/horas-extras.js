import { supabase } from "../supabase/supabaseClient.js";

const CONCEPTOS=[["P003","EXTRA DIURNA"],["P004","EXTRA NOCTURNA"],["P005","RECARGO NOCTURNO"],["P006","DOMINICAL COMPENSADO"],["P007","FESTIVO"],["P008","EXTRA FESTIVA DIURNA"],["P009","EXTRA FESTIVA NOCTURNA"],["P100","RECARGO NOCTURNO DOMINICAL O FESTIVO"]];
const HEADERS=["Empleado","Concepto","Fecha","Dias","FechaInici","Horas","Valor","LiquidarEnPrima","Centro de costos"];
let sesion=null,base=[],responsables=[];
const $=id=>document.getElementById(id),texto=v=>String(v??"").trim(),num=v=>Number(v||0);
const html=v=>texto(v).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
const fechaCorta=v=>{if(!v)return "-";const s=texto(v).slice(0,10).split("-");return s.length===3?`${s[2]}/${s[1]}/${s[0]}`:texto(v)};
const hora=v=>texto(v).match(/(?:T|\s)(\d{2}:\d{2})/)?.[1]||texto(v).slice(0,5)||"-";
const estado=v=>texto(v||"pendiente").toLowerCase();
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
  const authActual=await supabase.auth.getSession();
  if(authActual.error||!authActual.data?.session?.access_token||sesion.tipo_ingreso!=="admin_auth"){
    localStorage.removeItem("ccp_sesion");
    await supabase.auth.signOut({scope:"local"});
    alert("Debe ingresar con la contraseña nueva para crear una sesión segura de Supabase Auth.");
    location.href="login.html";
    return;
  }
  const rol=texto(sesion.rol).toLowerCase(),modulos=Array.isArray(sesion.modulos_permitidos)?sesion.modulos_permitidos:[];
  const permitido=sesion.puede_ver_todo===true||["admin","administrador","gerencia","nomina","auditor","aprobador","ayb","servicios_generales","direccion_financiera"].includes(rol)||modulos.includes("horas-extras");
  if(!permitido){alert("No tienes autorización para ingresar al módulo de horas extras.");location.href="login.html";return}
  $("heUsuario").textContent=sesion.nombre_completo||sesion.usuario||"Usuario";$("heRol").textContent=sesion.rol||"-";
  const hoy=new Date(),desde=new Date();desde.setDate(hoy.getDate()-14);$("heDesde").value=iso(desde);$("heHasta").value=iso(hoy);
  $("heActualizar").addEventListener("click",cargar);["heArea","heEstado"].forEach(id=>$(id).addEventListener("change",render));$("heBuscar").addEventListener("input",render);
  $("heXlsx").addEventListener("click",descargarRevision);$("heXls").addEventListener("click",descargarProsof);
  $("heConfigResponsables").addEventListener("click",()=>bootstrap.Modal.getOrCreateInstance($("heModalResponsables")).show());
  await cargar();
}
function iso(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`}
async function cargar(){
  $("heBody").innerHTML='<tr><td colspan="11" class="text-center text-muted py-4">Actualizando información...</td></tr>';
  try{
    const desde=$("heDesde").value,hasta=$("heHasta").value;
    const preparacion=await supabase.rpc("preparar_conceptos_revision",{p_fecha_desde:desde,p_fecha_hasta:hasta,p_grupo_codigo:null,p_proceso_codigo:null});
    if(preparacion.error)console.warn("No fue posible actualizar candidatos; se mostrarán los ya calculados:",preparacion.error.message);

    let q=supabase.from("turnos_conceptos_revision").select("*").order("fecha",{ascending:false});
    if(desde)q=q.gte("fecha",desde);if(hasta)q=q.lte("fecha",hasta);
    const {data,error}=await q;if(error)throw error;
    base=await completarBandeja(Array.isArray(data)?data:[],desde,hasta);
    const r=await supabase.from("vw_turnos_responsables_activos").select("*");responsables=Array.isArray(r.data)?r.data:[];
    poblarAreas();render();
  }catch(e){console.error(e);$("heBody").innerHTML=`<tr><td colspan="11" class="text-center text-danger py-4">No fue posible cargar la bandeja: ${html(e.message||e)}</td></tr>`}
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
function poblarAreas(){const actual=$("heArea").value;const areas=[...new Set(base.map(area))].sort((a,b)=>a.localeCompare(b,"es"));$("heArea").innerHTML='<option value="">Todas</option>'+areas.map(x=>`<option ${x===actual?"selected":""}>${html(x)}</option>`).join("")}
function dentroAlcance(x){if(sesion?.puede_ver_todo===true)return true;const permitidas=Array.isArray(sesion?.areas_permitidas)?sesion.areas_permitidas.map(v=>texto(v).toLowerCase()):[];if(permitidas.includes("*"))return true;const valor=`${area(x)} ${x.centro_costos||""} ${x.proceso_nombre||""}`.toLowerCase();return permitidas.some(a=>a&&valor.includes(a))}
function filtrados(){const a=$("heArea").value,e=$("heEstado").value,b=texto($("heBuscar").value).toLowerCase();return base.filter(x=>dentroAlcance(x)&&(!a||area(x)===a)&&(!e||estado(x)===e)&&(!b||`${empleado(x)} ${x.cedula||""} ${codigoErp(x)} ${concepto(x)}`.toLowerCase().includes(b)))}
function puedeDecidir(){return !["auditor"].includes(texto(sesion?.rol_auth||sesion?.rol).toLowerCase())}
function responsableDe(x){return texto(x.responsable_nombre||x.aprobador_nombre||responsables.find(r=>texto(r.proceso_codigo)&&texto(r.proceso_codigo)===texto(x.proceso_codigo))?.responsable_nombre||"Sin asignar")}
function badge(e){return `<span class="he-state he-${html(e)}">${html(e)}</span>`}
function render(){const rows=filtrados();$("heKpiRegistros").textContent=rows.length;$("heKpiPendientes").textContent=rows.filter(x=>estado(x)==="pendiente").length;$("heKpiAprobados").textContent=rows.filter(x=>estado(x)==="aprobado").length;$("heKpiHoras").textContent=rows.filter(x=>estado(x)==="aprobado").reduce((s,x)=>s+num(x.horas_aprobadas),0).toFixed(2);renderAreas(rows);renderTabla(rows)}
function resumenAreas(rows){const map=new Map();for(const x of rows){const a=area(x),o=map.get(a)||{p:0,o:0,a:0,r:new Set()};const e=estado(x);if(e==="pendiente")o.p++;if(e==="observado")o.o++;if(e==="aprobado")o.a++;o.r.add(responsableDe(x));map.set(a,o)}return map}
function renderAreas(rows){const map=resumenAreas(rows);$("heKpiAreas").textContent=[...map.values()].filter(x=>x.p+x.o>0).length;$("heAreasBody").innerHTML=[...map].sort().map(([a,x])=>`<tr class="he-area-row ${x.p+x.o===0?"cerrada":""}"><td><strong>${html(a)}</strong></td><td>${html([...x.r].join(", "))}</td><td>${x.p}</td><td>${x.o}</td><td>${x.a}</td><td>${x.p+x.o?badge("pendiente"):badge("aprobado")}</td></tr>`).join("")||'<tr><td colspan="6" class="text-center text-muted">Sin datos.</td></tr>'}
function renderTabla(rows){$("heBody").innerHTML=rows.map(x=>`<tr><td>${html(area(x))}</td><td><strong>${html(empleado(x))}</strong><div class="small text-muted">${html(codigoErp(x)||"Sin código ERP")} · ${html(x.cedula||"")}</div></td><td>${html(fechaCorta(x.fecha))}</td><td>${html(x.turno||"")}<div class="small text-muted">${html(hora(x.hora_inicio))}–${html(hora(x.hora_fin))}</div></td><td>${html(hora(x.ultima_marcacion))}</td><td><strong>${html(concepto(x))}</strong><div class="small">${html(x.concepto_nombre||"")}</div></td><td>${horasCalculadas(x).toFixed(2)}</td><td>${horasAprobadas(x)==null?"-":horasAprobadas(x).toFixed(2)}</td><td>${badge(estado(x))}</td><td>${html(responsableDe(x))}</td><td>${puedeDecidir()&&x.permite_revision&&!["aprobado","rechazado"].includes(estado(x))?`<div class="d-flex gap-1"><button class="btn btn-success btn-sm" data-action="aprobar" data-id="${html(x.revision_id)}">Aprobar</button><button class="btn btn-outline-primary btn-sm" data-action="ajustar" data-id="${html(x.revision_id)}">Ajustar</button></div>`:'<span class="small text-muted">Solo lectura</span>'}</td></tr>`).join("")||'<tr><td colspan="11" class="text-center text-muted py-4">No hay resultados.</td></tr>';$("heBody").querySelectorAll("button[data-action]").forEach(b=>b.addEventListener("click",()=>resolver(b.dataset.id,b.dataset.action)))}
async function resolver(id,accion){const x=base.find(v=>texto(v.revision_id)===texto(id));if(!x)return;let h=horasCalculadas(x),obs=null;if(accion==="ajustar"){const raw=prompt("Horas aprobadas:",h.toFixed(2));if(raw===null)return;h=Number(String(raw).replace(",","."));if(!Number.isFinite(h)||h<0)return alert("Horas inválidas.");obs=prompt("Justificación obligatoria:");if(!texto(obs))return alert("La justificación es obligatoria.")}else if(!confirm(`Aprobar ${h.toFixed(2)} horas de ${concepto(x)} para ${empleado(x)}?`))return;const {error}=await supabase.rpc("resolver_concepto_revision",{p_revision_id:id,p_accion:accion,p_usuario:sesion.usuario||sesion.nombre_completo,p_horas_aprobadas:h,p_observacion:obs});if(error)return alert("No se pudo guardar: "+error.message);await cargar()}
function filasProsof(rows){return rows.filter(x=>estado(x)==="aprobado").map(x=>({Empleado:codigoErp(x),Concepto:concepto(x),Fecha:texto(x.fecha||x.Fecha).slice(0,10),Dias:"",FechaInici:"",Horas:num(x.horas_aprobadas??x.Horas),Valor:"",LiquidarEnPrima:"N","Centro de costos":texto(x["Centro de costos"]||x.centro_costos||"")}))}
function validarProsof(rows){const errores=[];rows.forEach((x,i)=>{if(!x.Empleado)errores.push(`Fila ${i+2}: empleado sin código PROSOF`);if(!CONCEPTOS.some(c=>c[0]===x.Concepto))errores.push(`Fila ${i+2}: concepto ${x.Concepto||"vacío"} no permitido`);if(!/^\d{4}-\d{2}-\d{2}$/.test(x.Fecha))errores.push(`Fila ${i+2}: fecha inválida`);if(!(x.Horas>0))errores.push(`Fila ${i+2}: horas inválidas`)});return errores}
function hojaProsof(rows){const ws=XLSX.utils.json_to_sheet(rows,{header:HEADERS});ws["!cols"]=[{wch:14},{wch:12},{wch:12},{wch:8},{wch:12},{wch:10},{wch:10},{wch:18},{wch:18}];for(let r=2;r<=rows.length+1;r++){if(ws[`A${r}`])ws[`A${r}`].t="s";if(ws[`B${r}`])ws[`B${r}`].t="s";const d=rows[r-2].Fecha.split("-").map(Number);ws[`C${r}`]={t:"d",v:new Date(d[0],d[1]-1,d[2]),z:"mm-dd-yy"};if(ws[`F${r}`])ws[`F${r}`].z="#,##0.00"}return ws}
function hojaConceptos(){return XLSX.utils.aoa_to_sheet([["",""],["",""],...CONCEPTOS])}
function descargarProsof(){if(!window.XLSX)return alert("No se cargó el componente Excel.");const rows=filasProsof(filtrados()),errores=validarProsof(rows);if(!rows.length)return alert("No hay conceptos aprobados para exportar.");if(errores.length)return alert(`No se generó el archivo porque debe corregirse:\n\n${errores.slice(0,12).join("\n")}`);const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,hojaProsof(rows),"Hoja1");XLSX.utils.book_append_sheet(wb,hojaConceptos(),"conceptos");XLSX.writeFile(wb,`NOMINA_EXTRAS_${$("heDesde").value}_${$("heHasta").value}.xls`,{bookType:"biff8"})}
function descargarRevision(){if(!window.XLSX)return alert("No se cargó el componente Excel.");const rows=filtrados(),wb=XLSX.utils.book_new();const detalle=rows.map(x=>({Área:area(x),Empleado:empleado(x),Cédula:x.cedula||"","Código PROSOF":codigoErp(x),Fecha:texto(x.fecha).slice(0,10),Turno:x.turno||"","Inicio programado":hora(x.hora_inicio),"Salida programada":hora(x.hora_fin),"Salida real":hora(x.ultima_marcacion),Concepto:concepto(x),"Horas calculadas":horasCalculadas(x),"Horas aprobadas":horasAprobadas(x),Estado:estado(x),Responsable:responsableDe(x),Observación:x.observacion||""}));XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(detalle),"Revisión detallada");const areas=[];for(const [a,x] of resumenAreas(rows))areas.push({Área:a,Responsable:[...x.r].join(", "),Pendientes:x.p,Observados:x.o,Aprobados:x.a,Estado:x.p+x.o?"PENDIENTE":"CERRADO"});XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(areas),"Estado por área");XLSX.utils.book_append_sheet(wb,hojaProsof(filasProsof(rows)),"Aprobados PROSOF");XLSX.utils.book_append_sheet(wb,hojaConceptos(),"conceptos");XLSX.writeFile(wb,`REVISION_NOMINA_EXTRAS_${$("heDesde").value}_${$("heHasta").value}.xlsx`)}
