import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {agruparCruces719,aplicarCruces719,tramosCandidatos719,candidatosDeJornada719,agregarSugerencias719,usaRevision719,sentidoPuerta719} from '../js/nomina-candidatos.js';
import {modeloNomina} from '../js/nomina-neto.js';
import {minutoCivil} from '../js/revision-evidencia.js';
import {accionesConceptoDiario} from '../js/nomina-aprobacion-diaria.js';
const T=s=>minutoCivil(s);
const cedula='TEST719';
const ev=(id,hora,terminal='Administracion',punto='Bodega')=>({id,hora,terminal_alias:terminal,punto});
const mark=(fecha,events,extra={})=>({cedula,fecha,empleado:'Persona de prueba',area:'Auditoria',turno:'AUD_T2',hora_inicio:'13:30',hora_fin:'21:00',minutos_descanso:30,programacion_tipo:'inferida_alta',recorrido:events,total_marcaciones:events.length,...extra});
const gates=(day,entry,exit)=>[ev(1,day+'T'+entry,'Ingreso Porteria','Porteria'),ev(2,day+'T'+entry),ev(3,day+'T'+exit),ev(4,day+'T'+exit,'Salida Porteria','Porteria')];
const rows=()=>[
 mark('2026-09-18',[ev(14149,'2026-09-18T12:36:51','Ingreso Porteria','Porteria'),ev(14154,'2026-09-18T12:40:05')]),
 mark('2026-09-19',[ev(14554,'2026-09-19T00:17:29'),ev(14556,'2026-09-19T00:24:38','Salida Porteria','Porteria'),ev(15051,'2026-09-19T15:04:33','Ingreso Porteria','Porteria'),ev(15055,'2026-09-19T15:07:46')],{hora_inicio:'15:00'})
];
const args=(exit='2026-09-18T23:00:00')=>({entrada:T('2026-09-18T13:30:00'),salida:T(exit),inicio:T('2026-09-18T13:30:00'),fin:T('2026-09-18T21:00:00')});
const byCode=xs=>new Map(xs.map(x=>[x.codigo,x]));
const approx=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);

test('Midnight exit belongs to prior entry day; later entry remains alone',()=>{
 const raw=rows(),snapshot=JSON.stringify(raw),r=agruparCruces719(raw);
 assert.equal(r.total,6);assert.equal(r.cruces.length,1);
 assert.deepEqual(r.porDia.get(cedula+'|2026-09-18').map(x=>x.id),[14149,14154,14554,14556]);
 assert.deepEqual(r.porDia.get(cedula+'|2026-09-19').map(x=>x.id),[15051,15055]);
 const exit=r.porDia.get(cedula+'|2026-09-18')[2];assert.equal(exit.hora,'2026-09-19T00:17:29');assert.equal(exit.fecha_marcacion,'2026-09-19');assert.equal(exit.fecha_jornada,'2026-09-18');
 assert.equal(JSON.stringify(raw),snapshot);
});
test('Net 18th uses exit next morning; 19th no false 14:20',()=>{
 const raw=rows(),joined=aplicarCruces719(raw,raw),a=modeloNomina(joined[0]),b=modeloNomina(joined[1]);
 approx(a.entrada,T('2026-09-18T12:40:05'));approx(a.salida,T('2026-09-19T00:17:29'));approx(a.neto,667.4);
 approx(b.entrada,T('2026-09-19T15:07:46'));assert.equal(b.salida,null);assert.equal(b.neto,null);
 assert.equal(joined[1].agrupacion_719.fecha_calendario_total,4);
 assert.equal(joined[0].evidencia_revision.total_marcaciones,4);
});
test('Cut ending on 18th reads 19th as margin without adding new display day',()=>{
 const raw=rows(),joined=aplicarCruces719([raw[0]],raw);assert.equal(joined.length,1);assert.equal(joined[0].fecha,'2026-09-18');approx(modeloNomina(joined[0]).salida,T('2026-09-19T00:17:29'));
});
test('Cut starting on 19th excludes exit assigned to 18th using preceding margin',()=>{
 const raw=rows(),joined=aplicarCruces719([raw[1]],raw);assert.equal(joined.length,1);assert.equal(joined[0].total_marcaciones,2);assert.equal(modeloNomina(joined[0]).salida,null);
});
test('A&B and Chef rows are unchanged including source object identity',()=>{
 const raw=rows();for(const origin of ['ayb','chef']){const protectedRows=raw.map(r=>({...r,origen:origin}));const joined=aplicarCruces719(protectedRows,raw);joined.forEach((r,i)=>assert.equal(r,protectedRows[i]));assert.equal(candidatosDeJornada719(protectedRows[0]).length,0);}
});
test('No prior gate entry means no invented midnight reassignment',()=>{const raw=rows();raw[0].recorrido.shift();const g=agruparCruces719(raw);assert.equal(g.cruces.length,0);assert.equal(g.porDia.get(cedula+'|2026-09-19').length,4);});
test('No exit gate means midnight remains an unresolved case',()=>{const raw=rows();raw[1].recorrido=raw[1].recorrido.filter(x=>x.id!==14556);assert.equal(agruparCruces719(raw).cruces.length,0);});
test('Multiple internal points do not merge into one observed visit',()=>{const raw=rows();raw[1].recorrido[0].punto='Otro punto';assert.equal(agruparCruces719(raw).cruces.length,0);});
test('Exit beyond six AM requires manual association',()=>{const raw=rows();raw[1].recorrido[1].hora='2026-09-19T06:00:00';assert.equal(agruparCruces719(raw).cruces.length,0);});
test('Longer than 16h is not guessed as a complete visit',()=>{const raw=rows();raw[0].recorrido[0].hora='2026-09-18T06:00:00';assert.equal(agruparCruces719(raw).cruces.length,0);});
test('Duplicate RPC events deduplicate by ID without loss',()=>{const raw=rows();const g=agruparCruces719([...raw,...structuredClone(raw)]);assert.equal(g.total,6);});
test('An ID with changed timestamp fails instead of mixing snapshots',()=>{const raw=rows(),other=structuredClone(raw[0]);other.recorrido[0].hora='2026-09-18T12:36:52';assert.throws(()=>agruparCruces719([...raw,other]),/cambio/);});
test('Same-day raw events keep original grouping',()=>{const raw=[mark('2026-09-16',gates('2026-09-16','13:30:25','21:37:45'))];assert.equal(aplicarCruces719(raw,raw)[0],raw[0]);});
test('Two employees cannot exchange exits with same biometric IDs',()=>{const raw=rows(),other=raw.map(r=>({...r,cedula:'OTHER'}));const g=agruparCruces719([...raw,...other]);assert.equal(g.total,12);assert.equal(g.cruces.length,2);});
test('Configured gate labels determine direction, not internal terminal labels',()=>{assert.equal(sentidoPuerta719(ev(1,'','Salida Porteria','Porteria')),'salida');assert.equal(sentidoPuerta719(ev(1,'','Ingreso Porteria','Porteria')),'ingreso');assert.equal(sentidoPuerta719(ev(1,'','Salida Cocina','Cocina')),'');});
test('Recargo and overtime appear simultaneously without shared minutes',()=>{const r=byCode(tramosCandidatos719(args()));approx(r.get('P005').minutos,120);approx(r.get('P004').minutos,120);assert.equal(r.get('P005').tramos[0].fin,r.get('P004').tramos[0].inicio);});
for(const [exit,extra] of [['21:25:00',false],['21:25:01',true],['21:25:23',true],['21:12:04',false]])test('25 minute candidate threshold with real seconds '+exit,()=>{const r=byCode(tramosCandidatos719(args('2026-09-18T'+exit)));assert.equal(r.has('P004'),extra);if(extra)approx(r.get('P004').minutos,T('2026-09-18T'+exit)-T('2026-09-18T21:00:00'));});
test('Overtime midnight extension sums both dates under the initiating review',()=>{const r=byCode(tramosCandidatos719(args('2026-09-19T00:17:29')));approx(r.get('P004').minutos,197+29/60);assert.equal(r.get('P004').tramos.length,2);assert.equal(r.get('P004').tramos[1].fecha,'2026-09-19');});
test('Day and night overtime split at 19:00 without replacing ordinary night',()=>{const a=args('2026-09-18T20:30:00');a.fin=T('2026-09-18T18:00:00');const r=byCode(tramosCandidatos719(a));approx(r.get('P003').minutos,60);approx(r.get('P004').minutos,90);assert.equal(r.has('P005'),false);});
test('Sunday base and night surcharge stay separate from special overtime',()=>{const a={entrada:T('2026-09-20T17:00:00'),salida:T('2026-09-20T23:00:00'),inicio:T('2026-09-20T17:00:00'),fin:T('2026-09-20T21:00:00')};const r=byCode(tramosCandidatos719(a));approx(r.get('P006').minutos,240);approx(r.get('P100').minutos,120);approx(r.get('P009').minutos,120);});
test('Holiday uses holiday base and special codes, not ordinary overtime',()=>{const a=args();a.festivos=new Set(['2026-09-18']);const r=byCode(tramosCandidatos719(a));assert.ok(r.has('P007')&&r.has('P100')&&r.has('P009'));assert.equal(r.has('P004'),false);});
test('Midnight into Sunday reclassifies only the actual Sunday segment',()=>{const a={entrada:T('2026-09-19T13:30:00'),salida:T('2026-09-20T00:45:00'),inicio:T('2026-09-19T13:30:00'),fin:T('2026-09-19T21:00:00')};const r=byCode(tramosCandidatos719(a));approx(r.get('P004').minutos,180);approx(r.get('P009').minutos,45);});
test('No payroll candidates created for missing or reversed endpoints',()=>{for(const a of [{...args(),salida:null},{...args(),salida:args().entrada},{...args(),fin:null}])assert.deepEqual(tramosCandidatos719(a),[]);});
test('Suggested shift, not official scheduling, produces visible independent candidates',()=>{const r=mark('2026-09-16',gates('2026-09-16','13:30:25','21:37:45'));const c=candidatosDeJornada719(r);assert.deepEqual(c.map(x=>x.concepto_codigo),['P004','P005']);for(const x of c){assert.equal(x.sugerencia_719,true);assert.equal(x.horas_aprobadas,null);assert.equal(x.estado,'pendiente');assert.equal(usaRevision719(x),true);} });
test('No known schedule keeps both night possibilities unquantified',()=>{const r=mark('2026-09-16',gates('2026-09-16','13:30:25','21:37:45'),{hora_inicio:null,hora_fin:null,turno:null,programacion_tipo:'Sin programacion'});const c=candidatosDeJornada719(r);assert.equal(c.length,2);c.forEach(x=>assert.equal(x.detalle.calculo_pendiente,true));});
test('Multiple point movements do not become automatically quantifiable',()=>{const r=mark('2026-09-16',[...gates('2026-09-16','13:30:25','21:37:45'),ev(5,'2026-09-16T17:00:00')]);candidatosDeJornada719(r).forEach(x=>assert.equal(x.detalle.calculo_pendiente,true));});
test('Existing recargo never suppresses new extra; no existing record changes',()=>{const row=mark('2026-09-16',gates('2026-09-16','13:30:25','21:37:45'));for(const estado of ['pendiente','aprobado','rechazado']){const saved={cedula,fecha:row.fecha,concepto_codigo:'P005',revision_id:'saved',estado};const all=agregarSugerencias719([saved],[row]);assert.equal(all.length,2);assert.equal(all[0],saved);assert.equal(all[1].concepto_codigo,'P004');assert.equal(all.filter(x=>x.estado==='aprobado').length,estado==='aprobado'?1:0);}});
test('Existing closed extra is not regenerated under another synthetic ID',()=>{const row=mark('2026-09-16',gates('2026-09-16','13:30:25','21:37:45'));const saved=['P004','P005'].map(c=>({cedula,fecha:row.fecha,concepto_codigo:c,estado:'rechazado'}));assert.deepEqual(agregarSugerencias719(saved,[row]),saved);});
test('Open today suggestions stay visible but approval is disabled',()=>{const c={revision_id:'suggestion',estado:'pendiente',permite_revision:true};const a=accionesConceptoDiario(c,{disponible:true,abierta:true});assert.equal(a.mostrarDecision,true);assert.equal(a.aprobar,false);});
test('17th keeps surcharge but no extra because only twelve post-turn minutes',()=>{const row=mark('2026-09-17',gates('2026-09-17','13:20:45','21:12:04'));assert.deepEqual(candidatosDeJornada719(row).map(x=>x.concepto_codigo),['P005']);});
test('19th new entry has no nocturnal candidate imported from prior exit',()=>{const raw=rows(),joined=aplicarCruces719(raw,raw);assert.equal(candidatosDeJornada719(joined[1]).length,0);assert.equal(candidatosDeJornada719(joined[0]).length,2);});
test('New modal is on demand and uses read preview / write decision RPCs',async()=>{const s=await readFile(new URL('../js/nomina-revision-sugerida.js',import.meta.url),'utf8');assert.ok(s.includes('previsualizar_sugerencia_nomina_v719'));assert.ok(s.includes('resolver_sugerencia_nomina_v719'));assert.ok(s.includes('p_confirmado:confirmed'));assert.ok(s.includes('p_huella:context.huella'));assert.ok(s.includes('Comentario ${action'));assert.ok(!s.includes('setInterval'));});
test('Only application version changes in page; no new page panels or buttons',async()=>{const after=await readFile(new URL('../pages/horas-extras.html',import.meta.url),'utf8');assert.equal(createHash('sha256').update(after.replaceAll('719','717').replaceAll('7.19','7.17')).digest('hex'),'ea283f038388a8fe74d8ecf99c93ada96329783ce76987f2d0198a1b0e119fc5');});
