import { supabase } from '../supabase/supabaseClient.js';

const $ = (id) => document.getElementById(id);
const state = { rows: [], previous: [], key: '', active: '', routeCache: new Map(), loading: false };
const fmtNum = (n,d=0) => Number(n||0).toLocaleString('es-CO',{minimumFractionDigits:d,maximumFractionDigits:d});
const esc = (v) => String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const isoDate = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
const pretty = (s) => s ? new Date(`${s}T00:00:00Z`).toLocaleDateString('es-CO',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'}) : '—';
const clock = (ts) => ts ? new Date(ts).toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'America/Bogota'}) : '—';

function filters(){
  return {
    from: $('filtroFechaInicio')?.value || '',
    to: $('filtroFechaFin')?.value || '',
    subarea: $('filtroSubarea')?.value || '',
    employee: $('filtroEmpleado')?.value || ''
  };
}
function validRange(f){return /^\d{4}-\d{2}-\d{2}$/.test(f.from)&&/^\d{4}-\d{2}-\d{2}$/.test(f.to)&&f.from<=f.to;}
function rowMatches(r,f){
  if(r.fecha<f.from||r.fecha>f.to)return false;
  if(f.employee && String(r.cedula)!==String(f.employee))return false;
  if(f.subarea){const t=`${r.subarea||''} ${r.area_laboral||''}`.toUpperCase();if(!t.includes(String(f.subarea).toUpperCase()))return false;}
  return true;
}
function selectedRows(){const f=filters();return state.rows.filter(r=>rowMatches(r,f));}
function presenceRows(rows){return rows.filter(r=>Number(r.total_marcaciones||0)>0);}
function rangeDates(from,to){const out=[];let d=new Date(`${from}T00:00:00Z`),end=new Date(`${to}T00:00:00Z`);while(d<=end){out.push(isoDate(d));d.setUTCDate(d.getUTCDate()+1);}return out;}
function previousComparableRange(to){
  const end=new Date(`${to}T00:00:00Z`);const day=end.getUTCDate();
  const prevStart=new Date(Date.UTC(end.getUTCFullYear(),end.getUTCMonth()-1,1));
  const prevMonthEnd=new Date(Date.UTC(end.getUTCFullYear(),end.getUTCMonth(),0));
  const prevEnd=new Date(Date.UTC(prevStart.getUTCFullYear(),prevStart.getUTCMonth(),Math.min(day,prevMonthEnd.getUTCDate())));
  return {from:isoDate(prevStart),to:isoDate(prevEnd)};
}
async function rpc(name,args){const {data,error}=await supabase.rpc(name,args);if(error)throw error;return data;}
async function load(force=false){
  const f=filters();if(!validRange(f))return;
  const key=`${f.from}|${f.to}`;if(!force&&state.key===key&&state.rows.length){render();return;}
  if(state.loading)return;state.loading=true;setStatus('Consultando marcaciones y programación A&B…');
  try{
    const prev=previousComparableRange(f.to);
    const [cur,old]=await Promise.all([
      rpc('consultar_dashboard_ayb_analitica_v1',{p_desde:f.from,p_hasta:f.to}),
      rpc('consultar_dashboard_ayb_analitica_v1',{p_desde:prev.from,p_hasta:prev.to})
    ]);
    state.rows=Array.isArray(cur?.registros)?cur.registros:[];
    state.previous=Array.isArray(old?.registros)?old.registros:[];
    state.key=key;state.routeCache.clear();
    setStatus(`Lectura A&B lista · ${fmtNum(state.rows.length)} jornadas combinadas`,'ok');render();
  }catch(e){console.error('Analítica A&B:',e);setStatus(`No se pudo cargar la lectura A&B: ${e.message||e}`,'bad');}
  finally{state.loading=false;}
}
function setStatus(text,type=''){const el=$('aybControlStatus');if(!el)return;el.textContent=text;el.dataset.type=type;}
function table(headers,rows){return `<div class="aybc-table-wrap"><table class="aybc-table"><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join(''):`<tr><td colspan="${headers.length}" class="aybc-empty">Sin datos para este filtro.</td></tr>`}</tbody></table></div>`;}
function barList(rows,valueKey,labelKey){const max=Math.max(1,...rows.map(r=>Number(r[valueKey]||0)));return `<div class="aybc-bars">${rows.map(r=>`<button type="button" class="aybc-bar-row" ${r.attr||''}><span>${esc(r[labelKey])}</span><i><b style="width:${Math.max(2,100*Number(r[valueKey]||0)/max)}%"></b></i><strong>${fmtNum(r[valueKey],r.decimals||0)}</strong></button>`).join('')||'<div class="aybc-empty">Sin datos.</div>'}</div>`;}
function dailyPeople(rows,from,to){const p=presenceRows(rows),map=new Map(rangeDates(from,to).map(d=>[d,new Set()]));for(const r of p){if(map.has(r.fecha))map.get(r.fecha).add(r.cedula);}return [...map].map(([date,set])=>({date,label:date.slice(8,10)+'/'+date.slice(5,7),people:set.size}));}
function movement(rows){const map=new Map();for(const r of presenceRows(rows)){const label=String(r.subarea||'Sin subárea');if(!map.has(label))map.set(label,{label,people:new Set(),days:new Set(),marks:0});const x=map.get(label);x.people.add(r.cedula);x.days.add(`${r.cedula}|${r.fecha}`);x.marks+=Number(r.total_marcaciones||0);}return [...map.values()].map(x=>({...x,peopleCount:x.people.size,dayCount:x.days.size})).sort((a,b)=>b.peopleCount-a.peopleCount||a.label.localeCompare(b.label));}
function weekdayAverage(rows,from,to){const names=['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];const dates=rangeDates(from,to);const byDate=new Map(dailyPeople(rows,from,to).map(x=>[x.date,x.people]));const acc=Array.from({length:7},()=>({sum:0,n:0}));for(const d of dates){const wd=new Date(`${d}T00:00:00Z`).getUTCDay();acc[wd].sum+=byDate.get(d)||0;acc[wd].n++;}return [1,2,3,4,5,6,0].map(wd=>({label:names[wd],avg:acc[wd].n?acc[wd].sum/acc[wd].n:0,decimals:1}));}
function employeeDays(rows){const map=new Map();for(const r of presenceRows(rows)){if(!map.has(r.cedula))map.set(r.cedula,{cedula:r.cedula,name:r.empleado||r.cedula,subarea:r.subarea||'Sin subárea',days:new Set()});map.get(r.cedula).days.add(r.fecha);}return [...map.values()].map(x=>({...x,count:x.days.size})).sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name));}
function avgPeople(rows,from,to){const d=dailyPeople(rows,from,to);return d.length?d.reduce((s,x)=>s+x.people,0)/d.length:0;}
function renderTrends(){
  const f=filters(),rows=selectedRows(),daily=dailyPeople(rows,f.from,f.to),move=movement(rows),week=weekdayAverage(rows,f.from,f.to),rank=employeeDays(rows);
  $('aybTrendDaily').innerHTML=barList(daily.map(x=>({...x,attr:`data-ayb-day="${x.date}"`})),'people','label');
  $('aybTrendAreas').innerHTML=table(['Área / punto A&B','Personas','Días-persona','Marcaciones','Detalle'],move.map(x=>[`<button class="aybc-link" data-ayb-area="${esc(x.label)}">${esc(x.label)}</button>`,`<strong>${x.peopleCount}</strong>`,x.dayCount,fmtNum(x.marks),`<button class="aybc-link" data-ayb-area="${esc(x.label)}">Quiénes vinieron</button>`]));
  $('aybTrendWeekday').innerHTML=barList(week,'avg','label');
  $('aybTrendEmployees').innerHTML=table(['Empleado','Área / punto','Días con registro','Detalle'],rank.slice(0,30).map(x=>[`<button class="aybc-link" data-ayb-person="${esc(x.cedula)}">${esc(x.name)}</button><small>${esc(x.cedula)}</small>`,esc(x.subarea),`<strong>${x.count}</strong>`,`<button class="aybc-link" data-ayb-person="${esc(x.cedula)}">Abrir persona</button>`]));
  const prev=previousComparableRange(f.to),curAvg=avgPeople(rows,f.from,f.to),prevRows=state.previous.filter(r=>!f.employee||String(r.cedula)===String(f.employee)),prevAvg=avgPeople(prevRows,prev.from,prev.to),change=prevAvg?100*(curAvg-prevAvg)/prevAvg:null;
  $('aybTrendComparison').innerHTML=`<div class="aybc-stat"><strong>${fmtNum(curAvg,1)}</strong><span>personas/día en el período actual</span></div><div class="aybc-stat"><strong>${fmtNum(prevAvg,1)}</strong><span>personas/día · ${pretty(prev.from)} a ${pretty(prev.to)}</span></div><div class="aybc-stat"><strong>${change===null?'Sin base':`${change>=0?'+':''}${fmtNum(change,1)}%`}</strong><span>variación frente al mes anterior comparable</span></div>`;
}
function punctualityData(rows){
  const comparable=rows.filter(r=>['puntual','tarde'].includes(r.estado_puntualidad));const areas=new Map(),emps=new Map();
  for(const r of rows){const area=String(r.subarea||'Sin subárea');if(!areas.has(area))areas.set(area,{area,comp:0,on:0,late:0,mins:0,scheduled:0});const a=areas.get(area);if(r.turno||r.hora_inicio)a.scheduled++;if(!['puntual','tarde'].includes(r.estado_puntualidad))continue;a.comp++;if(r.estado_puntualidad==='tarde'){a.late++;a.mins+=Math.max(0,Number(r.diferencia_entrada_minutos||0));}else a.on++;
    if(!emps.has(r.cedula))emps.set(r.cedula,{cedula:r.cedula,name:r.empleado||r.cedula,area,comp:0,late:0,mins:0,days:[]});const e=emps.get(r.cedula);e.comp++;e.days.push(r);if(r.estado_puntualidad==='tarde'){e.late++;e.mins+=Math.max(0,Number(r.diferencia_entrada_minutos||0));}}
  return {comparable,areas:[...areas.values()].map(a=>({...a,rate:a.comp?100*a.on/a.comp:null})).sort((a,b)=>a.area.localeCompare(b.area)),employees:[...emps.values()].filter(e=>e.late>0).sort((a,b)=>b.late-a.late||b.mins-a.mins||a.name.localeCompare(b.name))};
}
function renderPunctuality(){const rows=selectedRows(),p=punctualityData(rows),late=p.comparable.filter(r=>r.estado_puntualidad==='tarde').length,on=p.comparable.length-late;$('aybPunctSummary').innerHTML=`<div class="aybc-stat"><strong>${p.comparable.length?fmtNum(100*on/p.comparable.length,1)+'%':'Sin base'}</strong><span>Puntualidad A&B</span></div><div class="aybc-stat"><strong>${p.comparable.length}</strong><span>Jornadas comparables</span></div><div class="aybc-stat"><strong>${late}</strong><span>Jornadas con tardanza</span></div>`;
  $('aybPunctAreas').innerHTML=table(['Área / punto','Puntualidad','A tiempo','Tarde','Base comparable','Minutos tarde'],p.areas.map(a=>[esc(a.area),a.rate===null?'Sin base':`${fmtNum(a.rate,1)}%`,a.on,a.late,a.comp,fmtNum(a.mins)]));
  $('aybPunctPeople').innerHTML=table(['Empleado','Área / punto','Días tarde','Base','Minutos acumulados','Detalle'],p.employees.map(e=>[`<button class="aybc-link" data-ayb-person="${esc(e.cedula)}" data-ayb-context="punctuality">${esc(e.name)}</button><small>${esc(e.cedula)}</small>`,esc(e.area),`<strong>${e.late}</strong>`,e.comp,fmtNum(e.mins),`<button class="aybc-link" data-ayb-person="${esc(e.cedula)}" data-ayb-context="punctuality">Comparar turnos y marcas</button>`]));}
function render(){if(state.active==='tendencias')renderTrends();if(state.active==='puntualidad')renderPunctuality();}
async function route(code,date){const key=`${code}|${date}`;if(state.routeCache.has(key))return state.routeCache.get(key);const data=await rpc('consultar_dashboard_ayb_recorrido_v1',{p_cedula:code,p_fecha:date});const rows=Array.isArray(data)?data:[];state.routeCache.set(key,rows);return rows;}
function hoursFromRoute(marks){if(!Array.isArray(marks)||marks.length<2)return {hours:null,criterion:'Marcación insuficiente'};let mins=0,pairs=0;for(let i=0;i+1<marks.length;i+=2){const a=new Date(marks[i].hora),b=new Date(marks[i+1].hora);const d=(b-a)/60000;if(d>=0&&d<=18*60){mins+=d;pairs++;}}return {hours:pairs?mins/60:null,criterion:marks.length%2?'Parcial: existe una marca sin pareja':'Suma de pares biométricos'};}
function dialog(){return $('aybControlDialog');}
function showDialog(title,subtitle,body){$('aybControlDialogTitle').textContent=title;$('aybControlDialogSubtitle').textContent=subtitle;$('aybControlDialogBody').innerHTML=body;dialog().showModal();}
async function openArea(label){const rows=presenceRows(selectedRows()).filter(r=>String(r.subarea||'Sin subárea')===label);const map=new Map();for(const r of rows){if(!map.has(r.cedula))map.set(r.cedula,{cedula:r.cedula,name:r.empleado||r.cedula,dates:[],marks:0});const x=map.get(r.cedula);x.dates.push(r.fecha);x.marks+=Number(r.total_marcaciones||0);}showDialog(label,'Personas con marcación en el período',table(['Empleado','Fechas con registro','Marcaciones','Detalle'],[...map.values()].sort((a,b)=>b.dates.length-a.dates.length).map(x=>[`<button class="aybc-link" data-ayb-person="${esc(x.cedula)}">${esc(x.name)}</button><small>${esc(x.cedula)}</small>`,x.dates.sort().map(pretty).join('<br>'),x.marks,`<button class="aybc-link" data-ayb-person="${esc(x.cedula)}">Abrir persona</button>`])));}
async function openPerson(code){const rows=selectedRows().filter(r=>String(r.cedula)===String(code)).sort((a,b)=>a.fecha.localeCompare(b.fecha));if(!rows.length)return;showDialog(rows[0].empleado||code,`${rows[0].subarea||'A&B'} · preparando recorridos…`,'<div class="aybc-loading">Consultando marcaciones del empleado…</div>');const enriched=[];let total=0,calc=0;let idx=0;async function worker(){while(idx<rows.length){const r=rows[idx++];let marks=[];try{marks=await route(code,r.fecha);}catch{}const w=hoursFromRoute(marks);if(w.hours!==null){total+=w.hours;calc++;}enriched.push({...r,marks,w});}}await Promise.all([worker(),worker()]);enriched.sort((a,b)=>a.fecha.localeCompare(b.fecha));const summary=`<div class="aybc-summary"><div><strong>${fmtNum(total,2)} h</strong><span>Total calculable en ${calc} jornada(s)</span></div><div><strong>${rows.length}</strong><span>Días del filtro</span></div></div>`;const body=summary+table(['Fecha','Turno','Primera marca','Última marca','Diferencia','Horas realizadas','Estado','Recorrido'],enriched.map(r=>[pretty(r.fecha),r.hora_inicio?`${esc(r.hora_inicio)} — ${esc(r.hora_fin||'—')}`:'Sin horario',r.primera_marcacion?clock(r.primera_marcacion):'—',r.ultima_marcacion?clock(r.ultima_marcacion):'—',r.diferencia_entrada_minutos==null?'No comparable':Number(r.diferencia_entrada_minutos)>0?`${r.diferencia_entrada_minutos} min tarde`:Number(r.diferencia_entrada_minutos)<0?`${Math.abs(r.diferencia_entrada_minutos)} min antes`:'Hora exacta',r.w.hours===null?'No calculable':`${fmtNum(r.w.hours,2)} h<small>${esc(r.w.criterion)}</small>`,esc(r.estado_puntualidad||''),`<button class="aybc-link" data-ayb-route="${esc(code)}" data-ayb-date="${r.fecha}">Abrir recorrido</button>`]));showDialog(rows[0].empleado||code,`${rows[0].subarea||'A&B'} · comparación turno vs marcaciones`,body);}
async function openRoute(code,date){let marks=[];try{marks=await route(code,date);}catch(e){return showDialog('Recorrido','Error',esc(e.message||e));}const w=hoursFromRoute(marks);showDialog(`Recorrido biométrico · ${pretty(date)}`,w.hours===null?'Horas no calculables':`${fmtNum(w.hours,2)} h · ${w.criterion}`,table(['Hora','Punto','Terminal','ID'],marks.map(m=>[clock(m.hora),esc(m.area_biometrico||'—'),esc(m.terminal||m.serial||'—'),esc(m.id||'')])));}
function exportPunctuality(){if(!window.XLSX){alert('No está disponible la librería de Excel.');return;}const rows=selectedRows(),p=punctualityData(rows);const wb=XLSX.utils.book_new();const areas=[['Área / punto','Puntualidad %','A tiempo','Tarde','Base comparable','Minutos tarde'],...p.areas.map(a=>[a.area,a.rate==null?'':Number(a.rate.toFixed(2)),a.on,a.late,a.comp,a.mins])];const people=[['Cédula','Empleado','Área / punto','Días tarde','Base comparable','Minutos tarde'],...p.employees.map(e=>[e.cedula,e.name,e.area,e.late,e.comp,e.mins])];const detail=[['Fecha','Cédula','Empleado','Área / punto','Turno','Entrada programada','Salida programada','Primera marca','Última marca','Diferencia min','Estado'],...rows.map(r=>[r.fecha,r.cedula,r.empleado,r.subarea,r.turno||'',r.hora_inicio||'',r.hora_fin||'',r.primera_marcacion||'',r.ultima_marcacion||'',r.diferencia_entrada_minutos??'',r.estado_puntualidad])];XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(areas),'Áreas');XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(people),'Tardanzas');XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(detail),'Detalle');const f=filters();XLSX.writeFile(wb,`Puntualidad_AYB_${f.from}_${f.to}.xlsx`);}

export function activateAybControl(panel){state.active=panel;if(panel==='tendencias'||panel==='puntualidad')load();}
window.activateAybControl=activateAybControl;

document.addEventListener('DOMContentLoaded',()=>{
  $('aybControlDialogClose')?.addEventListener('click',()=>dialog().close());
  $('aybExportPunctuality')?.addEventListener('click',exportPunctuality);
  for(const id of ['filtroFechaInicio','filtroFechaFin','filtroArea','filtroSubarea','filtroEmpleado'])$(id)?.addEventListener('change',()=>{state.key='';if(['tendencias','puntualidad'].includes(state.active))load();});
  $('btnLimpiarFiltros')?.addEventListener('click',()=>setTimeout(()=>{state.key='';if(['tendencias','puntualidad'].includes(state.active))load(true);},0));
  $('btnActualizarTablero')?.addEventListener('click',()=>{state.key='';if(['tendencias','puntualidad'].includes(state.active))load(true);});
  document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.aybArea)openArea(b.dataset.aybArea);else if(b.dataset.aybPerson)openPerson(b.dataset.aybPerson);else if(b.dataset.aybRoute)openRoute(b.dataset.aybRoute,b.dataset.aybDate);});
});
