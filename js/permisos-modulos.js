import { supabase } from '../supabase/supabaseClient.js';
import { tieneModulo, moduloDeRuta, destinoPermitido, MODULOS_ADMIN } from './permisos-core.js?v=735';
export { tieneModulo, moduloDeRuta, destinoPermitido };
let inflight=null,cached=null,blocked=false,linkSession=null,linkObserver=null;
function local(){try{return JSON.parse(localStorage.getItem('ccp_sesion')||'null');}catch{return null;}}
function limitada(promise){let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('No se pudieron verificar los permisos. Recarga e intenta nuevamente.')),15000);})]).finally(()=>clearTimeout(timer));}
export function invalidarPermisos(){cached=null;}
export async function consultarPermisos({force=false}={}){
 const visual=local();if(visual?.tipo_ingreso==='empleado'||visual?.rol==='empleado')return visual;
 const {data,error}=await limitada(supabase.auth.getSession());
 if(error||!data?.session?.user?.id)throw new Error('Inicia sesi\u00f3n con tu cuenta administrativa.');
 const uid=data.session.user.id;
 if(!force&&cached?.uid===uid&&cached.expires>Date.now())return cached.session;
 if(inflight?.uid===uid)return inflight.promise;
 const promise=(async()=>{
  const {data:p,error:e}=await limitada(supabase.rpc('consultar_mis_modulos_v720'));
  if(e)throw new Error(e.message||'No se pudieron verificar los permisos.');
  if(!p||p.user_id!==uid||!p.activo)throw new Error('La cuenta no tiene acceso administrativo activo.');
  const {data:after}=await limitada(supabase.auth.getSession());if(after?.session?.user?.id!==uid)throw new Error('La cuenta cambi\u00f3. Vuelve a ingresar.');
  const old=local(),oldUid=old?.auth_user_id||(old?.tipo_ingreso==='admin_auth'?old.id:null);
  if(oldUid&&oldUid!==uid)throw new Error('La cuenta cambi\u00f3. Vuelve a ingresar.');
  const session={...(old||{}),auth_user_id:uid,tipo_ingreso:'admin_auth',activo:true,rol_auth:p.rol,
    rol:p.perfil_acceso||(p.rol==='administrador'?'admin':p.rol),
    modulos_permitidos:p.modulos_permitidos,areas_permitidas:p.areas_permitidas,puede_administrar:p.puede_administrar===true};
  localStorage.setItem('ccp_sesion',JSON.stringify(session));cached={uid,session,expires:Date.now()+10000};
  window.dispatchEvent(new CustomEvent('ccp-permisos-actualizados',{detail:session}));return session;
 })();inflight={uid,promise};try{return await promise;}finally{if(inflight?.promise===promise)inflight=null;}
}
function bloquear(message,session){
 if(blocked)return;blocked=true;
 document.querySelectorAll('main,.main-content,dialog,.modal').forEach(el=>{el.hidden=true;el.style.display='none';});
 const box=document.createElement('section');box.id='ccpAccesoDenegado';box.setAttribute('role','alert');box.style.cssText='max-width:640px;margin:10vh auto;padding:24px;font:16px system-ui;background:white;border:1px solid #BBDFFF;border-radius:12px';
 const p=document.createElement('p');p.textContent=message;box.append(p);
 const target=destinoPermitido(session);const a=document.createElement('a');a.textContent=target?'Ir a un m\u00f3dulo permitido':'Volver al inicio';a.href=target||'login.html';box.append(a);document.body.append(box);
}
export async function exigirModulo(module,options={}){
 try{const session=await consultarPermisos(options);if(!tieneModulo(session,module)){bloquear('No tienes permiso para este m\u00f3dulo. Solicita el acceso a Sistemas.',session);return null;}return session;}
 catch(e){bloquear(e.message);return null;}
}
// A separate class prevents legacy role-based scripts from restoring a denied link.
export function filtrarEnlaces(session,root=document){
 linkSession=session;
 if(!document.getElementById('ccpReglaPermisos720')){
  const style=document.createElement('style');style.id='ccpReglaPermisos720';
  style.textContent='.ccp-modulo-denegado720{display:none!important}';document.head.append(style);
  document.addEventListener('click',event=>{const link=event.target.closest?.('a.ccp-modulo-denegado720');if(link){event.preventDefault();event.stopImmediatePropagation();}},true);
 }
 const valid=new Set([...MODULOS_ADMIN.map(x=>x[0]),'usuarios-admin']);
 const links=[...(root.matches?.('a[href]')?[root]:[]),...root.querySelectorAll('a[href]')];
 links.forEach(link=>{
  const module=moduloDeRuta(link.getAttribute('href'));if(!valid.has(module))return;
  const allow=tieneModulo(session,module);
  link.classList.toggle('ccp-modulo-denegado720',!allow);
  if(!allow)link.setAttribute('aria-hidden','true');
  else if(link.getAttribute('aria-hidden')==='true')link.removeAttribute('aria-hidden');
 });
 if(!linkObserver&&document.body){
  linkObserver=new MutationObserver(changes=>{
   for(const change of changes)for(const node of change.addedNodes){
    if(node.nodeType===1&&linkSession)filtrarEnlaces(linkSession,node);
   }
  });
  linkObserver.observe(document.body,{childList:true,subtree:true});
 }
}
