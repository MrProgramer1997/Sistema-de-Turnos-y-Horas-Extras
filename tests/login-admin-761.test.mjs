import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {crearIngresoAdmin761, conLimiteIngreso761, lecturaIngreso761, mensajeErrorIngreso761, CAMPOS_EMPLEADO_LOGIN761} from '../js/login-admin-resiliente.js';
const pause = ms => new Promise(r => setTimeout(r, ms));
const credentials = {email:'fixture@example.invalid',password:'not-a-real-password',usuario:'fixture'};
const user = () => ({id:'u-fixture',app_metadata:{empleado_id:'e-fixture',rol:'administrador',perfil_acceso:'admin'}});
const access = () => ({user_id:'u-fixture',activo:true,modulos_permitidos:['dashboard'],areas_permitidas:['*']});
const employee = () => ({id:'e-fixture',estado:true,nombres:'Fixture',apellidos:'Test'});
function fixture(options={}) {
 const calls={auth:0,employee:0,permissions:0,verified:[],clears:0,signals:[],select:[],statuses:[]};
 const client={auth:{signInWithPassword:async()=>{calls.auth++;return options.auth?options.auth():{data:{user:user(),session:{access_token:'fixture-token',user:user()}}};},getSession:async()=>options.session?options.session():{data:{session:{user:user()}}}},
 from(name){assert.equal(name,'empleados');const q={select(cols){calls.select.push(cols);return q;},eq(key,value){assert.equal(key,'id');assert.equal(value,'e-fixture');return q;},abortSignal(s){calls.signals.push(s);return q;},maybeSingle(){calls.employee++;return options.employee?options.employee(calls.employee):Promise.resolve({data:employee()});}};return q;},
 rpc(name){assert.equal(name,'consultar_mis_modulos_v720');return {abortSignal(signal){calls.signals.push(signal);calls.permissions++;return options.permissions?options.permissions(calls.permissions):Promise.resolve({data:access()});}};}};
 const controller=crearIngresoAdmin761({client,clearApplicationSession(){calls.clears++;},onStatus:s=>calls.statuses.push(s),onVerified:r=>calls.verified.push(r),authTimeoutMs:30,readTimeoutMs:20,sessionTimeoutMs:20,...options.config});
 return {controller,calls};
}
test('valid Auth, employee and server permissions are all mandatory before access',async()=>{
 const {controller,calls}=fixture();assert.equal(await controller.ingresar(credentials),true);assert.equal(calls.verified.length,1);assert.equal(calls.auth,1);assert.equal(calls.employee,1);assert.equal(calls.permissions,1);assert.equal(calls.select[0],CAMPOS_EMPLEADO_LOGIN761);assert.equal(controller.ocupado(),false);
});
test('employee and permissions are started in parallel, not one after another',async()=>{
 let finish;const {controller,calls}=fixture({employee:()=>new Promise(r=>{finish=r;})});
 const result=controller.ingresar(credentials);await pause(2);assert.equal(calls.permissions,1);finish({data:employee()});await result;
});
test('one HTTP 520 is retried without a second password sign-in',async()=>{
 const {controller,calls}=fixture({employee:n=>Promise.resolve(n===1?{error:{code:'',message:'Gateway'},status:520}:{data:employee()})});
 await controller.ingresar(credentials);assert.equal(calls.employee,2);assert.equal(calls.auth,1);assert.equal(calls.verified.length,1);
});
test('persistent server error stops after two read attempts and never authenticates by fallback',async()=>{
 const {controller,calls}=fixture({employee:()=>Promise.resolve({error:{message:'Gateway'},status:520})});
 await assert.rejects(controller.ingresar(credentials));assert.equal(calls.employee,2);assert.equal(calls.auth,1);assert.equal(calls.verified.length,0);assert.equal(controller.ocupado(),false);
});
test('hung reads are aborted, state released, and late results cannot redirect',async()=>{
 const resolvers=[];const {controller,calls}=fixture({employee:()=>new Promise(r=>resolvers.push(r))});
 await assert.rejects(controller.ingresar(credentials),{code:'LOGIN_TIMEOUT'});assert.equal(calls.employee,2);assert.equal(calls.signals.filter(s=>s.aborted).length>=2,true);assert.equal(calls.verified.length,0);
 for(const resolve of resolvers)resolve({data:employee()});await pause(1);assert.equal(calls.verified.length,0);assert.equal(controller.ocupado(),false);
});
test('permissions 403 is not retried or converted into default admin access',async()=>{
 const {controller,calls}=fixture({permissions:()=>Promise.resolve({error:{code:'42501'},status:403})});
 await assert.rejects(controller.ingresar(credentials));assert.equal(calls.permissions,1);assert.equal(calls.verified.length,0);
});
test('invalid credentials are never retried and never query employee tables',async()=>{
 const {controller,calls}=fixture({auth:()=>({error:{code:'invalid_credentials',status:400}})});
 await assert.rejects(controller.ingresar(credentials),{code:'LOGIN_AUTH_FAILED'});assert.equal(calls.auth,1);assert.equal(calls.employee,0);
});
test('Auth that never completes leaves a bounded UI and prohibits a second overlapping sign-in',async()=>{
 const {controller,calls}=fixture({auth:()=>new Promise(()=>{})});
 await assert.rejects(controller.ingresar(credentials),{code:'LOGIN_TIMEOUT'});assert.equal(controller.ocupado(),false);assert.equal(controller.requiereRecarga(),true);
 await assert.rejects(controller.ingresar(credentials),{code:'LOGIN_AUTH_PENDING'});assert.equal(calls.auth,1);assert.equal(calls.verified.length,0);
});
test('late Auth after timeout cannot open the panel or save application session',async()=>{
 let finish;const {controller,calls}=fixture({auth:()=>new Promise(r=>{finish=r;})});
 await assert.rejects(controller.ingresar(credentials));finish({data:{user:user(),session:{access_token:'late',user:user()}}});await pause(2);assert.equal(calls.employee,0);assert.equal(calls.verified.length,0);assert.equal(controller.requiereRecarga(),false);
});
test('simultaneous submit cannot launch two sign-ins',async()=>{
 let finish;const {controller,calls}=fixture({auth:()=>new Promise(r=>{finish=r;})});
 const running=controller.ingresar(credentials);await assert.rejects(controller.ingresar(credentials),{code:'LOGIN_BUSY'});await pause(1);
 finish({data:{user:user(),session:{access_token:'fixture',user:user()}}});await running;assert.equal(calls.auth,1);
});
test('cancel during reads prevents a late confirmation',async()=>{
 let finish;const {controller,calls}=fixture({employee:()=>new Promise(r=>{finish=r;})});
 const running=controller.ingresar(credentials);await pause(2);controller.cancelar();await assert.rejects(running,{code:'LOGIN_CANCELLED'});finish({data:employee()});await pause(2);assert.equal(calls.verified.length,0);assert.equal(calls.employee,1);
});
test('disabled employee cannot enter despite successful Auth',async()=>{
 const {controller,calls}=fixture({employee:()=>Promise.resolve({data:{...employee(),estado:false}})});await assert.rejects(controller.ingresar(credentials),{code:'LOGIN_EMPLOYEE_INVALID'});assert.equal(calls.verified.length,0);
});
for(const data of [null,{...access(),activo:false},{...access(),user_id:'someone-else'},{...access(),modulos_permitidos:null}])test('invalid server access is denied: '+JSON.stringify(data),async()=>{
 const {controller,calls}=fixture({permissions:()=>Promise.resolve({data})});await assert.rejects(controller.ingresar(credentials),{code:'LOGIN_DENIED'});assert.equal(calls.verified.length,0);
});
test('user_metadata cannot grant administrative access',async()=>{
 const bad={id:'u-fixture',app_metadata:{},user_metadata:{empleado_id:'e-fixture',rol:'administrador'}};
 const {controller,calls}=fixture({auth:()=>({data:{user:bad,session:{access_token:'fixture',user:bad}}})});await assert.rejects(controller.ingresar(credentials),{code:'LOGIN_DENIED'});assert.equal(calls.employee,0);
});
test('session replaced by another tab cannot be used for the wrong identity',async()=>{
 const {controller,calls}=fixture({session:()=>({data:{session:{user:{id:'someone-else'}}}})});await assert.rejects(controller.ingresar(credentials),{code:'LOGIN_SESSION_CHANGED'});assert.equal(calls.verified.length,0);
});
test('network failure returned by PostgREST is retried once',async()=>{
 let count=0;const data=await lecturaIngreso761(()=>Promise.resolve(++count===1?{error:{message:'TypeError: Failed to fetch'},status:0}:{data:123}),{ms:10});assert.equal(data,123);assert.equal(count,2);
});
test('timeout helper aborts its actual request signal',async()=>{
 let signal;await assert.rejects(conLimiteIngreso761(s=>{signal=s;return new Promise(()=>{});},{ms:5}),{code:'LOGIN_TIMEOUT'});assert.equal(signal.aborted,true);
});
test('timed-out directory cannot subsequently replace selected account',async()=>{
 let finish,commits=0;const pending=conLimiteIngreso761(()=>new Promise(r=>{finish=r;}),{ms:5}).then(()=>{commits++;});await assert.rejects(pending);finish({data:[]});await pause(2);assert.equal(commits,0);
});
test('UI has real cancel/finally and employee, PWA and payroll paths remain unchanged',async()=>{
 const html=await readFile(new URL('../pages/login.html',import.meta.url),'utf8');
 const admin=html.slice(html.indexOf('async function loginAdminConUI'),html.indexOf('async function consultarTurnosConUI'));
 assert.match(admin,/finally/);assert.doesNotMatch(admin,/timeoutLoader/);assert.match(html,/Cancelar ingreso/);assert.match(html,/Acceso 7.61/);assert.match(html,/login-pwa.js\?v=754/);
 const auth=await readFile(new URL('../js/auth.js',import.meta.url),'utf8');assert.match(auth,/window.consultarTurnos = loginEmpleadoSeguro/);assert.doesNotMatch(auth,/password_hash/);assert.doesNotMatch(auth,/localStorage.clear/);
});
test('no raw secrets or response HTML are displayed in login errors',()=>{
 const raw=new Error('<script>secret</script>');assert.doesNotMatch(mensajeErrorIngreso761(raw),/secret|script/);
});

test('Auth service failure never claims the password was already accepted',async()=>{
 const {controller}=fixture({auth:()=>({error:{status:503,code:'unexpected_failure'}})});
 try {await controller.ingresar(credentials);assert.fail('Expected rejection');}catch(error){assert.match(mensajeErrorIngreso761(error),/autenticacion no esta disponible/);assert.doesNotMatch(mensajeErrorIngreso761(error),/La cuenta se autentico/);}
});
