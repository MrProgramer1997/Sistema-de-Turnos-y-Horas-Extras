import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {modeloRevision,calculadasCeldaRevision,programacionCelda} from '../js/revision-evidencia.js';
import {modeloParaNomina721,conceptosAyB721} from '../js/nomina-ayb-candidatos.js';
import {estadoHorario,diagnosticoHorarioHtml,revisarConcepto,construirCalendario} from '../js/nomina-calidad.js';
import {visibleEnBandeja749} from '../js/nomina-control-pendientes.js';
import {construirEvidenciasLocales721} from '../js/nomina-evidencia-local.js';
const f='2026-09-30';
function fixture(unknown=false){
 const x={cedula:'TEST753',fecha:f,area:'Bodega',grupo_codigo:'ALIMENTOS_BEBIDAS',origen:'ayb',turno:unknown?null:'BOD-C2',hora_inicio:unknown?null:'08:00',hora_fin:unknown?null:'17:00',minutos_descanso:30,descuento_almuerzo:0.5,horas_programadas_netas:unknown?null:8.5,programacion_tipo:unknown?'inferida_ambigua':'inferida_alta',horario_propuesto:true,bodega_753:{solo_propuesta:true,motivo:'Propuesta pendiente'},diagnostico_turno:'Propuesta pendiente',alternativas_turno:unknown?[{turno:'T1',inicio:'08:30',fin:'16:00'},{turno:'T2',inicio:'08:00',fin:'17:00'}]:[],total_marcaciones:4,recorrido:['07:57:25','08:01:14','18:00:32','18:04:03'].map((h,i)=>({id:i,hora:f+'T'+h,punto:i===0||i===3?'Porteria':'Bodega'}))};
 x.evidencia_revision=construirEvidenciasLocales721([x],[x],[x]).values().next().value;return x;
}
test('suggested schedule is not promoted to a confirmed assignment',()=>{const m=modeloRevision(fixture());assert.equal(m.sugerido,true);assert.equal(m.fuente,'Propuesta Bodega; confirmar horario');assert.equal(estadoHorario(fixture()),'alta');assert.match(programacionCelda(m),/Propuesta Bodega/);});
test('source diagnostics retain proposal origin',()=>assert.match(diagnosticoHorarioHtml(fixture()),/Propuesta pendiente/));
test('known rotation computes full post-shift reference, without gates',()=>{const cs=conceptosAyB721(fixture());assert.deepEqual(cs.map(c=>c.codigo),['P003']);assert.equal(Math.round(cs[0].minutos*60),3632);});
test('configured meal is deducted once, not again from extra',()=>{const m=modeloParaNomina721(fixture());assert.equal(Math.round(m.neto*60),34158);assert.equal(m.descuentoAplicado,30);});
test('ambiguous rotation has no invented start/end',()=>{const m=modeloRevision(fixture(true));assert.equal(m.b1,null);assert.equal(m.comparable,false);assert.equal(estadoHorario(fixture(true)),'por_confirmar');});
test('unknown candidate displays pending, not zero',()=>{const x={...fixture(true),concepto_codigo:'P003',estado:'pendiente',horas_calculadas:0,detalle:{bodega_753:{},calculo_pendiente:true}};assert.match(calculadasCeldaRevision(x),/Por confirmar/);assert.equal(visibleEnBandeja749(x),true);});
test('known sub-26 reference remains filtered',()=>assert.equal(visibleEnBandeja749({concepto_codigo:'P003',estado:'pendiente',horas_calculadas:0.25,detalle:{calculo_pendiente:false,tramos_sugeridos:[{inicio:0,fin:15}]}}),false));
test('approved decisions do not become proposed or filtered',()=>{const x={concepto_codigo:'P003',estado:'aprobado',horas_calculadas:0.25,horas_aprobadas:0.25,detalle:{bodega_753:{},calculo_pendiente:true}};assert.doesNotMatch(calculadasCeldaRevision(x),/Por confirmar/);assert.equal(visibleEnBandeja749(x),true);});
test('a proposal produces an explicit unconfirmed-shift warning',()=>{const x={...fixture(),concepto_codigo:'P003',horas_calculadas:1};const cal=construirCalendario({desde:f,hasta:f,festivos:[]});assert.ok(revisarConcepto(x,cal).avisos.some(x=>x.codigo==='extra_sin_turno'));});
test('official schedules keep their original label',()=>{const x=fixture();delete x.horario_propuesto;delete x.bodega_753;x.programacion_tipo='confirmada';x.evidencia_revision.horario=x;assert.equal(estadoHorario(x),'guardado');assert.equal(modeloRevision(x).sugerido,false);});
test('all warehouse alternatives are available, including the fourth rotation',()=>{const x=fixture(true);x.alternativas_turno=Array.from({length:4},(_,i)=>({turno:'T'+(i+1),inicio:'07:00',fin:'16:00'}));x.evidencia_revision.horario=x;assert.match(diagnosticoHorarioHtml(x),/T4/);});
test('release metadata is owned by page, never downgraded to 7.49',async()=>{const html=await readFile(new URL('../pages/horas-extras.html',import.meta.url),'utf8');assert.match(html,/versi.n 7.53/);const source=await readFile(new URL('../js/nomina-control-pendientes.js',import.meta.url),'utf8');assert.doesNotMatch(source,/version\.textContent\s*=/);const map=JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;assert.equal(map['../js/nomina-calidad.js?v=746'],'../js/nomina-calidad.js?v=753');assert.equal(map['../js/revision-evidencia.js?v=746'],'../js/revision-evidencia.js?v=753');});
