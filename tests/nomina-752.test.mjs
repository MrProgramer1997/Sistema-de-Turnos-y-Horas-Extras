import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {resolverHorarioCodigo} from '../js/cocina-turnos-horario.js';
import {codigoAsignado} from '../js/cocina-planificacion-core.js';
import {modeloParaNomina721,conceptosAyB721,agregarCandidatosAyB721} from '../js/nomina-ayb-candidatos.js';

// Exercise the ACTUAL Chef date/code resolver without mounting its UI or client.
const chef=await readFile(new URL('../js/cocina-chef.js',import.meta.url),'utf8');
const constants=chef.slice(chef.indexOf('const TURNOS_CHEF_6_5H_NETAS'),chef.indexOf('let fechaBase'));
const functions=chef.slice(chef.indexOf('function obtenerCatalogoTurnosChefPorFecha('),chef.indexOf('function cargarOpcionesCodigoTurnoChef('));
function resolve({code='3',date='2026-09-18',holiday=false,snapshot=null,start='08:00:00',end='16:00:00',active=true,block=1}={}) {
 const context={Date,Number,String,resolverHorarioCodigo,codigoAsignado,
  codigos:[{codigo:code,hora_inicio:start,hora_fin:end,activo:active}],
  festivosSemanaChef:holiday?[{fecha:date}]:[],code,date,record:snapshot?{horario_asignado:snapshot}:null,block};
 return vm.runInNewContext(constants+functions+';obtenerCodigoTurnoChef(code,date,record,block)',context);
}
// Values independently returned by the deployed SQL pure resolver, 22 Oct 2026.
// No employee identifiers or payroll amounts are persisted in these fixtures.
const starts=['05:30','06:00','07:00','08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00'];
const shortEnds=['12:30','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00','21:00','22:00'];
const longEnds=['14:00','14:30','15:30','16:30','17:30','18:30','19:30','20:30','21:30','22:30','23:30'];
for(const day of [
 {label:'weekday',date:'2026-09-18',holiday:false,ends:shortEnds},
 {label:'Saturday',date:'2026-09-19',holiday:false,ends:longEnds},
 {label:'holiday',date:'2026-10-12',holiday:true,ends:longEnds}
]) for(let i=0;i<11;i++) test(`752 SQL/frontend parity: ${day.label}, code ${i+1}`,()=>{
 const r=resolve({code:String(i+1),...day});
 assert.equal(r.hora_inicio,starts[i]);assert.equal(r.hora_fin,day.ends[i]);
});
for(const date of ['2026-09-18','2026-09-19'])test(`752 individual hours prevail on ${date}`,()=>{
 const snapshot={version:1,inicio1:'09:15',fin1:'17:45',inicio2:null,fin2:null};
 const before=JSON.stringify(snapshot),r=resolve({date,snapshot});
 assert.equal(r.hora_inicio,'09:15');assert.equal(r.hora_fin,'17:45');assert.equal(JSON.stringify(snapshot),before);
});
test('752 snapshot explicit nulls do not fall back to second-block catalog',()=>{
 const r=resolve({block:2,snapshot:{version:1,inicio1:'09:15',fin1:'17:45',inicio2:null,fin2:null}});
 assert.equal(r.hora_inicio,null);assert.equal(r.hora_fin,null);
});
test('752 overnight standard number retains its custom catalog times',()=>{
 const r=resolve({code:'10',start:'18:00:00',end:'02:00:00'});
 assert.equal(r.hora_inicio,'18:00:00');assert.equal(r.hora_fin,'02:00:00');
});
test('752 nonstandard code retains its catalog hours',()=>{
 const r=resolve({code:'TE',start:'16:00:00',end:'18:00:00'});
 assert.equal(r.hora_inicio,'16:00:00');assert.equal(r.hora_fin,'18:00:00');
});
test('752 inactive unsaved code cannot fabricate a schedule',()=>{
 const r=resolve({active:false});assert.equal(r.hora_inicio,null);assert.equal(r.hora_fin,null);
});
function fixture(){
 const d='2026-09-18',schedule=resolve();
 return {cedula:'FIXTURE-752',fecha:d,area:'COCINA',grupo_codigo:'ALIMENTOS_BEBIDAS',
  programacion_tipo:'confirmada',tipo_registro:'turno',turno:'3',subarea:'Fria',
  hora_inicio:schedule.hora_inicio,hora_fin:schedule.hora_fin,minutos_descanso:30,horas_programadas_netas:6.5,
  total_marcaciones:4,recorrido:[
   {hora:d+'T06:34:56',punto:'Porteria'},
   {hora:d+'T06:51:47',punto:'Bodega'},
   {hora:d+'T17:30:41',punto:'Bodega'},
   {hora:d+'T17:35:16',punto:'Porteria'}]};
}
test('752 reported-day fixture compares real entry with 07:00, not 08:00',()=>{
 const m=modeloParaNomina721(fixture());assert.equal(Math.round(m.deltaEntrada*60),-493);
 assert.equal(m.netoProgramado,390);assert.equal(Math.round(m.neto*60),36534);
});
test('752 reported-day fixture measures excess after 14:00, not 16:00',()=>{
 const j=fixture(),before=JSON.stringify(j),m=modeloParaNomina721(j),c=conceptosAyB721(j);
 assert.equal(Math.round(m.deltaSalida*60),12641);assert.equal(c.length,1);
 assert.equal(c[0].codigo,'P003');assert.equal(Math.round(c[0].minutos*60),12641);
 assert.equal(JSON.stringify(j),before);
});
test('752 corrected reference never overwrites an existing approval',()=>{
 const j=fixture(),approved={...j,id:'fixture-approval',concepto_codigo:'P003',estado:'aprobado',horas_aprobadas:1.5};
 const before=JSON.stringify(approved),out=agregarCandidatosAyB721([approved],[j]);
 assert.equal(out.length,1);assert.equal(out[0],approved);assert.equal(JSON.stringify(approved),before);
});
test('752 deployment retains 749/750/751 import protections',async()=>{
 const html=await readFile(new URL('../pages/horas-extras.html',import.meta.url),'utf8');
 const map=JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;
 assert.equal(map['../js/nomina-autorizacion-manual.js?v=746'],'../js/nomina-autorizacion-manual.js?v=750');
 assert.equal(map['../js/revision-punto.js?v=713'],'../js/revision-punto.js?v=751');
 assert.equal(map['../js/nomina-control-pendientes.js?v=713'],'../js/nomina-control-pendientes.js?v=749');
 assert.match(html,/versi.n 7.52/);
});
