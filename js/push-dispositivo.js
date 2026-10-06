import {supabase} from '../supabase/supabaseClient.js';
const OWNER='ccp-push-748-owner',OFF='ccp-push-device-off';
const leer=key=>{try{return localStorage.getItem(key);}catch{return null;}};
const guardar=(key,value)=>{try{value===null?localStorage.removeItem(key):localStorage.setItem(key,value);}catch{}};
export const avisosDesactivados=()=>leer(OFF)==='1';
let operaciones=Promise.resolve();
const enOrden=work=>{const tarea=operaciones.catch(()=>{}).then(work);operaciones=tarea.catch(()=>{});return tarea;};
export function marcarAvisosDesactivados(reg){
 guardar(OFF,'1');guardar(OWNER,null);
 for(const worker of [reg?.active,reg?.waiting,reg?.installing])worker?.postMessage({tipo:'desactivar-avisos'});
}
export function claveBytes(value){
 if(typeof value!=='string')throw new Error('Falta la clave de notificaciones. Contacta a Sistemas.');
 return Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
}
export async function pushCall(accion,datos={}, {usuario,signal}={}){
 const ctrl=new AbortController(),abort=()=>ctrl.abort();
 signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
 let timer;
 const limit=new Promise((_,reject)=>{timer=setTimeout(()=>{ctrl.abort();reject(new Error('No se pudo conectar con los avisos a tiempo. Revisa la conexión y pulsa Reintentar.'));},12000);});
 const work=(async()=>{
  const {data,error}=await supabase.auth.getSession();
  if(error||!data?.session?.access_token)throw new Error('Tu sesión venció. Ingresa nuevamente para reconectar los avisos.');
  let session=data.session;
  if(usuario&&session.user?.id!==usuario)throw new Error('La cuenta cambió. Ingresa nuevamente para reconectar los avisos.');
  if(session.expires_at&&session.expires_at*1000-Date.now()<60000){
   const refreshed=await supabase.auth.refreshSession();
   if(refreshed.error||!refreshed.data?.session?.access_token)throw new Error('Tu sesión venció. Ingresa nuevamente para reconectar los avisos.');
   session=refreshed.data.session;
  }
  if(ctrl.signal.aborted)throw new Error('Operación de avisos cancelada.');
  if(usuario&&session.user?.id!==usuario)throw new Error('La cuenta cambió. Ingresa nuevamente para reconectar los avisos.');
  const result=await supabase.functions.invoke('portal-push-v748',{body:{accion,datos},headers:{Authorization:`Bearer ${session.access_token}`},signal:ctrl.signal});
  if(result.error){let info;try{info=await result.error.context?.json();}catch{}throw new Error(info?.error||'No se pudo conectar con los avisos. Revisa la conexión y pulsa Reintentar.');}
  if(!result.data?.ok)throw new Error(result.data?.error||'No se pudo confirmar la operación de avisos.');
  return result.data;
 })();
 try{return await Promise.race([work,limit]);}finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
function distintaClave(sub,key){
 const actual=sub.options?.applicationServerKey;if(!actual)return false;
 const bytes=new Uint8Array(actual);return bytes.length!==key.length||bytes.some((b,i)=>b!==key[i]);
}
/* No pide permisos en segundo plano ni elimina suscripciones por fallos de red. */
export function sincronizarAvisos(reg,config,{usuario,actual=()=>true,explicito=false,api=pushCall}={}){
 return enOrden(async()=>{
  if(!actual()||!reg||!config?.activo||Notification.permission!=='granted'||(!explicito&&avisosDesactivados()))return null;
  const key=claveBytes(config.publicKey);
  let sub=await reg.pushManager.getSubscription();if(!actual())return null;
  if(sub&&(distintaClave(sub,key)||(sub.expirationTime&&sub.expirationTime<=Date.now()))){
   // Libera el registro obsoleto antes de crear otro en este dispositivo.
   await api('baja',{endpoint:sub.endpoint},{usuario}).catch(()=>{});if(!actual())return null;
   if(!await sub.unsubscribe())throw new Error('No se pudo renovar la suscripción. Pulsa Reintentar.');
   sub=null;
  }
  if(!sub){
   try{sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});}
   catch{throw new Error('El navegador necesita que pulses Activar avisos para reconectarlos. No necesitas reinstalar la app.');}
  }
  if(!actual()||(!explicito&&avisosDesactivados()))return null;
  await api('guardar',sub.toJSON(),{usuario});
  if(!actual()||(!explicito&&avisosDesactivados()))return null;
  guardar(OFF,null);guardar(OWNER,usuario||config.usuario||'activo');
  for(const worker of [reg.active,reg.waiting,reg.installing])worker?.postMessage({tipo:'activar-avisos'});
  return sub;
 });
}
export function desactivarAvisos(reg,{usuario,api=pushCall}={}){
 marcarAvisosDesactivados(reg);
 return enOrden(async()=>{
  marcarAvisosDesactivados(reg);
  const sub=await reg?.pushManager?.getSubscription();let falloServidor=null;
  if(sub){
   try{await api('baja',{endpoint:sub.endpoint},{usuario});}catch(e){falloServidor=e;}
   if(!await sub.unsubscribe())throw new Error('Los avisos están pausados, pero el navegador no terminó de retirar la suscripción. Pulsa Reintentar.');
  }
  const all=await reg?.getNotifications();all?.forEach(n=>n.close());
  if(navigator.clearAppBadge)await navigator.clearAppBadge().catch(()=>{});
  return {falloServidor};
 });
}
