// A&B payroll review only. No changes to scheduling, the Dashboard or BioTime.
import { modeloNomina } from './nomina-neto.js?v=714';
import { seleccionarPuntoRevision } from './revision-punto.js?v=713';
import { tramosCandidatos719, NOMBRES719 } from './nomina-candidatos.js?v=719';
const text=v=>String(v??'').trim(),norm=v=>text(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
const key=x=>text(x.cedula)+'|'+text(x.fecha).slice(0,10);
const supported=['P003','P004','P005','P008','P009','P100'];
const models=new WeakMap();
export function esAyB721(x={}){
 const p=x.jornada_actual||x;
 return [x.grupo_codigo,p.grupo_codigo,x.origen,p.origen,x.centro_costos,p.centro_costos,x.area,p.area].some(v=>/ALIMENTOS|^AYB$|^CHEF$|^COCINA/.test(norm(v)));
}
export function modeloParaNomina721(x={}){
 if(models.has(x))return models.get(x);
 const m=modeloNomina(x);
 if(esAyB721(x)&&!m.b2&&m.seleccion.completa&&m.usadas.length>=2&&m.brutos!==null&&m.brutos<=960&&m.pausa!==null&&m.pausa>=0&&m.pausa<=m.brutos){
  m.neto=m.brutos-m.pausa;m.descuentoAplicado=m.pausa;
  m.criterio='Intervalo del punto menos el descanso configurado. Las marcas intermedias se conservan para revision.';
 }
 models.set(x,m);return m;
}
export function conceptosAyB721(x,calendario){
 if(!esAyB721(x)||x.es_externo_chef||x.jornada_actual?.es_externo_chef)return [];
 const m=modeloParaNomina721(x);if(!m.eventos.length)return [];
 const festivos=new Set(calendario?.festivos?.keys?.()||[]),amounts=new Map();
 const blocks=m.b1?[{...m.b1,subarea:m.p.subarea,ultimo:!m.b2,hasta:m.b2?.start},...(m.b2?[{...m.b2,subarea:m.p.subarea_2,ultimo:true,desde:m.b1.end}]:[])]:[];
 let complete=Boolean(blocks.length&&!m.p.novedad_codigo&&!m.p.conflicto_programacion&&!m.ev?.conflicto_horario),last=null;
 for(const b of blocks){
  const ev=m.eventos.filter(e=>(b.desde==null||e.t>=b.desde)&&(b.hasta==null||e.t<b.hasta));
  const sel=seleccionarPuntoRevision(ev,ev.length,{subarea:b.subarea});
  if(sel.entrada===null||sel.salida===null||sel.usadas.length<2||sel.salida-sel.entrada>960||last!==null&&sel.entrada<last){complete=false;continue;}
  last=sel.salida;
  for(const c of tramosCandidatos719({entrada:sel.entrada,salida:sel.salida,inicio:b.start,fin:b.end,festivos})){
   if(!supported.includes(c.codigo)||(!b.ultimo&&['P003','P004','P008','P009'].includes(c.codigo)))continue;
   const prev=amounts.get(c.codigo)||{codigo:c.codigo,minutos:0,tramos:[]};prev.minutos+=c.minutos;prev.tramos.push(...c.tramos);amounts.set(c.codigo,prev);
  }
 }
 if(!complete){
  const night=m.eventos.some(v=>v.t%1440>=1140||v.t%1440<360);
  if(night){const d=text(x.fecha).slice(0,10),special=festivos.has(d)||new Date(d+'T12:00:00Z').getUTCDay()===0;
   for(const code of [special?'P100':'P005',special?'P009':'P004'])if(!amounts.has(code))amounts.set(code,{codigo:code,minutos:null,tramos:[]});
  }
 }
 return [...amounts.values()].sort((a,b)=>a.codigo.localeCompare(b.codigo)).map(c=>({...c,complete}));
}
export function agregarCandidatosAyB721(base,jornadas,calendario){
 const result=base.slice(),ids=new Set(base.map(x=>key(x)+'|'+x.concepto_codigo));
 for(const j of jornadas)for(const c of conceptosAyB721(j,calendario)){
  const k=key(j)+'|'+c.codigo;if(ids.has(k))continue;ids.add(k);
  result.push({...j,id:undefined,revision_id:`s721|${k}`,concepto_codigo:c.codigo,concepto_nombre:NOMBRES719[c.codigo],
   estado:'pendiente',estado_revision:'pendiente',permite_revision:true,origen_calculo:'vista_ayb_v721',sugerencia_721:true,
   horas_calculadas:c.minutos===null?0:Math.round(c.minutos/60*100)/100,horas_aprobadas:null,
   detalle:{calculo_pendiente:c.minutos===null||!c.complete,tramos_sugeridos:c.tramos},jornada_actual:j});
 }
 return result;
}
export const usaRevisionAyB721=x=>Boolean(x&&esAyB721(x)&&supported.includes(x.concepto_codigo)&&!x.sugerencia_719&&x.origen_calculo!=='revision_sugerida_v719');
