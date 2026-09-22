// 7.21: reuse the complete, authenticated raw read. The write dialogs still
// obtain fresh evidence and a server fingerprint before every decision.
import { minutoCivil } from './revision-evidencia.js?v=728';
const text=v=>String(v??'').trim(), key=x=>text(x.cedula)+'|'+text(x.fecha).slice(0,10);
const day=(d,n=0)=>new Date(Date.parse(d+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
const block=(d,a,b,offset=0)=>{
 let start=minutoCivil(a,d),end=minutoCivil(b,d);
 if(start===null||end===null||start===end)return null;
 start+=offset*1440;end+=offset*1440;if(end<start)end+=1440;return {start,end};
};
function bounds(h,d){
 const one=block(d,h?.hora_inicio,h?.hora_fin);
 const two=block(d,h?.hora_inicio_2,h?.hora_fin_2,one&&minutoCivil(h?.hora_inicio_2,d)<one.start?1:0);
 return {one,two};
}
export function construirEvidenciasLocales721(jornadas,marcas,programaciones=[]){
 const events=new Map(),schedules=new Map(),result=new Map();
 for(const r of marcas){
  const cedula=text(r.cedula);if(!events.has(cedula))events.set(cedula,new Map());
  for(const v of r.recorrido||[]){
   const t=minutoCivil(v.hora||v.punch_time,r.fecha);if(t===null)throw new Error('Marca con fecha no valida.');
   const id=text(v.id??v.biotime_id)||`${t}|${v.serial||v.terminal||''}`;
   const prev=events.get(cedula).get(id);
   if(prev&&prev.t!==t)throw new Error('Una marcacion cambio durante la lectura.');
   events.get(cedula).set(id,{...v,t});
  }
 }
 for(const p of programaciones){const k=key(p);if(!schedules.has(k))schedules.set(k,[]);schedules.get(k).push(p);}
 const ordered=new Map([...events].map(([k,v])=>[k,[...v.values()].sort((a,b)=>a.t-b.t||text(a.id).localeCompare(text(b.id)))]));
 for(const x of jornadas){
  const d=text(x.fecha).slice(0,10),cedula=text(x.cedula),candidates=schedules.get(key(x))||[];
  // A&B has precedence over general schedules, as in the existing backend.
  const ayb=candidates.filter(s=>s.origen==='ayb'), hs=ayb.length?ayb:candidates;
  const h=hs.length===1?hs[0]:null, b=bounds(h,d),zero=minutoCivil('00:00',d);
  const end=Math.max(b.one?.end??zero,b.two?.end??zero);
  let from=zero,to=end>=zero+1440?end+180:zero+1440;
  const prior=(schedules.get(cedula+'|'+day(d,-1))||[]).filter(s=>s.origen==='ayb');
  if(ayb.length===1&&prior.length===1){
   const p=bounds(prior[0],day(d,-1)).one;
   if(p&&p.end>=zero&&b.one?.start>p.end+180)from=p.end+180;
  }
  const recorrido=(ordered.get(cedula)||[]).filter(v=>v.t>=from&&v.t<to).map(({t,...v})=>v);
  const evidence={cedula,fecha:d,horario:h,conflicto_horario:hs.length>1,completo:true,
   recorrido,total_marcaciones:recorrido.length,primera_marcacion:recorrido[0]?.hora||null,
   ultima_marcacion:recorrido.at(-1)?.hora||null,origen_lectura:'marcaciones_completas_721'};
  if(x.documental_711){evidence.horario_documental=x;evidence.documental_711=x.documental_711;}
  result.set(key(x),evidence);
 }
 return result;
}
