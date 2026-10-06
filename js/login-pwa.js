import {registrarPWA,instalada,ayudaInstalacion} from './pwa-registro.js?v=754';
const box=document.getElementById('loginInstall'),button=document.getElementById('instalarLogin'),help=document.getElementById('instalarAyuda');
let prompt=null;
function render(){box.hidden=instalada();button.textContent=prompt?'Instalar Mis Turnos':'C\u00f3mo instalar la app';}
function say(text){help.hidden=false;help.textContent=text;}
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();prompt=e;render();});
window.addEventListener('appinstalled',()=>{prompt=null;render();});
button.addEventListener('click',async()=>{if(!prompt){say(ayudaInstalacion());return;}const next=prompt;prompt=null;try{await next.prompt();}catch{say(ayudaInstalacion());}render();});
registrarPWA().catch(()=>say('La instalaci\u00f3n no est\u00e1 disponible ahora. Puedes seguir ingresando desde esta p\u00e1gina.'));
render();
