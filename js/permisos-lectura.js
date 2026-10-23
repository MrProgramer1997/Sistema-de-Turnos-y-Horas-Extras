/* Navigation 7.62. One bounded, identity-bound permission read per page.
 * Only a response from the protected RPC can grant administrative navigation.
 * No persisted permission fallback; no password retries or payroll writes.
 */
export class ErrorPermisos762 extends Error {
  constructor(code, message, transitorio = false) {
    super(message); this.name = 'ErrorPermisos762'; this.code = code; this.transitorio = transitorio;
  }
}
const temporal = () => new ErrorPermisos762('PERMISOS_RED', 'El servidor no respondio a tiempo al consultar los permisos. Puedes reintentar sin volver a escribir la contrasena.', true);
const identidad = () => new ErrorPermisos762('PERMISOS_SESION', 'La sesion cambio o termino. Vuelve a ingresar con tu cuenta.');
function clasificar(error, status = 0) {
  if (error instanceof ErrorPermisos762) return error;
  const code = String(error?.code || ''), http = Number(error?.status || status);
  if (http === 401 || ['PGRST301','PGRST302','PGRST303'].includes(code)) return identidad();
  if (http === 403 || code === '42501') return new ErrorPermisos762('PERMISOS_DENEGADOS', 'El servidor rechazo la verificacion de permisos. Contacta a Sistemas.');
  if (!http || http >= 500 || http === 408 || http === 429) return temporal();
  return new ErrorPermisos762('PERMISOS_RESPUESTA', 'No se pudo verificar el acceso con el servidor. No se han cambiado tus permisos.');
}
function acotar(promise, ms, signal, alVencer = () => {}) {
  return new Promise((resolve, reject) => {
    let done = false, timer;
    const finish = (fn, value) => { if (done) return; done = true; clearTimeout(timer); signal?.removeEventListener('abort', abort); fn(value); };
    const abort = () => finish(reject, identidad());
    Promise.resolve(promise).then(v => finish(resolve, v), e => finish(reject, e));
    if (signal?.aborted) { abort(); return; }
    signal?.addEventListener('abort', abort, {once:true});
    timer = setTimeout(() => { finish(reject, temporal()); alVencer(); }, ms);
  });
}
export function crearLecturaPermisos762(client, {
  leerLocal = () => null, guardarLocal = () => {}, notificar = () => {}, alCambiarIdentidad = () => {},
  timeout = 10000, timeoutSesion = 8000, ttl = 10000, pausaReintento = 250, clock = Date.now
} = {}) {
  let cache = null, pendiente = null, generation = 0, uidAnterior = null;
  const controllers = new Set();
  function invalidar() { generation++; cache = null; for (const c of controllers) c.abort(); }
  function cambio(event, session) {
    const uid = session?.user?.id || null;
    if (event === 'SIGNED_OUT' || (uidAnterior && uid && uidAnterior !== uid)) {
      invalidar(); queueMicrotask(() => alCambiarIdentidad(identidad()));
    } else if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') cache = null;
    uidAnterior = uid;
  }
  const subscription = client.auth.onAuthStateChange?.(cambio)?.data?.subscription;
  async function sesion(signal) {
    let r;
    try { r = await acotar(client.auth.getSession(), timeoutSesion, signal); }
    catch (e) { throw clasificar(e); }
    if (r.error) throw clasificar(r.error);
    const s = r.data?.session;
    if (!s?.user?.id || !s.access_token) throw identidad();
    const visual = leerLocal(), localId = visual?.auth_user_id || (visual?.tipo_ingreso === 'admin_auth' ? visual.id : null);
    if (localId && localId !== s.user.id) throw identidad();
    uidAnterior = s.user.id;
    return s;
  }
  async function comprobar(force) {
    const visual = leerLocal();
    // Personal navigation remains separate. These records never grant an admin module.
    if (visual?.tipo_ingreso === 'empleado' || visual?.rol === 'empleado') return visual;
    const currentGeneration = generation, parent = new AbortController(); controllers.add(parent);
    try {
      const current = await sesion(parent.signal), uid = current.user.id;
      if (generation !== currentGeneration) throw identidad();
      if (!force && cache?.uid === uid && cache.token === current.access_token && cache.expires > clock()) return cache.session;
      let p;
      for (let attempt = 0; attempt < 2; attempt++) {
        if (generation !== currentGeneration) throw identidad();
        const controller = new AbortController();
        const abort = () => controller.abort(); parent.signal.addEventListener('abort', abort, {once:true});
        try {
          let request = client.rpc('consultar_mis_modulos_v720');
          if (typeof request.abortSignal !== 'function' || typeof request.setHeader !== 'function') {
            throw new ErrorPermisos762('PERMISOS_SDK', 'Actualiza la pagina para cargar el componente seguro de conexion.');
          }
          request = request.setHeader('Authorization', `Bearer ${current.access_token}`).abortSignal(controller.signal);
          const r = await acotar(request, timeout, parent.signal, abort);
          if (r.error) throw clasificar(r.error, r.status);
          p = r.data;
          if (!p || p.user_id !== uid) throw identidad();
          if (p.activo !== true) throw new ErrorPermisos762('PERMISOS_INACTIVOS', 'La cuenta no tiene acceso administrativo activo.');
          if (!Array.isArray(p.modulos_permitidos) || !Array.isArray(p.areas_permitidas)) {
            throw new ErrorPermisos762('PERMISOS_RESPUESTA', 'El servidor no devolvio una lista de permisos valida.');
          }
          break;
        } catch (e) {
          const error = clasificar(e);
          if (!error.transitorio || attempt === 1 || generation !== currentGeneration) throw error;
          await acotar(new Promise(r => setTimeout(r, pausaReintento)), timeoutSesion, parent.signal);
        } finally { parent.signal.removeEventListener('abort', abort); controller.abort(); }
      }
      const after = await sesion(parent.signal);
      if (after.user.id !== uid || generation !== currentGeneration) throw identidad();
      const old = leerLocal();
      if (old?.tipo_ingreso === 'empleado' || old?.rol === 'empleado') throw identidad();
      const session = {...(old || {}), auth_user_id:uid, tipo_ingreso:'admin_auth', activo:true, rol_auth:p.rol,
        rol:p.perfil_acceso || (p.rol === 'administrador' ? 'admin' : p.rol),
        modulos_permitidos:p.modulos_permitidos.slice(), areas_permitidas:p.areas_permitidas.slice(), puede_administrar:p.puede_administrar === true};
      guardarLocal(session);
      cache = {uid, token:current.access_token, session, expires:clock() + ttl};
      notificar(session);
      return session;
    } finally { controllers.delete(parent); }
  }
  function consultar({force = false} = {}) {
    if (pendiente) return pendiente;
    const operation = Promise.resolve().then(() => comprobar(force));
    pendiente = operation.finally(() => { if (pendiente === exposed) pendiente = null; });
    const exposed = pendiente;
    return exposed;
  }
  function destruir() { invalidar(); subscription?.unsubscribe(); }
  return {consultar, invalidar, destruir};
}
