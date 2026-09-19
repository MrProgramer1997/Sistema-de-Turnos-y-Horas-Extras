/* 7.19: suggestions are review evidence, never payment authorization.
 * Keep raw timestamps. Associate an early exit with the visit that started
 * the previous day only when the gate sequence corroborates that visit. */
import { modeloNomina, esAyBChefNomina } from './nomina-neto.js?v=714';
import { minutoCivil } from './revision-evidencia.js?v=715';
import { normalizarPunto, esPorteria, etiquetaPunto } from './revision-punto.js?v=713';
const text=v=>String(v??'').trim();
const key=x=>`${text(x.cedula)}|${text(x.fecha).slice(0,10)}`;
export const fecha719=t=>new Date(Math.round(t*60000)).toISOString().slice(0,10);
export const sumarDia719=(d,n)=>new Date(Date.parse(d+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
export const NOMBRES719={P003:'EXTRA DIURNA',P004:'EXTRA NOCTURNA',P005:'RECARGO NOCTURNO',P006:'DOMINICAL COMPENSADO',P007:'FESTIVO',P008:'EXTRA FESTIVA DIURNA',P009:'EXTRA FESTIVA NOCTURNA',P100:'RECARGO NOCTURNO DOMINICAL O FESTIVO'};
export function sentidoPuerta719(v){
 if(!esPorteria(v))return '';
 const label=normalizarPunto([v.terminal_alias,v.terminal].filter(Boolean).join(' '));
 return label.includes('SALIDA')?'salida':label.includes('INGRESO')||label.includes('ENTRADA')?'ingreso':'';
}
export function agruparCruces719(rows){
 const people=new Map(),originals=new Map();
 for(const r of rows){
  const cedula=text(r.cedula);if(!cedula)continue;
  if(!people.has(cedula))people.set(cedula,new Map());
  for(const v of r.recorrido||[]){
   const t=minutoCivil(v.hora||v.punch_time,r.fecha);if(t===null)continue;
   const id=text(v.id??v.biotime_id)||`${t}|${v.serial||v.terminal||''}`;
   const event={...v,t,cedula,_id:id,_fecha:fecha719(t)},prev=people.get(cedula).get(id);
   if(prev&&prev.t!==t)throw new Error('Una marcacion cambio durante la lectura. Actualiza el corte.');
   people.get(cedula).set(id,event);
  }
 }
 const result=new Map(),changed=new Set(),crossings=[];
 for(const [cedula,byId] of people){
  const events=[...byId.values()].sort((a,b)=>a.t-b.t||a._id.localeCompare(b._id));
  let entry=null;const visits=[];
  for(const v of events){
   const dir=sentidoPuerta719(v);if(dir==='ingreso')entry=v;
   if(dir==='salida'){
    if(entry&&entry._fecha===sumarDia719(v._fecha,-1)&&v.t-entry.t<=960&&v.t%1440<360){
     const inside=events.filter(e=>e.t>=entry.t&&e.t<=v.t&&!esPorteria(e));
     const groups=new Set(inside.map(e=>normalizarPunto(etiquetaPunto(e))).filter(Boolean));
     if(groups.size===1&&inside.some(e=>e._fecha===entry._fecha)&&inside.some(e=>e._fecha===v._fecha)){
      const visit={cedula,inicio:entry.t,fin:v.t,fecha:entry._fecha};visits.push(visit);crossings.push(visit);
     }
    }
    entry=null;
   }
  }
  for(const v of events){
   const visit=visits.find(w=>v.t>=w.inicio&&v.t<=w.fin);
   const assigned=visit?.fecha||v._fecha,k=cedula+'|'+assigned,original=cedula+'|'+v._fecha;
   if(assigned!==v._fecha){changed.add(k);changed.add(original);}
   if(!result.has(k))result.set(k,[]);
   result.get(k).push({...v,fecha_marcacion:v._fecha,fecha_jornada:assigned});
   originals.set(cedula+'|'+v._id,{original,assigned:k});
  }
 }
 const count=[...result.values()].reduce((n,x)=>n+x.length,0);
 if(count!==originals.size)throw new Error('La asociacion de madrugada duplico o perdio una marcacion.');
 return {porDia:result,cambiadas:changed,cruces:crossings,total:count};
}
export function aplicarCruces719(jornadas,marcasConMargen){
 const grouped=agruparCruces719(marcasConMargen);
 return jornadas.map(x=>{
  if(esAyBChefNomina(x)||!grouped.cambiadas.has(key(x)))return x;
  const events=grouped.porDia.get(key(x))||[];
  const recorrido=events.map(({t,cedula,_id,_fecha,...v})=>v);
  const nota='Salida de madrugada asociada a la jornada de ingreso. Las fechas originales de las marcaciones se conservan.';
  const evidence={...(x.evidencia_revision||{}),cedula:x.cedula,fecha:x.fecha,recorrido,total_marcaciones:recorrido.length,
   primera_marcacion:recorrido[0]?.hora||null,ultima_marcacion:recorrido.length>1?recorrido.at(-1).hora:null,completo:true};
  return {...x,total_marcaciones:recorrido.length,recorrido,primera_marcacion:evidence.primera_marcacion,
   ultima_marcacion:evidence.ultima_marcacion,evidencia_revision:evidence,
   agrupacion_719:{nota,fecha_calendario_total:x.total_marcaciones,fecha_calendario_recorrido:x.recorrido}};
 });
}
/** Disjoint ordinary / overtime periods; classify every segment by its actual
 * civil date. Preserve the existing >25-minute candidate rule. */
export function tramosCandidatos719({entrada,salida,inicio,fin,festivos=new Set()}){
 const out=new Map();
 const add=(code,a,b)=>{if(b<=a)return;const c=out.get(code)||{codigo:code,minutos:0,tramos:[]};c.minutos+=b-a;c.tramos.push({inicio:a,fin:b,fecha:fecha719(a)});out.set(code,c);};
 if([entrada,salida,inicio,fin].some(v=>v===null||!Number.isFinite(v))||salida<=entrada||fin<=inicio)return [];
 for(let day=Math.floor(entrada/1440)*1440;day<salida;day+=1440){
  const d=fecha719(day),special=festivos.has(d)||new Date(d+'T12:00:00Z').getUTCDay()===0;
  for(const [lo,hi,night] of [[day,day+360,true],[day+360,day+1140,false],[day+1140,day+1440,true]]){
   const a=Math.max(entrada,inicio,lo),b=Math.min(salida,fin,hi);
   if(night)add(special?'P100':'P005',a,b);
   if(special)add(festivos.has(d)?'P007':'P006',a,b);
   if(salida-fin>25+1e-8)add(special?(night?'P009':'P008'):(night?'P004':'P003'),Math.max(entrada,fin,lo),Math.min(salida,hi));
  }
 }
 return [...out.values()].sort((a,b)=>a.codigo.localeCompare(b.codigo));
}
function variasVisitas(m){
 const gates=m.eventos.filter(v=>v.t>m.entrada&&v.t<m.salida);
 return gates.some(a=>sentidoPuerta719(a)==='salida'&&gates.some(b=>b.t>a.t&&sentidoPuerta719(b)==='ingreso'));
}
export function candidatosDeJornada719(x,calendario){
 if(esAyBChefNomina(x)||!Number(x.total_marcaciones))return [];
 const m=modeloNomina(x),festivos=new Set(calendario?.festivos?.keys?.()||[]);
 const night=m.eventos.some(v=>v.t%1440>=1140||v.t%1440<360);
 const clear=Boolean(m.seleccion?.parClaro&&m.b1&&!m.b2&&m.brutos!==null&&!m.p.novedad_codigo&&!m.p.conflicto_programacion&&!variasVisitas(m));
 let found=clear?tramosCandidatos719({entrada:m.entrada,salida:m.salida,inicio:m.b1.start,fin:m.b1.end,festivos}):[];
 if(!clear&&night){
  const special=festivos.has(text(x.fecha).slice(0,10))||new Date(text(x.fecha).slice(0,10)+'T12:00:00Z').getUTCDay()===0;
  found=[{codigo:special?'P100':'P005',minutos:null,tramos:[]},{codigo:special?'P009':'P004',minutos:null,tramos:[]}];
 }
 return found.map(c=>({...x,id:undefined,revision_id:`s719|${key(x)}|${c.codigo}`,concepto_codigo:c.codigo,
  concepto_nombre:NOMBRES719[c.codigo],estado:'pendiente',estado_revision:'pendiente',permite_revision:true,
  origen_calculo:'vista_sugerida_v719',sugerencia_719:true,horas_aprobadas:null,
  horas_calculadas:c.minutos===null?0:Math.round(c.minutos/60*100)/100,
  detalle:{calculo_pendiente:c.minutos===null,sugerencia_719:true,tramos_sugeridos:c.tramos,
   criterio:'Referencia para revisar; valida el turno, las pausas y cada concepto. No son horas aprobadas.'},
  jornada_actual:x,evidencia_revision:x.evidencia_revision}));
}
export function agregarSugerencias719(base,jornadas,calendario){
 const stored=new Set(base.map(x=>key(x)+'|'+x.concepto_codigo)),nuevos=[];
 for(const j of jornadas)for(const c of candidatosDeJornada719(j,calendario)){
  const k=key(c)+'|'+c.concepto_codigo;if(!stored.has(k)){stored.add(k);nuevos.push(c);}
 }
 return [...base,...nuevos];
}
export const usaRevision719=x=>Boolean(x?.sugerencia_719||x?.origen_calculo==='revision_sugerida_v719');
