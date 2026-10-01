import {supabase} from '../supabase/supabaseClient.js';
const $=id=>document.getElementById(id);
let promptInstall=null,installed=window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
let registration=null,userId=null,config=null,pushBusy=false,lastNoticeCount=0;
const storageKey='ccp-push-748-owner';
const localGet=()=>{try{return localStorage.getItem(storageKey);}catch{return null;}};
const localSet=value=>{try{value?localStorage.setItem(storageKey,value):localStorage.removeItem(storageKey);}catch{}};
export async function pushCall(accion,datos={}){
 const {data,error}=await supabase.functions.invoke('portal-push-v748',{body:{accion,datos}});
 if(error){let info;try{info=await error.context?.json();}catch{}throw new Error(info?.error||'No se pudo conectar con los avisos. Intenta de nuevo.');}
 if(!data?.ok)throw new Error(data?.error||'No se pudo confirmar la operación.');return data;
}
const isIOS=()=>/iPhone|iPad|iPod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const message=text=>{if($('pwaStatus'))$('pwaStatus').textContent=text;};
function renderInstall(){
 if(!$('pwaSetup'))return;
 $('pwaInstall').hidden=installed;
 $('pwaInstall').textContent=promptInstall?'Instalar app':'Cómo instalar';
 $('pwaInstallHelp').hidden=true;
 if(installed){$('pwaLead').textContent='Mis Turnos en tu celular';}
 else $('pwaLead').textContent='Abre Mis Turnos desde su icono';
}
async function setupWorker(){
 if(!window.isSecureContext||!('serviceWorker' in navigator)){message('Abre el enlace seguro del Club (HTTPS) para instalar la app.');return;}
 const url=new URL('../pages/mis-turnos-sw.js',import.meta.url);
 const scope=new URL('./',url).href;
 const current=await navigator.serviceWorker.getRegistration(scope);
 if(current?.scope===scope&&![current.active?.scriptURL,current.waiting?.scriptURL,current.installing?.scriptURL].filter(Boolean).some(s=>new URL(s).pathname===url.pathname)){
  message('Sistemas debe revisar otra app instalada en esta ruta. Tus turnos siguen disponibles.');return;
 }
 registration=await navigator.serviceWorker.register(url.href,{scope,updateViaCache:'none'});
 if(!registration.active)await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(new Error('No se pudo preparar la app. Recarga e intenta de nuevo.')),12000);
  const worker=registration.installing||registration.waiting;
  if(!worker){clearTimeout(timer);resolve();return;}
  const check=()=>{if(worker.state==='activated'){clearTimeout(timer);resolve();}else if(worker.state==='redundant'){clearTimeout(timer);reject(new Error('Vuelve a abrir la app.'));}};
  worker.addEventListener('statechange',check);check();
 });
 navigator.serviceWorker.addEventListener('message',e=>{
  if(e.data?.tipo==='push-recibido'){window.dispatchEvent(new Event('portal-nuevo-aviso'));if(e.data.clase==='prueba')message('Aviso de prueba recibido en este dispositivo.');}
  if(e.data?.tipo==='abrir-aviso')window.dispatchEvent(new CustomEvent('portal-abrir-aviso',{detail:e.data}));
 });
}
const readyWorker=setupWorker().catch(e=>{message(e.message);return null;});
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();promptInstall=e;renderInstall();});
window.addEventListener('appinstalled',()=>{installed=true;promptInstall=null;renderInstall();message('App instalada. Ahora activa los avisos.');});
window.matchMedia('(display-mode: standalone)').addEventListener?.('change',e=>{installed=e.matches;renderInstall();});
$('pwaInstall')?.addEventListener('click',async()=>{
 if(promptInstall){const p=promptInstall;promptInstall=null;const choice=await p.prompt();if(choice?.outcome==='accepted')message('Confirma la instalación y abre el icono Mis Turnos.');renderInstall();}
 else {
  $('pwaInstallHelp').hidden=false;
  $('pwaInstallHelp').textContent=isIOS()?'En iPhone: abre esta pagina en Safari, pulsa Compartir y elige Añadir a pantalla de inicio. Luego abre el icono Mis Turnos.':'En Chrome: abre el menú de los tres puntos y elige Instalar aplicacion o Añadir a pantalla de inicio. Confirma Instalar. No necesitas guardarlo como marcador.';
 }
});
function setPushState(active){
 $('pwaPush').hidden=active;$('pwaOptions').hidden=!active;
 $('pwaPush').disabled=!userId||!config||!registration||pushBusy;
 if(active){message(config?.envio_automatico?'Avisos activados en este dispositivo.':'Permiso guardado. El envío automático de avisos aún no está habilitado.');$('pwaTest').hidden=!config?.envio_automatico;}
}
function decodeKey(s){return Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));}
export async function iniciarPWA(user){
 userId=user.id;renderInstall();
 try {
  await readyWorker;
  config=await pushCall('config');$('pwaRetry').hidden=true;
  $('pwaPush').textContent=config.envio_automatico?'Activar avisos':'Preparar avisos';
  if(!config.activo){message('Los avisos del celular están temporalmente pausados.');return;}
  if(isIOS()&&!installed){message('En iPhone instala la app y abre su icono para activar las notificaciones.');$('pwaPush').disabled=true;return;}
  if(!registration||!('PushManager' in window)||!('Notification' in window)){message('Este navegador no admite avisos. Prueba en Chrome o desde la app instalada.');return;}
  let sub=await registration.pushManager.getSubscription();
  if(sub&&localGet()!==userId){await sub.unsubscribe();sub=null;localSet(null);await clearVisibleNotices();}
  if(sub&&Notification.permission==='granted'){
   await pushCall('guardar',sub.toJSON());localSet(userId);setPushState(true);
  }else{
   setPushState(false);
   if(Notification.permission==='denied')message('Las notificaciones están bloqueadas. Permitelas en los ajustes del sitio para este celular.');
   else message(config.envio_automatico?'Activa los avisos para enterarte de cambios de horario y respuestas de Bienestar.':'Puedes preparar el permiso. El envío automático de notificaciones está pendiente de activación.');
  }
 }catch(e){message(e.message);$('pwaRetry').hidden=false;}
}
$('pwaRetry')?.addEventListener('click',()=>{if(userId)iniciarPWA({id:userId});});
$('pwaPush')?.addEventListener('click',async()=>{
 if(pushBusy||!userId||!registration||!config)return;
 // Request permission immediately within the user's gesture (required by iOS).
 const permissionPromise=Notification.requestPermission();pushBusy=true;$('pwaPush').disabled=true;
 let sub=null;
 try {
  if(await permissionPromise!=='granted'){message('No se activaron los avisos. Puedes seguir consultando tus turnos.');return;}
  sub=await registration.pushManager.getSubscription()||await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:decodeKey(config.publicKey)});
  await pushCall('guardar',sub.toJSON());localSet(userId);setPushState(true);
  if(config.envio_automatico){try{await pushCall('prueba',{endpoint:sub.endpoint});message('Avisos activados. Enviaremos una prueba; puede tardar cerca de un minuto.');}catch(e){message('Avisos activados. '+e.message);}}
 }catch(e){if(sub&&!localGet())await sub.unsubscribe().catch(()=>{});message(e.message);$('pwaRetry').hidden=false;}
 finally{pushBusy=false;$('pwaPush').disabled=!config||!userId;}
});
$('pwaTest')?.addEventListener('click',async()=>{
 if(pushBusy||!registration||!config?.envio_automatico)return;pushBusy=true;$('pwaTest').disabled=true;
 try{const sub=await registration.pushManager.getSubscription();if(!sub)throw new Error('Activa las notificaciones nuevamente.');await pushCall('prueba',{endpoint:sub.endpoint});message('Prueba solicitada al servidor. Espera aproximadamente un minuto.');}
 catch(e){message(e.message);}finally{pushBusy=false;$('pwaTest').disabled=false;}
});
async function clearVisibleNotices(){const all=await registration?.getNotifications();all?.forEach(n=>n.close());if(navigator.clearAppBadge)await navigator.clearAppBadge().catch(()=>{});}
export async function detenerPWA({server=true}={}){
 try {
  await readyWorker;const sub=await registration?.pushManager?.getSubscription();
  if(sub){if(server&&userId)await pushCall('baja',{endpoint:sub.endpoint}).catch(()=>{});await sub.unsubscribe();}
 }catch{}finally{localSet(null);await clearVisibleNotices().catch(()=>{});config=null;userId=null;}
}
$('pwaOff')?.addEventListener('click',async()=>{
 const previous=userId;await detenerPWA();userId=previous;setPushState(false);message('Avisos desactivados en este dispositivo.');
 if(previous)try{config=await pushCall('config');$('pwaPush').disabled=false;}catch{}
});
export async function avisosHorario(){return await pushCall('avisos');}
export async function leerAvisoHorario(id){return await pushCall('leido',{id});}
export function badgePWA(n){lastNoticeCount=Number(n)||0;if(navigator.setAppBadge){(lastNoticeCount?navigator.setAppBadge(lastNoticeCount):navigator.clearAppBadge()).catch(()=>{});}}
renderInstall();
