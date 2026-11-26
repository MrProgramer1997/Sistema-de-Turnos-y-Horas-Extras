import test from 'node:test';
import assert from 'node:assert/strict';
import {consultarControlEnvio,recuperacionPermitida,reservarEnvio,finalizarEnvio}
  from '../supabase/functions/reporte-tardanzas-diario/control-envios.js';

const env=k=>({
  SUPABASE_URL:'https://prueba.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY:'solo-test-no-es-real'
})[k]||'';

test('activacion se lee exclusivamente de la tabla de control interna',async()=>{
 let n=0;
 const fetchFn=async (url,init)=>{
   n++;
   assert.match(url,/cc_reporte_tardanzas_control\?/);
   assert.equal(init.headers.Authorization,'Bearer solo-test-no-es-real');
   return {ok:true,status:200,json:async()=>[{envio_habilitado:true,recuperacion_hasta:'2026-11-27T05:00:00Z'}]};
 };
 const c=await consultarControlEnvio({env,fetch:fetchFn});
 assert.equal(n,1);assert.equal(c.habilitado,true);
 assert.equal(c.recuperacion_hasta,'2026-11-27T05:00:00Z');
});
test('no envía si el control no está en estado válido',async()=>{
 await assert.rejects(consultarControlEnvio({env,fetch:async()=>({ok:true,status:200,json:async()=>[]})}),/Control de envío ausente/);
});
test('recuperacion solo 22-25 nov 2026 y caduca; no admite fechas futuras',()=>{
 const c={habilitado:true,recuperacion_hasta:'2026-11-27T05:00:00Z'};
 const now=new Date('2026-11-26T17:00:00Z');
 for(const d of ['2026-11-22','2026-11-23','2026-11-24','2026-11-25'])
   assert.equal(recuperacionPermitida(c,d,now),true);
 for(const d of ['2026-11-21','2026-11-26','2026-12-01'])
   assert.equal(recuperacionPermitida(c,d,now),false);
 assert.equal(recuperacionPermitida({...c,habilitado:false},'2026-11-22',now),false);
 assert.equal(recuperacionPermitida(c,'2026-11-22',new Date('2026-11-27T05:00:00Z')),false);
});
test('la reserva única bloquea repetir correos de la misma fecha',async()=>{
 const seen=[];
 const first=await reservarEnvio({fecha:'2026-11-22',tipo:'puntualidad'},{
   env,fetch:async(url,init)=>{seen.push(JSON.parse(init.body));return {ok:true,status:201,json:async()=>[{id:'f1111111-1111-4111-8111-111111111111',estado:'preparando'}]};}
 });
 assert.equal(first.reservado,true);
 assert.equal(seen[0].audiencia,'produccion');
 assert.equal(seen[0].estado,'preparando');
 const again=await reservarEnvio({fecha:'2026-11-22',tipo:'puntualidad'},{
   env,fetch:async()=>({ok:false,status:409})
 });
 assert.deepEqual(again,{reservado:false,motivo:'ya_registrado'});
});
test('Graph 202 queda registrado y el control no expone credenciales',async()=>{
 let record;
 const r=await finalizarEnvio({id:'f1111111-1111-4111-8111-111111111111',aceptado:true,httpStatus:202},{
   env,fetch:async(_url,init)=>{record=JSON.parse(init.body);return {ok:true,status:200,json:async()=>[{id:'f1111111-1111-4111-8111-111111111111',estado:'aceptado'}]};}
 });
 assert.equal(r.estado,'aceptado');assert.equal(record.codigo_proveedor,202);
 assert.equal(record.estado,'aceptado');assert.equal(record.detalle_error,null);
 assert.ok(!JSON.stringify(record).includes('solo-test-no-es-real'));
});
test('si no puede reservar, nunca se debe intentar enviar Graph',async()=>{
 await assert.rejects(reservarEnvio({fecha:'2026-11-25',tipo:'alerta_programacion'},{
   env,fetch:async()=>({ok:false,status:401})
 }),/No fue posible reservar/);
});
