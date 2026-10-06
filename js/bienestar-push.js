import {supabase} from '../supabase/supabaseClient.js';
import {registrarPWA,instalada} from './pwa-registro.js?v=754';
import {pushCall,sincronizarAvisos,desactivarAvisos,avisosDesactivados} from './push-dispositivo.js?v=754';
const btn=document.getElementById('btnPushBienestar'),status=document.getElementById('pushBienestarEstado');
let reg=null,config=null,busy=false,sub=null,userId=null,epoch=0,ultimoSync=0,permitido=false,reintentar=false;
const current=(e,id)=>e===epoch&&id===userId&&!!id;
function say(text){if(status)status.textContent=text||'';}
function supported(){return window.isSecureContext&&'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;}
function render(active){
 if(btn&&reintentar&&userId){btn.hidden=false;btn.disabled=busy;btn.textContent='Reintentar notificaciones';return;}
 if(!btn)return;btn.hidden=!permitido||!config?.bienestar||!config?.activo;
 btn.disabled=busy;btn.textContent=active?'Desactivar notificaciones':'Activar notificaciones';
 btn.classList.toggle('btn-outline-danger',active);btn.classList.toggle('btn-outline-success',!active);
}
async function refresh(){
 if(!btn||busy)return;
 if(!supported()){btn.hidden=true;say('Este navegador no admite notificaciones push.');return;}
 const version=++epoch;busy=true;reintentar=false;render(!!sub);ultimoSync=Date.now();
 let id=null;
 try{
  const {data,error}=await supabase.auth.getSession();if(version!==epoch)return;
  id=data?.session?.user?.id;userId=id||null;sub=null;config=null;permitido=false;
  if(error||!id){btn.hidden=true;say('Inicia sesión para configurar las notificaciones.');return;}
  reg=await registrarPWA();if(!current(version,id))return;
  const cfg=await pushCall('config',{}, {usuario:id});if(!current(version,id))return;config=cfg;
  if(cfg.usuario!==id)throw new Error('La cuenta cambió. Ingresa nuevamente.');
  if(!cfg.bienestar){btn.hidden=true;say('');return;}
  if(!cfg.activo){btn.hidden=true;say('Las notificaciones están temporalmente pausadas.');return;}
  const ios=/iPhone|iPad|iPod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  if(ios&&!instalada()){btn.hidden=true;say('En iPhone abre la app desde su icono para configurar las notificaciones.');return;}
  permitido=true;
  const saved=await sincronizarAvisos(reg,cfg,{usuario:id,actual:()=>current(version,id)});
  if(!current(version,id))return;sub=saved;render(!!sub);
  say(sub?(cfg.envio_automatico?'Notificaciones de Bienestar activas en este dispositivo.':'Permiso guardado; el envío automático está pausado.'):avisosDesactivados()?'Notificaciones desactivadas en este dispositivo.':Notification.permission==='denied'?'Las notificaciones están bloqueadas en el navegador.':'Activa las notificaciones para recibir nuevas solicitudes y soportes.');
 }catch(e){if(version===epoch){reintentar=true;render(false);say(e.message);}}
 finally{if(version===epoch){busy=false;render(!!sub);}}
}
btn?.addEventListener('click',async()=>{
 if(reintentar&&!busy){refresh();return;}
 if(busy||!permitido||!config?.bienestar||!reg||!userId)return;
 const version=epoch,id=userId,cfg=config,desactivar=!!sub;
 const permission=desactivar?null:Notification.permission==='granted'?Promise.resolve('granted'):Notification.requestPermission();
 busy=true;render(!!sub);
 try{
  if(desactivar){
   const result=await desactivarAvisos(reg,{usuario:id});if(!current(version,id))return;sub=null;
   say(result.falloServidor?'Notificaciones desactivadas en este dispositivo; falta confirmar la baja en el servidor.':'Notificaciones desactivadas en este dispositivo.');
  }else{
   if(await permission!=='granted')throw new Error('No se concedió el permiso de notificaciones.');
   const saved=await sincronizarAvisos(reg,cfg,{usuario:id,actual:()=>current(version,id),explicito:true});
   if(!current(version,id)||!saved)return;sub=saved;say('Notificaciones de Bienestar activadas en este dispositivo.');
   if(cfg.envio_automatico){await pushCall('prueba',{endpoint:sub.endpoint},{usuario:id});if(current(version,id))say('Notificaciones activadas. Prueba en cola para el siguiente ciclo.');}
  }
 }catch(e){if(current(version,id))say(e.message);}
 finally{if(current(version,id)){busy=false;render(!!sub);}}
});
function reconectar(forzar=false){if(!busy&&navigator.onLine!==false&&(forzar===true||Date.now()-ultimoSync>=30000))refresh();}
window.addEventListener('online',()=>reconectar(true));window.addEventListener('pageshow',()=>reconectar());window.addEventListener('pwa-actualizada',()=>reconectar(true));
if('serviceWorker' in navigator)navigator.serviceWorker.addEventListener('message',e=>{if(e.data?.tipo==='push-suscripcion-cambio')reconectar(true);});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)reconectar();});
supabase.auth.onAuthStateChange((event,session)=>{
 if(event==='SIGNED_OUT'||(userId&&session?.user?.id&&userId!==session.user.id)){
  ++epoch;userId=null;config=null;sub=null;busy=false;permitido=false;reintentar=false;render(false);say('Inicia sesión para configurar las notificaciones.');
 }else if(event==='SIGNED_IN')queueMicrotask(()=>refresh());
});
refresh();
