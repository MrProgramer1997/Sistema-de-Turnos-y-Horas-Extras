import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluarProgramacion,avisoProgramacionFaltante} from '../supabase/functions/reporte-tardanzas-diario/alerta-programacion.js';

const fecha='2026-11-25';
const records={
 employees:[{id:'e2',cedula:'202'}],
 chefPeople:[{id:'cp2',empleado_id:'e2',documento:'202',tipo_personal:'planta'}],
};
const ayb=[{fecha,cedula:'101',area:'ALIMENTOS Y BEBIDAS'}];
const chef=[{fecha,cronograma_personal_id:'cp2',estado:'publicada'}];

test('sin programación AYB ni Chef, se emite aviso claro sin falso cero tardanzas',()=>{
 const status=evaluarProgramacion({legacy:[],chef:[]},fecha);
 assert.deepEqual(status.faltan,['AYB','Chef']);
 assert.equal(status.completa,false);
 assert.deepEqual(status.empleados,{AYB:0,Chef:0});
 const mail=avisoProgramacionFaltante(status,fecha);
 assert.match(mail.subject,/ALERTA.*AYB y Programación Chef.*25\/11\/2026/);
 assert.match(mail.html,/No fue posible generar el informe consolidado de llegadas tarde/);
 assert.match(mail.html,/No se generó un listado de tardanzas/);
 assert.match(mail.html,/Esta alerta NO significa que nadie haya llegado tarde/);
 assert.ok(!mail.html.includes('0 tardanzas'));
 assert.ok(!mail.html.includes('Sin retrasos'));
});

test('si solo falta AYB, avisar reporte incompleto sin mostrar tardanzas de Chef',()=>{
 const status=evaluarProgramacion({...records,legacy:[],chef},fecha);
 assert.deepEqual(status.faltan,['AYB']);
 assert.deepEqual(status.empleados,{AYB:0,Chef:1});
 const mail=avisoProgramacionFaltante(status,fecha);
 assert.match(mail.subject,/Programación incompleta \(AYB\)/);
 assert.match(mail.html,/1 empleado\(s\) con programación registrada/);
 assert.ok(!mail.html.includes('0 tardanzas'));
});

test('si solo falta Chef, identificar la fuente concreta',()=>{
 const status=evaluarProgramacion({...records,legacy:ayb,chef:[]},fecha);
 assert.deepEqual(status.faltan,['Chef']);
 assert.deepEqual(status.empleados,{AYB:1,Chef:0});
 assert.match(avisoProgramacionFaltante(status,fecha).subject,/Programación Chef/);
});

test('con programación en ambas fuentes no se envía alerta',()=>{
 const status=evaluarProgramacion({...records,legacy:ayb,chef},fecha);
 assert.equal(status.completa,true);
 assert.deepEqual(status.faltan,[]);
 assert.throws(()=>avisoProgramacionFaltante(status,fecha),/Solo se puede emitir alerta/);
});

test('no cuentan personal Chef externo, cancelado ni otras áreas',()=>{
 const bad={
   ...records,
   legacy:[{fecha,cedula:'313',area:'MANTENIMIENTO'}],
   chefPeople:[...records.chefPeople,{id:'cpExt',documento:'999',tipo_personal:'externo',externo_id:'ext'}],
   chef:[{fecha,cronograma_personal_id:'cpExt',estado:'publicada'},
     {fecha,cronograma_personal_id:'cp2',estado:'cancelado'}]
 };
 const result=evaluarProgramacion(bad,fecha);
 assert.deepEqual(result.faltan,['AYB','Chef']);
});

test('las programaciones históricas de otra fecha no suprimen el aviso',()=>{
 const result=evaluarProgramacion({...records,legacy:[{...ayb[0],fecha:'2026-11-22'}],
   chef:[{...chef[0],fecha:'2026-11-22'}]},fecha);
 assert.equal(result.completa,false);
 assert.deepEqual(result.faltan,['AYB','Chef']);
});
