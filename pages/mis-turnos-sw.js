/* Mis Turnos PWA 7.54. No private data, API response, auth token or medical
   attachment is cached. No interception of payroll/administrative pages. */
const VERSION='mis-turnos-public-754';
const PREFS='mis-turnos-device-preferences';
const FLAG=new URL('push-enabled',self.location).href;
const DISABLED=new URL('push-disabled-explicit',self.location).href;
const LOGIN=new URL('login.html',self.location);
const OFFLINE=new URL('mis-turnos-offline.html',self.location).href;
const APP=new URL('mis-turnos.html',self.location);
const ICON=new URL('../assets/mis-turnos/icon-192.png',self.location).href;
const BADGE=new URL('../assets/mis-turnos/badge-96.png',self.location).href;
const RECEIPT='https://kzxveqrgvuchcgwrjwjb.supabase.co/functions/v1/portal-push-v748';
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
async function confirmarRecepcion(data){
 if(!uuid(data.envio)||!uuid(data.recibo))return;
 // Este recibo solo confirma un envío: no es una sesión ni permite leer datos.
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),7000);
 try{await fetch(RECEIPT,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({accion:'recibido',datos:{envio:data.envio,recibo:data.recibo}}),signal:ctrl.signal,credentials:'omit',cache:'no-store'});}catch{}
 finally{clearTimeout(timer);}
}
async function marcarInsignia(){try{await self.navigator?.setAppBadge?.();}catch{}}
self.addEventListener('install',event=>event.waitUntil((async()=>{
 const cache=await caches.open(VERSION);
 // Un icono ausente no debe impedir actualizar el receptor de notificaciones.
 await Promise.allSettled([OFFLINE,ICON,BADGE].map(url=>cache.add(url)));
 // Solo cambia el receptor Push y recursos públicos. No recarga ventanas ni
 // intercepta peticiones de formularios, API o soportes que estén en curso.
 await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 const keys=await caches.keys();await Promise.all(keys.filter(k=>k.startsWith('mis-turnos-public-')&&k!==VERSION).map(k=>caches.delete(k)));
 // Migra el antiguo bloqueo por «cerrar-sesion» sin revertir una baja explícita.
 const prefs=await caches.open(PREFS),disabled=await prefs.match(DISABLED);
 if(!disabled||await disabled.text()!=='on')await prefs.put(FLAG,new Response('on'));
 await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
 const req=event.request,u=new URL(req.url);
 if(req.method!=='GET'||u.origin!==APP.origin)return;
 if(req.mode==='navigate'&&[APP.pathname,LOGIN.pathname].includes(u.pathname)){
  event.respondWith(fetch(new Request(req,{cache:'no-store'})).catch(async()=>await caches.match(OFFLINE)||new Response('Sin conexión. Vuelve a abrir Mis Turnos cuando tengas internet.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}})));return;
 }
 if([OFFLINE,ICON,BADGE].includes(u.href))event.respondWith(caches.match(req).then(r=>r||fetch(req)));
});
self.addEventListener('message',event=>{
 const url=event.source?.url;
 if(!url||new URL(url).origin!==APP.origin)return;
 if(!['cerrar-sesion','activar-avisos','desactivar-avisos'].includes(event.data?.tipo))return;
 event.waitUntil((async()=>{
  const tipo=event.data.tipo;
  // «Salir» conserva el vínculo del dispositivo. Solo la baja explícita pausa.
  if(tipo!=='cerrar-sesion'){
   const enabled=tipo==='activar-avisos',cache=await caches.open(PREFS);
   await cache.put(DISABLED,new Response(enabled?'off':'on'));
   await cache.put(FLAG,new Response(enabled?'on':'off'));
  }
  if(tipo!=='activar-avisos'){const notices=await self.registration.getNotifications();notices.forEach(n=>n.close());}
  if(tipo==='desactivar-avisos')try{await self.navigator?.clearAppBadge?.();}catch{}
 })());
});
self.addEventListener('pushsubscriptionchange',event=>event.waitUntil((async()=>{
 // Las credenciales no se guardan en el worker. La ventana autenticada realiza
 // el registro seguro de la nueva suscripción; al reabrir también se comprueba.
 const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
 windows.filter(c=>new URL(c.url).origin===APP.origin&&new URL(c.url).pathname.startsWith(new URL('./',APP).pathname)).forEach(c=>c.postMessage({tipo:'push-suscripcion-cambio'}));
})()));
self.addEventListener('push',event=>event.waitUntil((async()=>{
 // Una antigua salida de sesión no equivale a desactivar el dispositivo.
 // Un fallo de caché tampoco debe impedir mostrar un envío válido del servidor.
 try{const prefs=await caches.open(PREFS),disabled=await prefs.match(DISABLED);if(disabled&&await disabled.text()==='on')return;}catch{}
 let data={};try{data=event.data?.json()||{};}catch{}
 const known=['horario','bienestar','bienestar_equipo','prueba'];const clase=known.includes(data.clase)?data.clase:'bienestar';
 const messages={horario:'Tu programacion fue actualizada. Abre la app para consultar el cambio.',bienestar:'Tienes una novedad de Bienestar. Abre la app para verla.',bienestar_equipo:'Hay una solicitud o nuevos soportes para revisar en Bienestar.',prueba:'Las notificaciones de Mis Turnos funcionan en este dispositivo.'};
 const id=/^[a-f0-9-]{36}$/i.test(data.id||'')?data.id:'aviso';
 const fecha=/^\d{4}-\d{2}-\d{2}$/.test(data.fecha||'')?data.fecha:null;
 await self.registration.showNotification('Mis Turnos - Club Campestre',{body:messages[clase],icon:ICON,badge:BADGE,tag:'turnos-'+id,renotify:false,data:{clase,id,fecha}});
 // Funciona sin ventanas abiertas. La insignia y el recibo no bloquean el aviso.
 await Promise.allSettled([marcarInsignia(),confirmarRecepcion(data)]);
 const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
 windows.filter(c=>new URL(c.url).pathname===APP.pathname).forEach(c=>c.postMessage({tipo:'push-recibido',clase}));
})()));
self.addEventListener('notificationclick',event=>event.waitUntil((async()=>{
 event.notification.close();const d=event.notification.data||{};
 const url=new URL(APP.href);url.hash='avisos';
 if(d.clase==='bienestar_equipo'){url.hash='';url.pathname=url.pathname.replace(/mis-turnos\.html$/,'solicitudes-bienestar.html');}
 const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
 const existing=windows.find(c=>new URL(c.url).origin===url.origin&&new URL(c.url).pathname===url.pathname);
 if(existing){await existing.focus();existing.postMessage({tipo:'abrir-aviso',clase:d.clase,fecha:d.fecha});return;}
 await self.clients.openWindow(url.href);
})()));
