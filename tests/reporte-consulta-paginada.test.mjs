import test from 'node:test';
import assert from 'node:assert/strict';
import {consultarPaginado,documentosProgramados} from '../supabase/functions/reporte-tardanzas-diario/consulta-paginada.js';

test('PostgREST usa limit/offset explicitos, avanza las paginas y no duplica',async()=>{
 const input=[{biotime_id:1},{biotime_id:2},{biotime_id:3},{biotime_id:4},{biotime_id:5}];
 const requests=[];
 const fake=async(url,opts)=>{
   const u=new URL(url),offset=Number(u.searchParams.get('offset')),limit=Number(u.searchParams.get('limit'));
   requests.push({offset,limit,order:u.searchParams.get('order'),filter:u.searchParams.get('emp_code'),headers:opts.headers});
   return {ok:true,status:200,json:async()=>input.slice(offset,offset+limit)};
 };
 const rows=await consultarPaginado({baseUrl:'https://example.supabase.co',serviceKey:'fake-secret',table:'biotime_marcaciones',
   select:'biotime_id',filters:[['emp_code','in','(101,202)']],pageSize:2,max:20,fetchFn:fake});
 assert.deepEqual(rows,input);
 assert.deepEqual(requests.map(x=>x.offset),[0,2,4]);
 assert.deepEqual(requests.map(x=>x.limit),[2,2,2]);
 assert.ok(requests.every(x=>x.order==='biotime_id.asc'&&x.filter==='in.(101,202)'));
 assert.equal(requests[0].headers.Range,undefined);
});
test('una pagina repetida es rechazada antes de enviar correo',async()=>{
 const fake=async()=>({ok:true,status:200,json:async()=>[{id:1},{id:2}]});
 await assert.rejects(consultarPaginado({baseUrl:'https://example.supabase.co',serviceKey:'test',
   table:'empleados',select:'id',max:10,pageSize:2,fetchFn:fake}),/duplicada/i);
});
test('una respuesta incompleta o un tope no genera un informe parcial',async()=>{
 const fake=async(_url)=>({ok:true,status:200,json:async()=>[{id:1},{id:2}]});
 await assert.rejects(consultarPaginado({baseUrl:'https://example.supabase.co',serviceKey:'test',
   table:'empleados',select:'id',max:2,pageSize:2,fetchFn:fake}),/Límite de protección/i);
});
test('se consultan exclusivamente documentos de turnos AYB y Chef fijo',()=>{
 const legacy=[
  {cedula:'101',area:'ALIMENTOS Y BEBIDAS'},
  {cedula:'303',area:'MANTENIMIENTO'}];
 const employees=[{id:'e2',cedula:'202'},{id:'e3',cedula:'404'}];
 const chefPeople=[
  {id:'cp1',empleado_id:'e2',tipo_personal:'fijo'},
  {id:'cp2',empleado_id:'e3',tipo_personal:'externo',externo_id:'ext1'}
 ];
 const chef=[
  {cronograma_personal_id:'cp1',estado:'publicada'},
  {cronograma_personal_id:'cp2',estado:'publicada'},
  {cronograma_personal_id:'cp1',estado:'cancelado'}
 ];
 assert.deepEqual(documentosProgramados(legacy,chef,chefPeople,employees),['101','202']);
});
