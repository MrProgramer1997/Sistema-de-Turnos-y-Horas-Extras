import {codigoAsignado,analizarHorario} from "./cocina-planificacion-core.js?v=chef-7-3";
export const BUCKET = 'mis-turnos-soportes';
export const TYPES = {
 incapacidad:'Incapacidad', permiso_no_remunerado:'Permiso sin pago', dia_familia:'D\u00eda de la familia',
 cumpleanos:'Cumplea\u00f1os', calamidad:'Calamidad familiar', luto:'Fallecimiento de un familiar',
 dia_grado:'D\u00eda de grado', graduacion:'Graduaci\u00f3n', matrimonio:'Matrimonio'
};
export const SUBTYPES = {enfermedad_general:'Enfermedad general',accidente_transito:'Accidente de tr\u00e1nsito',accidente_trabajo:'Accidente de trabajo',licencia_maternidad:'Licencia de maternidad',licencia_paternidad:'Licencia de paternidad'};
export const STATES = {
 pendiente:['Recibida','Bienestar debe revisar tu solicitud.','info'],
 pendiente_documentos:['Faltan documentos','Tu solicitud fue recibida. Revisa qu\u00e9 documentos faltan.','warning'],
 aprobada:['Aprobada','Bienestar aprob\u00f3 tu solicitud.','success'],
 rechazada:['No aprobada','Lee la respuesta de Bienestar.','danger'],
 fuera_de_tiempo:['Recibida fuera del plazo','Bienestar debe revisar la fecha de radicaci\u00f3n.','warning'],
 en_revision_bienestar:['En revisi\u00f3n','Bienestar est\u00e1 revisando tu solicitud.','info'],
 programada:['Aprobada y programada','Tu solicitud fue aplicada a la programaci\u00f3n.','success'],
 aplicada_programacion:['Aplicada a tu turno','Tu programaci\u00f3n fue actualizada.','success'],
 cerrada:['Cerrada','Lee el resultado en la respuesta de Bienestar.','info']
};
export const esc = v => String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const stateInfo = s => STATES[s] || ['En seguimiento','Bienestar debe confirmar el estado.','info'];
export const receipt = id => 'SOL-'+String(id||'').slice(0,8).toUpperCase();
export function todayBogota(){ return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()); }
export function addDays(day,n){const d=new Date(day+'T12:00:00Z'); d.setUTCDate(d.getUTCDate()+n); return d.toISOString().slice(0,10);}
export function daysBetween(start,end){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(start||'')||!/^\d{4}-\d{2}-\d{2}$/.test(end||''))return 0;
 const a=new Date(start+'T00:00:00Z'),b=new Date(end+'T00:00:00Z');
 if(!Number.isFinite(+a)||!Number.isFinite(+b)||a.toISOString().slice(0,10)!==start||b.toISOString().slice(0,10)!==end)return 0;
 return Math.round((b-a)/86400000)+1;
}
export function dateText(day){return day?new Intl.DateTimeFormat('es-CO',{weekday:'long',day:'numeric',month:'long',timeZone:'UTC'}).format(new Date(day+'T12:00:00Z')):'';}
export function timeText(h){if(!/^([01]\d|2[0-3]):[0-5]\d/.test(h||''))return '';const [hh,mm]=h.split(':').map(Number);return `${hh%12||12}:${String(mm).padStart(2,'0')} ${hh<12?'a. m.':'p. m.'}`;}
export function requiredDocs(type,sub,days){
 if(type==='incapacidad'){
  const b=['Certificado de incapacidad'];
  if(sub==='enfermedad_general')return days<=2?b:[...b,'Historia cl\u00ednica'];
  if(sub==='accidente_transito')return days<=2?b:[...b,'Historia cl\u00ednica','FURIPS','Copia del SOAT vigente'];
  if(sub==='accidente_trabajo')return [...b,'Historia cl\u00ednica'];
  if(sub==='licencia_maternidad')return [...b,'Historia cl\u00ednica','Certificado nacido vivo','Registro civil'];
  if(sub==='licencia_paternidad')return ['Certificado de incapacidad e historia cl\u00ednica de la mam\u00e1','Certificado nacido vivo','Registro civil'];
 }
 return ({calamidad:['Documento soporte de calamidad o evento','Soporte adicional si aplica'],permiso_no_remunerado:['Solicitud o soporte justificativo del permiso no remunerado'],dia_familia:[],cumpleanos:[],dia_grado:['Soporte o constancia del grado'],matrimonio:['Registro civil o documento soporte del matrimonio'],luto:['Documento soporte del parentesco o del evento'],graduacion:['Acta, diploma o soporte de graduaci\u00f3n']})[type]||[];
}
export function validateForm(d){
 if(!TYPES[d.tipo])return 'Elige qu\u00e9 necesitas reportar.';
 if(d.tipo==='incapacidad'&&!SUBTYPES[d.subtipo])return 'Selecciona el tipo de incapacidad que dice tu certificado.';
 const n=daysBetween(d.desde,d.hasta);
 if(n<1||n>366)return 'Revisa las fechas. El \u00faltimo d\u00eda no puede ser anterior al primero.';
 if(d.tipo==='matrimonio'&&n>2)return 'Bienestar tiene configurado un m\u00e1ximo de 2 d\u00edas para matrimonio.';
 if(['dia_grado','graduacion'].includes(d.tipo)&&n>1)return 'Bienestar tiene configurado 1 d\u00eda para esta solicitud.';
 if(d.subtipo==='licencia_maternidad'&&n>126)return 'Revisa la duraci\u00f3n con Bienestar: supera la regla configurada.';
 return '';
}
export function validateFiles(fs){
 if(fs.length>6)return 'Puedes adjuntar hasta 6 archivos.';
 for(const f of fs){
  if(!['image/jpeg','image/png','image/webp','application/pdf'].includes(f.type))return 'Usa una foto JPG, PNG, WEBP o un archivo PDF.';
  if(f.size>10485760)return 'Uno de los archivos supera 10 MB. Elige uno m\u00e1s peque\u00f1o.';
  if(!f.size)return 'Uno de los archivos est\u00e1 vac\u00edo. Elige otro.';
 }return '';
}
const OFF={L:'Hoy descansas',V:'Est\u00e1s de vacaciones',DC:'Tienes permiso de cumplea\u00f1os',DF:'Tienes d\u00eda de la familia',PC:'Tu turno est\u00e1 por confirmar',D:'Hoy descansas',DESC:'Hoy descansas',DESCANSO:'Hoy descansas',VAC:'Est\u00e1s de vacaciones',INC:'Tienes una incapacidad registrada',DFAM:'Tienes d\u00eda de la familia',F:'Tienes d\u00eda de la familia',PNR:'Tienes un permiso sin pago',LR:'Tienes un permiso sin pago',COMP:'Tienes un compensatorio',CUMP:'Tienes permiso de cumplea\u00f1os',CAL:'Tienes una calamidad registrada',LUTO:'Tienes una licencia por luto'};
export function resolveDay(bundle,day){
 const rows=[];
 for(const source of ['chef','ayb','general'])for(const raw of bundle[source]||[]){
  if(raw.fecha!==day||['anulado','cancelado','eliminado','borrador'].includes(raw.estado))continue;
  const type=String(raw.tipo_registro||'').toLowerCase(),code=String(raw.novedad_codigo||raw.turno||'').toUpperCase(),blocks=[];
  for(const suffix of ['','_2']){
   const c=source==='chef'?codigoAsignado(raw,{hora_inicio:raw['hora_inicio'+suffix],hora_fin:raw['hora_fin'+suffix]},suffix?2:1):{hora_inicio:raw['hora_inicio'+suffix],hora_fin:raw['hora_fin'+suffix]}; const start=c.hora_inicio?.slice(0,5),end=c.hora_fin?.slice(0,5);
   const individual=source==='chef'&&raw.horario_asignado?analizarHorario(raw.horario_asignado).bloques.find(b=>b.n===(suffix?2:1)):null;
   if(timeText(start)&&timeText(end)&&start!==end)blocks.push({start,end,startDayOffset:individual?.diaInicio||0,endDayOffset:individual?.diaFin||(end<start?1:0),overnight:individual?individual.diaFin>0:end<start,place:raw['lugar'+suffix]||raw['subarea'+suffix]||raw.lugar||raw.subarea||'Confirma el lugar con tu jefe'});
  }
  const off=['descanso','novedad'].includes(type)||OFF[code];
  const inferred=String(raw.origen_programacion||'').includes('infer');
  rows.push({source,status:inferred?'unknown':off?'notice':blocks.length?'work':'unknown',blocks:off||inferred?[]:blocks,title:off?(OFF[code]||raw.novedad_descripcion||'Tienes una novedad registrada'):'',code});
 }
 const notices=(bundle.novedades||[]).filter(n=>n.fecha_inicio<=day&&n.fecha_fin>=day&&n.codigo!=='PASA');
 if(notices.length){const n=notices[0];return {status:'notice',title:OFF[n.codigo]||'Tienes una novedad registrada',blocks:[],until:n.fecha_fin,from:n.fecha_inicio,details:rows,hasWorkConflict:rows.some(r=>r.status==='work')};}
 if(!rows.length)return {status:'unknown',title:'Tu turno a\u00fan no est\u00e1 publicado',blocks:[]};
 const signature=r=>JSON.stringify([r.status,r.status==='notice'?r.code:'',r.blocks.map(b=>[b.start,b.end,b.place.toLocaleLowerCase('es')])]);
 if(new Set(rows.map(signature)).size>1)return {status:'conflict',title:'Hay horarios diferentes para este d\u00eda',blocks:[],details:rows};
 return rows[0];
}
