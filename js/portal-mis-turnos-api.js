import { cargarDocumentados } from './horarios-documentados-api.js?v=711';
import { supabase } from '../supabase/supabaseClient.js';
import { BUCKET } from './portal-mis-turnos-core.js?v=chef-7-3';
export { supabase };
export async function call(name,args={}){
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),25000);
 try{const {data,error}=await supabase.rpc(name,args).abortSignal(ctrl.signal);if(error)throw Object.assign(new Error(error.message),{code:error.code});
  if(name==='portal_mis_turnos_v1'){
   const request=(n,a,o)=>supabase.rpc(n,a).abortSignal(o.signal);
   const doc=await cargarDocumentados(request,{desde:args.p_desde,hasta:args.p_hasta,signal:ctrl.signal,propio:true});
   if(doc.disponible){
    if(doc.resuelto.rows.some(r=>r.empleado_id!==data.empleado?.id))throw new Error('La identidad del horario no coincide con la cuenta.');
    const effective=doc.resuelto.rows.filter(r=>!['guardada','novedad'].includes(r.documental_711.tipo));
    const keys=new Set(effective.map(r=>r.fecha));
    return {...data,general:[...(data.general||[]).filter(r=>!keys.has(r.fecha)),...effective.map(r=>({...r,estado:'programado',origen_programacion:r.programacion_tipo.startsWith('inferida')?'inferida_semanal_documental':'documental_estipulada',lugar:r.area||'Confirma el lugar con tu jefe'}))],documental_711:doc.resuelto};
   }
   return {...data,aviso_documental:doc.motivo};
  }
  return data;}
 finally{clearTimeout(timer);}
}
export async function uploadSupports(userId,id,files,progress=()=>{}){
 const out=[];
 try{
  for(let i=0;i<files.length;i++){
   const {file,tipo_documento}=files[i],ext=({'image/jpeg':'jpg','image/png':'png','image/webp':'webp','application/pdf':'pdf'})[file.type];
   if(!ext)throw new Error('Tipo de archivo no permitido.');
   const path=`${userId}/${id}/${crypto.randomUUID()}.${ext}`;progress(i+1,files.length);
   const {error}=await supabase.storage.from(BUCKET).upload(path,file,{upsert:false,contentType:file.type,cacheControl:'0'});
   if(error)throw new Error('No se pudo subir un archivo. Revisa tu conexi\u00f3n y vuelve a intentar.');
   out.push({bucket:BUCKET,path,name:file.name,tipo_documento,size:file.size,type:file.type});
  }return out;
 }catch(e){if(out.length)await supabase.storage.from(BUCKET).remove(out.map(d=>d.path)).catch(()=>{});throw e;}
}
export async function openSupport(doc){
 const popup=window.open('about:blank','_blank');if(popup)popup.opener=null;
 try{
  if(!popup)throw new Error('Permite abrir una ventana para ver el soporte.');
  let url;
  if(doc.bucket===BUCKET&&doc.path){const {data,error}=await supabase.storage.from(BUCKET).createSignedUrl(doc.path,60);if(error)throw error;url=data.signedUrl;}
  else url=doc.publicUrl;
  const u=new URL(url);
  if(u.protocol!=='https:'||u.hostname!=='kzxveqrgvuchcgwrjwjb.supabase.co'||!u.pathname.startsWith('/storage/'))throw new Error('Enlace no permitido');
  popup.location.replace(u.href);
 }catch(e){popup?.close();throw new Error('No se pudo abrir el documento. Verifica tu sesi\u00f3n o permite ventanas emergentes.');}
}
