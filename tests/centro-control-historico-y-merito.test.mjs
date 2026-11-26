import test from 'node:test';
import assert from 'node:assert/strict';
import {dividirHistorico,unirContextos,unirMarcaciones} from '../js/centro-control-historico.js';
import {dates,buildModel,rankingMerito} from '../js/centro-control-metricas.js';
import {extremosDePunto,equipoEsperado} from '../js/centro-control-alcance.js';

test('el histórico desde 23/08 hasta 26/11 no tiene límite de 62 días',()=>{
  const ranges=dividirHistorico('2026-08-22','2026-11-27',28);
  assert.equal(ranges[0].from,'2026-08-22');
  assert.equal(ranges.at(-1).to,'2026-11-27');
  assert.equal(ranges.length,4);
  for(let i=1;i<ranges.length;i++){
    const previous=new Date(ranges[i-1].to+'T00:00:00Z');
    previous.setUTCDate(previous.getUTCDate()+1);
    assert.equal(ranges[i].from,previous.toISOString().slice(0,10));
  }
  assert.equal(dates('2026-08-23','2026-11-26').length,96);
});
test('contextos de varios bloques no duplican empleados, turnos ni novedades',()=>{
  const base={scope:['*'],employees:[{id:'e1',cedula:'1'}],legacy:[{id:'t1',fecha:'2026-08-23'}],
    chef:[{id:'ch1',fecha:'2026-09-01'}],requests:[{id:'r1',fecha_inicio:'2026-08-20',fecha_fin:'2026-09-10'}]};
  const merged=unirContextos([base,{...base,legacy:[{id:'t2',fecha:'2026-09-01'}],chef:[{id:'ch1',fecha:'2026-09-01'}]}]);
  assert.equal(merged.employees.length,1);
  assert.equal(merged.legacy.length,2);
  assert.equal(merged.chef.length,1);
  assert.equal(merged.requests.length,1);
  assert.throws(()=>unirContextos([base,{scope:['OTRA']}]),/permisos/i);
});
test('bloques de marcaciones no admiten pérdida ni duplicación de ID',()=>{
  const blockA={rows:[{biotime_id:1},{biotime_id:2}],total:2};
  const blockB={rows:[{biotime_id:3}],total:1};
  assert.equal(unirMarcaciones([blockA,blockB]).total,3);
  assert.throws(()=>unirMarcaciones([blockA,{rows:[{biotime_id:2}],total:1}]),/repetida/i);
  assert.throws(()=>unirMarcaciones([blockA,{rows:[],total:1}]),/incompleto/i);
});
test('marca a las 18:02 en Portería no reemplaza salida laboral de las 17:46',()=>{
  const fecha='2026-11-25',j={subarea:'Rialto',status:'tarde'};
  const eventos=[
    {t:1,clock:'09:58',alias:'Salida Porteria',point:'Porteria',direction:'out'},
    {t:2,clock:'10:10',alias:'Administracion',point:'Bodega',direction:'unknown'},
    {t:3,clock:'17:46',alias:'Administracion',point:'Bodega',direction:'unknown'},
    {t:4,clock:'18:02',alias:'Salida Porteria',point:'Porteria',direction:'out'}
  ];
  assert.equal(equipoEsperado('Rialto'),'ADMINISTRACION');
  const r=extremosDePunto(j,eventos);
  assert.equal(r.primera.clock,'10:10');
  assert.equal(r.ultima.clock,'17:46');
  assert.equal(r.ultima.point,'Bodega');
  const sinTurno=extremosDePunto({status:'sin_programacion'},eventos);
  assert.equal(sinTurno.primera.clock,'10:10');
  assert.equal(sinTurno.ultima.clock,'17:46');
  assert.equal(sinTurno.referencia,true);
});
test('ranking 1 al último: mérito exige asistencia verificable, no premia un solo día',()=>{
  const employees=[
    {id:'a',cedula:'11',nombres:'Ana',apellidos:'Puntual',area:'Alimentos y Bebidas'},
    {id:'b',cedula:'22',nombres:'Beto',apellidos:'Tardanza',area:'Alimentos y Bebidas'},
    {id:'c',cedula:'33',nombres:'Cata',apellidos:'Sin Marca',area:'Alimentos y Bebidas'}
  ];
  const legacy=[],marks=[];
  for(let i=1;i<=5;i++){
    const fecha=`2026-11-${String(i).padStart(2,'0')}`;
    for(const [num,code] of [['11','a'],['22','b'],['33','c']]){
      legacy.push({id:code+i,cedula:num,fecha,area:'ALIMENTOS Y BEBIDAS',subarea:'Hoyo 19',turno:'A',hora_inicio:'08:00',hora_fin:'16:00'});
    }
    marks.push({biotime_id:10+i,emp_code:'11',punch_time:fecha+'T07:59:00',terminal_sn:'hy'});
    marks.push({biotime_id:30+i,emp_code:'22',punch_time:fecha+(i<=2?'T08:05:00':'T07:59:00'),terminal_sn:'hy'});
  }
  const model=buildModel({employees,legacy,terminals:[{sn:'hy',alias:'Hy 19',area_name:'HOYO 19'}]},marks,'2026-11-06T18:00:00');
  const ranked=rankingMerito(model,{from:'2026-11-01',to:'2026-11-05'});
  assert.deepEqual(ranked.map(x=>x.cedula),['11','22','33']);
  assert.deepEqual(ranked.map(x=>x.posicion),[1,2,3]);
  assert.equal(ranked[0].merito,true);
  assert.equal(ranked[0].minutes,0);
  assert.equal(ranked[1].minutes,10);
  assert.equal(ranked[1].merito,false);
  assert.equal(ranked[2].pendientes,5);
  assert.equal(ranked[2].verificado,false);
});

test('ranking: 100% de puntualidad verificada antecede a alguien con llegadas tarde, aunque tenga pendientes',()=>{
 const d=fecha=>`2026-11-${String(fecha).padStart(2,'0')}`;
 const person=(cedula,name)=>({cedula,name,areaLabel:'Alimentos y Bebidas',external:false,known:true});
 const p100=person('D','Daniela'),p80=person('L','Lisneidy'),p2=person('N','Poca muestra');
 const journeys=[];
 const add=(p,n,status,delta=0)=>{
   journeys.push({code:p.cedula,person:p,date:d(n),status,start:8*60,end:16*60,
     delta,source:'Programación A&B',entry:status==='puntual'||status==='tarde'?{clock:'08:00'}:null});
 };
 // Daniela: 16 de 16 comparables puntuales + dos días sin marca que requieren revisión.
 for(let n=1;n<=16;n++)add(p100,n,'puntual');
 add(p100,17,'sin_marca');add(p100,18,'sin_marca');
 // Lisneidy: 12 puntuales y 3 tardanzas sin pendientes; antes aparecía adelante.
 for(let n=1;n<=12;n++)add(p80,n,'puntual');
 for(let n=13;n<=15;n++)add(p80,n,'tarde',n-10);
 // Un solo par de jornadas puntuales no cumple la muestra mínima.
 add(p2,1,'puntual');add(p2,2,'puntual');
 const result=rankingMerito({journeys,today:'2026-11-26'},{
   from:'2026-11-01',to:'2026-11-26'});
 assert.deepEqual(result.map(e=>e.cedula),['D','L','N']);
 assert.equal(result[0].puntual,100);
 assert.equal(result[0].pendientes,2);
 assert.equal(result[0].merito,false); // No se otorga reconocimiento hasta revisar las dos marcas.
 assert.equal(result[1].puntual,80);
 assert.equal(result[1].pendientes,0);
 assert.equal(result[2].baseSuficiente,false);
});
