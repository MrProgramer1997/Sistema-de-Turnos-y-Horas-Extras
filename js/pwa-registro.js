/* Conserva la URL y el scope del piloto instalado. */
let ready,registro=null,ultimoIntento=0;
const avisar=()=>window.dispatchEvent(new Event('pwa-actualizada'));
function observar(reg){
 const vistos=new WeakSet();
 const seguir=worker=>{
  if(!worker||vistos.has(worker))return;vistos.add(worker);
  worker.addEventListener('statechange',()=>{if(worker.state==='activated')avisar();});
 };
 seguir(reg.installing);seguir(reg.waiting);
 reg.addEventListener('updatefound',()=>seguir(reg.installing));
}
function esperarActivo(reg){
 if(reg.active)return Promise.resolve();
 return new Promise((resolve,reject)=>{
  const workers=new Set();
  const limpiar=()=>{clearTimeout(timer);reg.removeEventListener('updatefound',check);for(const w of workers)w.removeEventListener('statechange',check);};
  const check=()=>{
   for(const w of [reg.installing,reg.waiting])if(w&&!workers.has(w)){workers.add(w);w.addEventListener('statechange',check);}
   if(reg.active||[...workers].some(w=>w.state==='activated')){limpiar();resolve();}
   else if(workers.size&&[...workers].every(w=>w.state==='redundant')){limpiar();reject(new Error('No se pudo actualizar la app. Vuelve a abrirla e intenta de nuevo.'));}
  };
  const timer=setTimeout(()=>{limpiar();reject(new Error('No se pudo preparar la app. Revisa la conexión e intenta nuevamente.'));},12000);
  reg.addEventListener('updatefound',check);check();
 });
}
export function registrarPWA(){
 if(ready)return ready;
 ready=(async()=>{
  if(!window.isSecureContext||!('serviceWorker' in navigator))return null;
  const url=new URL('../pages/mis-turnos-sw.js',import.meta.url),scope=new URL('./',url).href;
  const current=await navigator.serviceWorker.getRegistration(scope);
  if(current?.scope===scope&&![current.active,current.waiting,current.installing].filter(Boolean).some(w=>new URL(w.scriptURL).pathname===url.pathname))throw new Error('Ya existe otra aplicación en esta ruta. Contacta a Sistemas.');
  const reg=await navigator.serviceWorker.register(url.href,{scope,updateViaCache:'none'});
  observar(reg);await esperarActivo(reg);registro=reg;
  comprobarActualizacion().catch(()=>{});
  return reg;
 })().catch(e=>{ready=null;throw e;});
 return ready;
}
export async function comprobarActualizacion(){
 if(!registro||navigator.onLine===false||Date.now()-ultimoIntento<60000)return;
 ultimoIntento=Date.now();
 try{await registro.update();}catch{ultimoIntento=0;}
}
window.addEventListener('online',()=>comprobarActualizacion());
window.addEventListener('pageshow',()=>comprobarActualizacion());
document.addEventListener('visibilitychange',()=>{if(!document.hidden)comprobarActualizacion();});
export function instalada(){return matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;}
export function ayudaInstalacion(){const ios=/iPhone|iPad|iPod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);return ios?'En Safari, pulsa Compartir y elige Añadir a pantalla de inicio. Luego abre el icono Mis Turnos.':'En Chrome, abre el menú de los tres puntos y elige Instalar aplicación o Añadir a pantalla de inicio. Confirma la instalación.';}
