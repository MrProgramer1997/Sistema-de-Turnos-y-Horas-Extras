import { supabase } from '../supabase/supabaseClient.js';

// Shared transport for protected modules. Never substitutes a public key for a
// missing user session. Authorization and row visibility remain on the server.
export class ErrorSesion extends Error {
  constructor(code, message, cause) {
    super(message);
    this.name = 'ErrorSesion';
    this.code = code;
    if (cause) this.cause = cause;
  }
}
const KEYS = ['ccp_sesion','usuarioActual','empleadoActual','sessionUser','userData','authUser','usuarioLogueado','empleadoSesion'];
export function leerSesionVisual() {
  try { return JSON.parse(localStorage.getItem('ccp_sesion') || 'null'); }
  catch { return null; }
}
function codigo(error) { return String(error?.code || ''); }
function esDenegacion(error) {
  return ['42501','PGRST301','PGRST302','PGRST303'].includes(codigo(error)) ||
    Number(error?.status) === 401 || /jwt.*(expired|invalid)|permission denied for function/i.test(error?.message || '');
}
function esTokenInvalido(error) {
  return Number(error?.status) === 401 || Number(error?.status) === 403 ||
    /AuthSessionMissing|AuthInvalidJwt|session_not_found|refresh_token_not_found|refresh_token_already_used|bad_jwt/i.test(`${error?.name || ''} ${error?.code || ''}`);
}
function limitada(promise, ms) {
  let timer;
  return Promise.race([Promise.resolve(promise), new Promise((_, reject) => {
    timer = setTimeout(() => reject(new ErrorSesion('AUTH_NETWORK', 'No se pudo verificar la sesi\u00f3n a tiempo. Revisa la conexi\u00f3n y vuelve a intentar.')), ms);
  })]).finally(() => clearTimeout(timer));
}
const faltaSesion = () => new ErrorSesion('AUTH_REQUIRED', 'Tu sesi\u00f3n segura termin\u00f3 o no est\u00e1 disponible. El nombre del men\u00fa puede seguir guardado; inicia sesi\u00f3n nuevamente para consultar los datos.');

export function crearControlSesion(client, { localSession = leerSesionVisual, timeout = 12000, clock = Date.now } = {}) {
  let comprobada = null, enCurso = null, renovando = null, ultimoUsuario = null, generation = 0;
  const listeners = new Set();
  function cambio(event, session) {
    comprobada = null;
    const id = session?.user?.id || null;
    if (event === 'SIGNED_OUT' || (ultimoUsuario && id && ultimoUsuario !== id)) {
      generation++;
      for (const listener of listeners) queueMicrotask(() => listener(event));
    }
    if (id) ultimoUsuario = id;
  }
  const subscription = client.auth.onAuthStateChange?.(cambio)?.data?.subscription;
  async function actual() {
    let result;
    try { result = await limitada(client.auth.getSession(), timeout); }
    catch (error) { throw error instanceof ErrorSesion ? error : new ErrorSesion('AUTH_NETWORK', 'No se pudo consultar la sesi\u00f3n. Revisa la conexi\u00f3n.', error); }
    if (result.error) {
      if (esTokenInvalido(result.error)) throw faltaSesion();
      throw new ErrorSesion('AUTH_NETWORK', 'No se pudo consultar la sesi\u00f3n. Revisa la conexi\u00f3n.', result.error);
    }
    const session = result.data?.session;
    if (!session?.access_token || !session?.user?.id) throw faltaSesion();
    if (session.user.role && session.user.role !== 'authenticated') throw faltaSesion();
    return session;
  }
  async function renovar() {
    if (!renovando) {
      renovando = (async () => {
        // Do not attempt refresh when the user has signed out.
        await actual();
        let result;
        try { result = await limitada(client.auth.refreshSession(), timeout); }
        catch (error) { throw error instanceof ErrorSesion ? error : new ErrorSesion('AUTH_NETWORK', 'No se pudo renovar la sesi\u00f3n. Revisa la conexi\u00f3n.', error); }
        if (result.error) {
          if (esTokenInvalido(result.error) || Number(result.error.status) === 400) throw faltaSesion();
          throw new ErrorSesion('AUTH_NETWORK', 'No se pudo renovar la sesi\u00f3n. Revisa la conexi\u00f3n.', result.error);
        }
        if (!result.data?.session?.access_token) throw faltaSesion();
        comprobada = null;
        return result.data.session;
      })().finally(() => { renovando = null; });
    }
    return renovando;
  }
  function mismaPersona(user) {
    const visual = localSession();
    if (!visual) return;
    const authId = visual.auth_user_id || (visual.tipo_ingreso === 'admin_auth' ? visual.id : null);
    const employeeId = visual.empleado_id || (visual.tipo_ingreso === 'empleado' ? visual.id : null);
    const realEmployee = user.app_metadata?.empleado_id;
    if ((authId && String(authId) !== String(user.id)) ||
        (employeeId && realEmployee && String(employeeId) !== String(realEmployee))) {
      throw new ErrorSesion('AUTH_IDENTITY', 'La cuenta de Supabase no coincide con la persona que muestra el men\u00fa. Inicia sesi\u00f3n nuevamente con tu cuenta.');
    }
  }
  async function verificar() {
    let session = await actual();
    if (session.expires_at && session.expires_at * 1000 - clock() < 60000) session = await renovar();
    if (comprobada?.token === session.access_token && comprobada.until > clock()) {
      mismaPersona(comprobada.user);
      return { session, user: comprobada.user };
    }
    const version = generation;
    let result;
    try { result = await limitada(client.auth.getUser(session.access_token), timeout); }
    catch (error) { throw error instanceof ErrorSesion ? error : new ErrorSesion('AUTH_NETWORK', 'No se pudo validar tu cuenta con Supabase. Revisa la conexi\u00f3n.', error); }
    if (result.error) {
      if (!esTokenInvalido(result.error)) throw new ErrorSesion('AUTH_NETWORK', 'No se pudo validar tu cuenta. No se cambiaron los permisos ni los datos.', result.error);
      session = await renovar();
      result = await limitada(client.auth.getUser(session.access_token), timeout);
      if (result.error) throw faltaSesion();
    }
    if (!result.data?.user || result.data.user.id !== session.user.id || version !== generation) throw faltaSesion();
    mismaPersona(result.data.user);
    ultimoUsuario = result.data.user.id;
    comprobada = { user: result.data.user, token: session.access_token, until: clock() + 20000 };
    return { session, user: result.data.user };
  }
  async function asegurar({ forceRefresh = false } = {}) {
    if (forceRefresh) {
      if (enCurso) await enCurso;
      await renovar();
    }
    if (!enCurso) enCurso = verificar().finally(() => { enCurso = null; });
    return enCurso;
  }
  async function query(makeBuilder, { signal, range, read = true, name = "consulta protegida" } = {}) {
    let valid = await asegurar();
    for (let attempt = 0; attempt < 2; attempt++) {
      if (signal?.aborted) throw new DOMException('Consulta cancelada','AbortError');
      const version = generation;
      let builder = makeBuilder();
      // setHeader is part of PostgREST's documented builder API. Refuse to make
      // an unbound request if an incompatible, stale SDK is served by the CDN.
      if (typeof builder.setHeader !== 'function') throw new ErrorSesion('AUTH_SDK', 'El componente de conexi\u00f3n est\u00e1 desactualizado. Recarga con Ctrl + F5.');
      builder = builder.setHeader('Authorization', `Bearer ${valid.session.access_token}`);
      if (range) builder = builder.range(range[0], range[1]);
      const controller = new AbortController();
      const abort = () => controller.abort();
      signal?.addEventListener('abort', abort, { once: true });
      const timer = setTimeout(abort, 40000);
      let response;
      try { response = await builder.abortSignal(controller.signal); }
      finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
      if (controller.signal.aborted) throw new DOMException('Consulta cancelada o agotada','AbortError');
      if (version !== generation) throw faltaSesion();
      const latest = await actual();
      if (latest.user.id !== valid.user.id) throw new ErrorSesion('AUTH_IDENTITY', 'La sesi\u00f3n cambi\u00f3 durante la consulta. Vuelve a ingresar.');
      mismaPersona(valid.user);
      if (!response.error || !esDenegacion(response.error)) return response;
      // Only repeat read operations. Never replay an approval, preparation or
      // other write when an acknowledgement could have been lost.
      if (read && attempt === 0) {
        valid = await asegurar({ forceRefresh: latest.access_token === valid.session.access_token });
        continue;
      }
      throw new ErrorSesion('AUTH_FORBIDDEN', `La sesi\u00f3n est\u00e1 identificada, pero Supabase rechaz\u00f3 ${name}. Vuelve a ingresar. Si persiste, Sistemas debe revisar el permiso de esa funci\u00f3n; no se cambi\u00f3 ning\u00fan dato.`, response.error);
    }
  }
  const request = (name, args = {}, options = {}) => query(() => client.rpc(name, args), { ...options, name });
  return { asegurar, request, query, observar: listener => { listeners.add(listener); return () => listeners.delete(listener); }, dispose: () => subscription?.unsubscribe() };
}
const control = crearControlSesion(supabase);
export const asegurarSesion = options => control.asegurar(options);
export const rpcConSesion = (name, args, options) => control.request(name, args, options);
export const consultaConSesion = (makeBuilder, options) => control.query(makeBuilder, options);
export const observarSesion = listener => control.observar(listener);
export const esErrorAcceso = error => error instanceof ErrorSesion && error.code !== 'AUTH_NETWORK';
export function rutaReingreso(page = location.pathname.split('/').pop()) {
  const allowed = ['dashboard.html','horas-extras.html'];
  const target = allowed.includes(page) ? page : 'dashboard.html';
  return `login.html?sesion=verificada&volver=${encodeURIComponent(target)}`;
}
export function mostrarErrorAcceso(container, error, retry) {
  if (!container) return;
  container.hidden = false;
  container.replaceChildren();
  container.setAttribute('role','alert');
  const text = document.createElement('p');text.textContent = error.message || 'No se pudo verificar el acceso.';
  text.style.margin = '0 0 10px';container.append(text);
  const row = document.createElement('div');row.style.cssText='display:flex;gap:12px;align-items:center;flex-wrap:wrap';
  const btn = document.createElement('button');btn.type='button';btn.textContent='Revalidar sesi\u00f3n';
  btn.style.cssText='border:0;border-radius:8px;padding:10px 16px;min-height:44px;background:#004AA1;color:#fff;font:inherit;cursor:pointer';
  btn.addEventListener('click', async () => {
    btn.disabled=true;btn.textContent='Verificando...';
    try { await asegurarSesion({ forceRefresh: true }); await retry?.(); }
    catch (e) { text.textContent=e.message||'No se pudo verificar la sesi\u00f3n.'; }
    finally { btn.disabled=false;btn.textContent='Revalidar sesi\u00f3n'; }
  });
  const link=document.createElement('a');link.href=rutaReingreso();link.textContent='Iniciar sesi\u00f3n nuevamente';
  link.style.cssText='color:#004AA1;font-weight:700;display:inline-block;padding:10px';
  row.append(btn,link);container.append(row);
}
export async function cerrarSesionSegura() {
  const result = await limitada(supabase.auth.signOut({ scope: 'local' }), 12000);
  if (result?.error) throw new Error('No se pudo cerrar la sesi\u00f3n segura. Reintenta antes de cambiar de usuario.');
  for (const key of KEYS) { localStorage.removeItem(key); sessionStorage.removeItem(key); }
  sessionStorage.removeItem('portal-envio-id');
}
