import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function importBrowserModule(relativePath) {
  const source = await readFile(new URL(relativePath, import.meta.url), 'utf8');
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}

const control = await importBrowserModule('../js/nomina-control-pendientes.js');
const integridad = await importBrowserModule('../js/nomina-integridad-v748.js');
const {
  AREAS_PRINCIPALES,
  codigoAreaPrincipal,
  coincideAreaConsulta,
  registroAreaPrincipal
} = control;
const {
  esConflictoCerradoV748,
  esEstadoCerradoV748,
  rutaRechazoV748
} = integridad;

test('solo expone las ocho areas principales vigentes', () => {
  assert.deepEqual(
    AREAS_PRINCIPALES.map(area => area.codigo),
    [
      'ADMINISTRATIVO',
      'ALIMENTOS_BEBIDAS',
      'EVENTOS_SERVICIOS',
      'INFRAESTRUCTURA',
      'MANTENIMIENTO',
      'MERCADEO_COMUNICACIONES',
      'OPERACIONES',
      'SERVICIOS_DEPORTIVOS'
    ]
  );
});

test('agrupa subareas sin perder el grupo principal explicito', () => {
  assert.equal(codigoAreaPrincipal('Cocina caliente'), 'ALIMENTOS_BEBIDAS');
  assert.equal(codigoAreaPrincipal('Dirección Deportes'), 'SERVICIOS_DEPORTIVOS');
  assert.equal(codigoAreaPrincipal('Oficios Varios'), 'OPERACIONES');
  assert.equal(
    registroAreaPrincipal({ grupo_codigo: 'OPERACIONES', proceso_nombre: 'Tenis' }).codigo,
    'OPERACIONES'
  );
});

test('filtra por grupo principal y conserva compatibilidad con valores exactos', () => {
  const row = {
    grupo_codigo: 'SERVICIOS_DEPORTIVOS',
    proceso_nombre: 'Tenis Cancheros',
    area_consulta: 'Tenis Cancheros'
  };
  assert.equal(coincideAreaConsulta(row, 'SERVICIOS_DEPORTIVOS'), true);
  assert.equal(coincideAreaConsulta(row, 'Servicios Deportivos'), true);
  assert.equal(coincideAreaConsulta(row, 'OPERACIONES'), false);
  assert.equal(coincideAreaConsulta(row, 'Tenis Cancheros'), true);
});

test('un estado cerrado siempre dirige a correccion auditada', () => {
  assert.equal(esEstadoCerradoV748('Aprobado'), true);
  assert.equal(rutaRechazoV748('pendiente', 'aprobado'), 'revisar');
  assert.equal(rutaRechazoV748('pendiente', 'pendiente'), 'rechazar');
  assert.equal(rutaRechazoV748('pendiente', 'otro'), 'actualizar');
});

test('detecta el conflicto de revision cerrada sin confundir otros errores', () => {
  assert.equal(
    esConflictoCerradoV748({ code: 'P0001', message: 'La revision ya esta cerrada con estado aprobado' }),
    true
  );
  assert.equal(
    esConflictoCerradoV748({ code: '42501', message: 'Perfil no autorizado' }),
    false
  );
});

test('no reemplaza el builder RPC del cliente Supabase', async () => {
  const source = await readFile(new URL('../js/nomina-integridad-v748.js', import.meta.url), 'utf8');
  assert.equal(/supabase\.rpc\s*=/.test(source), false);
});
