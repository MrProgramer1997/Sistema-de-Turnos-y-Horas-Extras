import test from 'node:test';
import assert from 'node:assert/strict';
import {buildModel,punctuality} from '../js/centro-control-metricas.js';

const fecha='2026-11-25',ahora='2026-11-25T18:00:00';
const ctx={
 employees:[
  {id:'a',cedula:'101',nombres:'Prueba',apellidos:'AYB',area:'Alimentos y Bebidas',centro_costos:'AYB'},
  {id:'b',cedula:'202',nombres:'Prueba',apellidos:'Chef',area:'',centro_costos:'DIRECCION ALIMENTOS Y BEBIDAS'},
  {id:'c',cedula:'303',nombres:'Otro',apellidos:'Departamento',area:'Mantenimiento'}],
 terminals:[
  {sn:'gate',alias:'Ingreso Portería',area_name:'Porteria'},
  {sn:'hy',alias:'Hy 19',area_name:'HOYO 19'},
  {sn:'adm',alias:'Administracion',area_name:'Bodega'},
  {sn:'other',alias:'Cuarto de Tacos',area_name:'Cuarto de Tacos'}],
 legacy:[
  {id:'l1',cedula:'101',fecha,area:'ALIMENTOS Y BEBIDAS',subarea:'Hoyo 19',hora_inicio:'08:00',hora_fin:'16:00',turno:'A'},
  {id:'l2',cedula:'303',fecha,area:'MANTENIMIENTO',subarea:'Hoyo 19',hora_inicio:'08:00',hora_fin:'16:00'}],
 chefPeople:[{id:'ch1',empleado_id:'b',documento:'202',tipo_personal:'fijo'}],
 chefCodes:[{codigo:'3',hora_inicio:'08:00',hora_fin:'16:00'}],
 chef:[{id:'ch-turn',cronograma_personal_id:'ch1',fecha,area_cocina:'Rialto',codigo_turno:'3',estado:'publicada'}]
};
const marks=[
 {biotime_id:1,emp_code:'101',punch_time:fecha+'T07:50:00',terminal_sn:'gate'},
 {biotime_id:2,emp_code:'101',punch_time:fecha+'T08:05:00',terminal_sn:'hy'},
 {biotime_id:3,emp_code:'202',punch_time:fecha+'T07:58:00',terminal_sn:'adm'},
 {biotime_id:4,emp_code:'303',punch_time:fecha+'T08:50:00',terminal_sn:'hy'}
];
test('la entrada de Porteria no determina la puntualidad AYB; otras areas quedan fuera',()=>{
 const model=buildModel(ctx,marks,ahora);
 const a=model.journeys.find(x=>x.code==='101'),c=model.journeys.find(x=>x.code==='303');
 assert.equal(a.status,'tarde');
 assert.equal(Math.trunc(a.delta),5);
 assert.equal(a.entry.point,'HOYO 19');
 assert.equal(c,undefined);
 assert.equal(model.events.some(x=>x.person.cedula==='303'),false);
});
test('Chef se lee desde su programacion, con entrada interna y porcentaje separado',()=>{
 const model=buildModel(ctx,marks,ahora);
 const c=model.journeys.find(x=>x.code==='202');
 assert.equal(c.status,'puntual');
 assert.equal(Math.trunc(c.delta),-2);
 const p=punctuality(model,{from:fecha,to:fecha});
 assert.equal(p.areas.reduce((n,x)=>n+x.late,0),1);
 assert.equal(p.areas.reduce((n,x)=>n+x.onTime,0),1);
});
test('una novedad Chef de descanso no se convierte en tardanza',()=>{
 const model=buildModel({...ctx,chef:[{...ctx.chef[0],codigo_turno:'D'}],chefCodes:[...ctx.chefCodes,{codigo:'D',hora_inicio:null,hora_fin:null}]},marks,ahora);
 assert.equal(model.journeys.find(j=>j.code==='202').status,'justificada');
});
test('Eventos usa el punto real de trabajo: Hoyo 19, no Portería',()=>{
 const model=buildModel({...ctx,legacy:[{...ctx.legacy[0],subarea:'Eventos'}]},marks,ahora);
 const j=model.journeys.find(j=>j.code==='101');
 assert.equal(j.status,'tarde');
 assert.equal(j.entry.point,'HOYO 19');
 assert.equal(Math.trunc(j.delta),5);
});

test('Evento en Rialto evalúa el biométrico Administración sin fijar sede',()=>{
 const r={...ctx.legacy[0],subarea:'Eventos'};
 const marks=[{biotime_id:10,emp_code:'101',punch_time:fecha+'T07:55:00',terminal_sn:'gate'},
  {biotime_id:11,emp_code:'101',punch_time:fecha+'T08:03:00',terminal_sn:'adm'}];
 const model=buildModel({...ctx,legacy:[r]},marks,ahora);
 const j=model.journeys.find(j=>j.code==='101');
 assert.equal(j.entry.point,'Bodega');
 assert.equal(j.status,'tarde');
 assert.equal(Math.trunc(j.delta),3);
});

test('Evento sin entrada interna conserva estado por revisar; Portería no valida puntualidad',()=>{
 const r={...ctx.legacy[0],subarea:'Eventos'};
 const gateOnly=marks.filter(m=>m.emp_code==='101'&&m.terminal_sn==='gate');
 const withGate=buildModel({...ctx,legacy:[r]},gateOnly,ahora);
 assert.equal(withGate.journeys.find(j=>j.code==='101').status,'sin_entrada');
 const without=buildModel({...ctx,legacy:[r]},[],ahora);
 assert.equal(without.journeys.find(j=>j.code==='101').status,'sin_marca');
});

test('Otras subáreas desconocidas siguen sin punto validado',()=>{
 const model=buildModel({...ctx,legacy:[{...ctx.legacy[0],subarea:'Steward'}]},marks,ahora);
 assert.equal(model.journeys.find(j=>j.code==='101').status,'sin_punto');
});

test('solo Porteria: no se atribuye tardanza laboral',()=>{
 const model=buildModel(ctx,marks.filter(x=>x.emp_code==='101'&&x.terminal_sn==='gate'),ahora);
 const a=model.journeys.find(x=>x.code==='101');
 assert.equal(a.status,'sin_entrada');
 assert.equal(a.entry,null);
});
test('si falta marcacion no se inventa llegada tarde',()=>{
 const model=buildModel(ctx,[],ahora);
 assert.equal(model.journeys.find(x=>x.code==='101').status,'sin_marca');
 assert.equal(model.journeys.find(x=>x.code==='202').status,'sin_marca');
});
test('marcacion AYB en dia no programado conserva evidencia sin clasificar tardanza',()=>{
 const day='2026-11-26';
 const data=[...marks,{biotime_id:20,emp_code:'101',punch_time:day+'T08:10:00',terminal_sn:'hy'}];
 const model=buildModel(ctx,data,day+'T18:00:00');
 assert.equal(model.journeys.find(x=>x.code==='101'&&x.date===day).status,'sin_programacion');
});
