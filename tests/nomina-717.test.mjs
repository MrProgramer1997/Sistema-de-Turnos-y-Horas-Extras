import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {recalcularPorDias,prepararOConsultarGuardado,diasEntre} from '../js/nomina-carga.js';
// Import the real transport with only its external SDK boundary replaced.
// No request from this suite can reach a real Supabase project.
let code=await readFile(new URL('../js/nomina-sesion.js',import.meta.url),'utf8');
code=code.replace("import { supabase } from '../supabase/supabaseClient.js';", "const supabase = {auth:{onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}};");
const {crearControlSesion,ErrorSesion,esErrorAcceso}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
function fake({error=null,refreshError=null,getUserError=null,missing=false,stall=false}={}) {
 const f={calls:[],checks:0,refreshes:0,headers:[],events:null,session:missing?null:{access_token:'test-user-token',expires_at:Date.now()/1000+3600,user:{id:'u1',role:'authenticated'}},responseError:error};
 const user=()=>({id:'u1',app_metadata:{empleado_id:'e1'}});
 f.auth={
  onAuthStateChange(cb){f.events=cb;return {data:{subscription:{unsubscribe(){}}}};},
  async getSession(){return {data:{session:f.session},error:null};},
  async getUser(){f.checks++;await delay(1);return {data:{user:user()},error:typeof getUserError==='function'?getUserError(f.checks):getUserError};},
  async refreshSession(){f.refreshes++;await delay(1);if(!refreshError)f.session={...f.session,access_token:'renewed-user-token',expires_at:Date.now()/1000+3600};return {data:{session:f.session},error:refreshError};}
 };
 f.rpc=(name,args)=>{
  const c={name,args};f.calls.push(c);
  return {setHeader(k,v){f.headers.push([k,v]);return this;},range(){return this;},abortSignal(signal){
   if(stall)return new Promise(resolve=>signal.addEventListener('abort',()=>resolve({error:{message:'aborted'}}),{once:true}));
   return delay(1).then(()=>({data:f.responseError?null:{ok:true},error:typeof f.responseError==='function'?f.responseError(f.calls.length):f.responseError}));
  }};
 };
 return f;
}
const control=(f,options={})=>crearControlSesion(f,{localSession:()=>null,timeout:100,queryTimeout:100,...options});
const timeout=()=>({code:'57014',message:'canceling statement due to statement timeout'});
const good=()=>({data:[{insertados:0,actualizados:0}],error:null});

test('SQL 57014 is not logout and is returned without refresh or replay',async()=>{
 const f=fake({error:timeout()}),c=control(f);const r=await c.request('read',{}, {read:true});
 assert.equal(r.error.code,'57014');assert.equal(f.refreshes,0);assert.equal(f.calls.length,1);assert.equal(esErrorAcceso(r.error),false);
});
for(const error of [{code:'42501',message:'permission denied',status:403},{code:'42501',message:'permission denied',status:401},{status:403,message:'Forbidden'},{code:'P0001',message:'Perfil no autorizado'}])test('Permission is not lost identity: '+JSON.stringify(error),async()=>{
 const f=fake({error}),c=control(f);await assert.rejects(c.request('read'),e=>e.code==='AUTH_FORBIDDEN'&&!esErrorAcceso(e));assert.equal(f.refreshes,0);assert.equal(f.calls.length,1);
});
test('Valid writes carry the verified user token, not the public API key',async()=>{
 const f=fake(),c=control(f);assert.deepEqual((await c.request('write',{}, {read:false})).data,{ok:true});assert.deepEqual(f.headers,[['Authorization','Bearer test-user-token']]);
});
test('Missing session makes no database request',async()=>{const f=fake({missing:true});await assert.rejects(control(f).request('read'),e=>esErrorAcceso(e)&&e.code==='AUTH_REQUIRED');assert.equal(f.calls.length,0);});
test('Anonymous session is never accepted',async()=>{const f=fake();f.session.user.role='anon';await assert.rejects(control(f).request('read'),e=>esErrorAcceso(e));assert.equal(f.calls.length,0);});
test('Local menu cannot switch verified identity',async()=>{const f=fake();await assert.rejects(control(f,{localSession:()=>({auth_user_id:'other'})}).request('read'),e=>e.code==='AUTH_IDENTITY');assert.equal(f.calls.length,0);});
test('Temporary auth network failure is not logout',async()=>{const f=fake({getUserError:{status:503,message:'temporary'}});await assert.rejects(control(f).request('read'),e=>e.code==='AUTH_NETWORK'&&!esErrorAcceso(e));assert.equal(f.calls.length,0);});
test('Concurrent requests share identity verification',async()=>{const f=fake(),c=control(f);await Promise.all([c.request('a'),c.request('b')]);assert.equal(f.checks,1);assert.equal(f.calls.length,2);});
test('Expiring token renews before sending request',async()=>{const f=fake();f.session.expires_at=Date.now()/1000+30;await control(f).request('read');assert.equal(f.refreshes,1);assert.equal(f.headers[0][1],'Bearer renewed-user-token');});
test('Verified expired JWT read gets exactly one safe retry',async()=>{const f=fake({error:n=>n===1?{code:'PGRST301',message:'JWT expired'}:null});await control(f).request('read');assert.equal(f.refreshes,1);assert.equal(f.calls.length,2);});
test('Rejected JWT on a write is never replayed',async()=>{const f=fake({error:{code:'PGRST301',message:'JWT expired'}});await assert.rejects(control(f).request('write',{}, {read:false}),e=>e.code==='AUTH_REQUIRED');assert.equal(f.calls.length,1);assert.equal(f.refreshes,0);});
test('Read retry cannot continue indefinitely on an invalid JWT',async()=>{const f=fake({error:{code:'PGRST301',message:'JWT expired'}});await assert.rejects(control(f).request('read'),e=>e.code==='AUTH_REQUIRED');assert.equal(f.calls.length,2);assert.equal(f.refreshes,1);});
test('Network error after refreshing is not reported as expired session',async()=>{const f=fake({getUserError:n=>n===1?{status:401,code:'bad_jwt'}:{status:503}});await assert.rejects(control(f).request('read'),e=>e.code==='AUTH_NETWORK');assert.equal(f.refreshes,1);assert.equal(f.calls.length,0);});
test('Invalid refresh token requires re-entry, never anonymous fallback',async()=>{const f=fake({refreshError:{status:400,code:'refresh_token_not_found'}});f.session.expires_at=1;await assert.rejects(control(f).request('read'),e=>e.code==='AUTH_REQUIRED');assert.equal(f.calls.length,0);});
test('SDK mismatch does not incorrectly announce logout',async()=>{const f=fake();f.rpc=()=>({});await assert.rejects(control(f).request('read'),e=>e.code==='AUTH_SDK'&&!esErrorAcceso(e));});
test('Transport timeout is not AUTH_REQUIRED and never replays',async()=>{const f=fake({stall:true});await assert.rejects(control(f,{queryTimeout:10}).request('write',{}, {read:false}),e=>e.code==='QUERY_TIMEOUT'&&!esErrorAcceso(e));assert.equal(f.calls.length,1);});
test('Explicit abort does not cause refresh or a retry',async()=>{const f=fake(),ac=new AbortController();ac.abort();await assert.rejects(control(f).request('read',{}, {signal:ac.signal}),{name:'AbortError'});assert.equal(f.calls.length,0);});
test('Signout triggers invalidation, token refresh does not',async()=>{const f=fake(),c=control(f);await c.asegurar();let changed=0;c.observar(()=>changed++);f.events('TOKEN_REFRESHED',f.session);await delay(0);assert.equal(changed,0);f.events('SIGNED_OUT',null);await delay(0);assert.equal(changed,1);});
test('Switching users while a request is pending discards its response',async()=>{const f=fake(),c=control(f);await c.asegurar();f.rpc=()=>({setHeader(){return this;},async abortSignal(){f.events('SIGNED_IN',{user:{id:'other'}});return {data:{secret:'wrong-user'},error:null};}});await assert.rejects(c.request('read'),e=>esErrorAcceso(e));});

test('28-day recalculation uses 8 bounded writes, never the old endpoint',async()=>{const calls=[],progress=[];const r=await recalcularPorDias(async(n,p,o)=>{calls.push([n,p,o]);return good();},{desde:'2026-08-23',hasta:'2026-09-19',onProgress:p=>progress.push(p)});assert.equal(r.completadas,8);assert.equal(calls.length,8);assert.ok(calls.every(([n,p,o])=>!['preparar_conceptos_revision','preparar_dominicales_marcaciones_v1'].includes(n)&&o.read===false&&diasEntre(p.p_fecha_desde,p.p_fecha_hasta).length<=7));assert.equal(calls[0][0],'preparar_conceptos_revision_v717');assert.equal(calls.at(-1)[1].p_fecha_hasta,'2026-09-19');assert.ok(progress.every(p=>p.total===8));});
test('Timeout in a write stops after the first failure; no split or fallback',async()=>{let calls=0;await assert.rejects(recalcularPorDias(async()=>{calls++;return {error:timeout()};},{desde:'2026-08-23',hasta:'2026-09-19'}),e=>e.code==='57014'&&e.operacionesCompletadas===0&&e.fuenteNomina==='preparar_conceptos_revision_v717'&&e.hastaNomina==='2026-08-29');assert.equal(calls,1);});
test('Partial recalc tracks committed acknowledgements, not assumed writes',async()=>{let calls=0;await assert.rejects(recalcularPorDias(async()=>{calls++;return calls===3?{error:timeout()}:good();},{desde:'2026-08-23',hasta:'2026-09-19'}),e=>e.operacionesCompletadas===2);assert.equal(calls,3);});
for(const data of [null,[],[{}],[{insertados:-1,actualizados:0}],[{insertados:0,actualizados:0},{insertados:0,actualizados:0}]])test('Bad write acknowledgement is not counted: '+JSON.stringify(data),async()=>{let calls=0;await assert.rejects(recalcularPorDias(async()=>{calls++;return {data};},{desde:'2026-08-23',hasta:'2026-09-19'}),e=>e.operacionesCompletadas===0);assert.equal(calls,1);});
test('Missing v717 deployment does not fallback to slow legacy write',async()=>{let calls=0;await assert.rejects(recalcularPorDias(async()=>{calls++;return {error:{code:'PGRST202',message:'function missing'}};},{desde:'2026-08-23',hasta:'2026-08-23'}));assert.equal(calls,1);});
test('Preparation timeout permits only persisted-data consultation',async()=>{let calls=0;const r=await prepararOConsultarGuardado(async()=>{calls++;throw timeout();});assert.equal(calls,1);assert.equal(r.completa,false);assert.equal(r.cobertura,null);assert.equal(r.error.code,'57014');});
test('Recovery path executes no preparation write',async()=>{const r=await prepararOConsultarGuardado(()=>{throw Error('Must not execute');},{soloConsulta:true,advertencia:'SQL failed'});assert.equal(r.completa,false);assert.equal(r.aviso,'SQL failed');});
test('Missing identity never falls back to a data read',async()=>{await assert.rejects(prepararOConsultarGuardado(async()=>{throw new ErrorSesion('AUTH_REQUIRED','missing');},{esErrorSesion:esErrorAcceso}),e=>e.code==='AUTH_REQUIRED');});
test('Prepared cut keeps the original coverage acknowledgement',async()=>{const d={insertados:2};const r=await prepararOConsultarGuardado(async()=>d);assert.equal(r.completa,true);assert.equal(r.cobertura,d);});
test('Cancellation of preparation is not swallowed as read-only recovery',async()=>{const ac=new AbortController();await assert.rejects(prepararOConsultarGuardado(async()=>{ac.abort();throw timeout();},{signal:ac.signal}),{name:'AbortError'});});
test('No new visible cards, KPIs or main actions in patch',async()=>{const p=await readFile(new URL('../pages/horas-extras.html',import.meta.url),'utf8');assert.match(p,/versi\u00f3n 7\.19/);assert.doesNotMatch(p,/heKpiRegistros|heKpiPendientes|nd-resumen/);assert.equal((p.match(/data-he-vista=/g)||[]).length,3);assert.match(p,/<details id="heOpcionesTecnicas" class="nd-avanzadas">/);});
test('Main connects optimized recalc, leaves raw session module unchanged',async()=>{const s=await readFile(new URL('../js/horas-extras.js',import.meta.url),'utf8');assert.match(s,/nomina-sesion\.js\?v=717/);assert.match(s,/soloConsulta:true/);assert.match(s,/heLecturaValida=preparacion\.completa/);assert.match(s,/if\(!datosUtilizables\(\)\)return;\n  const desde=/);});
