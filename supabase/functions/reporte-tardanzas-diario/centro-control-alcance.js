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
  const chef = (contexto.chef || []).filter(r => {const p=personasChef.get(r.cronograma_personal_id);return !cancelado(r) && p && !p.externo_id && !/extern|extra|eventual/.test(normal(p.tipo_personal).toLowerCase());});
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
    chefPeople: (contexto.chefPeople || []).filter(p => !p.externo_id && !/extern|extra|eventual/.test(normal(p.tipo_personal).toLowerCase()) && autorizados.has(documento(empleadosPorId.get(p.empleado_id)?.cedula || p.documento))),
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
// Eventos es un tipo de servicio, NO una sede fisica ni un terminal fijo.
// Solo para la subarea exacta Evento(s), el primer registro en cualquier
// biometrico interno AYB/Chef autorizado determina el punto de ingreso.
export const esServicioUbicacionVariable = subarea => /^(EVENTO|EVENTOS)$/.test(normal(subarea));
export function equipoEsperado(subarea='') {
  const s=normal(subarea);
  if(!s)return null;
  if(/TENIS/.test(s))return 'TENIS';
  if(/PISCINA/.test(s))return 'PISCINA';
  if(/HOYO 19|BAR DEPORTIVO|HELADERIA|CAFE|SAMANES|CARRO BAR/.test(s))return 'HY 19';
  if(/RIALTO|PORCIONAMIENTO|FRIA/.test(s))return 'ADMINISTRACION';
  // Steward y otras zonas sin correspondencia requieren revisión explícita.
  return null;
}
export function puntoValidoParaTurno(evento,subarea='') {
  if(!esMarcacionPuntoTrabajo(evento))return false;
  if(esServicioUbicacionVariable(subarea))return true;
  const esperado=equipoEsperado(subarea);
  if(!esperado)return false;
  return normal(evento.alias||evento.terminal_alias)===esperado;
}
export function esMarcacionPuntoTrabajo(evento) {
  const equipo = normal(evento?.alias || evento?.terminal_alias);
  const punto = normal(evento?.point || evento?.area_alias);
  if (/PORTERIA|PORTER|INGRESO GENERAL|SALIDA GENERAL/.test(`${equipo} ${punto}`)) return false;
  // Solo los cuatro dispositivos operativos confirmados para A&B/Chef.
  // El alias del dispositivo prevalece sobre el texto libre del área.
  if (equipo) return EQUIPOS_AYB_CHEF.has(equipo);
  return ['HOYO 19', 'BODEGA', 'TENIS', 'PISCINA'].includes(punto);
}

/* Primer/último registro en el punto de trabajo.
 * No se considera Portería como entrada/salida laboral. Si falta
 * programación, se muestran marcas internas como referencia, SIN liquidar horas.
 */
function esMismoEquipo(a,b){
  const as=texto(a?.terminal_sn),bs=texto(b?.terminal_sn);
  if(as&&bs)return as===bs;
  const aliasA=normal(a?.alias||a?.terminal_alias);
  const aliasB=normal(b?.alias||b?.terminal_alias);
  return Boolean(aliasA&&aliasB&&aliasA===aliasB);
}
export function extremosDePunto(jornada={},eventos=[]){
  const variable=esServicioUbicacionVariable(jornada.subarea);
  const esperado=equipoEsperado(jornada.subarea)||(variable?'PUNTO_DE_MARCACION':null);
  const esSinTurno=jornada.status==='sin_programacion';
  // En Eventos la sede se obtiene de la ENTRADA real y las demás
  // marcas laborales solo se emparejan en ese mismo dispositivo.
  // Sin entrada confirmada no se inventa un punto ni horas trabajadas.
  const validos=eventos.filter(e=>
      variable?(Boolean(jornada.entry)&&esMarcacionPuntoTrabajo(e)&&esMismoEquipo(e,jornada.entry)):
      esperado?puntoValidoParaTurno(e,jornada.subarea):
      esSinTurno&&esMarcacionPuntoTrabajo(e))
    .slice().sort((a,b)=>a.t-b.t);
  const primera=esperado&&jornada.entry
    ?jornada.entry
    :validos.find(e=>e.direction!=='out')||null;
  const ultima=primera?[...validos].reverse().find(e=>e.t>primera.t)||null:null;
  return {primera,ultima,esperado,referencia:!esperado&&esSinTurno,
    variable,marcasPunto:validos};
}
