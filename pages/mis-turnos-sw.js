/* Mis Turnos PWA 7.48. No private data, API response, auth token or medical
   attachment is cached. No interception of payroll/administrative pages. */
const VERSION='mis-turnos-public-748';
const OFFLINE=new URL('mis-turnos-offline.html',self.location).href;
const APP=new URL('mis-turnos.html',self.location);
const ICON=new URL('../assets/mis-turnos/icon-192.png',self.location).href;
const BADGE=new URL('../assets/mis-turnos/badge-96.png',self.location).href;
self.addEventListener('install',event=>event.waitUntil((async()=>{
 const cache=await caches.open(VERSION);await cache.addAll([OFFLINE,ICON,BADGE]);
 // No skipWaiting: an update must not interrupt a support upload or form.
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 const keys=await caches.keys();await Promise.all(keys.filter(k=>k.startsWith('mis-turnos-public-')&&k!==VERSION).map(k=>caches.delete(k)));
})()));
self.addEventListener('fetch',event=>{
 const req=event.request,u=new URL(req.url);
 if(req.method!=='GET'||u.origin!==APP.origin)return;
 if(req.mode==='navigate'&&u.pathname===APP.pathname){
  event.respondWith(fetch(new Request(req,{cache:'no-store'})).catch(()=>caches.match(OFFLINE)));return;
 }
 if([OFFLINE,ICON,BADGE].includes(u.href))event.respondWith(caches.match(req).then(r=>r||fetch(req)));
});
self.addEventListener('push',event=>event.waitUntil((async()=>{
 let data={};try{data=event.data?.json()||{};}catch{}
 const known=['horario','bienestar','bienestar_equipo','prueba'];const clase=known.includes(data.clase)?data.clase:'bienestar';
 const messages={horario:'Tu programacion fue actualizada. Abre la app para consultar el cambio.',bienestar:'Tienes una novedad de Bienestar. Abre la app para verla.',bienestar_equipo:'Hay una solicitud o nuevos soportes para revisar en Bienestar.',prueba:'Las notificaciones de Mis Turnos funcionan en este dispositivo.'};
 const id=/^[a-f0-9-]{36}$/i.test(data.id||'')?data.id:'aviso';
 const fecha=/^\d{4}-\d{2}-\d{2}$/.test(data.fecha||'')?data.fecha:null;
 await self.registration.showNotification('Mis Turnos - Club Campestre',{body:messages[clase],icon:ICON,badge:BADGE,tag:'turnos-'+id,renotify:false,data:{clase,id,fecha}});
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
