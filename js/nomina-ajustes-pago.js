// Payroll export policy confirmed by the responsible user, not a labor-law rule.
// It changes exported payment units, NEVER the approval or the attendance data.
const text = v => String(v ?? '').trim();
const finite = v => v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v);
export function minutosAprobados742(row = {}) {
  const hours = finite(row.horas_aprobadas ?? row.Horas);
  if (hours === null || hours < 0) return null;
  const exact = row.detalle?.aprobacion_manual_728?.minutos_netos_autorizados;
  // Corrections can leave older manual metadata; trust it only if it still
  // matches the CURRENT approved numeric value at the database precision.
  if (Number.isSafeInteger(exact) && exact >= 0 && Math.abs(hours - exact / 60) <= 0.005001) return exact;
  return Math.round(hours * 60);
}
export function pagoProsof742(row = {}) {
  const hours = finite(row.horas_aprobadas ?? row.Horas), minutes = minutosAprobados742(row);
  if (hours === null || minutes === null) return {minutosAprobados:null, minutosPago:null, horasPago:null, regla:'Sin aprobacion valida'};
  const full = Math.floor(minutes / 60), fraction = minutes % 60;
  const rule = fraction >= 50 ? '50-59 min: 1 hora para pago' : fraction >= 26 ? '26-49 min: media hora para pago' : '0-25 min: se conserva lo aprobado (regla no redefinida)';
  // The request did NOT authorize dropping approved fractions <=25 minutes.
  const paid = fraction >= 50 ? (full + 1) * 60 : fraction >= 26 ? full * 60 + 30 : minutes;
  return {minutosAprobados:minutes, minutosPago:paid,
    horasPago:fraction >= 26 ? paid / 60 : hours, regla:rule};
}
export const horasPagoProsof742 = row => pagoProsof742(row).horasPago;
export function estadoVisualConcepto742(row = {}) {
  const state = text(row.estado_revision ?? row.estado ?? 'pendiente').toLowerCase();
  if (state === 'aprobado') return {estado:state, clase:'nd-opcion-aprobada', fondo:'#B2FEE0', color:'#064e3b'};
  if (state === 'rechazado') return {estado:state, clase:'nd-opcion-rechazada', fondo:'#FDE8E7', color:'#8b1d16'};
  return {estado:state, clase:'nd-opcion-pendiente', fondo:'#FFF0D4', color:'#804000'};
}
export function textoAlimentacion742(m) {
  if (!m) return 'Alimentacion por verificar: no se supone un descanso ni se descuentan minutos del concepto a ciegas.';
  const format = v => v === null ? 'Por verificar' : `${Math.floor(v / 60)} h ${String(Math.floor(v % 60 + 1e-7)).padStart(2,'0')} min`;
  const gross = finite(m.brutos), lunch = finite(m.descuentoAplicado), net = finite(m.neto);
  if (gross !== null && lunch !== null && net !== null)
    return `${format(gross)} entre marcas - ${format(lunch)} de alimentacion = ${format(net)} netas de la jornada. La pausa ya esta descontada aqui; no se resta otra vez a cada extra.`;
  const configured = finite(m.pausa);
  return configured !== null
    ? `Alimentacion configurada: ${format(configured)}. Falta un intervalo verificable para calcular el neto. El tiempo que autorices manualmente debe ser neto.`
    : 'Alimentacion por confirmar para esta jornada. No se inventa una pausa; el tiempo que autorices manualmente debe ser neto.';
}
// Repair only an identifiable legacy GROSS-based daytime candidate. No shift
// inference, night reallocation, A&B/Chef engine change or persisted write.
export function presentarExtraNeta742(x, m) {
  if (!x || !m || m.protegidoAyB || !['P003','P008'].includes(x.concepto_codigo) ||
      ['aprobado','rechazado'].includes(text(x.estado_revision ?? x.estado)) ||
      m.b2 || !m.b1 || !m.comparable || m.p?.novedad_codigo || m.p?.conflicto_programacion) return x;
  const gross = finite(m.brutos), net = finite(m.neto), planned = finite(m.netoProgramado),
    pause = finite(m.descuentoAplicado), old = finite(x.horas_calculadas), declared = finite(x.detalle?.horas_reales);
  if ([gross,net,planned,pause,old,declared].some(v=>v===null) || pause <= 0 ||
      Math.abs(declared * 60 - gross) > 1) return x;
  const limit = Math.max(0, net - planned);
  if (old * 60 <= limit + 0.61) return x;
  const next = Math.round(limit / 60 * 100) / 100;
  return {...x, horas_calculadas:next, horas_candidatas:next,
    detalle:{...x.detalle, ajuste_almuerzo_742:{
      horas_calculadas_originales:x.detalle?.ajuste_almuerzo_742?.horas_calculadas_originales ?? old,
      bruto_minutos:gross, descanso_minutos:pause, neto_minutos:net, ordinarias_minutos:planned,
      referencia_extra_minutos:limit, criterio:'Candidato anterior bruto: comparacion neto laborado contra neto programado. No modifica aprobaciones.'}}};
}
