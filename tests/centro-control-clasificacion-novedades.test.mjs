import test from 'node:test';
import assert from 'node:assert/strict';
import {buildModel,punctuality,rankingMerito} from '../js/centro-control-metricas.js';
import {informeDelDia} from '../supabase/functions/reporte-tardanzas-diario/resumen.js';

const now='2026-11-27T12:00:00';
const area='ALIMENTOS Y BEBIDAS';
const empleados=[{id:'e1',cedula:'101',nombres:'Persona',apellidos:'Prueba',area}];
const nov=(fecha,codigo)=>({id:'nv'+fecha,cedula:'101',fecha,area,
  tipo_registro:'novedad',novedad_codigo:codigo,novedad_descripcion:codigo,
  turno:codigo,hora_inicio:null,hora_fin:null});
const ctx={employees:empleados,legacy:[
  nov('2026-11-17','VAC'),
  nov('2026-11-18','INC'),
  nov('2026-11-19','F'),
  nov('2026-11-20','ELECCION'),
  nov('2026-11-21','NNJ'),
  nov('2026-11-22','CITA')
],chef:[],chefPeople:[]};

test('Vacaciones, incapacidad y día de familia son justificadas; ELECCION y CITA no se equiparan a día completo',()=>{
 const model=buildModel(ctx,[],now);
 const statuses=Object.fromEntries(model.journeys.map(j=>[j.date,j.status]));
 assert.deepEqual(statuses,{
  '2026-11-17':'justificada',
  '2026-11-18':'justificada',
  '2026-11-19':'justificada',
  '2026-11-20':'novedad_no_comparable',
  '2026-11-21':'novedad_no_justificada',
  '2026-11-22':'novedad_no_comparable'
 });
 const p=punctuality(model,{from:'2026-11-17',to:'2026-11-22'});
 assert.equal(p.areas.length,1);
 assert.equal(p.areas[0].justified,3);
 assert.equal(p.areas[0].novedadesPorRevisar,3);
 assert.equal(p.areas[0].late,0);
 assert.equal(p.areas[0].comparable,0);
 assert.ok(model.notices.some(n=>n.type==='NNJ'&&n.label==='Novedad no justificada'));
});
test('una novedad NNJ no se convierte en falta laboral ni en tardanza por ausencia de marcas',()=>{
 const model=buildModel({employees:empleados,legacy:[nov('2026-11-22','NNJ')]},[],now);
 const j=model.journeys.find(x=>x.code==='101');
 assert.equal(j.status,'novedad_no_justificada');
 assert.equal(j.delta,null);
 assert.equal(j.entry,null);
 assert.equal(j.notices.length,1);
 assert.equal(model.journeys.some(x=>x.status==='tarde'||x.status==='sin_marca'),false);
});
test('aviso de correo distingue novedades no evaluables de las justificadas',()=>{
 const p=informeDelDia({employees:empleados,legacy:[nov('2026-11-22','ELECCION')]},[],
   '2026-11-22',now);
 assert.equal(p.turnos,1);
 assert.equal(p.novedades,0);
 assert.equal(p.pendientes,1);
 assert.equal(p.comparables,0);
 assert.equal(p.tardanzas,0);
});
test('una NNJ pendiente impide otorgar mérito aunque haya cinco jornadas puntuales',()=>{
 const legacy=[nov('2026-11-06','NNJ')],marks=[];
 for(let n=1;n<=5;n++){
   const fecha=`2026-11-${String(n).padStart(2,'0')}`;
   legacy.push({id:'t'+n,cedula:'101',fecha,area,subarea:'Hoyo 19',
      turno:'A',hora_inicio:'08:00',hora_fin:'16:00'});
   marks.push({biotime_id:100+n,emp_code:'101',punch_time:fecha+'T07:59:00',terminal_sn:'hy'});
 }
 const model=buildModel({employees:empleados,legacy,
    terminals:[{sn:'hy',alias:'Hy 19',area_name:'HOYO 19'}]},marks,now);
 const r=rankingMerito(model,{from:'2026-11-01',to:'2026-11-06'});
 assert.equal(r[0].comparable,5);
 assert.equal(r[0].onTime,5);
 assert.equal(r[0].puntual,100);
 assert.equal(r[0].pendientes,1);
 assert.equal(r[0].merito,false);
});
