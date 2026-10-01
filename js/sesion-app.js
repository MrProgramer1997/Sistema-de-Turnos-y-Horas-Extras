import {supabase} from '../supabase/supabaseClient.js';
const AUTH_KEY='sb-kzxveqrgvuchcgwrjwjb-auth-token';
const VISUAL=['ccp_sesion','usuarioActual','empleadoActual','sessionUser','userData','authUser','usuarioLogueado','empleadoSesion','portal-envio-id','ccp-push-748-owner'];
export function limpiarDatosSesion(){
 for(const store of [localStorage,sessionStorage])for(const key of [...VISUAL,AUTH_KEY,AUTH_KEY+'-code-verifier',AUTH_KEY+'-user'])try{store.removeItem(key);}catch{}
}
function limite(promise,ms){let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Tiempo de espera agotado')),ms);})]).finally(()=>clearTimeout(timer));}
export async function desvincularDispositivo(){
 if(!('serviceWorker' in navigator))return;
 const scope=new URL('../pages/',import.meta.url).href;
 const reg=await navigator.serviceWorker.getRegistration(scope);if(!reg||reg.scope!==scope)return;
 reg.active?.postMessage({tipo:'cerrar-sesion'});
 const sub=await reg.pushManager?.getSubscription();
 if(sub){const endpoint=sub.endpoint;await sub.unsubscribe();await supabase.functions.invoke('portal-push-v748',{body:{accion:'baja',datos:{endpoint}}}).catch(()=>{});}
 const notices=await reg.getNotifications();notices.forEach(n=>n.close());
 if(navigator.clearAppBadge)await navigator.clearAppBadge().catch(()=>{});
}
let cierre=null;
export function cerrarSesionAplicacion({antesDeSalir=desvincularDispositivo}={}){
 if(cierre)return cierre;
 cierre=(async()=>{
  let servidorConfirmado=false;
  try{await limite(Promise.resolve().then(antesDeSalir),4000);}catch{}
  try{const r=await limite(supabase.auth.signOut({scope:'local'}),8000);servidorConfirmado=!r?.error;}catch{}
  finally{try{await limite(supabase.auth.stopAutoRefresh(),500);}catch{}limpiarDatosSesion();}
  return {servidorConfirmado};
 })();return cierre;
}
