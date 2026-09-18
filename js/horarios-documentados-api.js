import {VERSION_DOCUMENTAL,fechaDoc,sumarDiaDoc,validarPaqueteDoc,resolverDocumentados} from './horarios-documentados-core.js?v=711';
const key=(name,x)=>name==='marcas'?String(x.id):name==='plantillas'?x.codigo:name==='guardadas'?String(x.id):name==='personas'?[x.id,x.vigente_desde,x.vigente_hasta].join('|'):JSON.stringify(x);
const arrays=['plantillas','personas','guardadas','protegidas','marcas','novedades','casos_confirmados','festivos','pendientes_vinculo'];
export async function cargarDocumentados(request,{desde,hasta,signal,propio=false}){
 desde=fechaDoc(desde);hasta=fechaDoc(hasta);if(desde>hasta||(Date.parse(hasta)-Date.parse(desde))/86400000>366)throw new Error('Rango documental no valido');
 if(hasta<'2026-08-23')return {disponible:true,resuelto:{version:VERSION_DOCUMENTAL,desde,hasta,rows:[],semanas:[],pendientes_vinculo:[]}};
 const parts=[];
 for(let start=desde<'2026-08-23'?'2026-08-23':desde;start<=hasta;){
  if(signal?.aborted)throw new DOMException('Consulta cancelada','AbortError');
  const end=[sumarDiaDoc(start,27),hasta].sort()[0];
  const response=await request(propio?'mis_horarios_documentados_v711':'consultar_horarios_documentados_v711',{p_desde:start,p_hasta:end},{read:true,signal});
  if(response?.error){
   if(response.error.code==='PGRST202'&&parts.length===0)return {disponible:false,motivo:'El servicio documental 7.11 aun no esta activado. Se conserva la lectura anterior; no se aplicaron estas plantillas.'};
   throw response.error;
  }
  const p=response?.data??response;validarPaqueteDoc(p);
  if(p.desde!==start||p.hasta!==end)throw new Error('El servicio documental devolvio otro periodo');
  parts.push(p);start=sumarDiaDoc(end,1);
 }
 const merged={...parts[0],desde,hasta,version:VERSION_DOCUMENTAL,generado_at:parts.at(-1).generado_at,contexto_desde:parts[0].contexto_desde,contexto_hasta:parts.at(-1).contexto_hasta};
 for(const name of arrays){const map=new Map();for(const p of parts)for(const row of p[name]){const k=key(name,row);if(map.has(k)&&JSON.stringify(map.get(k))!==JSON.stringify(row))throw new Error('Los datos cambiaron durante la lectura documental. Actualiza para evitar mezclar versiones.');map.set(k,row);}merged[name]=[...map.values()];}
 merged.total_marcas=merged.marcas.length;
 return {disponible:true,paquete:merged,resuelto:resolverDocumentados(merged)};
}
export function fusionarEvidenciasDocumentales(evidencias,resuelto){
 const byDay=new Map(resuelto.rows.map(r=>[r.cedula+'|'+r.fecha,r]));const result=new Map();
 for(const [k,e] of evidencias){const r=byDay.get(k);result.set(k,r?{...e,documental_711:r.documental_711,horario_documental:r,horario_original:e.horario}:e);}
 return result;
}
export function contextoDocumentalCC(ctx,resuelto){
 const byDay=new Map(resuelto.rows.map(r=>[r.cedula+'|'+r.fecha,r]));
 // Existing A&B/Chef arrays are left untouched and retain their priority.
 const original=(ctx.general||[]).filter(g=>!byDay.has(String(g.cedula||ctx.employees?.find(e=>e.id===g.empleado_id)?.cedula)+'|'+g.fecha));
 const extra=resuelto.rows.map(r=>({...r,id:r.documental_711.horario_en_bd?.[0]?.id||'doc:'+r.cedula+':'+r.fecha,estado:'programado',origen_programacion:r.documental_711.tipo==='deteccion_semanal'||r.programacion_tipo==='inferida_ambigua'?'inferida_semanal_documental':'documental_estipulada'}));
 return {...ctx,general:[...original,...extra],documental_711:resuelto};
}
export function resumenDocumento(resuelto){const r={documentadas:0,inferidas:0,pendientes:0,guardadas:0,conflictos:0};for(const x of resuelto.rows){const t=x.documental_711.tipo;if(['documental_fija','confirmacion_usuario','compensatorio_documental'].includes(t))r.documentadas++;else if(t==='deteccion_semanal')r.inferidas++;else if(t==='guardada'||t==='novedad')r.guardadas++;else if(t==='conflicto')r.conflictos++;else r.pendientes++;}return r;}
