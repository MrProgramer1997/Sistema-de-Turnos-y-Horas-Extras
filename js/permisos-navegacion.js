import { supabase } from '../supabase/supabaseClient.js';
import { tieneModulo, moduloDeRuta, destinoPermitido, MODULOS_ADMIN } from './permisos-core.js?v=735';
import { crearLecturaPermisos762 } from './permisos-lectura.js?v=762';
export { tieneModulo, moduloDeRuta, destinoPermitido };

// All historical entry URLs re-export this SAME module. Thus layout and page
// bootstrap share both the read and the recoverable access panel.
let block = null, retrying = null, linkSession = null, linkObserver = null;
const ocultos = new Map(), esperas = new Set();
const ruta = () => moduloDeRuta(window.location.pathname);
function local() { try { return JSON.parse(localStorage.getItem('ccp_sesion') || 'null'); } catch { return null; } }
const control = crearLecturaPermisos762(supabase, {
  leerLocal:local,
  guardarLocal:session => localStorage.setItem('ccp_sesion', JSON.stringify(session)),
  notificar:session => window.dispatchEvent(new CustomEvent('ccp-permisos-actualizados', {detail:session})),
  alCambiarIdentidad:error => { mostrarBloqueo(error, false); terminarEsperas(null); }
});
export const consultarPermisos = options => control.consultar(options);
export const invalidarPermisos = () => control.invalidar();
function terminarEsperas(session) {
  for (const item of esperas) item.resolve(session && tieneModulo(session, item.module) ? session : null);
  esperas.clear();
}
function ocultarContenido() {
  document.querySelectorAll('main,.main-content,dialog,.modal').forEach(el => {
    if (!ocultos.has(el)) ocultos.set(el, {hidden:el.hidden, display:el.style.getPropertyValue('display'), priority:el.style.getPropertyPriority('display')});
    el.hidden = true; el.style.setProperty('display', 'none', 'important');
  });
}
function recuperarContenido(session) {
  if (!tieneModulo(session, ruta())) return false;
  for (const [el, before] of ocultos) {
    if (!el.isConnected) continue;
    el.hidden = before.hidden;
    if (before.display) el.style.setProperty('display', before.display, before.priority);
    else el.style.removeProperty('display');
  }
  ocultos.clear(); document.getElementById('ccpAccesoDenegado')?.remove(); block = null;
  terminarEsperas(session); return true;
}
function mostrarBloqueo(error, recuperable, session = null) {
  // A temporary network error must never overwrite a definitive denial.
  if (block && !block.recuperable && recuperable) return;
  block = {recuperable, session}; ocultarContenido();
  let box = document.getElementById('ccpAccesoDenegado');
  if (!box) {
    box = document.createElement('section'); box.id = 'ccpAccesoDenegado';
    box.setAttribute('role','alert'); box.style.cssText='max-width:640px;margin:10vh auto;padding:24px;font:16px system-ui;background:white;border:1px solid #BBDFFF;border-radius:12px';
    document.body.append(box);
  }
  box.replaceChildren();
  const p = document.createElement('p'); p.textContent = error?.message || 'No se pudo verificar el acceso.'; box.append(p);
  if (recuperable) {
    const note = document.createElement('p'); note.textContent='La consulta fallo; esto no significa que se hayan retirado tus permisos. El modulo permanece protegido hasta verificar el acceso.'; box.append(note);
    const button = document.createElement('button'); button.type='button'; button.id='ccpReintentarPermisos762';
    button.className='btn btn-primary'; button.textContent='Reintentar permisos'; button.onclick=reintentar; box.append(button);
  }
  const target = destinoPermitido(session);
  const a = document.createElement('a'); a.textContent=target?'Ir a un modulo permitido':'Volver al inicio'; a.href=target||'login.html?admin=1'; a.style.marginLeft='16px'; box.append(a);
  const version = document.createElement('small'); version.textContent='Navegacion 7.62'; version.style.cssText='display:block;margin-top:16px;color:#687787'; box.append(version);
}
async function reintentar() {
  if (retrying || !block?.recuperable) return;
  const button = document.getElementById('ccpReintentarPermisos762');
  if (button) { button.disabled=true; button.textContent='Verificando permisos...'; }
  retrying = (async () => {
    try {
      const session = await consultarPermisos({force:true});
      if (!tieneModulo(session,ruta())) { mostrarBloqueo(new Error('No tienes permiso para este modulo. Solicita el acceso a Sistemas.'),false,session); terminarEsperas(null); return; }
      recuperarContenido(session);
    } catch (error) {
      mostrarBloqueo(error,error.transitorio===true);
      if (!error.transitorio) terminarEsperas(null);
    } finally { retrying=null; }
  })();
  return retrying;
}
export async function exigirModulo(module, options = {}) {
  try {
    const session = await consultarPermisos(options);
    if (!tieneModulo(session,module)) {
      mostrarBloqueo(new Error('No tienes permiso para este modulo. Solicita el acceso a Sistemas.'),false,session);
      terminarEsperas(null); return null;
    }
    if (block?.recuperable && module===ruta()) recuperarContenido(session);
    return session;
  } catch (error) {
    mostrarBloqueo(error,error.transitorio===true);
    if (!error.transitorio || !block?.recuperable) { terminarEsperas(null); return null; }
    // Keep bootstrap awaiting a deliberate retry, rather than returning null
    // and abandoning initialization permanently. No background retry loop.
    return new Promise(resolve => esperas.add({module,resolve}));
  }
}
export function filtrarEnlaces(session, root = document) {
  linkSession = session;
  if (!document.getElementById('ccpReglaPermisos720')) {
    const style = document.createElement('style'); style.id='ccpReglaPermisos720';
    style.textContent='.ccp-modulo-denegado720{display:none!important}'; document.head.append(style);
    document.addEventListener('click',event=>{const link=event.target.closest?.('a.ccp-modulo-denegado720');if(link){event.preventDefault();event.stopImmediatePropagation();}},true);
  }
  const valid = new Set([...MODULOS_ADMIN.map(x=>x[0]),'usuarios-admin']);
  const links = [...(root.matches?.('a[href]')?[root]:[]),...root.querySelectorAll('a[href]')];
  for (const link of links) {
    const module=moduloDeRuta(link.getAttribute('href')); if(!valid.has(module))continue;
    const allow=tieneModulo(session,module);link.classList.toggle('ccp-modulo-denegado720',!allow);
    if(!allow)link.setAttribute('aria-hidden','true');else if(link.getAttribute('aria-hidden')==='true')link.removeAttribute('aria-hidden');
  }
  if (!linkObserver && document.body) {
    linkObserver=new MutationObserver(changes=>{for(const change of changes)for(const node of change.addedNodes){if(node.nodeType===1&&linkSession)filtrarEnlaces(linkSession,node);}});
    linkObserver.observe(document.body,{childList:true,subtree:true});
  }
}
