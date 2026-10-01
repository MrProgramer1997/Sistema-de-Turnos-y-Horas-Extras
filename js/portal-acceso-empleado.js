import { supabase } from '../supabase/supabaseClient.js';
const ROLE='portal_empleado_v747';
let busy=false;
const $=id=>document.getElementById(id);
const show=(kind,message)=>{window.ocultarLoader?.();window.mostrarMensaje?.(kind,message);};
const tokenRole=token=>{try{return JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).role;}catch{return '';}};
async function endpoint(body){
 const {data,error}=await supabase.functions.invoke('portal-acceso-empleado-v747',{body});
 if(error){let info;try{info=await error.context?.json();}catch{}throw new Error(info?.error||'No se pudo verificar el acceso. Revisa la conexión e intenta de nuevo.');}
 if(!data?.ok)throw new Error(data?.error||'No se pudo confirmar el acceso.');
 return data;
}
function activationScreen(){
 window.ocultarLoader?.();window.limpiarMensaje?.();
 $('adminLogin').style.display='none';$('empleadoLogin').style.display='none';$('clavePersonal').style.display='flex';
 $('loginSecondary').hidden=true;$('loginTitle').textContent='Activa tu acceso';$('loginDescription').textContent='Crea una contraseña que solo tú conozcas.';
 $('passwordEmpleado').value='';$('claveNueva').focus();
}
function goPortal(){localStorage.removeItem('ccp_sesion');const route=new URLSearchParams(location.search).get('destino');location.replace('mis-turnos.html#'+(['avisos','turno'].includes(route)?route:'inicio'));}
export async function loginEmpleadoSeguro(){
 if(busy)return false;
 const documento=String($('cedula')?.value||'').trim(),password=$('passwordEmpleado')?.value||'';
 if(!/^[0-9]{5,15}$/.test(documento)||!password){show('error','Escribe tu cédula y contraseña.');return false;}
 busy=true;$('btnIngresoEmpleado').disabled=true;
 try{
  const result=await endpoint({accion:'ingresar',documento,password});
  if(!result.session?.access_token||!result.session?.refresh_token||tokenRole(result.session.access_token)!==ROLE)throw new Error('No se pudo confirmar el acceso personal. Contacta a Sistemas.');
  const {error}=await supabase.auth.setSession(result.session);if(error)throw new Error('No se pudo abrir la sesión. Vuelve a ingresar.');
  localStorage.removeItem('ccp_sesion');
  const {data:access,error:accessError}=await supabase.rpc('portal_mi_acceso_v747');
  if(accessError||!access?.personal)throw new Error('No se pudo comprobar tu acceso. Contacta a Sistemas.');
  if(access.cambiar_clave){activationScreen();return true;}
  goPortal();return true;
 }catch(e){show('error',e.message);return false;}
 finally{busy=false;$('btnIngresoEmpleado').disabled=false;window.ocultarLoader?.();}
}
$('clavePersonal')?.addEventListener('submit',async event=>{
 event.preventDefault();if(busy)return;
 const password=$('claveNueva').value,confirmation=$('claveRepetida').value;
 if(password!==confirmation){show('error','Las contraseñas no coinciden.');return;}
 if(password.length<10||password.length>128||!/[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(password)||!/[0-9]/.test(password)){show('error','Usa al menos 10 caracteres, con letras y números.');return;}
 busy=true;$('btnGuardarClave').disabled=true;
 try{const result=await endpoint({accion:'cambiar_clave',password});if(result.session){if(tokenRole(result.session.access_token)!==ROLE)throw new Error('Sesión personal no válida');const {error}=await supabase.auth.setSession(result.session);if(error)throw new Error('Ingresa con tu nueva contraseña.');}$('claveNueva').value='';$('claveRepetida').value='';goPortal();}
 catch(e){show('error',e.message);}
 finally{busy=false;$('btnGuardarClave').disabled=false;}
});
$('cancelarClavePersonal')?.addEventListener('click',async()=>{if(busy)return;const {cerrarSesionAplicacion}=await import('./sesion-app.js?v=749');await cerrarSesionAplicacion();location.replace('login.html?empleado=1');});
setTimeout(async()=>{
 const args=new URLSearchParams(location.search);
 
 if(args.get('activar')==='1'){
  try{const {data,error}=await supabase.rpc('portal_mi_acceso_v747');if(!error&&data?.personal){if(data.cambiar_clave)activationScreen();else goPortal();}}
  catch{show('error','Ingresa nuevamente para activar tu contraseña.');}
 }
},0);
