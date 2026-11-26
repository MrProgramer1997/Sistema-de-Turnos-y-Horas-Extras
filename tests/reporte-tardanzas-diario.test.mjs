import test from 'node:test';
import assert from 'node:assert/strict';
import {informeDelDia,correoHTML} from '../supabase/functions/reporte-tardanzas-diario/resumen.js';

const d='2026-11-22';
const ctx={
 employees:[
  {id:'e1',cedula:'101',nombres:'Persona',apellidos:'AYB'},
  {id:'e2',cedula:'202',nombres:'Persona',apellidos:'Chef'},
  {id:'e3',cedula:'303',nombres:'Persona',apellidos:'Mantenimiento'}
 ],
 legacy:[
  {id:'t1',cedula:'101',area:'ALIMENTOS Y BEBIDAS',fecha:d,subarea:'Hoyo 19',hora_inicio:'08:00',hora_fin:'16:00'},
  {id:'t2',cedula:'303',area:'MANTENIMIENTO',fecha:d,subarea:'Hoyo 19',hora_inicio:'08:00',hora_fin:'16:00'}
 ],
 chefPeople:[{id:'cp1',empleado_id:'e2',documento:'202',tipo_personal:'fijo'}],
 chefCodes:[{codigo:'A',hora_inicio:'10:00',hora_fin:'18:00'}],
 chef:[{id:'c1',cronograma_personal_id:'cp1',fecha:d,area_cocina:'Rialto',codigo_turno:'A'}],
 terminals:[
   {sn:'pt',alias:'Ingreso Porteria',area_name:'Porteria'},
   {sn:'hy',alias:'Hy 19',area_name:'HOYO 19'},
   {sn:'adm',alias:'Administracion',area_name:'Bodega'}
 ]
};
const marks=[
 {biotime_id:1,emp_code:'101',punch_time:d+'T07:50:00',terminal_sn:'pt'},
 {biotime_id:2,emp_code:'101',punch_time:d+'T08:05:00',terminal_sn:'hy'},
 {biotime_id:3,emp_code:'101',punch_time:d+'T16:00:00',terminal_sn:'hy'},
 {biotime_id:4,emp_code:'202',punch_time:d+'T09:58:00',terminal_sn:'adm'},
 {biotime_id:5,emp_code:'303',punch_time:d+'T08:15:00',terminal_sn:'hy'}
];
test('usa mismo motor de puntualidad: Portería no evita tardanza y otras áreas no salen',()=>{
 const p=informeDelDia(ctx,marks,d,d+'T22:00:00');
 assert.equal(p.turnos,2);
 assert.equal(p.tardanzas,1);
 assert.equal(p.minutos,5);
 assert.equal(p.comparables,2);
 assert.equal(p.filas[0].nombre,'Persona AYB');
 assert.equal(p.filas[0].entrada,'08:05');
 assert.equal(p.filas[0].punto,'HOYO 19');
});
test('las novedades justificadas no generan tardanza ni datos médicos',()=>{
 const x={...ctx,legacy:[{...ctx.legacy[0],novedad_codigo:'INC',hora_inicio:null,hora_fin:null}]};
 const p=informeDelDia(x,marks,d,d+'T22:00:00');
 assert.equal(p.tardanzas,0);
 assert.equal(p.novedades,1);
 const html=correoHTML(p);
 assert.ok(html.includes('No se detectaron tardanzas verificadas'));
 assert.ok(!html.includes('Persona AYB'));
});
test('escapar nombres en HTML previene inyección en correo',()=>{
 const bad={...ctx,employees:[{...ctx.employees[0],nombres:'<script>alert(1)</script>'},...ctx.employees.slice(1)]};
 const p=informeDelDia(bad,marks,d,d+'T22:00:00');
 const html=correoHTML(p);
 assert.ok(html.includes('&lt;script&gt;'));
 assert.ok(!html.includes('<script>'));
});
test('sin programación nunca se presenta falsamente como ausencia de tardanzas',()=>{
 const p=informeDelDia({...ctx,legacy:[],chef:[]},marks,d,d+'T22:00:00');
 assert.equal(p.turnos,0);
 assert.equal(p.tardanzas,0);
});

import {destinatariosPara,DESTINATARIO_PRUEBA,DESTINATARIOS_DIARIOS} from '../supabase/functions/reporte-tardanzas-diario/destinatarios.js';
test('la prueba solo puede enviarse al correo de Innovación',()=>{
 const testTo=destinatariosPara('test');
 assert.deepEqual(testTo,['analistainnovacion@campestrepereira.com']);
 assert.equal(testTo.length,1);
 assert.equal(testTo[0],DESTINATARIO_PRUEBA);
});
test('el informe diario se restringe exactamente a los cinco destinatarios definidos',()=>{
 const expected=[
   'analistainnovacion@campestrepereira.com','sistemas@campestrepereira.com',
   'directorayb@campestrepereira.com','maitre@campestrepereira.com',
   'dirbienestar@campestrepereira.com'
 ];
 assert.deepEqual(destinatariosPara('send'),expected);
 assert.deepEqual(DESTINATARIOS_DIARIOS,expected);
 assert.equal(new Set(expected).size,5);
 assert.throws(()=>destinatariosPara('preview'),/no permitido/i);
});
