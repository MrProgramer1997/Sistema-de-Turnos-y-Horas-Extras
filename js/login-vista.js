/* View selection is not authorization. The backend verifies every account. */
(() => {
 const $=id=>document.getElementById(id);
 function view(admin,{historyMode='none',focus=false}={}) {
  $('adminLogin').style.display=admin?'flex':'none';
  $('empleadoLogin').style.display=admin?'none':'flex';
  $('clavePersonal').style.display='none';$('loginSecondary').hidden=false;
  $('accesoAdmin').hidden=admin;$('volverEmpleado').hidden=!admin;
  $('loginTitle').textContent=admin?'Administraci\u00f3n':'Mis Turnos';
  $('loginDescription').textContent=admin?'Ingresa con tu cuenta administrativa.':'Ingresa con tu c\u00e9dula y tu contrase\u00f1a personal.';
  document.body.dataset.loginMode=admin?'admin':'empleado';
  for(const id of ['password','passwordEmpleado','claveNueva','claveRepetida'])$(id).value='';
  $('passwordEmpleado').type='password';$('verClaveEmpleado').textContent='Ver';$('verClaveEmpleado').setAttribute('aria-pressed','false');
  window.limpiarMensaje?.();window.limpiarErrores?.();window.ocultarLoader?.();
  if(historyMode!=='none'){
   const u=new URL(location.href);u.searchParams.delete('activar');u.searchParams.delete('salida');
   u.searchParams.delete(admin?'empleado':'admin');u.searchParams.set(admin?'admin':'empleado','1');
   history[historyMode==='push'?'pushState':'replaceState']({},'',u);
  }
  if(focus)$('loginTitle').focus({preventScroll:true});
 }
 function fromURL(){const q=new URLSearchParams(location.search);view(q.get('admin')==='1'||(q.get('sesion')==='verificada'&&q.get('empleado')!=='1'));}
 window.mostrarAdmin=()=>view(true,{historyMode:'push',focus:true});
 window.mostrarEmpleado=()=>view(false,{historyMode:'replace'});
 $('accesoAdmin').addEventListener('click',e=>{e.preventDefault();view(true,{historyMode:'push',focus:true});});
 $('volverEmpleado').addEventListener('click',e=>{e.preventDefault();view(false,{historyMode:'push',focus:true});});
 $('verClaveEmpleado').addEventListener('click',()=>{const show=$('passwordEmpleado').type==='password';$('passwordEmpleado').type=show?'text':'password';$('verClaveEmpleado').textContent=show?'Ocultar':'Ver';$('verClaveEmpleado').setAttribute('aria-pressed',String(show));$('verClaveEmpleado').setAttribute('aria-label',show?'Ocultar contrase\u00f1a':'Mostrar contrase\u00f1a');});
 window.addEventListener('popstate',fromURL);
 function avisoSalida(){if(new URLSearchParams(location.search).get('salida')==='local')window.mostrarMensaje?.('info','Se cerr\u00f3 el acceso en este dispositivo. No fue posible confirmar la revocaci\u00f3n en el servidor; revisa la conexi\u00f3n.');}
 window.addEventListener('pageshow',e=>{if(e.persisted)fromURL();avisoSalida();});
 fromURL();setTimeout(avisoSalida,0);
})();
