/* Alcance de lectura del Centro de Control: exclusivamente A&B y Chef.
 * No modifica tablas, marcaciones ni la programación original.
 */
const texto = v => String(v ?? '').trim();
const normal = v => texto(v).toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
const documento = v => texto(v).replace(/[ .-]/g, '');
const cancelado = r => /CANCEL|RECHAZ|BORRADOR/.test(normal(r?.estado));
export function esProgramacionAyb(r) {
  return /^(ALIMENTOS Y BEBIDAS|AYB|A&B)(\b|$)/.test(normal(r?.area));
}
export function limitarAybChef(contexto = {}, marcaciones = []) {
  const empleadosPorId = new Map((contexto.employees || []).map(e => [e.id, e]));
  const personasChef = new Map((contexto.chefPeople || []).map(p => [p.id, p]));
  const ayb = (contexto.legacy || []).filter(esProgramacionAyb);
  const chef = (contexto.chef || []).filter(r => !cancelado(r) && personasChef.has(r.cronograma_personal_id));
  const codigoChef = r => {
    const p = personasChef.get(r.cronograma_personal_id);
    return documento(empleadosPorId.get(p?.empleado_id)?.cedula || p?.documento);
  };
  const autorizados = new Set([
    ...ayb.map(r => documento(r.cedula)),
    ...chef.map(codigoChef)
  ].filter(Boolean));
  const empleadoAutorizado = r => autorizados.has(documento(r.cedula || empleadosPorId.get(r.empleado_id)?.cedula));
  const empleados = (contexto.employees || []).filter(empleadoAutorizado);
  const ids = new Set(empleados.map(e => e.id));
  const porCodigo = r => autorizados.has(documento(r.documento || r.emp_code));
  const ctx = {
    ...contexto,
    employees: empleados,
    legacy: ayb.filter(empleadoAutorizado),
    chef: chef.filter(r => autorizados.has(codigoChef(r))),
    general: [], // Programación general de otras áreas NO entra en puntualidad.
    chefPeople: (contexto.chefPeople || []).filter(p => autorizados.has(documento(empleadosPorId.get(p.empleado_id)?.cedula || p.documento))),
    links: (contexto.links || []).filter(l => ids.has(l.empleado_id)),
    externals: (contexto.externals || []).filter(porCodigo),
    extraQueue: (contexto.extraQueue || []).filter(porCodigo),
    requests: (contexto.requests || []).filter(empleadoAutorizado),
    notices: (contexto.notices || []).filter(empleadoAutorizado),
    appliedNotices: (contexto.appliedNotices || []).filter(empleadoAutorizado)
  };
  return {ctx, marcaciones: marcaciones.filter(m => autorizados.has(documento(m.emp_code))), codigos: autorizados};
}
const EQUIPOS_AYB_CHEF = new Set(['HY 19', 'ADMINISTRACION', 'TENIS', 'PISCINA']);
export function esMarcacionPuntoTrabajo(evento) {
  const equipo = normal(evento?.alias || evento?.terminal_alias);
  const punto = normal(evento?.point || evento?.area_alias);
  if (/PORTERIA|PORTER|INGRESO GENERAL|SALIDA GENERAL/.test(`${equipo} ${punto}`)) return false;
  // Solo los cuatro dispositivos operativos confirmados para A&B/Chef.
  // El alias del dispositivo prevalece sobre el texto libre del área.
  if (equipo) return EQUIPOS_AYB_CHEF.has(equipo);
  return ['HOYO 19', 'BODEGA', 'TENIS', 'PISCINA'].includes(punto);
}
