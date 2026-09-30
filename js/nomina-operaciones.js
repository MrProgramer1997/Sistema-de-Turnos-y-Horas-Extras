// 7.46: consume saved Operations schedules in payroll, never infer a replacement
// for an explicit assignment. Raw attendance and saved approvals are untouched.
const text=v=>String(v??'').trim();
const norm=v=>text(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
const key=x=>text(x.cedula)+'|'+text(x.fecha).slice(0,10);
const DAY=86400000;
const ops=new Set(['OPS_COORDINADOR','OPS_SERVICIOS_GENERALES','OPS_AUX_VESTIER','OPS_PORTERIA']);
const isAyb=x=>[x?.origen,x?.grupo_codigo,x?.centro_costos,x?.area,x?.jornada_actual?.origen].some(v=>/ALIMENTOS|^AYB$|^CHEF$|^COCINA/.test(norm(v)))||Boolean(x?.es_externo_chef);
const date=value=>{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))throw new Error('Fecha no valida.');
 const n=Date.parse(value+'T00:00:00Z');
 if(!Number.isFinite(n)||new Date(n).toISOString().slice(0,10)!==value)throw new Error('Fecha no valida.');
 return n;
};
function validate(r,a,b){
 if(r?.version!=='746'||r.desde!==a||r.hasta!==b||r.completa!==true||!Array.isArray(r.filas)||r.total!==r.filas.length)
  throw new Error('La programacion de Operaciones no llego completa.');
 const seen=new Set();
 for(const x of r.filas){
  if(!x?.programacion_id||!text(x.cedula)||seen.has(x.programacion_id)||!ops.has(x.proceso_codigo)||x.fecha<a||x.fecha>b||!['turno','novedad','descanso','compensatorio'].includes(x.tipo_registro))
   throw new Error('Fila de Operaciones invalida o duplicada.');
  date(x.fecha);seen.add(x.programacion_id);
  if(x.tipo_registro==='turno'&&(!/^([01]\d|2[0-3]):[0-5]\d$/.test(x.hora_inicio)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(x.hora_fin)||!Number.isInteger(x.minutos_descanso)||x.minutos_descanso<0))
   throw new Error('Horario de Operaciones incompleto.');
 }
 return r.filas;
}
export async function leerOperacionesNomina746(request,{desde,hasta,signal}){
 const start=date(desde),end=date(hasta);
 if(end<start||end-start>368*DAY)throw new Error('Periodo de Operaciones invalido.');
 const rows=[];
 for(let from=start;from<=end;from+=32*DAY){
  if(signal?.aborted)throw new DOMException('Consulta cancelada','AbortError');
  const a=new Date(from).toISOString().slice(0,10),b=new Date(Math.min(end,from+31*DAY)).toISOString().slice(0,10);
  const r=await request('consultar_operaciones_nomina_v746',{p_desde:a,p_hasta:b},{signal,read:true});
  if(signal?.aborted)throw new DOMException('Consulta cancelada','AbortError');
  if(r?.error)throw r.error;
  rows.push(...validate(r?.data,a,b));
 }
 return rows;
}
export function prepararHorarioOperaciones746(x){
 const work=x.tipo_registro==='turno';
 return {...x,operaciones_746:true,programacion_tipo:'confirmada',
  turno_2:null,hora_inicio_2:null,hora_fin_2:null,subarea_2:null,
  minutos_descanso:work?x.minutos_descanso:0,
  descanso_descontable_minutos:work?x.minutos_descanso:0,
  descuento_almuerzo:work?x.minutos_descanso/60:0,
  tipo_registro:x.tipo_registro,
  novedad_codigo:work?null:(x.novedad_codigo|| (x.tipo_registro==='compensatorio'?'COMP':'D')),
  diagnostico_turno:'Programacion guardada de Operaciones. Se conserva la pausa de esta jornada.',
  oficios_726:undefined,documental_711:undefined,almuerzo_documental_nomina:undefined,
  conflicto_programacion:false,estado_calculo:'valido',origen:'operaciones_guardada_746'};
}
export function integrarOperaciones746(jornadas,programaciones,{desde,hasta}={}){
 const byDay=new Map();
 for(const r of programaciones){
  if((desde&&r.fecha<desde)||(hasta&&r.fecha>hasta))continue;
  const k=key(r);if(!byDay.has(k))byDay.set(k,[]);byDay.get(k).push(r);
 }
 const existing=new Set(jornadas.map(key));
 const expanded=[...jornadas,...[...byDay].filter(([k])=>!existing.has(k)).map(([,p])=>({...p[0],total_marcaciones:0,recorrido:[],primera_marcacion:null,ultima_marcacion:null}))];
 return expanded.map(x=>{
  const rows=byDay.get(key(x));if(!rows?.length||isAyb(x))return x;
  // Preserve every original event and its employee/day count.
  const attendance={total_marcaciones:x.total_marcaciones,recorrido:x.recorrido,
   primera_marcacion:x.primera_marcacion,ultima_marcacion:x.ultima_marcacion,
   recorrido_fuente_jornada:x.recorrido_fuente_jornada};
  if(rows.length!==1)return {...x,...attendance,operaciones_746:true,oficios_726:undefined,documental_711:undefined,
   turno:'Programaciones en conflicto',hora_inicio:null,hora_fin:null,hora_inicio_2:null,hora_fin_2:null,
   minutos_descanso:null,descuento_almuerzo:null,descanso_descontable_minutos:null,horas_programadas_netas:null,
   conflicto_programacion:true,programacion_tipo:'inferida_ambigua',estado_calculo:'por_confirmar',
   diagnostico_turno:'Hay mas de una programacion guardada. El responsable debe revisar antes de autorizar.'};
  return {...x,...prepararHorarioOperaciones746(rows[0]),...attendance};
 });
}
export function programacionesEvidencia746(actuales,operaciones){
 const keys=new Set(operaciones.map(key));
 // Keep A&B's own precedence; remove only the duplicate general Operations row.
 return [...actuales.filter(x=>!keys.has(key(x))||isAyb(x)),...operaciones.map(prepararHorarioOperaciones746)];
}
