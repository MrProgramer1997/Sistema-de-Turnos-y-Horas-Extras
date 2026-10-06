import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
const code=readFileSync(new URL('../../pages/mis-turnos-sw.js',import.meta.url),'utf8');
function fixture({missingAsset=false,cacheFailure=false,badgeFailure=false,receiptFailure=false,notificationFailure=false}={}){
 const events={},boxes=new Map(),notes=[],windows=[],opened=[],fetches=[],badges=[];let closed=0,skipped=0,claimed=0;
 const key=x=>typeof x==='string'?x:x.url;
 const caches={async open(name){if(cacheFailure&&name==='mis-turnos-device-preferences')throw new Error('storage unavailable');if(!boxes.has(name))boxes.set(name,new Map());const b=boxes.get(name);return {add:async u=>{if(missingAsset&&u.includes('icon-192'))throw new Error('404');b.set(u,new Response('public'));},put:async(k,v)=>b.set(key(k),v),match:async k=>b.get(key(k))?.clone()};},keys:async()=>[...boxes.keys()],delete:async k=>boxes.delete(k),async match(k){for(const b of boxes.values()){const v=b.get(key(k));if(v)return v.clone();}}};
 const self={navigator:{setAppBadge:async()=>{badges.push('set');if(badgeFailure)throw new Error('badge unavailable');},clearAppBadge:async()=>badges.push('clear')},location:new URL('https://example.test/club/pages/mis-turnos-sw.js'),addEventListener:(n,f)=>events[n]=f,skipWaiting:async()=>skipped++,registration:{showNotification:async(t,o)=>{if(notificationFailure)throw new Error('permission denied');notes.push({title:t,...o});},getNotifications:async()=>[{close:()=>closed++}]},clients:{claim:async()=>claimed++,matchAll:async()=>windows,openWindow:async u=>opened.push(u)}};
 const fetch=async(r,options)=>{fetches.push({url:r,options});if(receiptFailure)throw new Error('offline');return new Response('network-only');};
 vm.runInNewContext(code,{self,caches,URL,Response,Request,fetch,AbortController,setTimeout,clearTimeout});
 async function fire(name,data={}){const tasks=[];let response;events[name]({...data,waitUntil:p=>tasks.push(p),respondWith:p=>{response=p;tasks.push(p);}});await Promise.all(tasks);return response;}
 const source={url:'https://example.test/club/pages/mis-turnos.html'};
 return {boxes,notes,windows,opened,fetches,badges,fire,source,get closed(){return closed;},get skipped(){return skipped;},get claimed(){return claimed;}};
}
test('Instala recursos públicos y activa la actualización sin recargar formularios',async()=>{
 const f=fixture();await f.fire('install');assert.equal(f.boxes.get('mis-turnos-public-754').size,3);assert.equal(f.skipped,1);
});
test('Un recurso ausente no bloquea la actualización del receptor Push',async()=>{
 const f=fixture({missingAsset:true});await f.fire('install');assert.equal(f.skipped,1);assert.equal(f.boxes.get('mis-turnos-public-754').size,2);
});
test('La activación conserva otras apps y toma el control sin navegación',async()=>{
 const f=fixture();for(const x of ['mis-turnos-public-750','mis-turnos-public-754','mis-turnos-device-preferences','unrelated'])f.boxes.set(x,new Map());await f.fire('activate');
 assert(!f.boxes.has('mis-turnos-public-750'));assert(f.boxes.has('unrelated'));assert(f.boxes.has('mis-turnos-device-preferences'));assert.equal(f.claimed,1);assert.equal(f.opened.length,0);
});
test('Migra el antiguo bloqueo por salida de sesión',async()=>{
 const f=fixture();f.boxes.set('mis-turnos-device-preferences',new Map([['https://example.test/club/pages/push-enabled',new Response('off')]]));await f.fire('activate');await f.fire('push',{data:{json:()=>({clase:'prueba'})}});assert.equal(f.notes.length,1);
});
test('Cerrar sesión conserva los avisos del dispositivo',async()=>{
 const f=fixture();await f.fire('message',{source:f.source,data:{tipo:'cerrar-sesion'}});await f.fire('push',{data:{json:()=>({clase:'prueba'})}});assert.equal(f.notes.length,1);assert.equal(f.closed,1);
});
test('Desactivar explícitamente persiste después de actualizar; activar lo revierte',async()=>{
 const f=fixture();await f.fire('message',{source:f.source,data:{tipo:'desactivar-avisos'}});await f.fire('activate');await f.fire('push',{data:{json:()=>({clase:'prueba'})}});assert.equal(f.notes.length,0);
 await f.fire('message',{source:f.source,data:{tipo:'activar-avisos'}});await f.fire('push',{data:{json:()=>({clase:'prueba'})}});assert.equal(f.notes.length,1);
});
test('Mensajes de otro origen no pueden cambiar la preferencia',async()=>{
 const f=fixture();await f.fire('message',{source:{url:'https://other.invalid/'},data:{tipo:'desactivar-avisos'}});assert.equal(f.boxes.size,0);
});
test('Las notificaciones omiten texto sensible y destinos externos',async()=>{
 const f=fixture();await f.fire('push',{data:{json:()=>({clase:'bienestar',id:'malicious',mensaje:'PRIVATE MEDICAL INFORMATION',url:'https://bad.invalid/'})}});
 assert.equal(f.notes.length,1);assert(!JSON.stringify(f.notes).includes('PRIVATE'));assert(!JSON.stringify(f.notes).includes('bad.invalid'));
});
test('Bienestar abre su módulo y el empleado abre sus avisos dentro del subdirectorio',async()=>{
 const f=fixture();for(const clase of ['bienestar_equipo','horario'])await f.fire('notificationclick',{notification:{close(){},data:{clase}}});
 assert.deepEqual(f.opened,['https://example.test/club/pages/solicitudes-bienestar.html','https://example.test/club/pages/mis-turnos.html#avisos']);
});
test('El cambio de suscripción pide reconciliación a las ventanas de la app',async()=>{
 const f=fixture();const received=[];f.windows.push({url:f.source.url,postMessage:m=>received.push(m)},{url:'https://other.invalid/',postMessage:()=>{throw new Error('another origin');}});
 await f.fire('pushsubscriptionchange');assert.equal(received[0].tipo,'push-suscripcion-cambio');
});
test('No intercepta API, nómina ni envío de formularios',async()=>{
 const f=fixture();for(const request of [{method:'GET',mode:'navigate',url:'https://example.test/club/pages/horas-extras.html'},{method:'GET',mode:'cors',url:'https://database.invalid/rest/v1/empleados'},{method:'POST',mode:'cors',url:f.source.url}])assert.equal(await f.fire('fetch',{request}),undefined);
 assert.equal(f.fetches.length,0);
});
const receipt={envio:'00000000-0000-4000-8000-000000000001',recibo:'00000000-0000-4000-8000-000000000002',id:'00000000-0000-4000-8000-000000000003',clase:'bienestar'};
test('Sin ventanas muestra el aviso, marca el icono y confirma sin sesión de usuario',async()=>{
 const f=fixture();await f.fire('push',{data:{json:()=>receipt}});
 assert.equal(f.windows.length,0);assert.equal(f.notes.length,1);assert.deepEqual(f.badges,['set']);assert.equal(f.fetches.length,1);
 const req=f.fetches[0];assert.equal(req.options.credentials,'omit');assert.equal(req.options.headers.Authorization,undefined);
 assert.deepEqual(JSON.parse(req.options.body),{accion:'recibido',datos:{envio:receipt.envio,recibo:receipt.recibo}});
 assert(!JSON.stringify(f.notes).includes(receipt.recibo));
});
test('El bloqueo legado por salir no descarta un envío; una baja explícita sí',async()=>{
 const f=fixture();f.boxes.set('mis-turnos-device-preferences',new Map([['https://example.test/club/pages/push-enabled',new Response('off')]]));
 await f.fire('push',{data:{json:()=>receipt}});assert.equal(f.notes.length,1);
 await f.fire('message',{source:f.source,data:{tipo:'desactivar-avisos'}});await f.fire('push',{data:{json:()=>receipt}});
 assert.equal(f.notes.length,1);assert.equal(f.fetches.length,1);assert.equal(f.badges.at(-1),'clear');
});
test('Un fallo de caché, insignia o recibo conserva la notificación',async()=>{
 const f=fixture({cacheFailure:true,badgeFailure:true,receiptFailure:true});await f.fire('push',{data:{json:()=>receipt}});assert.equal(f.notes.length,1);
});
test('No confirma como mostrado cuando el navegador rechaza la notificación',async()=>{
 const f=fixture({notificationFailure:true});await assert.rejects(f.fire('push',{data:{json:()=>receipt}}),/permission denied/);assert.equal(f.fetches.length,0);assert.equal(f.badges.length,0);
});
test('Un aviso anterior sin comprobante sigue funcionando sin llamar al recibo',async()=>{
 const f=fixture();await f.fire('push',{data:{json:()=>({clase:'prueba'})}});assert.equal(f.notes.length,1);assert.equal(f.fetches.length,0);
});
