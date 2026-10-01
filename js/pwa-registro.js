/* Same manifest id, worker URL and scope as the installed 7.48 pilot. */
let ready;
export function registrarPWA(){
 if(ready)return ready;
 ready=(async()=>{
  if(!window.isSecureContext||!('serviceWorker' in navigator))return null;
  const url=new URL('../pages/mis-turnos-sw.js',import.meta.url),scope=new URL('./',url).href;
  const current=await navigator.serviceWorker.getRegistration(scope);
  if(current?.scope===scope&&![current.active,current.waiting,current.installing].filter(Boolean).some(w=>new URL(w.scriptURL).pathname===url.pathname))throw new Error('Ya existe otra aplicaci\u00f3n en esta ruta. Contacta a Sistemas.');
  const reg=await navigator.serviceWorker.register(url.href,{scope,updateViaCache:'none'});
  if(!reg.active)await new Promise((resolve,reject)=>{
   const worker=reg.installing||reg.waiting;
   const timer=setTimeout(()=>reject(new Error('No se pudo preparar la app. Recarga e intenta nuevamente.')),12000);
   const check=()=>{if(reg.active||worker?.state==='activated'){clearTimeout(timer);resolve();}else if(worker?.state==='redundant'){clearTimeout(timer);reject(new Error('Vuelve a abrir la app.'));}};
   worker?.addEventListener('statechange',check);check();
  });
  return reg;
 })().catch(e=>{ready=null;throw e;});
 return ready;
}
export function instalada(){return matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;}
export function ayudaInstalacion(){const ios=/iPhone|iPad|iPod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);return ios?'En Safari, pulsa Compartir y elige A\u00f1adir a pantalla de inicio. Luego abre el icono Mis Turnos.':'En Chrome, abre el men\u00fa de los tres puntos y elige Instalar aplicaci\u00f3n o A\u00f1adir a pantalla de inicio. Confirma la instalaci\u00f3n.';}
