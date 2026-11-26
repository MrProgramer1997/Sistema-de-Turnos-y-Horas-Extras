import test from 'node:test';
import assert from 'node:assert/strict';
import {GRAPH_SENDER,GraphDeliveryError,prepararCorreoGraph,enviarCorreoGraph,diagnosticarAutenticacionGraph} from '../supabase/functions/reporte-tardanzas-diario/microsoft-graph-mail.js';
import {destinatariosPara} from '../supabase/functions/reporte-tardanzas-diario/destinatarios.js';

const TENANT='12345678-1234-4234-a234-123456789abc';
const CLIENT='abcdef12-1234-4234-a234-123456789abc';
const SECRET='sample-only-not-real-secrets-2026';
const env=key=>({'MS365_TENANT_ID':TENANT,'MS365_CLIENT_ID':CLIENT,'MS365_CLIENT_SECRET':SECRET}[key]||'');
const content={to:destinatariosPara('test'),subject:'[PRUEBA] Puntualidad 22/11/2026',html:'<h1>Prueba</h1>'};

test('El remitente se fija a reportes y el test envía exclusivamente a Innovación',()=>{
 assert.equal(GRAPH_SENDER,'reportes@campestrepereira.com');
 const req=prepararCorreoGraph(content);
 assert.equal(req.message.toRecipients.length,1);
 assert.equal(req.message.toRecipients[0].emailAddress.address,'analistainnovacion@campestrepereira.com');
 assert.deepEqual(req.message.body,{contentType:'HTML',content:'<h1>Prueba</h1>'});
 assert.equal(req.saveToSentItems,true);
});
test('No admite destinos de otros dominios, duplicados ni buzón de origen arbitrario',()=>{
 assert.throws(()=>prepararCorreoGraph({...content,to:['externo@example.com']}),/corporativos inválidos/);
 assert.throws(()=>prepararCorreoGraph({...content,to:[content.to[0],content.to[0]]}),/corporativos inválidos/);
 assert.throws(()=>prepararCorreoGraph({...content,to:[]}),/corporativos inválidos/);
});
test('Solicita token client_credentials y Graph envía desde ruta /users/reportes',async()=>{
 const seen=[];
 const mock=async (url,init)=>{
   seen.push({url,init});
   if(seen.length===1)return {ok:true,status:200,json:async()=>({access_token:'mock-access-token'})};
   return {ok:true,status:202};
 };
 const result=await enviarCorreoGraph(content,{env,fetch:mock});
 assert.deepEqual(result,{accepted:true,http_status:202,from:GRAPH_SENDER,to:1});
 assert.match(seen[0].url,/login\.microsoftonline\.com/);
 const form=new URLSearchParams(seen[0].init.body);
 assert.equal(form.get('grant_type'),'client_credentials');
 assert.equal(form.get('scope'),'https://graph.microsoft.com/.default');
 assert.equal(form.get('client_id'),CLIENT);
 assert.equal(form.get('client_secret'),SECRET);
 assert.equal(seen[1].url,'https://graph.microsoft.com/v1.0/users/reportes%40campestrepereira.com/sendMail');
 assert.equal(seen[1].init.headers.Authorization,'Bearer mock-access-token');
 assert.equal(JSON.parse(seen[1].init.body).message.toRecipients.length,1);
});
test('Sin credenciales no intenta llamar Microsoft',async()=>{
 let calls=0;
 await assert.rejects(
   enviarCorreoGraph(content,{env:()=>'',fetch:async()=>{calls++;throw Error('never')}}),
   e=>e instanceof GraphDeliveryError&&e.stage==='configuración'
 );
 assert.equal(calls,0);
});
test('Un HTTP 403 no se interpreta como envío ni entrega',async()=>{
 let calls=0;
 await assert.rejects(enviarCorreoGraph(content,{env,fetch:async()=>{
   calls++;return calls===1?{ok:true,status:200,json:async()=>({access_token:'mock'})}:{ok:false,status:403};
 }}),e=>e instanceof GraphDeliveryError&&e.stage==='envío'&&e.status===403);
});
test('Un HTTP 200 de Graph no equivale al 202 aceptado',async()=>{
 let calls=0;
 await assert.rejects(enviarCorreoGraph(content,{env,fetch:async()=>{
   calls++;return calls===1?{ok:true,status:200,json:async()=>({access_token:'mock'})}:{ok:true,status:200};
 }}),e=>e instanceof GraphDeliveryError&&e.stage==='envío'&&e.status===200);
});

test('diagnóstico devuelve solo código AADSTS y nunca el texto ni la contraseña',async()=>{
 let calls=0;
 const r=await diagnosticarAutenticacionGraph({env,fetch:async()=>{
   calls++;
   return {ok:false,status:401,json:async()=>({
     error:'invalid_client',error_codes:[7000215],
     error_description:'El valor secreto es inválido y contiene texto sensible'
   })};
 }});
 assert.equal(calls,1);
 assert.deepEqual(r,{ok:false,status:'oauth_rechazado',http_status:401,aadsts:'AADSTS7000215'});
 assert.ok(!JSON.stringify(r).includes('sensible'));
 assert.ok(!JSON.stringify(r).includes(SECRET));
});
test('diagnóstico de token válido no envía correo ni retorna token',async()=>{
 const urls=[];
 const r=await diagnosticarAutenticacionGraph({env,fetch:async url=>{
   urls.push(url);return {ok:true,status:200,json:async()=>({access_token:'mock-privado'})};
 }});
 assert.equal(urls.length,1);
 assert.match(urls[0],/login\.microsoftonline\.com/);
 assert.deepEqual(r,{ok:true,status:'credenciales_validas',http_status:200});
});

test('Microsoft Graph acepta cuatro correos corporativos y rechaza cinco',()=>{
 const approved=[
  'analistainnovacion@campestrepereira.com',
  'maitre@campestrepereira.com',
  'dirbienestar@campestrepereira.com',
  'chef@campestrepereira.com'
 ];
 const email=prepararCorreoGraph({...content,to:approved});
 assert.deepEqual(email.message.toRecipients.map(x=>x.emailAddress.address),approved);
 assert.throws(()=>prepararCorreoGraph({...content,to:[...approved,'otro@campestrepereira.com']}),/corporativos inválidos/);
});
