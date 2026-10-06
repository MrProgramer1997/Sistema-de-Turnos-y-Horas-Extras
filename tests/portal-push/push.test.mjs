import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
const source=readFileSync(new URL('../../js/push-dispositivo.js',import.meta.url),'utf8');
const code=source.replace(/^import .*;\n/gm,'').replace(/^export /gm,'')+'\nmodule={pushCall,sincronizarAvisos,desactivarAvisos,avisosDesactivados};';
function fixture({permission='granted',existing=true}={}){
 const values=new Map(),calls=[],messages=[];let subscriptions=0,removed=0,closed=0;
 const payload={endpoint:'https://fcm.googleapis.com/fcm/send/example',keys:{p256dh:'test-key',auth:'test-auth'}};
 const sub={endpoint:payload.endpoint,options:{},toJSON:()=>payload,unsubscribe:async()=>{removed++;reg.current=null;return true;}};
 const reg={current:existing?sub:null,active:{postMessage:m=>messages.push(m)},pushManager:{getSubscription:async()=>reg.current,subscribe:async()=>{subscriptions++;reg.current=sub;return sub;}},getNotifications:async()=>[{close:()=>closed++}]};
 const session={user:{id:'a',role:'portal_empleado_v747'},access_token:'fake-user-token',expires_at:Date.now()/1000+3600};
 const supabase={auth:{getSession:async()=>({data:{session}}),refreshSession:async()=>({data:{session:{...session,access_token:'renewed-user-token'}}})},functions:{invoke:async(name,options)=>{calls.push({name,options});return {data:{ok:true}};}}};
 const context={module:null,localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)},Notification:{permission},supabase,navigator:{},Uint8Array,atob,AbortController,setTimeout,clearTimeout,Date,Promise};
 vm.runInNewContext(code,context);
 const cfg={activo:true,publicKey:btoa('public-key'),usuario:'a'};
 const api=async(action,data,options)=>{calls.push({action,data,options});return {ok:true};};
 return {m:context.module,context,reg,sub,cfg,api,values,calls,messages,supabase,session,get subscriptions(){return subscriptions;},get removed(){return removed;},get closed(){return closed;}};
}
test('Revalida la suscripción existente sin destruirla ni crear otra',async()=>{
 const f=fixture();assert.equal(await f.m.sincronizarAvisos(f.reg,f.cfg,{usuario:'a',api:f.api}),f.sub);
 assert.equal(f.subscriptions,0);assert.equal(f.removed,0);assert.equal(f.calls[0].action,'guardar');assert.equal(f.values.get('ccp-push-748-owner'),'a');
});
test('Recupera una suscripción perdida cuando el permiso sigue concedido',async()=>{
 const f=fixture({existing:false});await f.m.sincronizarAvisos(f.reg,f.cfg,{usuario:'a',api:f.api});
 assert.equal(f.subscriptions,1);assert.equal(f.calls[0].action,'guardar');assert.equal(f.messages[0].tipo,'activar-avisos');
});
test('Un fallo de registro conserva la suscripción para reintentar',async()=>{
 const f=fixture({existing:false});await assert.rejects(f.m.sincronizarAvisos(f.reg,f.cfg,{usuario:'a',api:async()=>{throw new Error('offline');}}),/offline/);
 assert.equal(f.removed,0);assert.equal(f.reg.current,f.sub);assert.equal(f.messages.length,0);
 await f.m.sincronizarAvisos(f.reg,f.cfg,{usuario:'a',api:f.api});assert.equal(f.subscriptions,1);
});
test('Una baja explícita no se revierte por abrir o actualizar la app',async()=>{
 const f=fixture();await f.m.desactivarAvisos(f.reg,{usuario:'a',api:f.api});f.calls.length=0;
 assert.equal(f.m.avisosDesactivados(),true);assert.equal(f.removed,1);assert.equal(f.closed,1);
 assert.equal(await f.m.sincronizarAvisos(f.reg,f.cfg,{usuario:'a',api:f.api}),null);assert.equal(f.calls.length,0);assert.equal(f.subscriptions,0);
});
test('El botón Activar puede revertir la baja explícita',async()=>{
 const f=fixture();await f.m.desactivarAvisos(f.reg,{usuario:'a',api:f.api});
 assert.equal(await f.m.sincronizarAvisos(f.reg,f.cfg,{usuario:'a',api:f.api,explicito:true}),f.sub);assert.equal(f.m.avisosDesactivados(),false);assert.equal(f.subscriptions,1);
});
test('Un permiso bloqueado o no concedido no crea suscripciones',async()=>{
 for(const permission of ['denied','default']){const f=fixture({permission,existing:false});assert.equal(await f.m.sincronizarAvisos(f.reg,f.cfg,{usuario:'a',api:f.api}),null);assert.equal(f.subscriptions,0);assert.equal(f.calls.length,0);}
});
test('Salir durante el registro no cancela la suscripción del teléfono',async()=>{
 const f=fixture({existing:false});let active=true;
 const result=await f.m.sincronizarAvisos(f.reg,f.cfg,{usuario:'a',actual:()=>active,api:async()=>{active=false;return {ok:true};}});
 assert.equal(result,null);assert.equal(f.removed,0);assert.equal(f.reg.current,f.sub);assert.equal(f.messages.length,0);
});
test('Desactivar mientras se guarda se procesa después y no deja el dispositivo activo',async()=>{
 const f=fixture();let release;const gate=new Promise(r=>release=r);let started;
 const ready=new Promise(r=>started=r);
 const sync=f.m.sincronizarAvisos(f.reg,f.cfg,{usuario:'a',api:async()=>{started();await gate;return {ok:true};}});
 await ready;const off=f.m.desactivarAvisos(f.reg,{usuario:'a',api:f.api});release();await Promise.all([sync,off]);
 assert.equal(f.reg.current,null);assert.equal(f.m.avisosDesactivados(),true);assert(!f.messages.some(m=>m.tipo==='activar-avisos'));
});
test('Otra persona reutiliza el dispositivo y registra su identidad actual',async()=>{
 const f=fixture();await f.m.sincronizarAvisos(f.reg,f.cfg,{usuario:'b',api:f.api});
 assert.equal(f.calls[0].options.usuario,'b');assert.equal(f.values.get('ccp-push-748-owner'),'b');assert.equal(f.removed,0);
});
test('La baja gana frente a una activación explícita todavía en curso',async()=>{
 const f=fixture();let release,started;const gate=new Promise(r=>release=r),ready=new Promise(r=>started=r);
 const sync=f.m.sincronizarAvisos(f.reg,f.cfg,{usuario:'a',explicito:true,api:async()=>{started();await gate;return {ok:true};}});
 await ready;const off=f.m.desactivarAvisos(f.reg,{usuario:'a',api:f.api});release();await Promise.all([sync,off]);
 assert.equal(f.reg.current,null);assert.equal(f.m.avisosDesactivados(),true);assert.equal(f.messages.at(-1).tipo,'desactivar-avisos');
});
test('La retirada local funciona incluso si el servidor no responde',async()=>{
 const f=fixture();const r=await f.m.desactivarAvisos(f.reg,{usuario:'a',api:async()=>{throw new Error('offline');}});
 assert.equal(r.falloServidor.message,'offline');assert.equal(f.removed,1);assert.equal(f.m.avisosDesactivados(),true);
});
test('Una clave de servidor distinta renueva la suscripción y conserva el permiso',async()=>{
 const f=fixture();f.sub.options.applicationServerKey=new Uint8Array([1,2,3]).buffer;
 await f.m.sincronizarAvisos(f.reg,f.cfg,{usuario:'a',api:f.api});assert.equal(f.removed,1);assert.equal(f.subscriptions,1);
});
test('El transporte usa el token personal incluso con el rol de empleados',async()=>{
 const f=fixture();await f.m.pushCall('config',{}, {usuario:'a'});
 assert.equal(f.calls[0].options.headers.Authorization,'Bearer fake-user-token');
});
test('Una identidad distinta no llega al backend',async()=>{
 const f=fixture();await assert.rejects(f.m.pushCall('guardar',{}, {usuario:'b'}),/cuenta cambió/);assert.equal(f.calls.length,0);
});
test('Sin sesión no se sustituye el token por una clave pública',async()=>{
 const f=fixture();f.supabase.auth.getSession=async()=>({data:{session:null}});
 await assert.rejects(f.m.pushCall('config'),/sesión venció/);assert.equal(f.calls.length,0);
});
test('Un token cercano a expirar se renueva antes del envío',async()=>{
 const f=fixture();f.session.expires_at=Date.now()/1000+10;await f.m.pushCall('config',{}, {usuario:'a'});
 assert.equal(f.calls[0].options.headers.Authorization,'Bearer renewed-user-token');
});
