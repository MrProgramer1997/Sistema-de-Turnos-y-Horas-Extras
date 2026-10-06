import assert from 'node:assert/strict';
import test from 'node:test';
import {createHandler,pushPayload} from '../../supabase/functions/portal-push-v748/handler.mjs';
const ids={envio:'00000000-0000-4000-8000-000000000001',recibo:'00000000-0000-4000-8000-000000000002',evento:'00000000-0000-4000-8000-000000000003'};
function fixture({receiptOk=true}={}){
 const calls=[];let users=0;
 const admin={rpc:async(name,args)=>{calls.push({name,args});return {data:name==='portal_push_recibo_v754'?{ok:receiptOk}:{ok:true}};}};
 const userClient={auth:{getUser:async()=>{users++;return {data:{user:{id:'user'}}};}}};
 const handler=createHandler({admin,userClient,webpush:{}});
 const request=(body,options={})=>handler(new Request('https://example.test',{method:'POST',headers:{Origin:'https://turnos.campestrepereira.com','Content-Type':'application/json',...options.headers},body:JSON.stringify(body)}));
 return {request,calls,get users(){return users;}};
}
test('El payload cifrado incluye un comprobante del envío y omite datos sensibles',()=>{
 const payload=JSON.parse(pushPayload({id:ids.envio,recibo:ids.recibo,evento:ids.evento,clase:'bienestar',mensaje:'PRIVATE',usuario:'private-user'}));
 assert.equal(payload.envio,ids.envio);assert.equal(payload.recibo,ids.recibo);assert(!JSON.stringify(payload).includes('PRIVATE'));assert(!JSON.stringify(payload).includes('private-user'));
});
test('El recibo válido permite confirmar con la app cerrada sin token de sesión',async()=>{
 const f=fixture();const r=await f.request({accion:'recibido',datos:ids});assert.equal(r.status,200);assert.equal(f.users,0);
 assert.deepEqual(f.calls,[{name:'portal_push_recibo_v754',args:{p_envio:ids.envio,p_recibo:ids.recibo}}]);
});
test('Un comprobante que no corresponde al envío no se acepta',async()=>{
 const f=fixture({receiptOk:false});const r=await f.request({accion:'recibido',datos:ids});assert.equal(r.status,404);assert.deepEqual(await r.json(),{ok:false});
});
test('El recibo no habilita guardar, baja ni pruebas sin usuario autenticado',async()=>{
 const f=fixture();for(const accion of ['config','guardar','baja','prueba','avisos','leido'])assert.equal((await f.request({accion,datos:ids})).status,401);
 assert.equal(f.calls.length,0);assert.equal(f.users,0);
});
test('Los identificadores inválidos y los orígenes externos no llegan al RPC',async()=>{
 const f=fixture();assert.equal((await f.request({accion:'recibido',datos:{envio:'bad',recibo:ids.recibo}})).status,400);
 assert.equal((await f.request({accion:'recibido',datos:ids},{headers:{Origin:'https://other.invalid'}})).status,403);assert.equal(f.calls.length,0);
});
test('Las operaciones existentes conservan la validación del usuario',async()=>{
 const f=fixture();const r=await f.request({accion:'avisos'},{headers:{Authorization:'Bearer personal-token'}});assert.equal(r.status,200);assert.equal(f.users,1);
 assert.deepEqual(f.calls,[{name:'portal_push_usuario_v748',args:{p_usuario:'user',p_accion:'avisos',p_datos:{}}}]);
});
