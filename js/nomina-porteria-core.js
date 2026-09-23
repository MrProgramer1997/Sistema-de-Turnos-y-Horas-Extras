/* 7.32 - Porteria report: first and last mark per person and calendar day.
 * Read-only. No changes to payroll, meal breaks, schedules or approvals. */
export const ENCABEZADOS730 = ['C\u00f3digo','Nombre','Apellido','Ingreso','Tipo','Salida Comida','Tipo','Ingreso de Comida','Tipo','Salida','Tipo','T. Comida','T. Neto','Observaci\u00f3n'];
export const NOTA730 = 'Solo Porter\u00eda. Primera y \u00faltima marcaci\u00f3n del mismo d\u00eda, sin distinguir el tipo del huellero. T. Neto = intervalo entre ambas; sin descuento autom\u00e1tico de alimentaci\u00f3n. No es liquidaci\u00f3n ni aprobaci\u00f3n de n\u00f3mina.';
const DIA = 86400000;
export const texto730 = v => String(v ?? '').trim();
export const escapar730 = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function fechaISO730(value) {
  const text = texto730(value);
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!m) { const n = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text); if(n) m=[text,n[3],n[2],n[1]]; }
  if(!m) throw new Error('Escribe las fechas como d\u00eda/mes/a\u00f1o.');
  const iso=`${m[1]}-${m[2]}-${m[3]}`, d=new Date(`${iso}T00:00:00Z`);
  if(!Number.isFinite(d.getTime()) || d.toISOString().slice(0,10)!==iso) throw new Error('La fecha no existe. Revisa d\u00eda, mes y a\u00f1o.');
  return iso;
}
export function sumarDias730(iso,n){return new Date(Date.parse(`${fechaISO730(iso)}T00:00:00Z`)+n*DIA).toISOString().slice(0,10);}
export function fechaVisual730(iso){const s=fechaISO730(iso).split('-');return `${s[2]}/${s[1]}/${s[0]}`;}
export function horaVisual730(value){const s=texto730(value);return s ? `${fechaVisual730(s.slice(0,10))} ${s.slice(11,19).padEnd(8,'0')}` : '';}
export function instante730(value){
  const s=texto730(value).replace(' ','T');
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(s)) throw new Error('Una marcaci\u00f3n tiene fecha u hora no v\u00e1lida.');
  fechaISO730(s.slice(0,10));
  const n=Date.parse(s+'Z');if(!Number.isFinite(n))throw new Error('Hora de marcaci\u00f3n no v\u00e1lida.');return n;
}
export function duracion730(seconds){if(seconds==null)return '\u2014';const m=Math.floor(seconds/60);return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;}
export function bloques730(desde,hasta,size=32,limite=365){
  desde=fechaISO730(desde);hasta=fechaISO730(hasta);
  if(hasta<desde)throw new Error('La fecha final debe ser igual o posterior a la inicial.');
  if((Date.parse(hasta)-Date.parse(desde))/DIA>limite)throw new Error('Consulta como m\u00e1ximo un a\u00f1o por vez.');
  const result=[];for(let d=desde;d<=hasta;){const h=[sumarDias730(d,size-1),hasta].sort()[0];result.push({desde:d,hasta:h});d=sumarDias730(h,1);}return result;
}
function abortar(signal){if(signal?.aborted)throw new DOMException('Consulta cancelada','AbortError');}
export async function cargarPorteria730({desde,hasta,persona='',request,signal,onProgress=()=>{}}){
  bloques730(desde,hasta);
  // This report groups by calendar day, so no neighbouring-day lookup is needed.
  const bs=bloques730(desde,hasta);
  const respuestas=new Array(bs.length);let cursor=0,done=0;
  async function leer(b){
    abortar(signal);
    const result=await request({p_desde:b.desde,p_hasta:b.hasta,p_persona:texto730(persona)||null},signal);
    abortar(signal);
    if(result?.error){
      const er=result.error;
      if(['57014','QUERY_TIMEOUT','54000'].includes(String(er.code)) && b.desde<b.hasta){
        const days=Math.round((Date.parse(b.hasta)-Date.parse(b.desde))/DIA),mid=sumarDias730(b.desde,Math.floor(days/2));
        const a=await leer({desde:b.desde,hasta:mid}),c=await leer({desde:sumarDias730(mid,1),hasta:b.hasta});
        return [...a,...c];
      }
      throw new Error(er.message||'No se pudo consultar Porter\u00eda.');
    }
    const d=result?.data;
    if(!d||d.completa!==true||d.desde!==b.desde||d.hasta!==b.hasta||!Array.isArray(d.marcaciones)||Number(d.total)!==d.marcaciones.length)throw new Error('La lectura de Porter\u00eda lleg\u00f3 incompleta. Pulsa Generar de nuevo; no se imprime un resultado parcial.');
    return d.marcaciones;
  }
  async function worker(){while(cursor<bs.length){const i=cursor++;respuestas[i]=await leer(bs[i]);done++;onProgress(done,bs.length);}}
  await Promise.all(Array.from({length:Math.min(2,bs.length)},worker));abortar(signal);
  const ids=new Set(),marcas=respuestas.flat();
  for(const m of marcas){if(!texto730(m.id)||ids.has(String(m.id)))throw new Error('La lectura contiene identificadores repetidos o vac\u00edos. Genera el informe nuevamente.');ids.add(String(m.id));instante730(m.hora);}
  return marcas;
}
/* Display rule for BOTON ANTERIOR only. Device direction, schedule and
 * work-area assignment do not decide the daily endpoints. All original
 * events stay in the row for integrity checks and the raw Excel sheet. */
export function construirFilas730(marcas,desde,hasta){
  desde=fechaISO730(desde);hasta=fechaISO730(hasta);
  if(hasta<desde)throw new Error('La fecha final debe ser igual o posterior a la inicial.');
  if(!Array.isArray(marcas))throw new Error('La lista de marcaciones no es valida.');
  const grupos=new Map();
  for(const m of marcas){
    const hora=texto730(m.hora).replace(' ','T');
    instante730(hora);
    const fecha=hora.slice(0,10);
    if(fecha<desde||fecha>hasta)continue;
    const id=texto730(m.empleado_id),cedula=texto730(m.cedula),codigo=texto730(m.codigo_recibido);
    if(!id&&!cedula&&!codigo)throw new Error('Marcacion sin identificador de persona.');
    const key=JSON.stringify([id?'empleado':cedula?'cedula':'codigo',id||cedula||codigo,fecha]);
    const eventos=grupos.get(key)||[];
    eventos.push({...m,hora});
    grupos.set(key,eventos);
  }
  const filas=[];
  for(const eventos of grupos.values()){
    eventos.sort((a,b)=>instante730(a.hora)-instante730(b.hora)||String(a.id).localeCompare(String(b.id),'en',{numeric:true}));
    const primera=eventos[0],ultima=eventos.length>1?eventos[eventos.length-1]:null;
    const notas=[];
    // A single record is visible, but is not invented into a second punch.
    if(!ultima)notas.push('Una sola marcaci\u00f3n');
    if(!primera.empleado_id)notas.push('Sin empleado vinculado');
    if(eventos.some(m=>m.asistencia===false))notas.push('Registro no marcado como asistencia');
    const segundos=ultima?Math.floor((instante730(ultima.hora)-instante730(primera.hora))/1000):null;
    if(ultima&&segundos===0)notas.push('Marcaciones a la misma hora');
    filas.push({
      codigo:texto730(primera.codigo)||texto730(primera.codigo_recibido),
      cedula:texto730(primera.cedula),
      nombres:primera.nombres||'SIN EMPLEADO VINCULADO',apellidos:primera.apellidos||'',
      fecha:primera.hora.slice(0,10),ingreso:primera.hora,salida:ultima?.hora||'',
      segundos,observacion:notas.join(' \u00b7 '),eventos,orden:primera.hora
    });
  }
  filas.sort((a,b)=>a.nombres.localeCompare(b.nombres,'es')||a.apellidos.localeCompare(b.apellidos,'es')||a.codigo.localeCompare(b.codigo,'es',{numeric:true})||a.orden.localeCompare(b.orden));
  return filas;
}
export function celdas730(f){return [f.codigo,f.nombres,f.apellidos,horaVisual730(f.ingreso),f.ingreso?'H':'','','','','',horaVisual730(f.salida),f.salida?'H':'','00:00',duracion730(f.segundos),f.observacion];}
/* Calendar is presentation-only and never modifies daily intervals.
 * A holiday must exist in the configured calendar. */
export function diaPorteria731(value, calendario=null) {
 const text=texto730(value);if(!text)return null;
 const fecha=fechaISO730(text.slice(0,10));
 // Source dates are local wall-clock dates: never shift with browser timezone.
 const domingo=new Date(fecha+'T00:00:00Z').getUTCDay()===0;
 const festivo=Boolean(calendario?.festivos?.has(fecha));
 if(!domingo&&!festivo)return null;
 return {fecha,etiqueta:domingo&&festivo?'DOMINGO / FESTIVO':festivo?'FESTIVO':'DOMINGO',nombre:festivo?texto730(calendario.festivos.get(fecha)):''};
}
export async function cargarCalendarioPorteria731({desde,hasta,request,signal}) {
 bloques730(desde,hasta);const festivos=new Map();
 // Same exact dates as the attendance report; existing API <= 366 dates.
 for(const b of bloques730(desde,hasta,366)) {
  abortar(signal);const result=await request({p_desde:b.desde,p_hasta:b.hasta},signal);abortar(signal);
  if(result?.error){const e=new Error(result.error.message||'No se pudo verificar el calendario.');e.code=result.error.code;e.status=result.error.status;throw e;}
  const d=result?.data;
  if(!d||d.desde!==b.desde||d.hasta!==b.hasta||!Array.isArray(d.festivos))throw new Error('El calendario no corresponde al periodo consultado.');
  for(const f of d.festivos){
   const fecha=fechaISO730(f.fecha);
   if(fecha<b.desde||fecha>b.hasta)throw new Error('El calendario contiene una fecha fuera del periodo.');
   if(f.activo===false)continue;
   festivos.set(fecha,texto730(f.nombre));
  }
 }
 return {festivos,verificado:true,aviso:''};
}
function contenidoDia731(texto,dia) {
 if(!dia)return escapar730(texto)||'&nbsp;';
 const descripcion=dia.etiqueta+(dia.nombre?' - '+dia.nombre:'');
 return `<span class="np-fecha-especial" title="${escapar730(descripcion)}">${escapar730(texto)}</span><span class="np-dia-etiqueta" title="${escapar730(descripcion)}">${escapar730(dia.etiqueta)}</span>`;
}
export function filasHTML730(filas,{pantalla=true,calendario=null}={}){
 return filas.map((f,i)=>`<tr data-np-fila="${i}">${celdas730(f).map((v,c)=>{
  const dia=c===3?diaPorteria731(f.ingreso,calendario):c===9?diaPorteria731(f.salida,calendario):null;
  // Keep the calendar styling shared by the screen and print view.
  const sinTipo=c===13&&!f.ingreso&&!f.salida?diaPorteria731(f.orden,calendario):null;
  const clases=[c===13?'np-observacion':'',dia?'np-celda-especial':''].filter(Boolean);
  const contenido=pantalla&&[5,7].includes(c)&&!v?'<span class="np-vacio">/ / &nbsp; : :</span>':contenidoDia731(v,dia||sinTipo);
  return `<td${clases.length?` class="${clases.join(' ')}"`:''}${pantalla&&[3,9].includes(c)?` title="${escapar730(v)}${dia?' - '+escapar730(dia.etiqueta+(dia.nombre?' - '+dia.nombre:'')):''}"`:''}>${contenido}</td>`;
 }).join('')}</tr>`).join('');
}
export function htmlImpresion730(filas,{desde,hasta,persona,consultado,calendario=null}){
 return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Revisi\u00f3n de Horarios - Porter\u00eda</title><style>
 @page{size:A4 landscape;margin:9mm}*{box-sizing:border-box}body{margin:0;color:#000;font:10px Arial,sans-serif}h1{font:bold italic 24px Arial,sans-serif;color:#008000;margin:0 0 8px}header{margin:0 0 8px}.np-meta{font-size:11px;line-height:1.5}table{border-collapse:collapse;table-layout:fixed;width:100%}thead{display:table-header-group}th,td{border:1px solid #333;padding:3px 2px;vertical-align:top;white-space:normal;overflow-wrap:anywhere}th{background:#437f80;color:white;font-weight:normal;print-color-adjust:exact;-webkit-print-color-adjust:exact}tr{break-inside:avoid;page-break-inside:avoid}th:nth-child(1){width:5%}th:nth-child(2){width:10%}th:nth-child(3){width:12%}th:nth-child(4),th:nth-child(6),th:nth-child(8),th:nth-child(10){width:10%}th:nth-child(5),th:nth-child(7),th:nth-child(9),th:nth-child(11){width:2%;font-size:8px;white-space:nowrap;padding-left:0;padding-right:0}th:nth-child(12),th:nth-child(13){width:5%}th:nth-child(14){width:15%}footer{margin-top:8px;font-size:9px;line-height:1.4}@media screen{body{padding:16px}th{color:white}}
 .np-fecha-especial{color:#b00020;font-weight:bold;text-decoration:underline;text-underline-offset:2px;print-color-adjust:exact;-webkit-print-color-adjust:exact}.np-dia-etiqueta{display:block;font-size:8px;line-height:1.3;font-weight:bold;color:#b00020;print-color-adjust:exact;-webkit-print-color-adjust:exact}
 </style></head><body><header><h1>Revisi\u00f3n de Horarios</h1><div class="np-meta"><strong>Persona:</strong> ${escapar730(persona||'Todas las personas')}<br><strong>Fecha inicial:</strong> ${fechaVisual730(desde)} &nbsp; <strong>Fecha final:</strong> ${fechaVisual730(hasta)} &nbsp; <strong>Fuente:</strong> Porter\u00eda</div></header><table><thead><tr>${ENCABEZADOS730.map(x=>`<th>${escapar730(x)}</th>`).join('')}</tr></thead><tbody>${filasHTML730(filas,{pantalla:false,calendario})}</tbody></table><footer>${escapar730(NOTA730)}${calendario?.aviso?'<br>'+escapar730(calendario.aviso):''}<br>Consulta: ${escapar730(consultado||'')} \u00b7 ${filas.length} filas. Fechas y horas originales; no se completan registros faltantes.</footer></body></html>`;
}
