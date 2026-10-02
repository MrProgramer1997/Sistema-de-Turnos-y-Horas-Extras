import {supabase} from '../supabase/supabaseClient.js';
import {registrarPWA} from './pwa-registro.js?v=750';

const btn=document.getElementById('btnPushBienestar');
const status=document.getElementById('pushBienestarEstado');
let reg=null,config=null,busy=false,sub=null;

function say(text){if(status)status.textContent=text||'';}
function supported(){return window.isSecureContext&&'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;}
function keyBytes(value){return Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));}
async function call(accion,datos={}){
  const {data,error}=await supabase.functions.invoke('portal-push-v748',{body:{accion,datos}});
  if(error){let detail;try{detail=await error.context?.json();}catch{}throw new Error(detail?.error||'No se pudo conectar con las notificaciones.');}
  if(!data?.ok)throw new Error(data?.error||'No se pudo completar la operación.');
  return data;
}
function render(active){
  if(!btn)return;
  btn.hidden=false;
  btn.disabled=busy;
  btn.textContent=active?'Desactivar notificaciones':'Activar notificaciones';
  btn.classList.toggle('btn-outline-danger',active);
  btn.classList.toggle('btn-outline-success',!active);
}
async function refresh(){
  if(!btn)return;
  if(!supported()){btn.hidden=true;say('Este navegador no admite notificaciones push.');return;}
  try{
    reg=await registrarPWA();
    const {data:{session}}=await supabase.auth.getSession();
    if(!session?.user){btn.hidden=true;say('Inicia sesión para configurar las notificaciones.');return;}
    config=await call('config');
    if(!config.bienestar){btn.hidden=true;say('');return;}
    if(!config.activo){btn.hidden=true;say('Las notificaciones están temporalmente pausadas.');return;}
    sub=await reg?.pushManager?.getSubscription();
    if(sub&&Notification.permission==='granted'){
      await call('guardar',sub.toJSON());
      reg.active?.postMessage({tipo:'activar-avisos'});
      render(true);
      say(config.envio_automatico?'Notificaciones de Bienestar activas en este dispositivo.':'Permiso guardado; el envío automático está pausado.');
    }else{
      render(false);
      say(Notification.permission==='denied'?'Las notificaciones están bloqueadas en el navegador.':'Activa las notificaciones para recibir nuevas solicitudes y soportes.');
    }
  }catch(e){btn.hidden=false;render(false);say(e.message);}
}
async function activate(){
  if(busy||!config?.bienestar||!reg)return;
  busy=true;render(!!sub);
  try{
    const permission=await Notification.requestPermission();
    if(permission!=='granted')throw new Error('No se concedió el permiso de notificaciones.');
    sub=await reg.pushManager.getSubscription()||await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:keyBytes(config.publicKey)});
    await call('guardar',sub.toJSON());
    reg.active?.postMessage({tipo:'activar-avisos'});
    render(true);
    say('Notificaciones de Bienestar activadas en este dispositivo.');
    if(config.envio_automatico){await call('prueba',{endpoint:sub.endpoint});say('Notificaciones activadas. Se envió una prueba que debe llegar en el siguiente ciclo.');}
  }catch(e){say(e.message);}
  finally{busy=false;render(!!sub);}
}
async function deactivate(){
  if(busy||!sub)return;
  busy=true;render(true);
  try{
    const endpoint=sub.endpoint;
    await call('baja',{endpoint});
    await sub.unsubscribe();
    sub=null;
    render(false);
    say('Notificaciones desactivadas en este dispositivo.');
  }catch(e){say(e.message);}
  finally{busy=false;render(!!sub);}
}
btn?.addEventListener('click',()=>sub?deactivate():activate());
window.addEventListener('pageshow',refresh,{once:true});
