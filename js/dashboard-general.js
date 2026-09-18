import { cargarDocumentados, contextoDocumentalCC } from './horarios-documentados-api.js?v=711';
import { supabase } from '../supabase/supabaseClient.js';
import { asegurarSesion, rpcConSesion, esErrorAcceso, mostrarErrorAcceso, observarSesion, ErrorSesion } from './sesion-protegida.js?v=sesion-6-2-1';
import {METRIC_START,HISTORY_START,bogotaNow,iso,addDays,dates,dayMinute,clock,norm,buildModel,matchPerson,selectedEvents,summary,dailyFlow,areaFlow,punctuality,mergeNotices} from './centro-control-metricas.js?v=711';

// Centro de Control: lectura operativa. No aprueba, liquida ni altera marcaciones.
const $=id=>document.getElementById(id);
const txt=(id,value)=>{if($(id))$(id).textContent=value??'';};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=(v,d=0)=>v===null||v===undefined||Number.isNaN(Number(v))?'—':Number(v).toLocaleString('es-CO',{maximumFractionDigits:d,minimumFractionDigits:0});
const pretty=d=>d?`${String(d).slice(8,10)}/${String(d).slice(5,7)}/${String(d).slice(0,4)}`:'—';
const monthStart=d=>String(d).slice(0,7)+'-01';
const monthEnd=d=>new Date(Date.UTC(+String(d).slice(0,4),+String(d).slice(5,7),0)).toISOString().slice(0,10);
const inRange=(d,r)=>d>=r.from&&d<=r.to;
const maxDate=(...v)=>v.filter(Boolean).sort().at(-1);
const minDate=(...v)=>v.filter(Boolean).sort()[0];
const stateLabels={puntual:['A tiempo','ok'],tarde:['Llegada tarde','bad'],justificada:['Descanso / novedad','info'],sin_programacion:['Sin programación','warn'],sin_marca:['Sin marcación; revisar','warn'],sin_entrada:['Sin entrada verificable','warn'],en_espera:['Jornada en curso','info'],futura:['Programación futura',''],inferida:['Horario inferido; excluido',''],conflicto:['Programaciones en conflicto','warn'],sin_horario:['Sin horario comparable','']};
const s={model:null,range:null,tab:'trends',areaScope:'period',loadToken:0,abort:null,channel:null,timer:null,debounce:null,lastLoaded:0,loaded:null};

function pill(label,cl=''){return `<span class="cc-pill ${cl}">${esc(label)}</span>`;}
function empty(message='No hay registros para estos filtros.'){return `<p class="cc-empty">${esc(message)}</p>`;}
function table(headers,rows){return rows.length?`<div class="cc-table-scroll"><table class="cc-table"><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`:empty();}
function filters(extra={}){return {...(s.range||{from:$('ccFrom').value,to:$('ccTo').value}),population:$('ccPopulation').value,area:$('ccArea').value,search:$('ccSearch').value.trim(),...extra};}
function previousMonthRange(d){const y=+String(d).slice(0,4),m=+String(d).slice(5,7);const start=new Date(Date.UTC(y,m-2,1)).toISOString().slice(0,10);return {from:start,to:monthEnd(start)};}
function punctualRange(){const r=filters({population:'club'});return $('ccPunctRange').value==='month'?{...r,from:monthStart(r.to),to:minDate(monthEnd(r.to),s.model.today)}:r;}
function error(message){$('ccError').hidden=false;txt('ccError',message);}
function clearError(){$('ccError').hidden=true;txt('ccError','');}
function switchTab(tab){if(!$(`ccPanel-${tab}`))return;s.tab=tab;document.querySelectorAll('.cc-panel').forEach(e=>e.hidden=e.id!==`ccPanel-${tab}`);document.querySelectorAll('.cc-tabs [data-tab]').forEach(b=>{b.classList.toggle('selected',b.dataset.tab===tab);b.setAttribute('aria-selected',String(b.dataset.tab===tab));});}

async function rpc(name,args,signal){
  const res=await rpcConSesion(name,args,{signal,read:true});
  if(res.error)throw new Error(`${name}: ${res.error.message||'No se pudo completar la consulta'}`);
  if(res.data===null||res.data===undefined)throw new Error(`${name}: respuesta vacía del servidor`);
  return res.data;
}
async function loadMarks(from,to,signal,token){let cursor=0,ceiling=null,total=null,all=[];const ids=new Set();
  for(let page=0;page<150;page++){
    if(signal.aborted)throw new DOMException('Consulta cancelada','AbortError');
    const data=await rpc('consultar_centro_control_marcaciones_v2',{p_desde:from,p_hasta:to,p_despues:cursor,p_hasta_id:ceiling,p_limite:1500},signal);
    if(total===null){total=Number(data.total);ceiling=Number(data.hasta_id);if(!Number.isFinite(total)||total<0)throw new Error('No se recibió el control total de marcaciones');}
    const batch=data.registros;if(!Array.isArray(batch))throw new Error('Formato de marcaciones inesperado');
    for(const row of batch){const id=String(row.biotime_id);if(ids.has(id))throw new Error('Se repitió un ID al paginar. Se conserva la consulta anterior.');ids.add(id);all.push(row);}
    if(token===s.loadToken)txt('ccStatus',`Leyendo marcaciones: ${num(all.length)} de ${num(total)}...`);
    if(all.length===total)return {rows:all,total,ceiling};
    if(!batch.length||Number(data.cursor)<=cursor||all.length>total)throw new Error('La lectura no coincide con el total de Supabase. No se publicarán métricas parciales.');
    cursor=Number(data.cursor);
  }
  throw new Error('El período excede el límite de lectura segura. Reduce el rango.');
}
async function load(silent=false){
  const requested={from:$('ccFrom').value,to:$('ccTo').value};
  const span=(dayMinute(requested.to)-dayMinute(requested.from))/1440;
  if(!Number.isFinite(span)||span<0||span>61){error('Selecciona un rango válido de hasta 62 días.');return;}
  const now=bogotaNow(),today=iso(now),prevMonth=previousMonthRange(requested.to);
  let from=maxDate(HISTORY_START,minDate(requested.from,monthStart(requested.to),prevMonth.from));
  let to=maxDate(requested.to,monthEnd(requested.to)<today?monthEnd(requested.to):today);
  from=addDays(from,-1);to=addDays(to,1);
  const token=++s.loadToken;s.abort?.abort();s.abort=new AbortController();const signal=s.abort.signal;
  const timeout=setTimeout(()=>s.abort?.signal===signal&&s.abort.abort(),45000);
  $('ccRefresh').disabled=true;if(!silent)clearError();txt('ccStatus','Consultando personal, programación, novedades y marcaciones...');
  try{
    await asegurarSesion();
    const [ctx,marks]=await Promise.all([rpc('consultar_centro_control_contexto_v2',{p_desde:from,p_hasta:to},signal),loadMarks(from,to,signal,token)]);
    if(token!==s.loadToken)return;
    const docs=await cargarDocumentados(rpcConSesion,{desde:from,hasta:to,signal});
    if(token!==s.loadToken)return;
    const conDoc=docs.disponible?contextoDocumentalCC(ctx,docs.resuelto):ctx;
    txt('ccDocStatus',docs.disponible?'Horarios documentales desde 23/08/2026. La puntualidad oficial excluye las sugerencias semanales no confirmadas.':docs.motivo);
    const model=buildModel(conDoc,marks.rows,ctx.server_time?bogotaNow(new Date(ctx.server_time)):now);
    if(model.diagnostic.invalid)throw new Error('Hay marcas con fecha inválida; revisa la fuente antes de calcular indicadores.');
    s.model=model;s.range=requested;s.loaded={from,to,total:marks.total,ceiling:marks.ceiling};s.lastLoaded=Date.now();
    populateAreas();render();clearError();realtime();
    txt('ccStatus',`Actualizado ${clock(model.now)} (Colombia) · ${num(marks.total)} marcaciones leídas completas`);
  }catch(e){
    if(token!==s.loadToken)return;
    console.error('Centro de Control',e);
    if(esErrorAcceso(e)){limpiarDatosPorSesion();mostrarErrorAcceso($('ccError'),e,()=>load());}
    else error(e.name==='AbortError'?'La consulta superó el tiempo de espera. Se conservan los datos anteriores; pulsa Actualizar.':`No se actualizó el Centro de Control. ${e.message}. No se reemplazaron los datos por ceros.`);
    txt('ccStatus',s.model?'Mostrando la última lectura completada':'Lectura no disponible');
  }finally{clearTimeout(timeout);if(token===s.loadToken)$('ccRefresh').disabled=false;}
}

function populateAreas(){const prior=$('ccArea').value;const areas=new Set();for(const e of s.model.ctx.employees||[])areas.add(s.model.person(e.cedula,s.range.to).areaLabel);for(const ev of s.model.events)areas.add(ev.person.areaLabel);$('ccArea').innerHTML='<option value="">Todas las áreas</option>'+[...areas].sort((a,b)=>a.localeCompare(b)).map(a=>`<option value="${esc(a)}">${esc(a)}</option>`).join('');if(areas.has(prior))$('ccArea').value=prior;}
function chartBars(data,labelKey,valueKey){if(!data.length)return empty();const w=Math.max(570,data.length*35+55),h=240,pad=37,bottom=205,top=22,max=Math.max(1,...data.map(x=>x[valueKey])),bw=(w-pad-15)/data.length;let content='';for(let k=0;k<=4;k++){const y=bottom-(bottom-top)*k/4;content+=`<line class="cc-grid" x1="${pad}" y1="${y}" x2="${w}" y2="${y}"/><text class="cc-axis" x="${pad-7}" y="${y+3}" text-anchor="end">${num(max*k/4)}</text>`;}data.forEach((x,i)=>{const height=(bottom-top)*x[valueKey]/max,xx=pad+i*bw+bw*.18;content+=`<g><title>${esc(x.tooltip||`${x[labelKey]}: ${num(x[valueKey],1)} personas`)}</title><rect class="cc-bar${x.today?' today':''}" x="${xx}" y="${bottom-height}" width="${Math.max(3,bw*.64)}" height="${height}" rx="3"/><text class="cc-bar-label" x="${xx+bw*.32}" y="${bottom-height-6}" text-anchor="middle">${num(x[valueKey],1)}</text><text class="cc-axis" x="${xx+bw*.32}" y="226" text-anchor="middle">${esc(x[labelKey])}</text></g>`;});return `<div class="cc-svg-scroll"><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Gráfica de personas por fecha" style="min-width:${Math.min(w,1300)}px">${content}</svg></div>`;}
function allAreaFlow(evs,f){const rows=areaFlow(evs),seen=new Set(rows.map(x=>x.label));for(const e of s.model.ctx.employees||[]){if(e.estado===false)continue;const p=s.model.person(e.cedula,f.to);if(matchPerson(p,f)&&!seen.has(p.areaLabel)){seen.add(p.areaLabel);rows.push({label:p.areaLabel,people:0,personDays:0,marks:0});}}return rows.sort((a,b)=>b.people-a.people||a.label.localeCompare(b.label));}
function areaTable(evs,f,scope){const rows=allAreaFlow(evs,f),max=Math.max(1,...rows.map(x=>x.people));return table(['Área laboral','Personas distintas','Días-persona','Registros','Detalle'],rows.map(a=>[`<button class="cc-link" data-area-detail="${esc(a.label)}" data-area-scope="${scope}">${esc(a.label)}</button>`,`<strong>${num(a.people)}</strong><div class="cc-progress"><i style="width:${a.people/max*100}%"></i></div>`,num(a.personDays),num(a.marks),a.people?`<button class="cc-link" data-area-detail="${esc(a.label)}" data-area-scope="${scope}">Quiénes vinieron</button>`:'—']));}

function renderTopAndDaily(){
  const f=filters(),a=summary(s.model,f),flows=areaFlow(a.events),from=maxDate(f.from,METRIC_START),to=minDate(f.to,s.model.today),daily=from<=to?dailyFlow(a.events,from,to):[],best=daily.slice().sort((x,y)=>y.people-x.people)[0];
  txt('ccPeople',num(a.people));txt('ccTopArea',flows[0]?.label||'Sin actividad');txt('ccTopAreaHint',flows[0]?`${num(flows[0].people)} personas distintas en el período`:'No hay registros para el filtro');
  const official=summary(s.model,{...f,population:'club'});txt('ccRate',official.rate===null?'Sin base':`${num(official.rate,1)}%`);txt('ccRateHint',`${num(official.onTime)} de ${num(official.comparable)} jornadas comparables`);txt('ccRangeLabel',`${pretty(f.from)} — ${pretty(f.to)}`);
  $('ccDailyChart').innerHTML=chartBars(daily.map(d=>({...d,label:d.date.slice(8,10)+'/'+d.date.slice(5,7),today:d.date===s.model.today,tooltip:`${pretty(d.date)}: ${d.people} personas únicas; ${d.marks} marcaciones`})),'label','people');
  const todayEvents=selectedEvents(s.model,{...f,from:s.model.today,to:s.model.today}),points=new Map();for(const e of todayEvents)points.set(e.point,(points.get(e.point)||0)+1);const point=[...points].sort((a,b)=>b[1]-a[1])[0];
  $('ccInsights').innerHTML=[best&&best.people?`<strong>Mayor ingreso registrado:</strong> ${pretty(best.date)}, con <strong>${num(best.people)} personas</strong>.<small>Personas con al menos una marcación bajo el filtro actual.</small>`:'Sin actividad registrada en este período.',point?`<strong>${esc(point[0])}</strong> registró el mayor movimiento de hoy: <strong>${num(point[1])} marcas</strong>.<small>Punto biométrico; no área laboral.</small>`:'Hoy no tiene actividad dentro de la lectura y filtros actuales.'].map(t=>`<div class="cc-insight">${t}</div>`).join('');
  const coverage=[];if(f.from<METRIC_START)coverage.push('Los registros anteriores al 27/08 permanecen disponibles como histórico, fuera de los indicadores.');if(f.population!=='club')coverage.push('La puntualidad oficial siempre compara personal del Club; Tendencias sí respeta el tipo de personal seleccionado.');if(!a.comparable&&a.people)coverage.push('Hay presencia sin jornadas comparables; se conservan las marcas sin inventar horarios.');$('ccCoverage').hidden=!coverage.length;txt('ccCoverage',coverage.join(' '));
  txt('ccIntegrity',`Control de lectura: ${num(s.loaded.total)} registros recibidos de ${num(s.loaded.total)} esperados, hasta ID ${s.loaded.ceiling}. No se eliminaron marcaciones. La clasificación laboral usa proceso asignado y, si falta, área / centro de costos / cargo.`);
}
function renderAreaMovement(){
  const base=filters();let f,scope=s.areaScope;
  if(scope==='today')f={...base,from:s.model.today,to:s.model.today};else f=base;
  const available=f.from>=s.loaded.from&&f.to<=s.loaded.to;
  const evs=available?selectedEvents(s.model,f):[];
  $('ccAreaComparison').innerHTML=available?areaTable(evs,f,scope):empty('Hoy no está incluido en la lectura cargada. Pulsa “Hoy” en la parte superior para consultar esa fecha.');
  $('ccAreaScopePeriod').classList.toggle('selected',scope==='period');$('ccAreaScopeToday').classList.toggle('selected',scope==='today');
  txt('ccAreaScopeCaption',scope==='today'?`${pretty(s.model.today)} · personas únicas por área laboral`:`${pretty(base.from)} — ${pretty(base.to)} · personas distintas y días-persona por área`);
}
function renderMonthComparison(){
  const f=filters(),curFull={from:monthStart(f.to),to:minDate(monthEnd(f.to),s.model.today)},prevFull=previousMonthRange(f.to);
  const cur={from:maxDate(curFull.from,METRIC_START,s.loaded.from),to:minDate(curFull.to,s.loaded.to)};
  const prev={from:maxDate(prevFull.from,METRIC_START,s.loaded.from),to:minDate(prevFull.to,s.loaded.to)};
  const stats=r=>{if(!r.from||!r.to||r.from>r.to)return null;const ev=selectedEvents(s.model,{...f,...r}),daily=dailyFlow(ev,r.from,r.to);return {ev,daily,avg:daily.length?daily.reduce((n,x)=>n+x.people,0)/daily.length:0,unique:new Set(ev.map(e=>e.person.cedula)).size,days:daily.length};};
  const a=stats(cur),b=stats(prev),partialPrev=prev.from!==prevFull.from||prev.to!==prevFull.to,partialCur=cur.from!==curFull.from||cur.to!==curFull.to;
  if(!a){$('ccPeriodComparison').innerHTML=empty('No hay datos del mes seleccionado.');return;}
  const change=b&&b.avg?100*(a.avg-b.avg)/b.avg:null;
  $('ccPeriodComparison').innerHTML=`<div class="cc-insight"><strong>${num(a.avg,1)}</strong> personas por día en ${curFull.from.slice(0,7)}.<small>${num(a.unique)} personas distintas · ${a.days} días con base calendario${partialCur?' · base parcial':''}</small></div>${b?`<div class="cc-insight"><strong>${num(b.avg,1)}</strong> personas por día en ${prevFull.from.slice(0,7)}.<small>${num(b.unique)} personas distintas · ${b.days} días${partialPrev?' · base parcial disponible desde '+pretty(prev.from):''}</small></div><div class="cc-insight"><strong>${change===null?'Sin base':`${change>=0?'+':''}${num(change,1)}%`}</strong> variación del promedio diario.<small>Comparación mensual con la información realmente disponible; no se completan días faltantes con ceros ficticios.</small></div>`:`<div class="cc-insight">No hay datos disponibles del mes anterior para comparar.</div>`}`;
}
function renderTrends(){
  renderTopAndDaily();renderAreaMovement();
  const f=filters(),evs=selectedEvents(s.model,f),from=maxDate(f.from,METRIC_START),to=minDate(f.to,s.model.today),daily=from<=to?dailyFlow(evs,from,to):[],days=['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  const week=Array.from({length:7},(_,i)=>{const d=(i+1)%7,rows=daily.filter(x=>new Date(x.date+'T00:00:00Z').getUTCDay()===d);return {label:days[d],people:rows.length?rows.reduce((n,x)=>n+x.people,0)/rows.length:0,tooltip:`${days[d]}: ${rows.length} fechas en el período`};});$('ccWeekdayChart').innerHTML=chartBars(week,'label','people');
  renderMonthComparison();
  const emp=new Map();for(const e of evs){const k=e.person.cedula;if(!emp.has(k))emp.set(k,{p:e.person,days:new Set});emp.get(k).days.add(e.date);}const rows=[...emp.values()].sort((a,b)=>b.days.size-a.days.size||a.p.name.localeCompare(b.p.name)).slice(0,25);$('ccAttendanceRanking').innerHTML=table(['Empleado','Área','Días con registro','Detalle'],rows.map(x=>[`<button class="cc-link" data-person="${esc(x.p.cedula)}">${esc(x.p.name)}</button><small>${esc(x.p.cedula)}</small>`,esc(x.p.areaLabel),`<strong>${num(x.days.size)}</strong>`,`<button class="cc-link" data-person="${esc(x.p.cedula)}">Abrir persona</button>`]));
}

function causes(j){return (j.notices||[]).map(n=>`${n.label}: ${pretty(n.from)} hasta ${pretty(n.to)} (${n.source})`).join('; ');}
function statusCell(j){const [label,cl]=stateLabels[j.status]||[j.status,''];return pill(label,cl);}
function eventsForJourney(j){
  const all=(s.model.events||[]).filter(e=>e.person.cedula===j.code);const day0=dayMinute(j.date);
  if(j.start!==null&&j.start!==undefined&&j.end!==null&&j.end!==undefined)return all.filter(e=>e.t>=j.start-240&&e.t<=j.end+240).sort((a,b)=>a.t-b.t);
  return all.filter(e=>e.t>=day0&&e.t<day0+1440).sort((a,b)=>a.t-b.t);
}
function workedSummary(j){
  const evs=eventsForJourney(j);if(!evs.length)return {events:[],first:null,last:null,elapsed:null,net:null,criterion:'Sin marcaciones'};
  const first=evs.find(e=>e.direction!=='out')||evs[0];const rev=[...evs].reverse();const lastOut=rev.find(e=>e.direction==='out'&&e.t>first.t);const last=lastOut||rev.find(e=>e.t>first.t)||null;
  if(!last)return {events:evs,first,last:null,elapsed:null,net:null,criterion:'Una sola marcación; no calculable'};
  const elapsed=Math.max(0,(last.t-first.t)/60),breakMin=Math.max(0,Number(j.breakMin||0)),net=Math.max(0,elapsed-breakMin/60);
  return {events:evs,first,last,elapsed,net,criterion:lastOut?'Entrada y salida biométrica':'Primera y última marcación; revisar salida',breakMin};
}
function employeeWorked(days=[]){let total=0,calculable=0;for(const j of days){const w=workedSummary(j);if(w.net!==null){total+=w.net;calculable++;}}return {total,calculable};}
function renderPunctuality(){
  const f=punctualRange(),p=punctuality(s.model,f),comp=p.areas.reduce((sum,a)=>sum+a.comparable,0),late=p.areas.reduce((sum,a)=>sum+a.late,0),mins=p.areas.reduce((sum,a)=>sum+a.minutes,0);
  $('ccPunctSummary').innerHTML=[[`${pretty(f.from)} — ${pretty(f.to)}`,'Período de puntualidad'],[num(comp),'Jornadas comparables'],[num(late),'Jornadas con tardanza'],[num(mins)+' min','Retraso acumulado; no descuento automático']].map(([v,l])=>`<div class="cc-insight"><strong style="font-size:${l==='Período de puntualidad'?'15':'23'}px">${esc(v)}</strong><small>${esc(l)}</small></div>`).join('');
  $('ccPunctAreas').innerHTML=table(['Área','Puntualidad','A tiempo','Tarde','Base comparable','Cobertura de horarios','Sin programación / con marca','Novedades'],p.areas.sort((a,b)=>a.label.localeCompare(b.label)).map(a=>[`<strong>${esc(a.label)}</strong>`,a.rate===null?'Sin base':`${num(a.rate,1)}%${a.comparable<5?'<small>Base menor de 5 jornadas</small>':''}`,num(a.onTime),num(a.late),num(a.comparable),a.scheduled?`${num(a.coverage,1)}%<small>${a.comparable} / ${a.scheduled} con horario evaluable</small>`:'No calculable',num(a.unplanned),num(a.justified)]));
  $('ccLatePeople').innerHTML=table(['Empleado','Área','Días tarde','Días comparables','Tardanzas / base','Minutos acumulados','Horas realizadas','Detalle'],p.employees.filter(e=>e.late>0).map(e=>{const w=employeeWorked(e.days);return [`<button class="cc-link" data-person="${esc(e.cedula)}" data-context="punctuality">${esc(e.name)}</button><small>${esc(e.cedula)}</small>`,esc(e.areaLabel),`<strong>${e.late}</strong>`,e.comparable,`${num(e.lateRate,1)}%`,num(e.minutes),w.calculable?`${num(w.total,2)} h<small>${w.calculable} jornadas calculables</small>`:'No calculable',`<button class="cc-link" data-person="${esc(e.cedula)}" data-context="punctuality">Comparar turnos y marcas</button>`];}));
}
function renderNotices(){const rows=mergeNotices(s.model,filters());$('ccNotices').innerHTML=table(['Empleado','Área','Causa','Desde','Hasta registrado','Fuente / estado'],rows.map(n=>[`<button class="cc-link" data-person="${esc(n.code)}">${esc(n.person.name)}</button>`,esc(n.person.areaLabel),esc(n.label),pretty(n.from),pretty(n.to),`${esc([...new Set(n.sources)].join(' / '))}<small>${esc(n.state)}${n.full?'':' · No exime por sí sola toda la jornada'}</small>`]));}
function render(){if(!s.model)return;renderTrends();renderPunctuality();renderNotices();}

function showDialog(title,subtitle,html){txt('ccDialogTitle',title);txt('ccDialogSubtitle',subtitle);$('ccDialogBody').innerHTML=html;if(!$('ccDialog').open)$('ccDialog').showModal();}
function openAreaDetail(label,scope='period'){
  const base=filters(),f=scope==='today'?{...base,from:s.model.today,to:s.model.today}:base,evs=selectedEvents(s.model,f).filter(e=>e.person.areaLabel===label),groups=new Map();
  for(const e of evs){const k=`${e.date}|${e.person.cedula}`;if(!groups.has(k))groups.set(k,{date:e.date,p:e.person,events:[]});groups.get(k).events.push(e);}
  const rows=[...groups.values()].sort((a,b)=>b.date.localeCompare(a.date)||a.p.name.localeCompare(b.p.name));
  showDialog(label,`${rows.length} jornadas-persona · ${scope==='today'?pretty(s.model.today):pretty(f.from)+' — '+pretty(f.to)}`,table(['Fecha','Empleado','Primera marca','Última marca','Registros','Abrir persona'],rows.map(x=>{x.events.sort((a,b)=>a.t-b.t);return [pretty(x.date),`<strong>${esc(x.p.name)}</strong><small>${esc(x.p.cedula)}</small>`,esc(x.events[0]?.clock||'—'),esc(x.events.at(-1)?.clock||'—'),num(x.events.length),`<button class="cc-link" data-person="${esc(x.p.cedula)}">Comparar con turno</button>`];})));
}
function openPerson(code,context='period'){
  const range=context==='punctuality'?punctualRange():filters(),p=s.model.person(code,range.to),js=s.model.journeys.filter(j=>j.code===code&&inRange(j.date,range)).sort((a,b)=>b.date.localeCompare(a.date));
  let total=0,calc=0;const rows=js.map(j=>{const w=workedSummary(j);if(w.net!==null){total+=w.net;calc++;}return [pretty(j.date),j.begin?`${esc(j.begin.slice(0,5))} — ${esc(j.end!==null&&j.end!==undefined?clock(new Date(j.end*60000).toISOString()):'—')}<small>${esc(j.source)}</small>`:esc(j.source),w.first?`${esc(w.first.clock)}<small>${esc(w.first.alias||w.first.point)}</small>`:'—',w.last?esc(w.last.clock):'—',j.delta===null||j.delta===undefined?'No comparable':j.delta>0?`${num(j.delta)} min tarde`:j.delta<0?`${num(-j.delta)} min antes`:'Hora exacta',w.net===null?'No calculable':`${num(w.net,2)} h<small>${esc(w.criterion)}</small>`,statusCell(j),`<button class="cc-link" data-journey="${esc(code)}" data-date="${j.date}">Abrir recorrido</button>`];});
  const summary=`<div class="cc-work-summary"><div><span>Jornadas mostradas</span><strong>${num(js.length)}</strong></div><div><span>Con horas calculables</span><strong>${num(calc)}</strong></div><div><span>Total horas realizadas estimadas</span><strong>${calc?num(total,2)+' h':'No calculable'}</strong></div></div><p class="cc-footnote compact">El total usa biometría disponible y descuenta el descanso programado cuando corresponde. Es control operativo, no liquidación de nómina.</p>`;
  showDialog(p.name,`${p.areaLabel} · ${p.cedula} · ${p.areaSource}`,summary+table(['Fecha','Turno guardado','Primera marca','Última marca','Diferencia','Horas realizadas','Estado','Recorrido'],rows));
}
function openJourney(code,date){
  const j=s.model.journeys.find(x=>x.code===code&&x.date===date),p=s.model.person(code,date);if(!j){showDialog('Recorrido',`${pretty(date)} · ${p.name}`,empty('No se encontró la jornada seleccionada.'));return;}
  const w=workedSummary(j),programado=j.begin?`${j.begin.slice(0,5)} — ${j.end!==null&&j.end!==undefined?clock(new Date(j.end*60000).toISOString()):'—'}`:'Sin horario comparable';
  const cards=`<div class="cc-work-summary"><div><span>Turno programado</span><strong>${esc(programado)}</strong></div><div><span>Primera marcación</span><strong>${esc(w.first?.clock||'—')}</strong></div><div><span>Última marcación</span><strong>${esc(w.last?.clock||'—')}</strong></div><div><span>Total horas realizadas</span><strong>${w.net===null?'No calculable':num(w.net,2)+' h'}</strong><small>${esc(w.criterion)}</small></div></div>`;
  const route=`<div class="cc-history"><div class="cc-route">${w.events.map(e=>`<span class="${e.direction==='out'?'out':''}">${esc(e.clock)} · ${esc(e.point)}<em>${esc(e.alias)} · ID ${esc(e.id)}${e.date!==date?' · '+pretty(e.date):''}</em></span>`).join('')||empty('No hay marcaciones en esa jornada.')}</div></div>`;
  showDialog(`Recorrido · ${p.name}`,`${pretty(date)} · ${p.areaLabel}`,`${cards}<p>${statusCell(j)} ${esc(causes(j)||'Sin novedad registrada.')}</p>${route}<p class="cc-footnote">Las marcaciones originales se conservan. Si no hay una salida identificable, se usa la última marca como estimación y se señala expresamente. Una sola marca nunca produce horas trabajadas.</p>`);
}
function openKpi(kind){if(kind!=='people')return;const seen=new Map();for(const e of selectedEvents(s.model,filters()))seen.set(e.person.cedula,e.person);showDialog('Personas con marcación','Personas únicas del filtro',table(['Empleado','Documento','Área','Clasificación','Detalle'],[...seen.values()].sort((a,b)=>a.name.localeCompare(b.name)).map(p=>[`<button class="cc-link" data-person="${esc(p.cedula)}">${esc(p.name)}</button>`,esc(p.cedula),esc(p.areaLabel),p.external?'Externo / extra':p.known?'Personal del Club':'Sin vínculo',`<button class="cc-link" data-person="${esc(p.cedula)}">Comparar con turno</button>`])));}

function safeCell(v){if(typeof v==='string'&&/^[=+@\-\t\r]/.test(v))return "'"+v;return v??'';}
function setWidths(ws,widths){ws['!cols']=widths.map(w=>({wch:w}));}
function exportPunctExcel(){
  if(!s.model)return;const XLSX=window.XLSX;if(!XLSX){alert('No se pudo cargar el componente de Excel. Recarga la página con conexión a Internet.');return;}
  const f=punctualRange(),p=punctuality(s.model,f),wb=XLSX.utils.book_new();
  const areas=[['Área','Puntualidad %','A tiempo','Tarde','Base comparable','Jornadas con horario','Cobertura %','Sin programación con marca','Novedades'],...p.areas.sort((a,b)=>a.label.localeCompare(b.label)).map(a=>[a.label,a.rate===null?'':Number(a.rate.toFixed(2)),a.onTime,a.late,a.comparable,a.scheduled,a.coverage===null?'':Number(a.coverage.toFixed(2)),a.unplanned,a.justified])];
  const latePeople=[['Cédula','Empleado','Área','Días tarde','Días comparables','Tardanzas %','Minutos acumulados','Jornadas con horas calculables','Total horas realizadas estimadas'],...p.employees.filter(e=>e.late>0).map(e=>{const w=employeeWorked(e.days);return [e.cedula,e.name,e.areaLabel,e.late,e.comparable,Number(e.lateRate.toFixed(2)),e.minutes,w.calculable,w.calculable?Number(w.total.toFixed(2)):''];})];
  const detail=[['Fecha','Cédula','Empleado','Área','Fuente programación','Inicio programado','Fin programado','Primera marcación','Última marcación','Punto de entrada','Minutos diferencia','Estado','Marcaciones','Horas transcurridas','Descanso descontado min','Horas realizadas estimadas','Criterio horas','Causa / vigencia']];
  for(const j of p.journeys){const w=workedSummary(j);detail.push([j.date,j.code,j.person.name,j.person.areaLabel,j.source,j.begin||'',j.end!==null&&j.end!==undefined?clock(new Date(j.end*60000).toISOString()):'',w.first?.clock||'',w.last?.clock||'',w.first?.alias||w.first?.point||'',j.delta??'',stateLabels[j.status]?.[0]||j.status,w.events.length,w.elapsed===null?'':Number(w.elapsed.toFixed(2)),w.breakMin??'',w.net===null?'':Number(w.net.toFixed(2)),w.criterion,causes(j)]);}
  const ws1=XLSX.utils.aoa_to_sheet(areas.map(r=>r.map(safeCell))),ws2=XLSX.utils.aoa_to_sheet(latePeople.map(r=>r.map(safeCell))),ws3=XLSX.utils.aoa_to_sheet(detail.map(r=>r.map(safeCell)));
  setWidths(ws1,[28,14,11,11,16,18,14,24,12]);setWidths(ws2,[16,34,24,12,16,14,18,24,28]);setWidths(ws3,[12,16,34,24,24,17,17,17,17,24,16,24,12,18,22,22,34,42]);
  XLSX.utils.book_append_sheet(wb,ws1,'Áreas');XLSX.utils.book_append_sheet(wb,ws2,'Ranking tardanzas');XLSX.utils.book_append_sheet(wb,ws3,'Detalle jornadas');
  XLSX.writeFile(wb,`Puntualidad_Centro_Control_${f.from}_${f.to}.xlsx`);
}

function preset(which){const today=iso(bogotaNow());$('ccTo').value=today;$('ccFrom').value=which==='today'?today:which==='month'?monthStart(today):addDays(today,-((new Date(today+'T00:00:00Z').getUTCDay()+6)%7));document.querySelectorAll('[data-preset]').forEach(b=>b.classList.toggle('selected',b.dataset.preset===which));if(which==='today')s.areaScope='today';load();}
function realtime(){if(s.channel)return;s.channel=supabase.channel('cc-lectura-v2').on('postgres_changes',{event:'UPDATE',schema:'public',table:'app_actualizacion_eventos',filter:'id=eq.centro_control'},()=>scheduleRefresh()).subscribe(status=>txt('ccLive',status==='SUBSCRIBED'?'Actualización automática conectada':'Respaldo automático cada minuto'));s.timer=setInterval(()=>{if(document.visibilityState==='visible'&&Date.now()-s.lastLoaded>55000)scheduleRefresh();},60000);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&Date.now()-s.lastLoaded>60000)scheduleRefresh();});window.addEventListener('beforeunload',()=>{s.abort?.abort();clearInterval(s.timer);clearTimeout(s.debounce);if(s.channel)supabase.removeChannel(s.channel);});}
function scheduleRefresh(){clearTimeout(s.debounce);s.debounce=setTimeout(()=>{if(document.visibilityState==='visible'&&!$('ccRefresh').disabled)load(true);},1800);}
function events(){
  $('ccFilterForm').addEventListener('submit',e=>{e.preventDefault();s.areaScope='period';load();});$('ccRefresh').addEventListener('click',()=>load());
  for(const id of ['ccArea','ccPopulation','ccPunctRange'])$(id).addEventListener('change',()=>render());let searchTimer;$('ccSearch').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>render(),160);});
  $('ccAreaScopePeriod').addEventListener('click',()=>{s.areaScope='period';renderAreaMovement();});$('ccAreaScopeToday').addEventListener('click',()=>{s.areaScope='today';renderAreaMovement();});
  $('ccExportPunct').addEventListener('click',exportPunctExcel);$('ccDialogClose').addEventListener('click',()=>$('ccDialog').close());
  document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.preset){preset(b.dataset.preset);return;}if(b.dataset.tab){switchTab(b.dataset.tab);return;}if(!s.model)return;if(b.dataset.open)openKpi(b.dataset.open);if(b.dataset.areaDetail)openAreaDetail(b.dataset.areaDetail,b.dataset.areaScope||'period');if(b.dataset.person)openPerson(b.dataset.person,b.dataset.context||'period');if(b.dataset.journey)openJourney(b.dataset.journey,b.dataset.date);});
}
function limpiarDatosPorSesion(){s.model=null;s.loaded=null;clearInterval(s.timer);clearTimeout(s.debounce);for(const id of ['ccPeople','ccTopArea','ccRate'])txt(id,'—');for(const id of ['ccDailyChart','ccInsights','ccAreaComparison','ccPunctSummary','ccPunctAreas','ccLatePeople','ccNotices','ccWeekdayChart','ccPeriodComparison','ccAttendanceRanking','ccDialogBody','ccIntegrity'])if($(id))$(id).replaceChildren();if($('ccDialog')?.open)$('ccDialog').close();if(s.channel){supabase.removeChannel(s.channel);s.channel=null;}txt('ccLive','Sesión pendiente de verificar');}
async function init(){const today=iso(bogotaNow());$('ccFrom').value=monthStart(today);$('ccTo').value=today;events();let session;try{session=JSON.parse(localStorage.getItem('ccp_sesion')||'null');}catch{}txt('ccUser',session?.nombre_completo||session?.usuario||'Sesión por verificar');observarSesion(()=>{s.abort?.abort();s.loadToken++;limpiarDatosPorSesion();$('ccRefresh').disabled=false;mostrarErrorAcceso($('ccError'),new ErrorSesion('AUTH_REQUIRED','Tu sesión cambió o terminó. Vuelve a ingresar para consultar tu información.'),()=>load());txt('ccStatus','Se requiere iniciar sesión');});await load();if(s.model)realtime();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
