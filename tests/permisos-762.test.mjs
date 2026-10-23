import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {crearLecturaPermisos762} from '../js/permisos-lectura.js';
const authSession = uid => ({user:{id:uid},access_token:'fixture-token-'+uid});
const permissions = (uid='u1',patch={}) => ({data:{user_id:uid,activo:true,rol:'administrador',perfil_acceso:'admin',modulos_permitidos:['horas-extras','dashboard-ayb'],areas_permitidas:[],puede_administrar:true,...patch}});
const sleep = n => new Promise(r=>setTimeout(r,n));
function fixture(t,plans=[],options={}) {
 const state={visual:{id:'u1',auth_user_id:'u1',tipo_ingreso:'admin_auth'},session:authSession('u1'),reads:0,gets:0,writes:[],signals:[],headers:[],events:[],changes:[],now:0};
 let callback;
 const client={auth:{getSession:async()=>{state.gets++;return {data:{session:state.session}};},onAuthStateChange(fn){callback=fn;return {data:{subscription:{unsubscribe(){}}}};}},rpc(name){
  assert.equal(name,'consultar_mis_modulos_v720');const index=state.reads++;let signal;
  const builder={setHeader(k,v){state.headers.push([k,v]);return this;},abortSignal(s){signal=s;state.signals.push(s);return this;},then(resolve,reject){return Promise.resolve().then(()=>typeof plans[index]==='function'?plans[index](signal):plans[index]??permissions()).then(resolve,reject);}};return builder;
 }};
 const service=crearLecturaPermisos762(client,{timeout:20,timeoutSesion:20,pausaReintento:0,ttl:10,clock:()=>state.now,leerLocal:()=>state.visual,guardarLocal:s=>{state.visual=s;state.writes.push(s);},notificar:s=>state.events.push(s),alCambiarIdentidad:e=>state.changes.push(e),...options});
 t.after(()=>service.destruir());
 return {state,client,service,event:(name,s)=>callback(name,s)};
}
test('concurrent menu/page/force checks share one session and RPC operation',async t=>{const f=fixture(t,[async()=>{await sleep(5);return permissions();}]);const result=await Promise.all([f.service.consultar(),f.service.consultar(),f.service.consultar({force:true})]);assert.equal(f.state.reads,1);assert.equal(f.state.gets,2);assert.equal(f.state.writes.length,1);assert.ok(result.every(s=>s===result[0]));});
test('only verified in-memory permissions are cached for the same session',async t=>{const f=fixture(t);await f.service.consultar();await f.service.consultar();assert.equal(f.state.reads,1);f.state.now=11;await f.service.consultar();assert.equal(f.state.reads,2);});
test('explicit force bypasses a completed cache',async t=>{const f=fixture(t);await f.service.consultar();await f.service.consultar({force:true});assert.equal(f.state.reads,2);});
test('one transient 520 retry succeeds, credentials are never replayed',async t=>{const f=fixture(t,[{error:{message:'Server error'},status:520},permissions()]);await f.service.consultar();assert.equal(f.state.reads,2);assert.equal(f.state.writes.length,1);assert.ok(f.state.signals.every(s=>s.aborted));});
test('two 520 failures do not use locally saved admin rights',async t=>{const f=fixture(t,[{status:520,error:{}},{status:520,error:{}}]);f.state.visual.modulos_permitidos=['horas-extras'];await assert.rejects(f.service.consultar(),{code:'PERMISOS_RED',transitorio:true});assert.equal(f.state.reads,2);assert.equal(f.state.writes.length,0);});
test('server denial is never retried or replaced by local permissions',async t=>{const f=fixture(t,[{error:{code:'42501'},status:403}]);await assert.rejects(f.service.consultar(),{code:'PERMISOS_DENEGADOS'});assert.equal(f.state.reads,1);assert.equal(f.state.writes.length,0);});
test('expired or absent session cannot access RPC',async t=>{const f=fixture(t);f.state.session=null;await assert.rejects(f.service.consultar(),{code:'PERMISOS_SESION'});assert.equal(f.state.reads,0);});
test('inactive server profile is not a temporary outage',async t=>{const f=fixture(t,[permissions('u1',{activo:false})]);await assert.rejects(f.service.consultar(),{code:'PERMISOS_INACTIVOS'});assert.equal(f.state.reads,1);});
test('string true is not accepted as server authorization',async t=>{const f=fixture(t,[permissions('u1',{activo:'true'})]);await assert.rejects(f.service.consultar(),{code:'PERMISOS_INACTIVOS'});});
test('wrong-user response does not update storage or the menu',async t=>{const f=fixture(t,[permissions('u2')]);await assert.rejects(f.service.consultar(),{code:'PERMISOS_SESION'});assert.equal(f.state.writes.length,0);assert.equal(f.state.events.length,0);});
test('malformed permission list fails closed without retry',async t=>{const f=fixture(t,[permissions('u1',{modulos_permitidos:null})]);await assert.rejects(f.service.consultar(),{code:'PERMISOS_RESPUESTA'});assert.equal(f.state.reads,1);});
test('timeout aborts both reads; a subsequent manual retry works',async t=>{const f=fixture(t,[()=>new Promise(()=>{}),()=>new Promise(()=>{}),permissions()],{timeout:5});await assert.rejects(f.service.consultar(),{code:'PERMISOS_RED'});assert.equal(f.state.signals.length,2);assert.ok(f.state.signals.every(s=>s.aborted));await f.service.consultar({force:true});assert.equal(f.state.writes.length,1);});
test('late timed-out success cannot overwrite a later fresh verification',async t=>{let late;const f=fixture(t,[()=>new Promise(r=>late=r),permissions('u1',{modulos_permitidos:['dashboard-ayb']})],{timeout:5});const r=await f.service.consultar();late(permissions());await sleep(2);assert.deepEqual(r.modulos_permitidos,['dashboard-ayb']);assert.equal(f.state.writes.length,1);assert.deepEqual(f.state.visual.modulos_permitidos,['dashboard-ayb']);});
test('switching identity while RPC runs invalidates the response',async t=>{let release;const f=fixture(t,[()=>new Promise(r=>release=r)]);const read=f.service.consultar();await sleep(1);f.state.session=authSession('u2');release(permissions());await assert.rejects(read,{code:'PERMISOS_SESION'});assert.equal(f.state.writes.length,0);});
test('sign-out cancels active reads and cannot accept a late response',async t=>{let release;const f=fixture(t,[()=>new Promise(r=>release=r)]);const read=f.service.consultar();await sleep(1);f.event('SIGNED_OUT',null);release(permissions());await assert.rejects(read,{code:'PERMISOS_SESION'});assert.equal(f.state.writes.length,0);assert.equal(f.state.changes.length,1);});
test('explicit invalidation removes previously verified cache',async t=>{const f=fixture(t);await f.service.consultar();f.service.invalidar();await f.service.consultar();assert.equal(f.state.reads,2);});
test('new token for same user requires a new server check',async t=>{const f=fixture(t);await f.service.consultar();f.state.session={...f.state.session,access_token:'another-fixture-token'};await f.service.consultar();assert.equal(f.state.reads,2);});
test('personal session remains personal, not an admin grant',async t=>{const f=fixture(t);f.state.visual={tipo_ingreso:'empleado',rol:'empleado'};assert.equal((await f.service.consultar()).rol,'empleado');assert.equal(f.state.reads,0);});
test('401 server response is never retried as transient',async t=>{const f=fixture(t,[{error:{code:'PGRST301'},status:401}]);await assert.rejects(f.service.consultar(),{code:'PERMISOS_SESION'});assert.equal(f.state.reads,1);});
test('local identity mismatch is rejected before RPC',async t=>{const f=fixture(t);f.state.visual.auth_user_id='u2';await assert.rejects(f.service.consultar(),{code:'PERMISOS_SESION'});assert.equal(f.state.reads,0);});
test('Auth getSession stall is bounded and does not consult permissions',async t=>{const f=fixture(t,[],{timeoutSesion:5});f.client.auth.getSession=()=>new Promise(()=>{});await assert.rejects(f.service.consultar(),{code:'PERMISOS_RED'});assert.equal(f.state.reads,0);});
test('historical wrapper versions resolve to the same canonical module',async()=>{const s=await readFile(new URL('../js/permisos-modulos.js',import.meta.url),'utf8');assert.match(s,/from '\.\/permisos-navegacion.js\?v=762'/);assert.doesNotMatch(s,/let inflight|let cached|rpc\(/);});
test('layout focus no longer forces redundant fresh requests',async()=>{const s=await readFile(new URL('../js/layout.js',import.meta.url),'utf8');assert.doesNotMatch(s,/force:true/);assert.match(s,/Date\.now\(\)-ultimaComprobacion<10000/);assert.match(s,/sidebarListo/);});

test('actual ESM v720/v735 wrappers execute only one canonical verifier',async t=>{
 const vm=await import('node:vm');
 if(!vm.SourceTextModule){t.skip('Run with --experimental-vm-modules for native module identity test');return;}
 const f=fixture(t,[async()=>{await sleep(4);return permissions();}]);
 const context=vm.createContext({console,setTimeout,clearTimeout,AbortController,queueMicrotask,
  localStorage:{getItem:()=>JSON.stringify(f.state.visual),setItem:(_k,v)=>{f.state.visual=JSON.parse(v);f.state.writes.push(f.state.visual);}},
  window:{location:{pathname:'/pages/horas-extras.html'},dispatchEvent(){}},CustomEvent:class{constructor(type,init){this.type=type;this.detail=init.detail;}}});
 const modules=new Map();
 async function load(url){
  if(modules.has(url))return modules.get(url);
  const parsed=new URL(url);let m;
  if(parsed.pathname.endsWith('/supabase/supabaseClient.js'))m=new vm.SyntheticModule(['supabase'],function(){this.setExport('supabase',f.client);},{context,identifier:url});
  else m=new vm.SourceTextModule(await readFile(parsed,'utf8'),{context,identifier:url});
  modules.set(url,m);return m;
 }
 const resolve=(spec,ref)=>load(new URL(spec,ref.identifier).href);
 const a=await load(new URL('../js/permisos-modulos.js?v=720',import.meta.url).href);await a.link(resolve);await a.evaluate();
 const b=await load(new URL('../js/permisos-modulos.js?v=735',import.meta.url).href);await b.link(resolve);await b.evaluate();
 assert.equal(a.namespace.exigirModulo,b.namespace.exigirModulo);
 await Promise.all([a.namespace.consultarPermisos(),b.namespace.consultarPermisos({force:true})]);
 assert.equal(f.state.reads,1);assert.equal(f.state.writes.length,1);
});
