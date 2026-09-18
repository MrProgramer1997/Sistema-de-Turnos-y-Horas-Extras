/* Fase 7.11: deterministic read model. No credentials, memberships or writes here.
 * Inputs are authenticated server data. Weekly suggestions never approve payroll.
 */
export const VERSION_DOCUMENTAL='711-20260915-v1';
export const VIGENCIA_DOCUMENTAL='2026-08-23';
export const POLITICA_SEMANAL=Object.freeze({minDias:3,minIntervalo:60,maxIntervalo:960,maxEntrada:60,minMargen:20,minCoincidencias:2});
const DAY=86400000;
const text=x=>String(x??'').trim();
export const normalizarDoc=x=>text(x).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ');
export const claveDoc=x=>`${text(x.cedula)}|${text(x.fecha).slice(0,10)}`;
export function fechaDoc(x){const f=text(x).slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(f)||!Number.isFinite(Date.parse(f+'T00:00:00Z'))||new Date(f+'T00:00:00Z').toISOString().slice(0,10)!==f)throw new Error('Fecha documental invalida');return f;}
export const sumarDiaDoc=(d,n)=>new Date(Date.parse(fechaDoc(d)+'T00:00:00Z')+n*DAY).toISOString().slice(0,10);
export const diaDoc=d=>new Date(fechaDoc(d)+'T00:00:00Z').getUTCDay()||7;
export const lunesDoc=d=>sumarDiaDoc(d,1-diaDoc(d));
function fechas(a,b){a=fechaDoc(a);b=fechaDoc(b);if(a>b)return [];if((Date.parse(b)-Date.parse(a))/DAY>366)throw new Error('Periodo documental demasiado grande');const out=[];for(let d=a;d<=b;d=sumarDiaDoc(d,1))out.push(d);return out;}
export function minutosDoc(v){const s=text(v);if(!/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(s))return null;return +s.slice(0,2)*60+ +s.slice(3,5)+ +(s.slice(6,8)||0)/60;}
function instante(v){let s=text(v).replace(' ','T');if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s))return null;const z=/(Z|[+-]\d{2}:?\d{2})$/i.test(s),t=Date.parse(s+(z?'':'Z'));return Number.isFinite(t)?t/60000-(z?300:0):null;}
function fechaCivil(t){return new Date(t*60000).toISOString().slice(0,10);}
const noCancelada=r=>!['cancelado','cancelada','anulado','anulada','eliminado','borrador'].includes(text(r.estado).toLowerCase());
function avisoCompleto(n){return /^(INC|VAC|V|DF|DFAM|D|COMP|PNR|LUTO|MATR|INCAPACIDAD|VACACIONES|DIA_LIBRE|DIA_FAMILIA|PERMISO_NO_REMUNERADO|LICENCIA_MATERNIDAD|LICENCIA_PATERNIDAD|MATRIMONIO)$/.test(normalizarDoc(n.codigo));}
function exclusivo(t){return [t.tipo,t.entrada,t.salida,t.descanso_descontable_minutos].join('|');}
export function validarPlantilla(t){
 if(!t||!text(t.codigo)||!Array.isArray(t.dias)||t.dias.length!==7||new Set(t.dias.map(d=>d.dia)).size!==7)throw new Error('Plantilla incompleta');
 let total=0;
 for(const d of t.dias){if(!Number.isInteger(d.dia)||d.dia<1||d.dia>7)throw new Error('Dia semanal invalido');
  if(d.tipo==='laboral'){
   const a=minutosDoc(d.entrada),b=minutosDoc(d.salida),pausa=d.descanso_descontable_minutos;
   if(a===null||b===null||a===b||!Number.isInteger(pausa)||pausa<0)throw new Error('Horario documental invalido');
   const bruto=(b-a+1440)%1440;if(pausa>=bruto)throw new Error('Descanso mayor o igual a la jornada');
   if(d.pausa_documentada_minutos===15&&(pausa!==0||d.pausa_remunerada_minutos!==15))throw new Error('El break confirmado de 15 minutos no se descuenta');
   if(bruto-pausa!==d.neto_programado_minutos)throw new Error('Total diario de la plantilla no coincide');total+=bruto-pausa;
  } else if(d.entrada!==null||d.salida!==null)throw new Error('Dia no laborable con horario');
 }
 if(total!==t.neto_semanal_minutos)throw new Error('Total semanal documental no coincide');
 return t;
}
export function validarPaqueteDoc(p){
 if(!p||p.version!==VERSION_DOCUMENTAL||p.solo_lectura!==true)throw new Error('Version del servicio documental no compatible');
 for(const k of ['plantillas','personas','guardadas','protegidas','marcas','novedades','casos_confirmados','festivos','pendientes_vinculo'])if(!Array.isArray(p[k]))throw new Error('Respuesta documental incompleta: '+k);
 if(instante(p.generado_at)===null)throw new Error('Falta fecha de corte del servidor');fechaDoc(p.desde);fechaDoc(p.hasta);fechaDoc(p.contexto_desde);fechaDoc(p.contexto_hasta);
 if(p.contexto_desde>p.contexto_hasta||p.total_marcas!==p.marcas.length)throw new Error('Conteo o rango documental inconsistente');
 const allowed=new Set(p.personas.map(x=>text(x.cedula))),ids=new Set();
 for(const t of p.plantillas)validarPlantilla(t);
 for(const m of p.marcas){if(!allowed.has(text(m.cedula))||m.id==null||ids.has(String(m.id))||instante(m.hora)===null)throw new Error('Evidencia duplicada, invalida o fuera del alcance');ids.add(String(m.id));}
 for(const s of [...p.guardadas,...p.protegidas,...p.casos_confirmados,...p.novedades])if(!allowed.has(text(s.cedula)))throw new Error('Fila documental fuera del alcance');
 return p;
}
function evidenciasSemana(persona,week,p){
 const map=new Map(),fin=sumarDiaDoc(week,6),today=fechaCivil(instante(p.generado_at));
 for(const m of p.marcas){if(text(m.cedula)!==text(persona.cedula))continue;const t=instante(m.hora),d=fechaCivil(t);if(d<week||d>fin||d<VIGENCIA_DOCUMENTAL||d>=today||d<persona.vigente_desde||(persona.vigente_hasta&&d>persona.vigente_hasta)||(persona.fecha_ingreso&&d<persona.fecha_ingreso))continue;
  if(p.protegidas.some(v=>text(v.cedula)===text(persona.cedula)&&v.fecha===d))continue;
  if(p.novedades.some(n=>text(n.cedula)===text(persona.cedula)&&avisoCompleto(n)&&n.fecha_inicio<=d&&n.fecha_fin>=d))continue;
  if(p.casos_confirmados.some(c=>text(c.cedula)===text(persona.cedula)&&c.fecha===d))continue; // A one-day exception is not proof of the entire rotation.
  if(!map.has(d))map.set(d,[]);map.get(d).push({...m,t});
 }
 const out=[];
 for(const [fecha,all] of map){all.sort((a,b)=>a.t-b.t);let use=all;
  const gates=all.filter(m=>normalizarDoc(m.punto||m.terminal).includes('PORTER'));
  if(gates.length>=2)use=gates;
  if(use.length<2)continue;const span=use.at(-1).t-use[0].t;
  if(span<POLITICA_SEMANAL.minIntervalo||span>POLITICA_SEMANAL.maxIntervalo)continue;
  const dayBase=Date.parse(fecha+'T00:00:00Z')/60000;
  out.push({fecha,dia:diaDoc(fecha),entrada:use[0].t-dayBase,salida:use.at(-1).t-dayBase,marcas:use.map(m=>m.id),criterio:gates.length>=2?'porteria':'primera_ultima'});
 }
 return out.sort((a,b)=>a.fecha.localeCompare(b.fecha));
}
export function detectarSemana(persona,week,p){
 const ts=persona.plantillas.map(code=>p.plantillas.find(t=>t.codigo===code));if(ts.some(t=>!t))throw new Error('Falta una plantilla autorizada');
 if(ts.length===1)return {semana:week,desde:week,hasta:sumarDiaDoc(week,6),tipo:'fija',confianza:'documentada',elegida:ts[0].codigo,dias_evidencia:0,alternativas:[],motivo:'Horario unico estipulado por Bienestar; no depende de las marcaciones.'};
 let obs=evidenciasSemana(persona,week,p);const holidays=new Set(p.festivos.map(f=>f.fecha));obs=obs.filter(o=>!holidays.has(o.fecha));
 const equivalent=new Map();for(const t of ts){const sig=t.dias.slice().sort((a,b)=>a.dia-b.dia).map(exclusivo).join(';');if(!equivalent.has(sig))equivalent.set(sig,[]);equivalent.get(sig).push(t);}
 const scored=[...equivalent.values()].map(list=>{
  const t=list[0],details=obs.map(o=>{const d=t.dias.find(d=>d.dia===o.dia);if(d.tipo!=='laboral')return {...o,entrada_desviacion:null,coste:120,fuera_plantilla:true};
   const da=Math.abs(o.entrada-minutosDoc(d.entrada)),de=Math.abs(o.salida-minutosDoc(d.salida));return {...o,entrada_desviacion:da,coste:Math.min(da,180)*.8+Math.min(de,60)*.2,fuera_plantilla:false};});
  const costes=details.filter(x=>!x.fuera_plantilla).map(x=>x.coste).sort((a,b)=>a-b);
  // Never discard positive work on a day absent from a candidate template.
  // Otherwise a Saturday would be trimmed as an outlier and both rotations
  // would appear identical. Only trim a scheduled-day outlier with 5+ such days.
  const robust=[...(costes.length>=5?costes.slice(0,-1):costes),...details.filter(x=>x.fuera_plantilla).map(x=>x.coste)];
  const score=robust.length?robust.reduce((a,b)=>a+b,0)/robust.length:null;
  return {codigo:t.codigo,equivalentes:list.map(x=>x.codigo),puntaje:score,dias:details,
   coincidencias:details.filter(d=>d.entrada_desviacion!==null&&d.entrada_desviacion<=45).length,
   fuera:details.filter(d=>d.fuera_plantilla).length,
   media_entrada:details.some(d=>d.entrada_desviacion!==null)?details.filter(d=>d.entrada_desviacion!==null).reduce((s,d)=>s+d.entrada_desviacion,0)/details.filter(d=>d.entrada_desviacion!==null).length:Infinity};
 }).sort((a,b)=>(a.puntaje??Infinity)-(b.puntaje??Infinity)||a.codigo.localeCompare(b.codigo));
 const a=scored[0],b=scored[1],margin=a?.puntaje!=null&&b?.puntaje!=null?b.puntaje-a.puntaje:null;
 const distinct=obs.filter(o=>new Set(ts.map(t=>exclusivo(t.dias.find(d=>d.dia===o.dia)))).size>1).length;
 const strong=obs.length>=POLITICA_SEMANAL.minDias&&distinct>0&&a?.coincidencias>=POLITICA_SEMANAL.minCoincidencias&&a?.media_entrada<=POLITICA_SEMANAL.maxEntrada&&a.fuera===0&&(margin===null?scored.length===1:margin>=POLITICA_SEMANAL.minMargen);
 const reason=obs.length<POLITICA_SEMANAL.minDias?'Faltan dias completos de evidencia para distinguir la semana.':!distinct?'Los horarios coinciden en los dias observados; no se usa una ausencia como prueba de descanso.':strong?'Patron semanal compatible con una plantilla. Detectado automaticamente; no equivale a asignacion confirmada ni aprueba extras.':'La evidencia semanal no diferencia los turnos con suficiente claridad; no se cambia el horario dia por dia para ajustarlo a una tardanza.';
 return {semana:week,desde:week,hasta:sumarDiaDoc(week,6),tipo:'rotativa',confianza:strong?'alta':'por_confirmar',elegida:strong?a.codigo:null,dias_evidencia:obs.length,dias_distintivos:distinct,margen:margin,alternativas:scored.map(x=>({codigo:x.codigo,puntaje:x.puntaje,equivalentes:x.equivalentes,dias:x.dias})),motivo:reason};
}
function normalizarGuardada(r){
 const out={...r,fecha:text(r.fecha).slice(0,10),hora_inicio:text(r.hora_inicio).slice(0,5)||null,hora_fin:text(r.hora_fin).slice(0,5)||null,hora_inicio_2:text(r.hora_inicio_2).slice(0,5)||null,hora_fin_2:text(r.hora_fin_2).slice(0,5)||null,programacion_tipo:'confirmada',origen:'general'};
 const a=minutosDoc(out.hora_inicio),b=minutosDoc(out.hora_fin),c=minutosDoc(out.hora_inicio_2),d=minutosDoc(out.hora_fin_2),pausa=Number(r.minutos_descanso||0);
 let gross=a===null||b===null||a===b?null:(b-a+1440)%1440;
 if(c!==null||d!==null){if(gross===null||c===null||d===null||c===d)gross=null;else{const start2=c+(c<a?1440:0),end2=start2+(d-c+1440)%1440;if(start2<a+gross||end2-a>=1440)gross=null;else gross+=(d-c+1440)%1440;}}
 out.horas_programadas_netas=gross===null||!Number.isFinite(pausa)||pausa<0||pausa>=gross?null:(gross-pausa)/60;
 return out;
}
export function resolverDocumentados(p){
 validarPaqueteDoc(p);const rows=[],semanas=[],protegidas=new Set(p.protegidas.map(claveDoc)),festivos=new Set(p.festivos.map(f=>f.fecha));
 const personas=new Map();for(const a of p.personas){const key=text(a.cedula);if(!personas.has(key))personas.set(key,[]);personas.get(key).push(a);}
 for(const [cedula,vinculos] of personas){const persona=vinculos[0],plans=new Map();
  for(const fecha of fechas(p.desde,p.hasta)){
   if(fecha<VIGENCIA_DOCUMENTAL||persona.fecha_ingreso&&fecha<persona.fecha_ingreso||protegidas.has(`${cedula}|${fecha}`))continue;
   const bindings=vinculos.filter(v=>fecha>=v.vigente_desde&&(!v.vigente_hasta||fecha<=v.vigente_hasta));if(!bindings.length)continue;
   const conflicting=new Set(bindings.map(b=>b.plantillas.join('|'))).size>1;
   const member=bindings[0],week=lunesDoc(fecha);
   const planKey=[week,member.plantillas.join('|'),member.vigente_desde,member.vigente_hasta||''].join('::');
   if(!plans.has(planKey)){const s=detectarSemana(member,week,p);plans.set(planKey,s);semanas.push({...s,cedula,nombre:member.nombre,vigente_desde:member.vigente_desde,vigente_hasta:member.vigente_hasta});}
   const plan=plans.get(planKey),caseRows=p.casos_confirmados.filter(r=>text(r.cedula)===cedula&&r.fecha===fecha),saved=p.guardadas.filter(r=>text(r.cedula)===cedula&&r.fecha===fecha&&noCancelada(r)),notices=p.novedades.filter(n=>text(n.cedula)===cedula&&n.fecha_inicio<=fecha&&n.fecha_fin>=fecha&&avisoCompleto(n));
   const base={cedula,empleado_id:member.id,empleado:member.nombre,cargo:member.cargo,area:member.area||member.centro_costos,centro_costos:member.centro_costos,fecha};
   const meta={version:p.version,semana:week,fuente:member.fuente,desde:member.vigente_desde,horario_en_bd:saved,plan,solo_lectura:true};
   let r;
   if(conflicting){r={...base,programacion_tipo:'Sin programacion',estado_comparacion:'programacion_a_revisar',conflicto_programacion:true,diagnostico_turno:'Varios vinculos documentales para la misma fecha. No se elige una identidad o plantilla arbitraria.'};meta.tipo='conflicto';}
   else if(notices.length){r={...base,programacion_tipo:'confirmada',tipo_registro:'novedad',novedad_codigo:notices[0].codigo,turno:notices[0].codigo,diagnostico_turno:'Novedad registrada: prevalece sobre el horario automatico.'};meta.tipo='novedad';}
   else if(caseRows.length===1){const c=caseRows[0];r={...base,turno:c.plantilla,hora_inicio:c.entrada,hora_fin:c.salida,minutos_descanso:c.descanso_descontable_minutos,horas_programadas_netas:((minutosDoc(c.salida)-minutosDoc(c.entrada)+1440)%1440-c.descanso_descontable_minutos)/60,programacion_tipo:'confirmada',tipo_registro:'turno',diagnostico_turno:c.fuente};meta.tipo='confirmacion_usuario';meta.fuente=c.fuente;meta.reconciliar_guardado=saved.some(s=>text(s.hora_inicio).slice(0,5)!==c.entrada||text(s.hora_fin).slice(0,5)!==c.salida);}
   else if(saved.length){const uniq=new Set(saved.map(s=>[s.hora_inicio,s.hora_fin,s.hora_inicio_2,s.hora_fin_2,s.minutos_descanso,s.novedad_codigo].join('|')));r={...base,...normalizarGuardada(saved[0])};if(uniq.size>1){r.conflicto_programacion=true;r.estado_comparacion='programacion_a_revisar';r.programacion_tipo='Sin programacion';meta.tipo='conflicto';}else meta.tipo='guardada';r.diagnostico_turno=uniq.size>1?'Asignaciones guardadas incompatibles; se requiere revision.':'Asignacion guardada: no se reemplaza por una inferencia semanal.';
    const authorizedDays=member.plantillas.map(code=>p.plantillas.find(t=>t.codigo===code)?.dias.find(d=>d.dia===diaDoc(fecha))).filter(Boolean),expected=member.plantillas.length===1?authorizedDays[0]:null;
    const matchingDays=authorizedDays.filter(d=>d.tipo==='laboral'&&d.entrada===r.hora_inicio&&d.salida===r.hora_fin),paid15=matchingDays.length>0&&matchingDays.every(d=>d.pausa_documentada_minutos===15&&d.descanso_descontable_minutos===0);
    if(uniq.size===1&&!r.hora_inicio_2&&!r.hora_fin_2&&paid15&&Number(r.minutos_descanso)===15){
      r.minutos_descanso=0;r.horas_programadas_netas=matchingDays[0].neto_programado_minutos/60;meta.pausa_remunerada_minutos=15;meta.reconciliar_guardado=true;r.diagnostico_turno='Break de 15 minutos incluido en la jornada por confirmacion del usuario. El registro antiguo requiere reconciliacion sin alterar marcaciones.';
    } else if(uniq.size===1&&expected?.tipo==='laboral'&&(r.hora_inicio!==expected.entrada||r.hora_fin!==expected.salida)){
      meta.conflicto_documental=true;r.diagnostico_turno='El horario guardado difiere de la plantilla fija documentada. Se conserva la asignacion y se requiere comprobar si es una excepcion, no se sustituye a ciegas.';
    }}
   else if(festivos.has(fecha)){r={...base,programacion_tipo:'Sin programacion',diagnostico_turno:'Festivo: los documentos no indican excepcion. Falta horario especifico, no se usa automaticamente el laboral.'};meta.tipo='festivo_sin_regla';}
   else {
    const t=p.plantillas.find(t=>t.codigo===plan.elegida),d=t?.dias.find(d=>d.dia===diaDoc(fecha));
    if(t&&d?.tipo==='laboral'){r={...base,turno:t.codigo,hora_inicio:d.entrada,hora_fin:d.salida,minutos_descanso:d.descanso_descontable_minutos,horas_programadas_netas:d.neto_programado_minutos/60,programacion_tipo:plan.tipo==='fija'?'confirmada':'inferida_alta',confianza_turno:plan.tipo==='fija'?'documentada':'alta',tipo_registro:'turno',diagnostico_turno:plan.motivo};meta.tipo=plan.tipo==='fija'?'documental_fija':'deteccion_semanal';meta.pausa_remunerada_minutos=d.pausa_remunerada_minutos;meta.meta_semanal_minutos=t.neto_semanal_minutos;meta.plantilla=t.codigo;}
    else if(t&&d?.tipo.startsWith('compensatorio')&&plan.tipo==='fija'){r={...base,programacion_tipo:'confirmada',tipo_registro:'novedad',novedad_codigo:'COMP',turno:'COMP',diagnostico_turno:'Compensatorio indicado en la plantilla documental; no se generan horas trabajadas.'};meta.tipo='compensatorio_documental';}
    else {r={...base,programacion_tipo:plan.tipo==='rotativa'?'inferida_ambigua':'Sin programacion',confianza_turno:plan.tipo==='rotativa'?'ambigua':null,estado_comparacion:plan.tipo==='rotativa'?'turno_ambiguo':'sin_programacion',diagnostico_turno:t?'Dia no laborable indicado para esta alternativa o dia no especificado. No se presume inasistencia.':plan.motivo};meta.tipo='pendiente';}
   }
   r.hora_inicio??=null;r.hora_fin??=null;r.hora_inicio_2??=null;r.hora_fin_2??=null;r.novedad_codigo??=null;r.origen='documental_v711';r.documental_711=meta;
   r.alternativas_turno=plan.alternativas.slice(0,3).map(a=>{const t=p.plantillas.find(t=>t.codigo===a.codigo),d=t.dias.find(d=>d.dia===diaDoc(fecha));return {turno:a.codigo,inicio:d.entrada||'Sin horario',fin:d.salida||'Sin horario',puntaje:a.puntaje,codigos_equivalentes:a.equivalentes};});
   rows.push(r);
  }
 }
 return {version:p.version,desde:p.desde,hasta:p.hasta,rows,semanas,pendientes_vinculo:p.pendientes_vinculo};
}
export function superponerDocumentados(jornadas,doc){
 const index=new Map(doc.rows.map(r=>[claveDoc(r),r])),out=[],done=new Set();
 for(const old of jornadas){const k=claveDoc(old),r=index.get(k);if(!r){out.push(old);continue;}
  // Always retain all raw evidence and identifiers from the current complete load.
  const merged={...old,...r,recorrido:old.recorrido,recorrido_fuente_jornada:old.recorrido_fuente_jornada,total_marcaciones:old.total_marcaciones,primera_marcacion:old.primera_marcacion,ultima_marcacion:old.ultima_marcacion};
  const base=Date.parse(r.fecha+'T00:00:00Z')/60000,start=minutosDoc(r.hora_inicio),end=minutosDoc(r.hora_fin),start2=minutosDoc(r.hora_inicio_2),end2=minutosDoc(r.hora_fin_2),ent=instante(old.primera_marcacion),sal=instante(old.ultima_marcacion),ok=start!==null&&end!==null&&!r.novedad_codigo&&!r.conflicto_programacion&&['confirmada','inferida_alta'].includes(r.programacion_tipo);
  const endAbs=start2!==null&&end2!==null?end2+(start2<start?1440:0)+(end2<start2?1440:0):end+(end<start?1440:0);
  merged.minutos_tarde=ok&&ent!==null?Math.max(0,Math.floor(ent-(base+start))):null;
  merged.minutos_posteriores_turno=ok&&sal!==null&&Number(old.total_marcaciones)>1?Math.max(0,Math.floor(sal-(base+endAbs))):null;
  merged.minutos_salida_anticipada=ok&&sal!==null&&Number(old.total_marcaciones)>1?Math.max(0,Math.floor(base+endAbs-sal)):null;
  merged.estado_comparacion=r.novedad_codigo?'novedad':Number(old.total_marcaciones)===1?'marcacion_unica':ok?(!old.total_marcaciones?'programado_sin_marcaciones':r.programacion_tipo==='confirmada'?'comparable':'comparable_inferida'):(r.estado_comparacion||'sin_programacion');
  out.push(merged);done.add(k);
 }
 // Includes known active employees already present in the catalog universe only.
 // No fictitious employee/day is appended outside that catalog.
 return out;
}
export function columnasDocumentales(r){const d=r.documental_711||r.jornada_actual?.documental_711;if(!d)return {};
 return {'Version horario documental':d.version,'Fuente del horario':d.fuente,'Vigencia horario':d.desde,'Tipo resolucion semanal':d.tipo,'Semana evaluada':d.semana,'Dias con evidencia semanal':d.plan.dias_evidencia,'Plantilla semanal elegida':d.plan.elegida||'Sin resolver','Break remunerado (min)':d.pausa_remunerada_minutos??null,'Meta semanal documental (h)':d.meta_semanal_minutos==null?null:d.meta_semanal_minutos/60,'Asignacion original distinta':d.reconciliar_guardado?'SI - revisar base':'NO'};}
