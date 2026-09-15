/* Read-only diagnostics. Does not turn estimates into assigned schedules or payments. */
import { modeloRevision, minutoCivil, escaparRevision as esc, requiereRevisionNocturna } from './revision-evidencia.js?v=7-7';
const s=v=>String(v??'').trim();
const n=v=>v===null||v===undefined||v===''||!Number.isFinite(Number(v))?null:Number(v);
const norm=v=>s(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
export const fechaClave=x=>s(x.fecha).slice(0,10);
export function fechaValida(f){return /^\d{4}-\d{2}-\d{2}$/.test(f)&&Number.isFinite(Date.parse(f+'T00:00:00Z'))&&new Date(f+'T00:00:00Z').toISOString().slice(0,10)===f;}
export function construirCalendario(r){
 if(!r||!fechaValida(r.desde)||!fechaValida(r.hasta)||r.hasta<r.desde||!Array.isArray(r.festivos))throw new Error('Calendario incompleto. No se clasifican los dias contra una lista vacia.');
 const festivos=new Map();for(const f of r.festivos){if(!fechaValida(f.fecha)||f.fecha<r.desde||f.fecha>r.hasta)throw new Error('Festivo fuera del calendario solicitado.');festivos.set(f.fecha,s(f.nombre)||'Festivo registrado');}
 return {desde:r.desde,hasta:r.hasta,festivos};
}
export function calendarioDia(fecha,cal){
 const f=s(fecha).slice(0,10);if(!cal||!fechaValida(f)||f<cal.desde||f>cal.hasta)return {tipo:'sin_verificar',texto:'Calendario por verificar',domingo:false,festivo:false};
 const domingo=new Date(f+'T12:00:00Z').getUTCDay()===0,nombre=cal.festivos.get(f),festivo=Boolean(nombre);
 return {tipo:festivo?'festivo':domingo?'domingo':'ordinario',texto:festivo?(domingo?'Domingo y festivo':'Festivo'):domingo?'Domingo':'Ordinario',nombre:nombre||'',domingo,festivo};
}
export function filaHorario(x){return x.evidencia_revision?.horario||x.jornada_actual||x;}
export function estadoHorario(x){const p=filaHorario(x);if(x.evidencia_revision?.conflicto_horario||x.conflicto_programacion)return 'conflicto';if(x.evidencia_revision?.horario||p.programacion_tipo==='confirmada'||x.programacion_tipo==='confirmada')return 'guardado';const t=s(p.programacion_tipo).toLowerCase();if(t==='inferida_alta')return 'alta';if(t==='inferida_media')return 'media';if(t==='inferida_ambigua'||p.estado_comparacion==='turno_ambiguo')return 'por_confirmar';return 'sin_horario';}
export function diagnosticoHorario(x){const p=filaHorario(x),tipo=estadoHorario(x);if(tipo==='guardado')return p.tipo_registro==='novedad'||p.novedad_codigo?'Novedad guardada; no equivale a horas de trabajo':'Horario guardado para esta persona y fecha; prevalece sobre la inferencia';if(tipo==='conflicto')return 'Fuentes de programacion incompatibles; revisar antes de comparar';return s(p.diagnostico_turno||x.diagnostico_turno)||((n(x.total_marcaciones)||0)===1?'Una marcacion: se conserva la presencia; falta completar evidencia':tipo==='sin_horario'?'No hay horario asignado ni una plantilla utilizable para esta fecha':'Horario sugerido por las marcas; no confirma asignacion ni autoriza extras');}
export function diagnosticoHorarioHtml(x){const p=filaHorario(x),alternativas=Array.isArray(p.alternativas_turno)?p.alternativas_turno:[],mensaje=diagnosticoHorario(x);return `<details class="nc-diagnostico"><summary>Origen del horario</summary><p>${esc(mensaje)}</p>${alternativas.length?'<p>Alternativas evaluadas (no asignadas):</p><ul>'+alternativas.slice(0,3).map(a=>`<li>${esc(a.turno)}: ${esc(a.inicio)}\u2013${esc(a.fin)}${Array.isArray(a.codigos_equivalentes)&&a.codigos_equivalentes.length>1?' \u00b7 c\u00f3digos equivalentes: '+esc(a.codigos_equivalentes.join(', ')):''}</li>`).join('')+'</ul>':''}</details>`;}
export function fechaHtml(x,cal){const c=calendarioDia(fechaClave(x),cal);return `<span class="nc-dia nc-${c.tipo}" title="${esc(c.nombre||c.texto)}">${esc(c.texto)}</span>`;}
export function revisarConcepto(x,cal,modelo=null){
 const m=modelo||modeloRevision(x),avisos=[],codigo=s(x.concepto_codigo),h=n(x.horas_calculadas??x.horas_candidatas),horario=estadoHorario(x),fecha=fechaClave(x),dia=calendarioDia(fecha,cal);
 const agregar=(codigo,texto)=>{if(!avisos.some(x=>x.codigo===codigo))avisos.push({codigo,texto});};
 const spans=[m.b1,m.b2].filter(Boolean),finDia=minutoCivil('00:00',fecha)+1440;
 const cruza=spans.some(b=>b.end>finDia)||m.salida!==null&&m.salida>=finDia;
 if(dia.tipo==='sin_verificar')agregar('calendario','No se verifico el calendario de esta fecha.');
 if(requiereRevisionNocturna(x))agregar('nocturno_programado','Recargo calculado solo con el horario. Usar Revisar calculo para contrastar las marcas.');
 if(m.brutos===null)agregar('sin_intervalo','No hay intervalo verificable. Las marcas se conservan, pero no certifican las horas del concepto.');
 else if(m.brutos>960)agregar('jornadas_mezcladas','Mas de 16 horas entre extremos: comprobar si se mezclaron jornadas distintas.');
 if(m.neto===null)agregar('neto','Total neto por verificar: faltan pausas o intervalos claros.');
 if(horario==='conflicto')agregar('conflicto','Hay horarios incompatibles en las fuentes.');
 if(['P003','P004','P008','P009'].includes(codigo)&&horario!=='guardado')agregar('extra_sin_turno','El turno no esta confirmado. Una sugerencia no demuestra cuantas horas fueron extra.');
 if(codigo==='P005'&&(dia.domingo||dia.festivo)&&!cruza)agregar('nocturno_especial','Es un dia especial. Revisar la clasificacion del recargo nocturno; no trasladar P005 a PROSOF sin validarla.');
 if(codigo==='P006'&&dia.festivo)agregar('domingo_festivo','La fecha coincide con un festivo. Revisar P006/P007 para no duplicar la misma base.');
 if(codigo==='P007'&&!dia.festivo&&dia.tipo!=='sin_verificar'&&!cruza)agregar('festivo_fecha','La fecha no aparece como festivo activo. Revisar fecha y concepto.');
 if(codigo==='P100'&&!dia.domingo&&!dia.festivo&&dia.tipo!=='sin_verificar'&&!cruza)agregar('nocturno_fecha','No se identifica domingo ni festivo en esta jornada. Revisar el concepto P100.');
 if(cruza)agregar('medianoche','Separar por fecha los tramos que cruzan medianoche; no clasificar toda la noche solo por el dia de entrada.');
 if(x.origen_calculo==='dominical_marcaciones_v1'){
  agregar('dominical_estimado','Candidato estimado por extremos del dia y 30 min de descuento; revisar pausas y otras jornadas.');
  if(m.neto!==null&&h!==null&&Math.abs(h*60-m.neto)>1)agregar('criterios_distintos','El candidato y el total diario usan criterios diferentes. Verificar descanso y tramos antes de aprobar.');
 }
 if(h!==null&&m.brutos!==null&&h*60>m.brutos+1)agregar('supera_intervalo','Las horas candidatas superan el intervalo observado. Revisar el calculo, no completar con horas inventadas.');
 return {avisos,cruza,dia,horario,requiereRevision:avisos.length>0,estado:avisos.length?'Verificar evidencia':'Sin alertas automaticas',aclaracion:'Este control no certifica la liquidacion ni reemplaza la revision humana.'};
}
export function controlConceptoHtml(x,cal,m=null){const c=revisarConcepto(x,cal,m);return c.avisos.length?`<details class="nc-alertas"><summary>${c.avisos.length} ${c.avisos.length===1?'punto por verificar':'puntos por verificar'}</summary><ul>${c.avisos.map(a=>`<li>${esc(a.texto)}</li>`).join('')}</ul><small>${esc(c.aclaracion)}</small></details>`:'';}
export function resumenCalidad(rows,areaFn=x=>x.area||x.centro_costos||'SIN AREA'){
 const mapa=new Map(),claves=new Set();
 for(const x of rows){const clave=s(x.cedula)+'|'+fechaClave(x);if(claves.has(clave))continue;claves.add(clave);if(!(n(x.total_marcaciones)>0))continue;const a=s(areaFn(x))||'SIN AREA',k=norm(a),r=mapa.get(k)||{area:a,personas:new Set(),jornadas:0,guardados:0,alta:0,media:0,porConfirmar:0,sinHorario:0,unaMarca:0};r.personas.add(s(x.cedula));r.jornadas++;const tipo=estadoHorario(x);if(tipo==='guardado')r.guardados++;else if(tipo==='alta')r.alta++;else if(tipo==='media')r.media++;else if(tipo==='por_confirmar'||tipo==='conflicto')r.porConfirmar++;else r.sinHorario++;if(n(x.total_marcaciones)===1)r.unaMarca++;mapa.set(k,r);}
 return [...mapa.values()].map(r=>({...r,personas:r.personas.size})).sort((a,b)=>(b.porConfirmar+b.sinHorario)-(a.porConfirmar+a.sinHorario)||a.area.localeCompare(b.area,'es'));
}
export function filaCalidadExcel(x,cal){const p=filaHorario(x),c=calendarioDia(fechaClave(x),cal);return {'Tipo de dia':c.texto,'Festivo registrado':c.nombre||'','Origen del horario':estadoHorario(x),'Motivo identificacion':diagnosticoHorario(x),'Confianza sugerida':p.confianza_turno||'','Alternativas de horario':(p.alternativas_turno||[]).slice(0,3).map(a=>`${a.turno}: ${a.inicio}-${a.fin}`).join(' | ')};}
export function filaControlExcel(x,cal){const c=revisarConcepto(x,cal);return {...filaCalidadExcel(x,cal),'Control del candidato':c.estado,'Puntos por verificar':c.avisos.map(a=>a.texto).join(' | '),'Aviso de uso':c.aclaracion};}
