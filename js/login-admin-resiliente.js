/* Login 7.61: bounded reads, no parallel sign-ins, no permission bypass.
 * Auth requests are not retried: the SDK has no per-signIn AbortSignal.
 * If Auth times out, its completion cannot save application state or redirect;
 * another sign-in is blocked until it settles (or the page is reloaded).
 */
export class ErrorIngreso761 extends Error {
  constructor(message, code, status = 0) {
    super(message); this.name = 'ErrorIngreso761'; this.code = code; this.status = status;
  }
}
const cancelado = () => new ErrorIngreso761('Ingreso cancelado. No se abrio el panel.', 'LOGIN_CANCELLED');
export function esFalloTemporal761(error) {
  const status = Number(error?.status || 0);
  return status === 408 || status === 429 || status >= 500 ||
    ['LOGIN_TIMEOUT', 'LOGIN_NETWORK', 'PGRST003', '57014'].includes(error?.code) ||
    (!status && /fetch|network|failed to fetch|load failed/i.test(String(error?.message || '')));
}
export async function conLimiteIngreso761(work, { signal, ms = 10000, etapa = 'consultar el acceso' } = {}) {
  if (signal?.aborted) throw signal.reason || cancelado();
  const ctrl = new AbortController();
  const relay = () => ctrl.abort(signal.reason || cancelado());
  let rejectAbort;
  const interrupted = new Promise((_, reject) => { rejectAbort = reject; });
  const onAbort = () => rejectAbort(ctrl.signal.reason || cancelado());
  ctrl.signal.addEventListener('abort', onAbort, { once: true });
  signal?.addEventListener('abort', relay, { once: true });
  const timer = setTimeout(() => ctrl.abort(new ErrorIngreso761(
    `El servidor no respondio a tiempo al ${etapa}. Intenta nuevamente.`, 'LOGIN_TIMEOUT'
  )), ms);
  try {
    return await Promise.race([Promise.resolve().then(() => {
      if (ctrl.signal.aborted) throw ctrl.signal.reason;
      return work(ctrl.signal);
    }), interrupted]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', relay);
    ctrl.signal.removeEventListener('abort', onAbort);
  }
}
export async function lecturaIngreso761(work, {
  signal, ms = 10000, etapa = 'consultar el acceso', onStatus = () => {}
} = {}) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await conLimiteIngreso761(async abortSignal => {
        const response = await work(abortSignal);
        if (response?.error) throw new ErrorIngreso761(
          `No se pudo ${etapa}.`, response.error.code || (esFalloTemporal761(response.error) ? 'LOGIN_NETWORK' : 'LOGIN_READ_FAILED'), response.status || response.error.status || 0
        );
        return response?.data;
      }, { signal, ms, etapa });
      if (signal?.aborted) throw signal.reason || cancelado();
      return result;
    } catch (error) {
      if (signal?.aborted || attempt === 1 || !esFalloTemporal761(error)) throw error;
      onStatus(`El servidor esta tardando al ${etapa}. Reintentando consulta (2/2)...`);
    }
  }
}
export const CAMPOS_EMPLEADO_LOGIN761 = 'id,codigo,cedula,nombres,apellidos,cargo,centro_costos,area,correo,telefono,estado';
const roles = new Set(['administrador', 'gerencia', 'nomina', 'aprobador', 'auditor']);
const normalizar = v => String(v || '').trim().toLowerCase();
export function crearIngresoAdmin761({
  client, onStatus = () => {}, onVerified, clearApplicationSession = () => {},
  authTimeoutMs = 15000, readTimeoutMs = 10000, sessionTimeoutMs = 3000
}) {
  let current = null, authPending = false;
  const assertCurrent = attempt => {
    if (current !== attempt || attempt.ctrl.signal.aborted) throw attempt.ctrl.signal.reason || cancelado();
  };
  return {
    ocupado: () => current !== null,
    requiereRecarga: () => authPending && current === null,
    cancelar() { current?.ctrl.abort(cancelado()); },
    async ingresar({ email, password, usuario }) {
      if (current || authPending) throw new ErrorIngreso761(
        authPending && !current ? 'La autenticacion anterior sigue pendiente. Recarga la pagina antes de volver a ingresar.' : 'Ya hay un ingreso en curso.',
        authPending && !current ? 'LOGIN_AUTH_PENDING' : 'LOGIN_BUSY'
      );
      if (!email || !password) throw new ErrorIngreso761('Complete usuario y contrasena.', 'LOGIN_REQUIRED');
      const attempt = { ctrl: new AbortController() }; current = attempt;
      let authenticated = false;
      const status = text => { if (current === attempt && !attempt.ctrl.signal.aborted) onStatus(text); };
      try {
        clearApplicationSession();
        status('Verificando usuario y contrasena...');
        const auth = await conLimiteIngreso761(() => {
          authPending = true;
          return Promise.resolve().then(() => client.auth.signInWithPassword({ email, password }))
            .finally(() => { authPending = false; });
        }, { signal: attempt.ctrl.signal, ms: authTimeoutMs, etapa: 'autenticar la cuenta' });
        assertCurrent(attempt);
        if (auth?.error) {
          const code = auth.error.code || '';
          const transient = Number(auth.error.status) >= 500 || code === 'over_request_rate_limit';
          throw new ErrorIngreso761(transient
            ? 'El servicio de autenticacion no esta disponible ahora. Intenta nuevamente; no se cambio tu contrasena.'
            : 'No se pudo autenticar la cuenta. Revisa el usuario y la contrasena.', 'LOGIN_AUTH_FAILED', auth.error.status);
        }
        const user = auth?.data?.user, session = auth?.data?.session;
        if (!user?.id || !session?.access_token || session.user?.id !== user.id) {
          throw new ErrorIngreso761('No se recibio una sesion administrativa valida.', 'LOGIN_AUTH_INVALID');
        }
        authenticated = true;
        const metadata = user.app_metadata || {};
        if (!metadata.empleado_id || !roles.has(normalizar(metadata.rol))) {
          throw new ErrorIngreso761('La cuenta no tiene un perfil administrativo autorizado.', 'LOGIN_DENIED');
        }
        status('Consultando empleado y permisos de acceso...');
        const options = { signal: attempt.ctrl.signal, ms: readTimeoutMs, onStatus: status };
        const [empleado, acceso] = await Promise.all([
          lecturaIngreso761(signal => client.from('empleados').select(CAMPOS_EMPLEADO_LOGIN761)
            .eq('id', metadata.empleado_id).abortSignal(signal).maybeSingle(), { ...options, etapa: 'consultar el empleado' }),
          lecturaIngreso761(signal => client.rpc('consultar_mis_modulos_v720').abortSignal(signal),
            { ...options, etapa: 'verificar los permisos' })
        ]);
        assertCurrent(attempt);
        if (!empleado || empleado.id !== metadata.empleado_id || empleado.estado === false) {
          throw new ErrorIngreso761('La cuenta no tiene un empleado activo vinculado. Contacta a Sistemas.', 'LOGIN_EMPLOYEE_INVALID');
        }
        if (acceso?.activo !== true || acceso.user_id !== user.id || !Array.isArray(acceso.modulos_permitidos) || !Array.isArray(acceso.areas_permitidas)) {
          throw new ErrorIngreso761('No se confirmaron permisos activos para esta cuenta. Contacta a Sistemas.', 'LOGIN_DENIED');
        }
        // A different tab may have replaced the shared session during the reads.
        const latest = await conLimiteIngreso761(() => client.auth.getSession(), {
          signal: attempt.ctrl.signal, ms: sessionTimeoutMs, etapa: 'confirmar la sesion'
        });
        assertCurrent(attempt);
        if (latest?.error || latest?.data?.session?.user?.id !== user.id) {
          throw new ErrorIngreso761('La sesion cambio durante el ingreso. Vuelve a ingresar con tu cuenta.', 'LOGIN_SESSION_CHANGED');
        }
        // This callback is synchronous: no stale continuation can store or navigate.
        onVerified({ user, empleado, acceso, usuario, correo: email });
        return true;
      } catch (error) {
        if (error && typeof error === 'object') error.autenticado = authenticated;
        throw error;
      } finally {
        attempt.ctrl.abort(cancelado());
        if (current === attempt) current = null;
      }
    }
  };
}
export function mensajeErrorIngreso761(error, requiereRecarga = false) {
  if (requiereRecarga) return 'La autenticacion no termino de responder. Recarga esta pagina antes de intentar otro ingreso.';
  if (['LOGIN_CANCELLED', 'LOGIN_AUTH_FAILED'].includes(error?.code)) return error.message;
  if (error?.code === 'LOGIN_TIMEOUT' && !error.autenticado) return 'La autenticacion no respondio a tiempo. Recarga el acceso e intenta nuevamente.';
  if (esFalloTemporal761(error) || error?.code === 'LOGIN_READ_FAILED') {
    return 'La cuenta se autentico, pero el servidor no permitio terminar la consulta de empleado o permisos. No se abrio el panel. Intenta de nuevo; no necesitas cambiar tu contrasena.';
  }
  if (error instanceof ErrorIngreso761) return error.message;
  return 'No se pudo completar el ingreso. Revisa la conexion e intenta nuevamente.';
}
