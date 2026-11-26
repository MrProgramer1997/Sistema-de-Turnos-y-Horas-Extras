import test from 'node:test';
import assert from 'node:assert/strict';
import {limitarAybChef,esMarcacionPuntoTrabajo,puntoValidoParaTurno,equipoEsperado} from '../js/centro-control-alcance.js';

const employee=(id,cedula,area)=>({id,cedula,area,nombres:id});
test('solo programacion AYB y Chef; no incluye otras areas',()=>{
 const ctx={
  employees:[employee('a','101','ALIMENTOS Y BEBIDAS'),employee('b','202','COCINA'),employee('c','303','MANTENIMIENTO')],
  legacy:[{cedula:'101',fecha:'2026-11-24',area:'ALIMENTOS Y BEBIDAS',subarea:'Hoyo 19'},{cedula:'303',fecha:'2026-11-24',area:'MANTENIMIENTO'}],
  chefPeople:[{id:'p2',empleado_id:'b',documento:'202',tipo_personal:'fijo'}],
  chef:[{cronograma_personal_id:'p2',fecha:'2026-11-24',codigo_turno:'3'}],
  general:[{empleado_id:'c',fecha:'2026-11-24'}],
  requests:[{empleado_id:'c'},{empleado_id:'b'}]
 };
 const marks=[{emp_code:'101'},{emp_code:'202'},{emp_code:'303'}];
 const out=limitarAybChef(ctx,marks);
 assert.deepEqual(out.ctx.employees.map(e=>e.id),['a','b']);
 assert.equal(out.ctx.legacy.length,1);
 assert.equal(out.ctx.chef.length,1);
 assert.equal(out.ctx.general.length,0);
 assert.deepEqual(out.marcaciones.map(e=>e.emp_code),['101','202']);
 assert.equal(out.ctx.requests.length,1);
});
test('Porteria y dispositivos ajenos no determinan llegada',()=>{
 assert.equal(esMarcacionPuntoTrabajo({alias:'Ingreso Portería',point:'Porteria'}),false);
 assert.equal(esMarcacionPuntoTrabajo({alias:'Salida Porteria',point:'Porteria'}),false);
 assert.equal(esMarcacionPuntoTrabajo({alias:'Cuarto de Tacos'}),false);
 assert.equal(puntoValidoParaTurno({alias:'Hy 19'},'Hoyo 19'),true);
 assert.equal(puntoValidoParaTurno({alias:'Piscina'},'Hoyo 19'),false);
 assert.equal(puntoValidoParaTurno({alias:'Administracion'},'Rialto'),true);
 assert.equal(puntoValidoParaTurno({alias:'Tenis'},'Tenis'),true);
 assert.equal(equipoEsperado('Eventos'),null);
});
test('no inventa un punto para subareas sin correspondencia validada',()=>{
 assert.equal(puntoValidoParaTurno({alias:'Administracion'},'Eventos'),false);
 assert.equal(puntoValidoParaTurno({alias:'Hy 19'},''),false);
});
