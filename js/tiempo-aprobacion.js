// Presentation boundary only. Database and ERP quantities remain numeric hours.
export function textoMinutos728(value) {
  if (value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) || Number(value) < 0) return '\u2014';
  const n = Math.round(Number(value));
  return `${Math.floor(n / 60)} h ${String(n % 60).padStart(2, '0')} min`;
}
export function textoHoras728(value) {
  return value === null || value === undefined || value === '' ? '\u2014' : textoMinutos728(Number(value) * 60);
}
export function leerMinutos728(value, {allowZero = false} = {}) {
  const s = String(value ?? '').trim().toLowerCase();
  let h = 0, m = 0, match;
  if ((match = /^(\d{1,2}):([0-5]\d)$/.exec(s))) { h = +match[1]; m = +match[2]; }
  else if ((match = /^(\d{1,2})\s*(?:h|hora|horas)(?:\s*(\d{1,2})\s*(?:min|minuto|minutos))?$/.exec(s))) { h = +match[1]; m = +(match[2] || 0); }
  else if ((match = /^(\d{1,2})\s*(?:min|minuto|minutos)$/.exec(s))) { m = +match[1]; }
  else throw new Error('Escribe horas y minutos, por ejemplo 1 h 26 min o 01:26. No uses decimales.');
  const total = h * 60 + m;
  if (m > 59 || !Number.isSafeInteger(total) || total < (allowZero ? 0 : 1) || total > 1440) throw new Error('Indica de 0 a 23 horas y de 0 a 59 minutos, o 24 h 00 min. El tiempo a aprobar debe ser mayor que cero.');
  return total;
}
export const horasDesdeTexto728 = (value, options) => Math.round(leerMinutos728(value, options) / 60 * 100) / 100;
// In legacy prompt dialogs a failed parse must not become a numeric approval.
export function horasTextoONaN728(value, options) { try { return horasDesdeTexto728(value, options); } catch { return NaN; } }
export function enlazarTiempo728(input, output) {
  if (!input || !output) return;
  const render = () => { try { output.textContent = textoMinutos728(leerMinutos728(input.value)); } catch { output.textContent = ''; } };
  input.addEventListener('input', render); render();
}
