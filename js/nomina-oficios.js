// Payroll-only reference overlay. Scope and schedules come from authenticated
// server data. The image's end is the BASE end: +30 minutes is a prolongation,
// never a shortened ordinary shift, never a payment without recorded evidence.
const text=v=>String(v??'').trim();
const norm=v=>text(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
export const usaOficios726=x=>Boolean(x?.oficios_726||x?.jornada_actual?.oficios_726);
function eventoMinuto(v,fecha){
 const raw=text(v.hora||v.punch_time);const s=/^\d{2}:\d{2}/.test(raw)?fecha+'T'+raw:raw.replace(' ','T');
 const z=/(Z|[+-]\d{2}:?\d{2})$/.test(s);const n=Date.parse(s+(z?'':'Z'));
 return Number.isFinite(n)?n/60000-(z?300:0):null;
}
const esPuerta=v=>norm([v.punto,v.area_alias,v.terminal_alias,v.terminal].filter(Boolean).join(' ')).includes('PORTER');
export function opcionesOficios726(config,cedula,fecha,festivos=new Set()) {
 const links=(config?.personas||[]).filter(p=>text(p.cedula)===text(cedula)&&fecha>=p.desde&&(!p.hasta||fecha<=p.hasta));
 if(!links.length||fecha<'2026-08-23')return [];
 const dow=new Date(fecha+'T12:00:00Z').getUTCDay()||7,especial=dow===7||festivos.has(fecha);
 const groups=new Set(links.map(p=>p.proceso));
 const group=groups.has('OPS_PORTERIA')?'OPS_PORTERIA':groups.has('OPS_AUX_VESTIER')?'OPS_AUX_VESTIER':'OPS_SERVICIOS_GENERALES';
 return (config.plantillas||[]).filter(c=>fecha>=c.desde&&(group==='OPS_SERVICIOS_GENERALES'||c.proceso===group)&&(!c.solo_lunes||(dow===1&&!especial)))
  .map(c=>({...c,key:'oficios726:'+c.codigo,inicio:text(especial?c.inicio_especial:c.inicio).slice(0,5),fin:text(especial?c.fin_especial:c.fin).slice(0,5)}))
  .filter(c=>c.inicio&&c.fin).sort((a,b)=>a.inicio.localeCompare(b.inicio)||a.fin.localeCompare(b.fin)||a.codigo.localeCompare(b.codigo));
}
function sugerencia(x,options) {
 const exact=options.find(o=>o.codigo===x.turno);
 if(exact&&x.programacion_tipo==='confirmada')return exact;
 if(options.length===1)return options[0];
 const inside=(x.recorrido||[]).filter(v=>!esPuerta(v)),raw=inside.length?inside:(x.recorrido||[]);
 const times=raw.map(v=>eventoMinuto(v,x.fecha)).filter(Number.isFinite).sort((a,b)=>a-b);
 if(!times.length)return null;
 // Arrival only: staying later must not silently change a reference schedule.
 const clock=times[0]%1440;
 const ranked=options.map(o=>({...o,distance:Math.abs(clock-(Number(o.inicio.slice(0,2))*60+Number(o.inicio.slice(3,5))))}));
 const distance=Math.min(...ranked.map(o=>o.distance));
 if(distance>60)return null;
 const closest=ranked.filter(o=>Math.abs(o.distance-distance)<1e-6);
 if(new Set(closest.map(o=>o.inicio+'|'+o.fin+'|'+o.pausa)).size!==1)return null;
 return closest.find(o=>o.proceso==='OPS_SERVICIOS_GENERALES'&&!o.solo_lunes)||closest[0];
}
export function aplicarHorariosOficios726(rows,config,calendario) {
 if(config?.version!=='726'||!Array.isArray(config.personas)||!Array.isArray(config.plantillas))throw new Error('No se obtuvo la configuracion vigente de Oficios Varios.');
 const festive=new Set(calendario?.festivos?.keys?.()||[]);
 return rows.map(x=>{
  const date=text(x.fecha).slice(0,10),tags=[x.grupo_codigo,x.centro_costos,x.origen,x.area,x.area_cocina].map(norm).join(' ');
  if(tags.includes('ALIMENTOS')||tags.includes('CHEF')||x.es_externo_chef)return x;
  const links=config.personas.filter(p=>text(p.cedula)===text(x.cedula)&&date>=p.desde&&(!p.hasta||date<=p.hasta));
  if(!links.length)return x;
  const options=opcionesOficios726(config,x.cedula,date,festive),meta={version:'726',opciones:options,pausa:30,prolongacion:30};
  if(x.tipo_registro==='novedad'||x.novedad_codigo)return {...x,oficios_726:meta};
  const selected=sugerencia(x,options);
  const duration=selected?Number(selected.fin.slice(0,2))*60+Number(selected.fin.slice(3,5))-Number(selected.inicio.slice(0,2))*60-Number(selected.inicio.slice(3,5)):null;
  const confirmed=selected?.codigo===x.turno&&x.programacion_tipo==='confirmada';
  // Existing renderer's priority marker, not a claim that these data came
  // from the old PDF. Reference source/version below is explicit.
  return {...x,oficios_726:{...meta,elegida:selected?.key||null},
   turno:selected?.codigo||null,turno_2:null,hora_inicio:selected?.inicio||null,hora_fin:selected?.fin||null,
   hora_inicio_2:null,hora_fin_2:null,subarea_2:null,
   minutos_descanso:30,descanso_descontable_minutos:30,descuento_almuerzo:0.5,
   horas_programadas_netas:duration===null?null:(duration-30)/60,
   horas_programadas_brutas_validas:duration===null?null:duration/60,
   programacion_tipo:confirmed?'confirmada':selected?'inferida_media':'inferida_ambigua',
   estado_calculo:selected?'valido':'por_confirmar',
   diagnostico_turno:selected?'Tabla principal de Oficios Varios. Prolongacion fuera del horario base.':'Selecciona el puesto y turno de la tabla principal al revisar.',
   documental_711:{version:'726',fuente:'Tabla principal confirmada desde 23/08/2026',codigo:selected?.codigo||null},
   conflicto_programacion:false};
 });
}
export function marcarConceptosOficios726(rows,jornadas) {
 const mapa=new Map(jornadas.map(j=>[text(j.cedula)+'|'+text(j.fecha).slice(0,10),j]));
 return rows.map(c=>{const j=mapa.get(text(c.cedula)+'|'+text(c.fecha).slice(0,10));return j?.oficios_726?{...c,oficios_726:j.oficios_726,jornada_actual:j}:c;});
}
