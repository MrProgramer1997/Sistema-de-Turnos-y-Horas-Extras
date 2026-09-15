import {codigoAsignado,analizarHorario} from "./cocina-planificacion-core.js?v=chef-7-3";
/** Centro de Control V2. Motor de lectura: no guarda, liquida ni aprueba horas. */
export const METRIC_START = '2026-08-27';
export const HISTORY_START = '2026-08-23';
const DAY = 1440;
export const norm = v => String(v ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
export const doc = v => String(v ?? '').trim().replace(/[ .-]/g, '');
export const iso = v => String(v ?? '').slice(0, 10);
export function bogotaNow(date = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date).map(x => [x.type,x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
}
export function stamp(v) {
  if (!v) return null;
  let s = String(v);
  if (/(?:Z|[+-]\d{2}:?\d{2})$/.test(s)) { const d = new Date(s); if (!Number.isFinite(+d)) return null; s = bogotaNow(d); }
  const m = s.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m || +m[2]>23 || +m[3]>59) return null;
  return Date.parse(`${m[1]}T00:00:00Z`)/60000 + +m[2]*60 + +m[3] + +(m[4]||0)/60;
}
export const dayMinute = date => Date.parse(`${iso(date)}T00:00:00Z`)/60000;
export const addDays = (date,n) => new Date((dayMinute(date)+n*DAY)*60000).toISOString().slice(0,10);
export function dates(from,to) {const a=[];for(let d=from;d&&d<=to&&a.length<100;d=addDays(d,1))a.push(d);return a;}
export const clock = v => {const m=String(v??'').match(/(?:T|\s|^)(\d{2}:\d{2})/);return m?.[1]||'\u2014';};
export function timeMin(v){const m=String(v??'').match(/^(\d{2}):(\d{2})/);return m&&+m[1]<24&&+m[2]<60?+m[1]*60 + +m[2]:null;}
const name = e => [e.nombres,e.apellidos].filter(Boolean).join(' ').trim() || e.nombre_visible || e.nombre || e.cedula;
function validLink(l,date) {return l.activo!==false && (!l.fecha_inicio||l.fecha_inicio<=date) && (!l.fecha_fin||l.fecha_fin>=date);}
export function areaOf(employee, process) {
  const p=String(process?.codigo||'').toUpperCase(), n=norm(`${process?.nombre||''} ${employee.area||''}`), c=norm(employee.centro_costos), job=norm(employee.cargo);
  let label;
  if (/^DEP_(ADMIN_TENIS|PROFESORES_TENIS|CANCHEROS)/.test(p)) label='Tenis';
  else if (/^DEP_(GOLF|ADMIN_GOLF|CUARTO_TACOS|MARSHALL)/.test(p)) label='Golf';
  else if (/^DEP_CAMPO/.test(p)) label='Campo';
  else if (/^DEP_(NATACION|SALVAVIDAS)/.test(p)) label='Nataci\u00f3n';
  else if (/^DEP_FUTBOL/.test(p)) label='F\u00fatbol';
  else if (/^DEP_GIMNASIO/.test(p)) label='Gimnasio';
  else if (/^DEP_WAKEBOARD/.test(p)) label='Wakeboard';
  else if (/^DEP_COORD/.test(p)) label='Administraci\u00f3n Deportes';
  else if (/^ADM_/.test(p)) label='Administraci\u00f3n';
  else if (/^AYB_/.test(p)) label='Alimentos y Bebidas';
  else if (/^MANT_/.test(p)) label='Mantenimiento';
  else if (/^INFRA_/.test(p)) label='Infraestructura';
  else if (/^MKT_/.test(p)) label='Comercial y Mercadeo';
  else if (/^EVS_/.test(p)) label='Eventos y Servicios';
  else if (/^OPS_SERVICIOS/.test(p)) label='Servicios Generales';
  else if (/^OPS_PORTERIA/.test(p)) label='Porter\u00eda';
  else if (/^OPS_/.test(p)) label='Operaciones';
  if(label) return {label,source:'Proceso asignado'};
  // Fallback organizacional; nunca se usa el huellero como area del empleado.
  const s=n||c;
  const tests=[[/alimentos|\bayb\b/,'Alimentos y Bebidas'],[/administrativ|administracion/,'Administraci\u00f3n'],[/servicios generales/,'Servicios Generales'],[/campo/,'Campo'],[/mantenimiento/,'Mantenimiento'],[/infraestructura/,'Infraestructura'],[/mercadeo|comercial/,'Comercial y Mercadeo'],[/eventos/,'Eventos y Servicios'],[/jubilad/,'Jubilados']];
  for(const [r,v] of tests) if(r.test(s))return {label:v,source:employee.area?'\u00c1rea registrada':'Centro de costos'};
  if(/deport|tenis|golf|natacion|futbol|gimnasio/.test(s)){
    for(const [r,v] of [[/tenis|canchero/,'Tenis'],[/golf|tacos|marshall/,'Golf'],[/natacion|salvavidas/,'Nataci\u00f3n'],[/futbol/,'F\u00fatbol'],[/gimnasio/,'Gimnasio']])if(r.test(`${s} ${job}`))return {label:v,source:'Clasificaci\u00f3n por cargo / \u00e1rea; no modifica el maestro'};
    return {label:'Deportes sin detalle',source:'Falta proceso espec\u00edfico'};
  }
  return {label:employee.area||employee.centro_costos||'Sin clasificar',source:'Dato del maestro'};
}
export function eventDirection(alias){const s=norm(alias);return /salida/.test(s)?'out':/ingreso|entrada/.test(s)?'in':'unknown';}
export function noticeLabel(code) {
 const c=norm(code).toUpperCase();
 return ({D:'Descanso',DL:'D\u00eda libre',DESCANSO:'Descanso',VAC:'Vacaciones',INC:'Incapacidad',DFAM:'D\u00eda de la familia',DIA_FAMILIA:'D\u00eda de la familia',VACACIONES:'Vacaciones',INCAPACIDAD:'Incapacidad',PER:'Permiso',PERMISO:'Permiso',LIC:'Licencia',LICENCIA:'Licencia',TC:'Trabajo desde casa',TDC:'Trabajo desde casa',TRABAJO_CASA:'Trabajo desde casa',PASA:'Permiso de salida',ELECCION:'Permiso electoral'})[c] || code || 'Novedad';
}
function fullDayNotice(code) {return ['D','DL','DESCANSO','DIA_LIBRE','VAC','VACACIONES','INC','INCAPACIDAD','DFAM','DIA_FAMILIA','TC','TDC','TRABAJO_CASA'].includes(norm(code).toUpperCase());}
export function buildModel(ctx={}, raw=[], now=bogotaNow()) {
 const byId=new Map(), byDoc=new Map(), duplicateDocs=new Set(), externalCodes=new Set();
 for(const e of ctx.externals||[])if(e.documento)externalCodes.add(doc(e.documento));
 for(const e of ctx.chefPeople||[])if(e.externo_id||/extern|extra|eventual/.test(norm(e.tipo_personal)))externalCodes.add(doc(e.documento));
 for(const q of ctx.extraQueue||[])if(/extra|extern|eventual/.test(norm(q.payload?.tipo_personal)))externalCodes.add(doc(q.emp_code));
 for(const e of ctx.employees||[]){const key=doc(e.cedula);if(byDoc.has(key))duplicateDocs.add(key);const emp={...e,cedula:key,name:name(e),external:externalCodes.has(key),known:true};byId.set(e.id,emp);byDoc.set(key,emp);}
 const proc=new Map((ctx.processes||[]).map(p=>[p.id,p])), links=new Map();
 for(const l of ctx.links||[]){if(!links.has(l.empleado_id))links.set(l.empleado_id,[]);links.get(l.empleado_id).push(l);}
 function person(code,date){code=doc(code);const e=byDoc.get(code)||{cedula:code,name:`C\u00f3digo sin vincular: ${code}`,known:false,external:externalCodes.has(code)};
   const matches=(links.get(e.id)||[]).filter(l=>validLink(l,date)&&proc.get(l.proceso_id)?.activo!==false);
   const ps=matches.map(l=>proc.get(l.proceso_id)).filter(Boolean), labels=[...new Set(ps.map(p=>areaOf(e,p).label))];
   const a=labels.length>1?{label:'Asignaci\u00f3n m\u00faltiple',source:'Revisar procesos simult\u00e1neos'}:areaOf(e,ps[0]);
   return {...e,areaLabel:a.label,areaSource:a.source,duplicate:duplicateDocs.has(code)};
 }
 const terms=new Map((ctx.terminals||[]).map(t=>[t.sn,t]));
 const events=[],seen=new Set();let duplicates=0,invalid=0;
 for(const m of raw){if(m.is_attendance===false)continue;const id=String(m.biotime_id??m.id??`${m.emp_code}|${m.punch_time}|${m.terminal_sn}`);if(seen.has(id)){duplicates++;continue;}seen.add(id);
  const t=stamp(m.punch_time);if(t===null||!Number.isFinite(t)){invalid++;continue;}
  const date=new Date(t*60000).toISOString().slice(0,10),tm=terms.get(m.terminal_sn),alias=m.terminal_alias||tm?.alias||'',pt=tm?.area_name||m.area_alias||alias||'Punto sin identificar';
  events.push({...m,id,t,date,clock:clock(new Date(t*60000).toISOString()),hour:Math.floor((t-dayMinute(date))/60),person:person(m.emp_code,date),point:pt,alias,direction:eventDirection(alias)});
 }
 events.sort((a,b)=>a.t-b.t||a.id.localeCompare(b.id));
 const perPerson=new Map(),perDay=new Map();for(const ev of events){const k=ev.person.cedula;if(!perPerson.has(k))perPerson.set(k,[]);perPerson.get(k).push(ev);const kd=`${k}|${ev.date}`;if(!perDay.has(kd))perDay.set(kd,[]);perDay.get(kd).push(ev);}
 const schedules=new Map(),codes=new Map((ctx.chefCodes||[]).map(c=>[c.codigo,c])),chefPeople=new Map((ctx.chefPeople||[]).map(p=>[p.id,p]));
 function addSchedule(code,date,s){if(!code||!date)return;const k=`${doc(code)}|${date}`;if(!schedules.has(k))schedules.set(k,[]);schedules.get(k).push({...s,code:doc(code),date});}
 for(const r of ctx.legacy||[])addSchedule(r.cedula,r.fecha,{source:'Programaci\u00f3n A&B',priority:2,begin:r.hora_inicio,end:r.hora_fin,begin2:r.hora_inicio_2,end2:r.hora_fin_2,turn:r.turno,notice:r.novedad_codigo||(/novedad|descanso/.test(norm(r.tipo_registro))?r.turno:''),id:r.id,breakMin:30});
 for(const r of ctx.general||[]){if(/cancel|rechaz|borrador/.test(norm(r.estado)))continue;addSchedule(byId.get(r.empleado_id)?.cedula,r.fecha,{source:'Programaci\u00f3n general',priority:1,begin:r.hora_inicio,end:r.hora_fin,turn:proc.get(r.proceso_id)?.nombre||'Turno',notice:r.novedad_codigo||(norm(r.tipo_registro)==='descanso'?'D':''),id:r.id,breakMin:r.minutos_descanso||0,inferred:/infer/.test(norm(r.origen_programacion))});}
 for(const r of ctx.chef||[]){if(/cancel|rechaz|borrador/.test(norm(r.estado)))continue;const p=chefPeople.get(r.cronograma_personal_id);if(!p)continue;const code=doc(byId.get(p.empleado_id)?.cedula||p.documento),a=codigoAsignado(r,codes.get(r.codigo_turno),1),b=codigoAsignado(r,codes.get(r.codigo_turno_2),2);
  addSchedule(code,r.fecha,{source:'Programaci\u00f3n Chef',priority:3,begin:a?.hora_inicio,end:a?.hora_fin,begin2:b?.hora_inicio,end2:b?.hora_fin,turn:r.codigo_turno,notice:!a?.hora_inicio?r.codigo_turno:'',id:r.id,breakMin:30,assignedNet:r.horario_asignado?analizarHorario(r.horario_asignado).netos/60:null});}
 const notices=[];
 function addNotice(r,source,code,state){const c=doc(r.cedula||byId.get(r.empleado_id)?.cedula),from=iso(r.fecha_inicio||r.fecha),to=iso(r.fecha_fin||r.fecha_inicio||r.fecha);if(!c||!from||!to||to<from)return;notices.push({id:r.id,code:c,from,to,label:noticeLabel(code),type:code,source,state,full:fullDayNotice(code),person:person(c,from)});}
 for(const r of ctx.requests||[])if(['aprobada','aprobado','autorizada','autorizado'].includes(norm(r.estado)))addNotice(r,'Solicitud aprobada',r.codigo_tipo||r.tipo_solicitud,r.estado);
 for(const r of ctx.notices||[])if(['activo','activa','aprobada','aprobado'].includes(norm(r.estado)))addNotice(r,'Novedad registrada',r.codigo,'Registrada');
 for(const r of ctx.appliedNotices||[])if(['activa','activo','aplicada','aplicado','aprobada','aprobado'].includes(norm(r.estado)))addNotice(r,'Novedad aplicada',r.tipo_novedad,r.estado);
 // Rangos continuos de novedades programadas; no se mezclan intervalos con dias de trabajo.
 const programNotice=new Map();
 for(const list of schedules.values()){const best=list.slice().sort((a,b)=>b.priority-a.priority)[0];if(best.notice){const k=`${best.code}|${best.notice}|${best.source}`;if(!programNotice.has(k))programNotice.set(k,[]);programNotice.get(k).push(best);}}
 for(const list of programNotice.values()){list.sort((a,b)=>a.date.localeCompare(b.date));let run=null;for(const s of list){if(run&&s.date===addDays(run.to,1))run.to=s.date;else{if(run)notices.push(run);run={code:s.code,from:s.date,to:s.date,type:s.notice,label:noticeLabel(s.notice),source:s.source,state:'Programada',full:fullDayNotice(s.notice),person:person(s.code,s.date)};}}if(run)notices.push(run);}
 const getNotices=(code,date)=>notices.filter(n=>n.code===code&&n.from<=date&&n.to>=date);
 const journeys=[], nightEvents=new Set();
 for(const [k,list] of schedules){const sorted=list.slice().sort((a,b)=>b.priority-a.priority),s=sorted[0],same=sorted.filter(x=>x.priority===s.priority),p=person(s.code,s.date),b=timeMin(s.begin),e=timeMin(s.end),n=getNotices(s.code,s.date),exempt=n.find(x=>x.full);
  let start=b===null?null:dayMinute(s.date)+b, end=e===null||start===null?null:dayMinute(s.date)+e;if(end!==null&&end<start)end+=DAY;
  const b2=timeMin(s.begin2),e2=timeMin(s.end2);if(b2!==null&&e2!==null&&start!==null){let end2=dayMinute(s.date)+e2;if(e2<b2)end2+=DAY;if(end2<start)end2+=DAY;end=Math.max(end??0,end2);}
  const conflict=p.duplicate||same.some(x=>[x.begin,x.end,x.notice].join('|')!==[s.begin,s.end,s.notice].join('|'));
  let status='sin_horario',entry=null,delta=null;
  if(exempt)status='justificada';
  else if(s.inferred)status='inferida';
  else if(conflict)status='conflicto';
  else if(start!==null&&end!==null&&end>start&&end-start<=20*60){
    if(start>stamp(now))status='futura';
    else{const marks=(perPerson.get(s.code)||[]).filter(x=>x.t>=start-240&&x.t<=end&&x.t<=stamp(now));
      entry=marks.find(x=>x.direction!=='out')||null;
      if(entry){delta=Math.trunc(entry.t)-start;status=delta>=1?'tarde':'puntual';}
      else status=(marks.length||(perDay.get(k)||[]).length)?'sin_entrada':end>stamp(now)?'en_espera':'sin_marca';
    }
  }
  if(start!==null&&end!==null&&end>=dayMinute(addDays(s.date,1))) {
    for(const ev of perPerson.get(s.code)||[])if(ev.date>s.date&&ev.t>=start&&ev.t<=end+120)nightEvents.add(ev.id);
  }
  journeys.push({...s,person:p,start,end,status,entry,delta,notices:n,conflict,dayEvents:perDay.get(k)||[],sourceDetail:s.source,netHours:s.assignedNet!=null?s.assignedNet:start!==null&&end!==null?Math.max(0,(end-start-(s.breakMin||0))/60):null});
 }
 const coverageKeys=new Set(journeys.map(j=>`${j.code}|${j.date}`));
 for(const [k,allEvs] of perDay)if(!coverageKeys.has(k)){const evs=allEvs.filter(e=>!nightEvents.has(e.id));if(!evs.length)continue;const ev=evs[0];journeys.push({code:ev.person.cedula,date:ev.date,person:ev.person,status:'sin_programacion',dayEvents:evs,entry:null,delta:null,notices:getNotices(ev.person.cedula,ev.date),source:'Sin programaci\u00f3n'});}
 journeys.sort((a,b)=>b.date.localeCompare(a.date)||a.person.name.localeCompare(b.person.name));
 return {ctx,raw,events,journeys,notices,person,now,today:iso(now),byDoc,perDay,diagnostic:{duplicates,invalid,rawCount:raw.length,usedCount:events.length}};
}
export function matchPerson(p,f={}){if(f.population==='club'&&(p.external||!p.known))return false;if(f.population==='external'&&!p.external)return false;if(f.area&&p.areaLabel!==f.area)return false;const q=norm(f.search);return !q||norm(`${p.name} ${p.cedula} ${p.codigo||''} ${p.cargo||''}`).includes(q);}
export function selectedEvents(model,f,metric=true){return model.events.filter(e=>e.date>=f.from&&e.date<=f.to&&e.t<=stamp(model.now)&&(!metric||e.date>=METRIC_START)&&matchPerson(e.person,f));}
export function selectedJourneys(model,f){return model.journeys.filter(j=>j.date>=f.from&&j.date<=f.to&&j.date>=METRIC_START&&j.date<=model.today&&matchPerson(j.person,f));}
export function summary(model,f){const evs=selectedEvents(model,f),js=selectedJourneys(model,f),people=new Set(evs.map(e=>e.person.cedula)),comparable=js.filter(j=>['tarde','puntual'].includes(j.status));return {events:evs,journeys:js,people:people.size,personDays:new Set(evs.map(e=>`${e.person.cedula}|${e.date}`)).size,comparable:comparable.length,late:comparable.filter(j=>j.status==='tarde').length,onTime:comparable.filter(j=>j.status==='puntual').length,unplanned:js.filter(j=>j.status==='sin_programacion').length,justified:js.filter(j=>j.status==='justificada').length,missing:js.filter(j=>['sin_marca','sin_entrada'].includes(j.status)).length,rate:comparable.length?100*comparable.filter(j=>j.status==='puntual').length/comparable.length:null};}
export function dailyFlow(evs,from,to){return dates(from,to).map(date=>{const a=evs.filter(e=>e.date===date);return {date,people:new Set(a.map(e=>e.person.cedula)).size,marks:a.length};});}
export function areaFlow(evs){const map=new Map();for(const e of evs){const label=e.person.areaLabel;if(!map.has(label))map.set(label,{label,people:new Set(),days:new Set(),hours:new Map(),marks:0});const a=map.get(label);a.people.add(e.person.cedula);a.days.add(`${e.date}|${e.person.cedula}`);a.marks++;if(!a.hours.has(e.hour))a.hours.set(e.hour,new Set());a.hours.get(e.hour).add(`${e.date}|${e.person.cedula}`);}
 return [...map.values()].map(a=>({...a,people:a.people.size,personDays:a.days.size,peak:[...a.hours].map(([hour,s])=>({hour,count:s.size})).sort((a,b)=>b.count-a.count||a.hour-b.hour)[0]})).sort((a,b)=>b.people-a.people||a.label.localeCompare(b.label));}
export function heatmap(evs,by='point'){const map=new Map();for(const e of evs){const label=by==='area'?e.person.areaLabel:e.point;if(!map.has(label))map.set(label,Array.from({length:24},()=>new Set()));map.get(label)[e.hour].add(`${e.date}|${e.person.cedula}`);}return [...map].sort((a,b)=>a[0].localeCompare(b[0])).map(([label,hours])=>({label,hours:hours.map(s=>s.size)}));}
export function punctuality(model,f){const js=selectedJourneys(model,{...f,population:'club'}),areas=new Map(),emps=new Map();
 for(const j of js){const label=j.person.areaLabel;if(!areas.has(label))areas.set(label,{label,seen:new Set(),scheduled:0,comparable:0,onTime:0,late:0,minutes:0,unplanned:0,justified:0,missing:0});const a=areas.get(label);a.seen.add(j.code);if(j.start!==null&&j.start!==undefined&&!['justificada','futura','inferida','conflicto'].includes(j.status))a.scheduled++;if(j.status==='sin_programacion')a.unplanned++;if(j.status==='justificada')a.justified++;if(['sin_marca','sin_entrada'].includes(j.status))a.missing++;
  if(!['tarde','puntual'].includes(j.status))continue;a.comparable++;a.onTime+=j.status==='puntual'?1:0;a.late+=j.status==='tarde'?1:0;a.minutes+=Math.max(0,j.delta||0);
  if(!emps.has(j.code))emps.set(j.code,{...j.person,late:0,onTime:0,comparable:0,minutes:0,days:[]});const e=emps.get(j.code);e.comparable++;e.onTime+=j.status==='puntual'?1:0;e.late+=j.status==='tarde'?1:0;e.minutes+=Math.max(0,j.delta||0);e.days.push(j);
 }
 return {journeys:js,areas:[...areas.values()].map(a=>({...a,people:a.seen.size,rate:a.comparable?100*a.onTime/a.comparable:null,coverage:a.scheduled?100*a.comparable/a.scheduled:null})),employees:[...emps.values()].map(e=>({...e,lateRate:100*e.late/e.comparable})).sort((a,b)=>b.late-a.late||b.minutes-a.minutes||a.name.localeCompare(b.name))};}
export function mergeNotices(model,f){const grouped=new Map();for(const n of model.notices){if(n.from>f.to||n.to<f.from||!matchPerson(n.person,f))continue;const k=`${n.code}|${n.type}|${n.from}|${n.to}`;if(!grouped.has(k))grouped.set(k,{...n,sources:[n.source]});else grouped.get(k).sources.push(n.source);}return [...grouped.values()].sort((a,b)=>b.to.localeCompare(a.to)||a.person.name.localeCompare(b.person.name));}
