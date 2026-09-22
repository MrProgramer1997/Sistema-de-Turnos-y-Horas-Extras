// P006/P007 are proposed as NET minutes. Never deduct a pause from approved
// amounts or from an already-net input. Raw endpoints remain the evidence.
const text = v => String(v ?? '').trim();
const number = v => v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v);
export const esEspecialDescanso723 = x => ['P006', 'P007'].includes(text(x?.concepto_codigo || x?.codigo));

export function referenciaEspecial723(x, m) {
  if (!esEspecialDescanso723(x) || !m || m.b2 || m.p?.novedad_codigo ||
      m.p?.tipo_registro === 'novedad' || m.p?.conflicto_programacion || !m.seleccion?.completa) return null;
  const entrada = number(m.entrada), salida = number(m.salida), pausa = number(m.pausa);
  if (entrada === null || salida === null || salida <= entrada || salida - entrada > 1440 || pausa === null || pausa < 0) return null;
  const fecha = text(x.fecha || m.p?.fecha).slice(0, 10), dia = Date.parse(fecha + 'T00:00:00Z') / 60000;
  if (!Number.isFinite(dia)) return null;
  let a = entrada, b = salida, fuente = 'Intervalo observado';
  if (m.b1 && number(m.b1.start) !== null && number(m.b1.end) !== null) {
    a = Math.max(a, m.b1.start); b = Math.min(b, m.b1.end);
    fuente = 'Tramo ordinario del turno de referencia';
  }
  // No guessed placement of a meal across different civil dates or blocks.
  // Keep the existing manual-review route for those cases.
  if (a < dia || b > dia + 1440 || b <= a || pausa > b - a) return null;
  const brutos = b - a, neto = Math.max(0, brutos - pausa);
  return {brutos, descanso: pausa, neto, inicio: a, fin: b, fuente, descontado: true};
}

export function presentarEspecialNeto723(x, m) {
  if (!esEspecialDescanso723(x) || ['aprobado', 'rechazado'].includes(text(x.estado_revision || x.estado))) return x;
  const ref = referenciaEspecial723(x, m);
  if (!ref) return x;
  return {...x,
    horas_calculadas_guardadas_723: x.horas_calculadas_guardadas_723 ?? x.horas_calculadas,
    horas_calculadas: Math.round(ref.neto / 60 * 100) / 100,
    horas_candidatas: Math.round(ref.neto / 60 * 100) / 100,
    referencia_especial_723: ref,
    detalle: {...x.detalle, calculo_pendiente: false, descanso_especial_723: ref}
  };
}

export function textoDescansoEspecial723(ref) {
  if (!ref) return '';
  const hm = n => {const v = Math.floor(n + 1e-7); return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;};
  return `${hm(ref.brutos)} de referencia - ${hm(ref.descanso)} de almuerzo = ${hm(ref.neto)} netas. El descanso ya esta descontado.`;
}
