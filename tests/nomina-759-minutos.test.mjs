import test from 'node:test';
import assert from 'node:assert/strict';
import { leerMinutos728, horasDesdeTexto728, textoHoras728 } from '../js/tiempo-aprobacion.js';

test('2.06 h se presenta como 2 h 04 min y se valida por 124 minutos', () => {
  assert.equal(textoHoras728(2.06), '2 h 04 min');
  assert.equal(leerMinutos728('2 h 04 min'), 124);
  assert.equal(Math.round(2.06 * 60), 124);
  assert.equal(horasDesdeTexto728('2 h 04 min'), 2.07);
});

test('la validacion por minutos no permite superar el minuto visible', () => {
  const max = Math.round(2.06 * 60);
  assert.equal(leerMinutos728('2 h 04 min') <= max, true);
  assert.equal(leerMinutos728('2 h 05 min') <= max, false);
});
