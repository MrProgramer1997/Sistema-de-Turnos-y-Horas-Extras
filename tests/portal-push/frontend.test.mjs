import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
const read=name=>readFileSync(new URL('../../js/'+name,import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/^export \{[^\n]+\};\n/gm,'').replace(/^export /gm,'');
function fixture({admin=false,ios=false,permission='granted',apiFailure=false}={}){
 const nodes=new Map(),calls=[],messages=[],storage=new Map(),listeners=[];let active=null,fail=apiFailure,permissionRequests=0;
 class Events{constructor(){this.events=new Map();}addEventListener(n,cb){if(!this.events.has(n))this.events.set(n,[]);this.events.get(n).push(cb);}dispatchEvent(e){for(const cb of this.events.get(e.type)||[])cb(e);}async fire(n,e={}){await Promise.all((this.events.get(n)||[]).map(cb=>cb(e)));}}
 class Element extends Events{constructor(){super();this.hidden=false;this.disabled=false;this.textContent='';this.classList={toggle(){}};}}
 const document=Object.assign(new Events(),{hidden:false,getElementById:id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);}});
 const window=Object.assign(new Events(),{isSecureContext:true,PushManager:class {},Notification:class {},matchMedia:()=>Object.assign(new Events(),{matches:!ios})});
 const reg=Object.assign(new Events(),{active:{postMessage:m=>messages.push(m)},pushManager:{getSubscription:async()=>active,subscribe:async()=>active={endpoint:'https://fcm.googleapis.com/test',options:{},toJSON(){return {endpoint:this.endpoint,keys:{p256dh:'mock',auth:'mock'}};},unsubscribe:async()=>{active=null;return true;}}},getNotifications:async()=>[]});
 let session={user:{id:'a'},access_token:'fake-token'};
 const supabase={auth:{getSession:async()=>({data:{session}}),onAuthStateChange:cb=>listeners.push(cb)},functions:{invoke:async(name,opt)=>{calls.push(opt.body.accion);if(fail){fail=false;return {error:{context:{json:async()=>({error:'Error de conexión de prueba'})}}};}return {data:opt.body.accion==='config'?{ok:true,usuario:'a',bienestar:admin,activo:true,envio_automatico:true,publicKey:btoa('key')}:{ok:true}};}}};
 const context={window,document,navigator:{serviceWorker:new Events(),onLine:true,userAgent:ios?'iPhone':'Chrome',platform:ios?'iPhone':'Linux',maxTouchPoints:0},matchMedia:window.matchMedia,Notification:{permission,requestPermission:async()=>{permissionRequests++;return 'granted';}},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},Event:class{constructor(type){this.type=type;}},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}},Date,Promise,Uint8Array,atob,AbortController,setTimeout,clearTimeout,queueMicrotask,supabase,registrarPWA:async()=>reg,instalada:()=>!ios,ayudaInstalacion:()=>'help'};
 vm.createContext(context);vm.runInContext(read('push-dispositivo.js').replace(/const OWNER=/,'const DEVICE_OWNER=').replace(/guardar\(OWNER,/g,'guardar(DEVICE_OWNER,'),context);
 // El código de módulos se evalúa con ámbitos separados como en el navegador.
 const source=read(admin?'bienestar-push.js':'mis-turnos-pwa.js');
 vm.runInContext('(function(){'+source+'\n globalThis.frontend='+ (admin?'{}':'{iniciarPWA,suspenderPWA}')+';})();',context);
 return {context,nodes,calls,messages,storage,reg,get active(){return active;},get permissionRequests(){return permissionRequests;},get session(){return session;},signout(){session=null;for(const cb of listeners)cb('SIGNED_OUT',null);}};
}
const settle=async()=>{for(let i=0;i<20;i++)await new Promise(r=>setImmediate(r));};
test('Empleado: recuperación, desactivación, reactivación y salida por los controles reales',async()=>{
 const f=fixture();await f.context.frontend.iniciarPWA({id:'a'});assert.equal(f.nodes.get('pwaOptions').hidden,false);assert(f.active);
 await f.nodes.get('pwaOff').fire('click');assert.equal(f.active,null);const count=f.calls.filter(x=>x==='guardar').length;
 await f.context.frontend.iniciarPWA({id:'a'});assert.equal(f.calls.filter(x=>x==='guardar').length,count);assert.equal(f.nodes.get('pwaPush').hidden,false);
 await f.nodes.get('pwaPush').fire('click');assert(f.active);assert(f.nodes.get('pwaStatus').textContent.includes('Prueba en cola'));
 f.context.frontend.suspenderPWA();assert(f.active);assert.equal(f.storage.get('ccp-push-748-owner'),'a');
});
test('Bienestar: recuperación y baja/activación por el botón del módulo',async()=>{
 const f=fixture({admin:true});await settle();const btn=f.nodes.get('btnPushBienestar');assert.equal(btn.hidden,false);assert.equal(btn.textContent,'Desactivar notificaciones');
 await btn.fire('click');assert.equal(f.active,null);assert.equal(btn.textContent,'Activar notificaciones');
 await btn.fire('click');assert(f.active);assert.equal(btn.textContent,'Desactivar notificaciones');
 f.signout();assert.equal(btn.hidden,true);assert(f.active);
});
test('Bienestar: un fallo de config muestra Reintentar y permite recuperar',async()=>{
 const f=fixture({admin:true,apiFailure:true});await settle();const btn=f.nodes.get('btnPushBienestar');assert.equal(btn.textContent,'Reintentar notificaciones');assert.equal(btn.hidden,false);
 await btn.fire('click');await settle();assert.equal(btn.textContent,'Desactivar notificaciones');assert(f.active);
});
test('Bienestar: en iPhone sin modo app la opción se mantiene oculta',async()=>{
 const f=fixture({admin:true,ios:true});await settle();assert.equal(f.nodes.get('btnPushBienestar').hidden,true);assert.equal(f.active,null);assert(f.nodes.get('pushBienestarEstado').textContent.includes('desde su icono'));
});
test('Un usuario sin autorización de Bienestar no puede activar ese botón',async()=>{
 const f=fixture({admin:false});
 // Este caso carga el módulo administrativo con config.bienestar=false.
 const context=f.context;vm.runInContext('(function(){'+read('bienestar-push.js')+'})();',context);await settle();
 assert.equal(f.nodes.get('btnPushBienestar').hidden,true);assert.equal(f.active,null);
});
test('Actualizar y volver a ingresar conservan el dispositivo sin volver a pedir permiso',async()=>{
 const f=fixture();await f.context.frontend.iniciarPWA({id:'a'});const original=f.active;
 await f.context.window.fire('pwa-actualizada');await settle();assert.equal(f.active,original);assert.equal(f.permissionRequests,0);
 f.context.frontend.suspenderPWA();await f.context.frontend.iniciarPWA({id:'a'});assert.equal(f.active,original);assert.equal(f.permissionRequests,0);
 assert.equal(f.storage.get('ccp-push-748-owner'),'a');assert(!f.messages.some(m=>m.tipo==='desactivar-avisos'));
});
