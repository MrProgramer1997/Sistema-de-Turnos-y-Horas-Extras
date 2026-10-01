import {supabase} from '../supabase/supabaseClient.js';
import {registrarPWA,instalada,ayudaInstalacion} from './pwa-registro.js?v=749';
const $=id=>document.getElementById(id);
let promptInstall=null,registration=null,userId=null,config=null,pushBusy=false,epoch=0;
const storageKey='ccp-push-748-owner';
const localGet=()=>{try{return localStorage.getItem(storageKey);}catch{return null;}};
const localSet=value=>{try{value?localStorage.setItem(storageKey,value):localStorage.removeItem(storageKey);}catch{}};
const message=text=>{if($('pwaStatus'))$('pwaStatus').textContent=text;};
const supported=()=>registration&&('PushManager' in window)&&('Notification' in window);
const current=(e,id)=>e===epoch&&id===userId&&!!id;
export async function pushCall(accion,datos={}){
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),12000);
 try{
  const {data,error}=await supabase.functions.invoke('portal-push-v748',{body:{accion,datos},signal:ctrl.signal});
  if(error){let info;try{info=await error.context?.json();}catch{}throw new Error(info?.error||'No se pudo conectar con los avisos. Revisa la conexi\u00f3n e intenta de nuevo.');}
  if(!data?.ok)throw new Error(data?.error||'No se pudo confirmar la operaci\u00f3n.');return data;
 }finally{clearTimeout(timer);}
}
function renderInstall(){
 $('pwaInstall').hidden=instalada();$('pwaInstall').textContent=promptInstall?'Instalar app':'C\u00f3mo instalar';
 $('pwaInstallHelp').hidden=true;$('pwaLead').textContent=instalada()?'Mis Turnos en tu celular':'Abre Mis Turnos desde su icono';
}
const readyWorker=registrarPWA().then(r=>registration=r).catch(e=>{message(e.message);return null;});
if('serviceWorker' in navigator)navigator.serviceWorker.addEventListener('message',e=>{
 if(!userId)return;
 if(e.data?.tipo==='push-recibido'){window.dispatchEvent(new Event('portal-nuevo-aviso'));if(e.data.clase==='prueba')message('Aviso de prueba recibido en este dispositivo.');}
 if(e.data?.tipo==='abrir-aviso')window.dispatchEvent(new CustomEvent('portal-abrir-aviso',{detail:e.data}));
});
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();promptInstall=e;renderInstall();});
window.addEventListener('appinstalled',()=>{promptInstall=null;renderInstall();message('App instalada. Activa los avisos en este dispositivo.');});
window.matchMedia('(display-mode: standalone)').addEventListener?.('change',renderInstall);
$('pwaInstall').addEventListener('click',async()=>{
 if(promptInstall){const p=promptInstall;promptInstall=null;try{await p.prompt();}catch{}renderInstall();}
 else{$('pwaInstallHelp').hidden=false;$('pwaInstallHelp').textContent=ayudaInstalacion();}
});
function setPushState(active){
 $('pwaPush').hidden=active;$('pwaOptions').hidden=!active;
 $('pwaPush').disabled=!userId||!config?.activo||!supported()||pushBusy;
 $('pwaTest').hidden=!config?.envio_automatico;
 if(active)message(config?.envio_automatico?'Avisos activados en este dispositivo.':'Permiso guardado. El env\u00edo autom\u00e1tico est\u00e1 pausado.');
}
function decodeKey(s){return Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));}
function allowNotices(){registration?.active?.postMessage({tipo:'activar-avisos'});}
export async function iniciarPWA(user){
 const version=++epoch,id=user.id;userId=id;config=null;setPushState(false);renderInstall();
 try{
  await readyWorker;if(!current(version,id))return;
  if(!registration)registration=await registrarPWA();if(!current(version,id))return;
  const cfg=await pushCall('config');if(!current(version,id))return;config=cfg;$('pwaRetry').hidden=true;
  if(!config.activo){message('Los avisos del celular est\u00e1n temporalmente pausados.');return;}
  const ios=/iPhone|iPad|iPod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  if(ios&&!instalada()){message('En iPhone instala la app y abre su icono para activar los avisos.');return;}
  if(!supported()){message('Este navegador no admite avisos. Prueba desde la app instalada o Chrome.');return;}
  let sub=await registration.pushManager.getSubscription();if(!current(version,id))return;
  if(sub&&localGet()!==id){await sub.unsubscribe();sub=null;localSet(null);await clearVisibleNotices();}
  if(!current(version,id))return;
  if(sub&&Notification.permission==='granted'){
   await pushCall('guardar',sub.toJSON());if(!current(version,id)){await sub.unsubscribe();return;}
   localSet(id);allowNotices();setPushState(true);
  }else{setPushState(false);message(Notification.permission==='denied'?'Las notificaciones est\u00e1n bloqueadas. Perm\u00edtelas en los ajustes del sitio.':config.envio_automatico?'Activa los avisos para recibir cambios de horario y respuestas de Bienestar.':'Puedes guardar el permiso; el env\u00edo autom\u00e1tico est\u00e1 pausado.');}
 }catch(e){if(current(version,id)){message(e.message);$('pwaRetry').hidden=false;}}
}
$('pwaRetry').addEventListener('click',()=>{if(userId)iniciarPWA({id:userId});});
$('pwaPush').addEventListener('click',async()=>{
 if(pushBusy||!userId||!config?.activo||!supported())return;
 const version=epoch,id=userId,cfg=config;
 // Permission is requested directly inside the click gesture for mobile browsers.
 const permission=Notification.requestPermission();pushBusy=true;$('pwaPush').disabled=true;
 let sub=null;
 try{
  if(await permission!=='granted'){if(current(version,id))message('No se activaron los avisos. Puedes seguir consultando tus turnos.');return;}
  if(!current(version,id))return;
  sub=await registration.pushManager.getSubscription()||await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:decodeKey(cfg.publicKey)});
  if(!current(version,id)){await sub.unsubscribe();return;}
  await pushCall('guardar',sub.toJSON());
  if(!current(version,id)){await sub.unsubscribe();return;}
  localSet(id);allowNotices();setPushState(true);
  if(cfg.envio_automatico){await pushCall('prueba',{endpoint:sub.endpoint});if(current(version,id))message('Avisos activados. Prueba en cola; normalmente llega en el siguiente minuto.');}
 }catch(e){if(sub&&!localGet())await sub.unsubscribe().catch(()=>{});if(current(version,id)){message(e.message);$('pwaRetry').hidden=false;}}
 finally{if(current(version,id)){pushBusy=false;$('pwaPush').disabled=!config?.activo;}}
});
$('pwaTest').addEventListener('click',async()=>{
 if(pushBusy||!userId||!registration||!config?.envio_automatico)return;
 const version=epoch,id=userId;pushBusy=true;$('pwaTest').disabled=true;
 try{const sub=await registration.pushManager.getSubscription();if(!sub)throw new Error('Activa los avisos nuevamente.');await pushCall('prueba',{endpoint:sub.endpoint});if(current(version,id))message('Prueba en cola. Puedes cerrar la app sin pulsar Salir y comprobar su llegada.');}
 catch(e){if(current(version,id))message(e.message);}finally{pushBusy=false;$('pwaTest').disabled=false;}
});
async function clearVisibleNotices(){const all=await registration?.getNotifications();all?.forEach(n=>n.close());if(navigator.clearAppBadge)await navigator.clearAppBadge().catch(()=>{});}
export async function detenerPWA({server=true}={}){
 ++epoch;const previous=userId;userId=null;config=null;pushBusy=false;localSet(null);setPushState(false);
 try{
  await readyWorker;registration?.active?.postMessage({tipo:'cerrar-sesion'});
  await clearVisibleNotices();const sub=await registration?.pushManager?.getSubscription();
  if(sub){const endpoint=sub.endpoint;await sub.unsubscribe();if(server&&previous)await pushCall('baja',{endpoint}).catch(()=>{});}
 }catch{}finally{await clearVisibleNotices().catch(()=>{});}
}
$('pwaOff').addEventListener('click',async()=>{
 const id=userId;if(!id||pushBusy)return;const stop=detenerPWA(),stoppedEpoch=epoch;await stop;
 if(epoch!==stoppedEpoch)return;await iniciarPWA({id});
 if(epoch===stoppedEpoch+1&&userId===id)message('Avisos desactivados en este dispositivo. Puedes activarlos nuevamente.');
});
export async function avisosHorario(){return await pushCall('avisos');}
export async function leerAvisoHorario(id){return await pushCall('leido',{id});}
export function badgePWA(n){if(navigator.setAppBadge)(Number(n)?navigator.setAppBadge(Number(n)):navigator.clearAppBadge()).catch(()=>{});}
renderInstall();
