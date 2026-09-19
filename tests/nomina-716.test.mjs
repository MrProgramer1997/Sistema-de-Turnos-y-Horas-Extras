import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validarBloqueNomina,leerBloquesNomina,leerEvidenciasNomina,prepararCortePorTramos,cargarFuentesNomina,leerPaginas,diasEntre} from '../js/nomina-carga.js';
const desde='2026-08-23',hasta='2026-09-19';
const timeout=()=>({code:'57014',message:'canceling statement due to statement timeout'});
const marca=(fecha,cedula='1')=>({fecha,cedula,total_marcaciones:2,recorrido:[{id:1},{id:2}]});
const block=(fuente,a,b,filas=[])=>({version:'716',fuente,desde:a,hasta:b,completa:true,total:filas.length,filas});
const respond=async(n,p)=>({data:block(p.p_fuente,p.p_desde,p.p_hasta,diasEntre(p.p_desde,p.p_hasta).map(d=>marca(d)))});
const evidencia=items=>({data:{total:items.length,jornadas:items.map(i=>({...i,completo:true,recorrido:[]}))}});
const prep=async(a,b)=>({desde:a,hasta:b,insertados:1,actualizados:2,cobertura:[],sin_aprobar:true});

test('Bloque con 1500 jornadas no usa paginacion ni count',async()=>{
 let calls=0;const result=await leerBloquesNomina(async(n,p,o)=>{
  calls++;assert.equal(n,'consultar_fuente_nomina_v716');assert.equal(o.read,true);assert.equal(o.range,undefined);assert.equal(o.count,undefined);
  return {data:block('marcas',desde,desde,Array.from({length:1500},(_,i)=>marca(desde,String(i))))};
 },{fuente:'marcas',desde,hasta:desde});assert.equal(calls,1);assert.equal(result.length,1500);
});
for(const patch of [{total:1},{completa:false},{version:'715'},{fuente:'ayb'},{desde:'2026-08-24'},{hasta:'2026-08-24'},{filas:null}])test('Bloque invalido: '+JSON.stringify(patch),()=>{
 assert.throws(()=>validarBloqueNomina({...block('marcas',desde,desde),...patch},'marcas',desde,desde));
});
for(const fila of [marca('2026-08-22'),marca(desde,''),marca('2026-08-23T00:00:00')])test('Fila no pertenece al bloque: '+JSON.stringify(fila),()=>{
 assert.throws(()=>validarBloqueNomina(block('marcas',desde,desde,[fila]),'marcas',desde,desde));
});
test('Corte de 28 dias completo y sin repeticion en cuatro bloques',async()=>{
 const calls=[];const r=await leerBloquesNomina(async(n,p,o)=>{calls.push(p);return respond(n,p,o);},{fuente:'marcas',desde,hasta});
 assert.equal(calls.length,4);assert.deepEqual(r.map(x=>x.jornada.fecha),diasEntre(desde,hasta));
});
test('Timeout confirmado divide solo el bloque de lectura y conserva todos los dias',async()=>{
 const calls=[];const r=await leerBloquesNomina(async(n,p,o)=>{
  calls.push(p);return diasEntre(p.p_desde,p.p_hasta).length>2?{error:timeout()}:respond(n,p,o);
 },{fuente:'ayb',desde,hasta});
 assert.deepEqual(r.map(x=>x.jornada.fecha),diasEntre(desde,hasta));assert.equal(new Set(r.map(x=>x.jornada.fecha)).size,28);assert.ok(calls.length>4);
});
test('Un dia que sigue fallando no se considera carga vacia exitosa',async()=>{
 let calls=0;await assert.rejects(leerBloquesNomina(async()=>{calls++;return {error:timeout()};},{fuente:'ayb',desde,hasta:desde}),e=>e.code==='57014'&&e.fuenteNomina.includes('ayb'));assert.equal(calls,1);
});
for(const error of [{code:'42501',message:'denied'},new DOMException('cancelled','AbortError'),{code:'NETWORK',message:'network error'}])test('No dividir ni repetir errores no confirmados '+error.code,async()=>{
 let calls=0;await assert.rejects(leerBloquesNomina(async()=>{calls++;throw error;},{fuente:'marcas',desde,hasta}));assert.equal(calls,1);
});
test('Cancelar antes de cargar no hace peticiones',async()=>{
 const ac=new AbortController();ac.abort();let calls=0;
 await assert.rejects(leerBloquesNomina(async()=>{calls++;},{fuente:'general',desde,hasta,signal:ac.signal}),{name:'AbortError'});assert.equal(calls,0);
});
test('No acepta respuesta llegada despues de cancelar',async()=>{
 const ac=new AbortController();await assert.rejects(leerBloquesNomina(async(n,p)=>{ac.abort();return respond(n,p);},{fuente:'general',desde,hasta,signal:ac.signal}),{name:'AbortError'});
});
test('Bloques lentos reducen ancho restante sin recortar el corte',async()=>{
 let t=0;const lens=[];const r=await leerBloquesNomina(async(n,p)=>{lens.push(diasEntre(p.p_desde,p.p_hasta).length);t+=5000;return respond(n,p);},{fuente:'ayb',desde,hasta,clock:()=>t});assert.deepEqual(lens.slice(0,3),[7,3,1]);assert.equal(r.length,28);
});
test('Evidencia se deduplica y ordena antes de lotes de 80',async()=>{
 const rs=Array.from({length:205},(_,i)=>({cedula:String(i),fecha:'2026-09-10'}));const sizes=[];
 const out=await leerEvidenciasNomina(async(n,p,o)=>{assert.equal(n,'consultar_evidencia_nomina_v716');assert.equal(o.read,true);sizes.push(p.p_items.length);return evidencia(p.p_items);},[...rs,rs[0]]);
 assert.deepEqual(sizes,[80,80,45]);assert.equal(out.size,205);
});
test('Evidencia timeout se divide y se recupera sin filas omitidas',async()=>{
 const rs=Array.from({length:90},(_,i)=>({cedula:String(i),fecha:desde}));
 const out=await leerEvidenciasNomina(async(n,p)=>p.p_items.length>20?{error:timeout()}:evidencia(p.p_items),rs);assert.equal(out.size,90);
});
for(const change of [d=>({...d,total:99}),d=>({...d,jornadas:[d.jornadas[0],d.jornadas[0]]}),d=>({...d,jornadas:d.jornadas.map(x=>({...x,completo:false}))}),d=>({...d,jornadas:d.jornadas.map(x=>({...x,cedula:'otra'}))})])test('Evidencia parcial o incorrecta bloquea la lectura',async()=>{
 await assert.rejects(leerEvidenciasNomina(async(n,p)=>({data:change(evidencia(p.p_items).data)}),[{cedula:'1',fecha:desde},{cedula:'2',fecha:desde}]));
});
test('Preparacion usa los mismos generadores, cuatro transacciones y ninguna decision',async()=>{
 const calls=[];const r=await prepararCortePorTramos(async(a,b)=>{calls.push([a,b]);return prep(a,b);},desde,hasta);
 assert.equal(calls.length,4);assert.equal(r.insertados,4);assert.equal(r.actualizados,8);assert.equal(r.sin_aprobar,true);
});
test('Preparacion con timeout NO se reintenta ni se divide tras el error',async()=>{
 let calls=0;await assert.rejects(prepararCortePorTramos(async(a,b)=>{calls++;if(calls===2)throw timeout();return prep(a,b);},desde,hasta),e=>e.operacionesCompletadas===1);assert.equal(calls,2);
});
test('Preparacion con acuse incompleto no habilita decisiones',async()=>{
 await assert.rejects(prepararCortePorTramos(async(a,b)=>({...await prep(a,b),sin_aprobar:false}),desde,hasta));
});
test('Preparacion cancelada no envia nuevos bloques',async()=>{
 let calls=0;const ac=new AbortController();await assert.rejects(prepararCortePorTramos(async(a,b)=>{calls++;ac.abort();return prep(a,b);},desde,hasta,{signal:ac.signal}),{name:'AbortError'});assert.equal(calls,1);
});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
test('Todas las fuentes y extras comparten un maximo de dos lecturas',async()=>{
 let running=0,max=0;const wrap=async(fn)=>{running++;max=Math.max(max,running);await sleep(1);try{return fn();}finally{running--;}};
 const r=await cargarFuentesNomina({desde,hasta,request:(n,p)=>wrap(()=>n==='consultar_empleados_nomina_v4'?{data:[{empleado:{cedula:'1'}}],count:1}:n==='extra'?{data:[]}:({data:block(p.p_fuente,p.p_desde,p.p_hasta,diasEntre(p.p_desde,p.p_hasta).map(d=>marca(d)))})),readReviews:()=>wrap(()=>[]),extras:[{key:'extra_calendario',run:(request,signal)=>request('extra',{}, {signal})}]});
 assert.equal(max,2);assert.equal(r.marcas.length,28);assert.equal(r.ayb.length,28);assert.equal(r.inferidos.length,28);assert.equal(r.extra_calendario.length,1);
 assert.ok(r.diagnostico.fuentes.every(f=>f.estado==='completa'));
});
test('Error en una fuente no retorna las otras como corte completo',async()=>{
 await assert.rejects(cargarFuentesNomina({desde,hasta,request:async(n,p)=>n==='consultar_empleados_nomina_v4'?{data:[],count:0}:p.p_fuente==='general'?{error:timeout()}:{data:block(p.p_fuente,p.p_desde,p.p_hasta)},readReviews:async()=>[]}));
});
test('No permite mas de dos fuentes simultaneas',async()=>{
 await assert.rejects(cargarFuentesNomina({desde,hasta,concurrency:3}));
});
test('Sin recortar fechas de corte de mes o de ano',()=>{
 assert.equal(diasEntre('2026-12-25','2027-01-07').length,14);assert.throws(()=>diasEntre('2026-02-30','2026-03-01'));
});
test('La paginacion restante detecta topes de API menores y no pierde registros',async()=>{
 const all=Array.from({length:1100},(_,i)=>({id:i}));const r=await leerPaginas(async(n,p,o)=>({data:all.slice(o.range[0],o.range[0]+500)}),{nombre:'reviews'});assert.equal(r.length,1100);
});
test('La pantalla no contiene indicadores retirados ni etiqueta Aprobacion diaria',async()=>{
 const page=await readFile(new URL('../pages/horas-extras.html',import.meta.url),'utf8');
 assert.ok(page.includes('Aprobaci\u00f3n del corte'));assert.ok(page.includes('versi\u00f3n 7.19'));
 assert.doesNotMatch(page,/nd-resumen|heKpiRegistros|heKpiPendientes|heKpiHoras|heKpiAprobados|heAyudaDiaria|Aprobaci\u00f3n diaria/);
 assert.match(page,/<details id="heOpcionesTecnicas" class="nd-avanzadas">/);
 assert.equal((page.match(/data-he-vista=/g)||[]).length,3);
});
test('Main conserva decisiones y controles de integridad, no referencia KPI retirados',async()=>{
 const js=await readFile(new URL('../js/horas-extras.js',import.meta.url),'utf8');
 assert.doesNotMatch(js,/heKpiRegistros|heKpiPendientes|heKpiHoras|heKpiAprobados|heAyudaDiaria/);
 for(const v of ['verificarIntegridadMarcaciones','completarDescansosNomina','heLecturaValida','crearVisorComentariosNomina','pedirDecisionNomina'])assert.ok(js.includes(v));
 assert.match(js,/'Aprobacion del corte'/);
});
