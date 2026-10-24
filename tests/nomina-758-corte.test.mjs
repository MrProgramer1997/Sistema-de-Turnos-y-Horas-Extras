import test from 'node:test';
import assert from 'node:assert/strict';
import { corteMensualNomina743 } from '../js/nomina-corte.js';

test('24 Oct 2026 abre el ultimo corte cerrado 16 Sep - 15 Oct', () => {
  assert.deepEqual(
    corteMensualNomina743(new Date('2026-10-24T12:00:00-05:00')),
    {desde:'2026-09-16',hasta:'2026-10-15'}
  );
});

test('antes del 16 conserva el corte cerrado anterior', () => {
  assert.deepEqual(
    corteMensualNomina743(new Date('2026-10-10T12:00:00-05:00')),
    {desde:'2026-08-16',hasta:'2026-09-15'}
  );
});

test('al iniciar un nuevo corte avanza automaticamente', () => {
  assert.deepEqual(
    corteMensualNomina743(new Date('2026-11-16T12:00:00-05:00')),
    {desde:'2026-10-16',hasta:'2026-11-15'}
  );
});

test('maneja correctamente el cambio de año', () => {
  assert.deepEqual(
    corteMensualNomina743(new Date('2027-01-10T12:00:00-05:00')),
    {desde:'2026-11-16',hasta:'2026-12-15'}
  );
});
