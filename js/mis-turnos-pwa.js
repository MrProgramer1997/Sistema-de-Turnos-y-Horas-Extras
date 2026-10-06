import {registrarPWA,instalada,ayudaInstalacion} from './pwa-registro.js?v=754';
import {pushCall,sincronizarAvisos,desactivarAvisos,avisosDesactivados} from './push-dispositivo.js?v=754';
export {pushCall};
const $=id=>document.getElementById(id);
let promptInstall=null,registration=null,userId=null,config=null,pushBusy=false,syncBusy=false,epoch=0,ultimoSync=0;
const message=text=>{if($('pwaStatus'))$('pwaStatus').textContent=text;};
const supported=()=>registration&&('PushManager' in window)&&('Notification' in window);
const current=(e,id)=>e===epoch&&id===userId&&!!id;
function renderInstall(){
 $('pwaInstall').hidden=instalada();$('pwaInstall').textContent=promptInstall?'Instalar app':'Cómo instalar';
 $('pwaInstallHelp').hidden=true;$('pwaLead').textContent=instalada()?'Mis Turnos en tu celular':'Abre Mis Turnos desde su icono';
}
function setPushState(active){
 $('pwaPush').hidden=active;$('pwaOptions').hidden=!active;
 $('pwaPush').disabled=!userId||!config?.activo||!supported()||pushBusy||syncBusy;
 $('pwaTest').hidden=!config?.envio_automatico;$('pwaTest').disabled=pushBusy||syncBusy;
 $('pwaOff').disabled=pushBusy||syncBusy;
 if(active)message(config?.envio_automatico?'Avisos activados en este dispositivo.':'Permiso guardado. El envío automático está pausado.');
}
async function preparar(){if(!registration)registration=await registrarPWA();return registration;}
preparar().catch(e=>message(e.message));
if('serviceWorker' in navigator)navigator.serviceWorker.addEventListener('message',e=>{
 if(e.data?.tipo==='push-suscripcion-cambio'){reconectar(true);return;}
 if(!userId)return;
 if(e.data?.tipo==='push-recibido'){window.dispatchEvent(new Event('portal-nuevo-aviso'));if(e.data.clase==='prueba')message('Aviso de prueba recibido en este dispositivo.');}
 if(e.data?.tipo==='abrir-aviso')window.dispatchEvent(new CustomEvent('portal-abrir-aviso',{detail:e.data}));
});
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();promptInstall=e;renderInstall();});
window.addEventListener('appinstalled',()=>{promptInstall=null;renderInstall();reconectar();});
window.matchMedia('(display-mode: standalone)').addEventListener?.('change',renderInstall);
$('pwaInstall').addEventListener('click',async()=>{
 if(promptInstall){const p=promptInstall;promptInstall=null;try{await p.prompt();}catch{}renderInstall();}
 else{$('pwaInstallHelp').hidden=false;$('pwaInstallHelp').textContent=ayudaInstalacion();}
});
export async function iniciarPWA(user){
 const version=++epoch,id=user.id;userId=id;config=null;syncBusy=true;pushBusy=false;ultimoSync=Date.now();
 setPushState(false);renderInstall();message('Comprobando los avisos de este dispositivo...');
 try{
  await preparar();if(!current(version,id))return;
  const cfg=await pushCall('config',{}, {usuario:id});if(!current(version,id))return;config=cfg;
  if(config.usuario!==id)throw new Error('La cuenta cambió. Ingresa nuevamente.');
  $('pwaRetry').hidden=true;
  if(!config.activo){message('Los avisos del celular están temporalmente pausados.');return;}
  const ios=/iPhone|iPad|iPod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  if(ios&&!instalada()){message('En iPhone abre la app desde su icono para configurar los avisos.');return;}
  if(!supported()){message('Este navegador no admite avisos. Prueba desde la app instalada o Chrome.');return;}
  const sub=await sincronizarAvisos(registration,config,{usuario:id,actual:()=>current(version,id)});
  if(!current(version,id))return;setPushState(!!sub);
  if(!sub)message(avisosDesactivados()?'Avisos desactivados en este dispositivo. Puedes activarlos nuevamente.':Notification.permission==='denied'?'Las notificaciones están bloqueadas. Permítelas en los ajustes del sitio.':'Activa los avisos para recibir cambios de horario y respuestas de Bienestar.');
 }catch(e){if(current(version,id)){setPushState(false);message(e.message);$('pwaRetry').hidden=false;}}
 finally{if(current(version,id)){syncBusy=false;$('pwaPush').disabled=!config?.activo||!supported();$('pwaTest').disabled=false;$('pwaOff').disabled=false;}}
}
function reconectar(forzar=false){if(userId&&!pushBusy&&!syncBusy&&navigator.onLine!==false&&(forzar===true||Date.now()-ultimoSync>=30000))iniciarPWA({id:userId});}
window.addEventListener('online',()=>reconectar(true));window.addEventListener('pageshow',()=>reconectar());window.addEventListener('pwa-actualizada',()=>reconectar(true));
document.addEventListener('visibilitychange',()=>{if(!document.hidden)reconectar();});
$('pwaRetry').addEventListener('click',()=>{if(userId&&!pushBusy&&!syncBusy)iniciarPWA({id:userId});});
$('pwaPush').addEventListener('click',async()=>{
 if(pushBusy||syncBusy||!userId||!config?.activo||!supported())return;
 const version=epoch,id=userId,cfg=config;
 // Solicitud de permiso directamente desde el gesto del usuario.
 const permission=Notification.permission==='granted'?Promise.resolve('granted'):Notification.requestPermission();
 pushBusy=true;$('pwaPush').disabled=true;
 try{
  if(await permission!=='granted'){if(current(version,id))message('No se activaron los avisos. Puedes seguir consultando tus turnos.');return;}
  const sub=await sincronizarAvisos(registration,cfg,{usuario:id,actual:()=>current(version,id),explicito:true});
  if(!current(version,id)||!sub)return;setPushState(true);$('pwaRetry').hidden=true;
  if(cfg.envio_automatico){await pushCall('prueba',{endpoint:sub.endpoint},{usuario:id});if(current(version,id))message('Avisos activados. Prueba en cola; normalmente llega en el siguiente minuto.');}
 }catch(e){if(current(version,id)){message(e.message);$('pwaRetry').hidden=false;}}
 finally{if(current(version,id)){pushBusy=false;$('pwaPush').disabled=!config?.activo;$('pwaTest').disabled=false;$('pwaOff').disabled=false;}}
});
$('pwaTest').addEventListener('click',async()=>{
 if(pushBusy||syncBusy||!userId||!registration||!config?.envio_automatico)return;
 const version=epoch,id=userId;pushBusy=true;$('pwaTest').disabled=true;
 try{
  const sub=await sincronizarAvisos(registration,config,{usuario:id,actual:()=>current(version,id)});
  if(!current(version,id))return;if(!sub)throw new Error('Pulsa Activar avisos para reconectarlos.');
  await pushCall('prueba',{endpoint:sub.endpoint},{usuario:id});
  if(current(version,id))message('Prueba en cola. Puedes cerrar la app o salir de tu cuenta y comprobar su llegada.');
 }catch(e){if(current(version,id)){message(e.message);$('pwaRetry').hidden=false;}}
 finally{if(current(version,id)){pushBusy=false;$('pwaTest').disabled=false;}}
});
export function suspenderPWA(){++epoch;userId=null;config=null;pushBusy=false;syncBusy=false;setPushState(false);}
export async function detenerPWA(){if(registration)return desactivarAvisos(registration,{usuario:userId});}
$('pwaOff').addEventListener('click',async()=>{
 if(!userId||pushBusy||syncBusy)return;
 const version=epoch,id=userId;pushBusy=true;$('pwaOff').disabled=true;$('pwaTest').disabled=true;
 try{
  const result=await detenerPWA();if(!current(version,id))return;
  setPushState(false);message(result?.falloServidor?'Avisos desactivados en este dispositivo. No se pudo confirmar la baja en el servidor; vuelve a intentar cuando tengas conexión.':'Avisos desactivados en este dispositivo. Puedes activarlos nuevamente.');
 }catch(e){if(current(version,id)){message(e.message);$('pwaRetry').hidden=false;}}
 finally{if(current(version,id)){pushBusy=false;$('pwaPush').disabled=!config?.activo;$('pwaOff').disabled=false;$('pwaTest').disabled=false;}}
});
export async function avisosHorario(){return pushCall('avisos',{}, {usuario:userId||undefined});}
export async function leerAvisoHorario(id){return pushCall('leido',{id},{usuario:userId||undefined});}
export function badgePWA(n){if(navigator.setAppBadge)(Number(n)?navigator.setAppBadge(Number(n)):navigator.clearAppBadge()).catch(()=>{});}
renderInstall();
