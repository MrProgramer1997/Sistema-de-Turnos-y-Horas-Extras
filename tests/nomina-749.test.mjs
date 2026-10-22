import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { esMenorUmbral749, minutosReferencia749, visibleEnBandeja749, coincideAreaConsulta } from '../js/nomina-control-pendientes.js';
import { esRevisionPersistida749, instalarNominaIntegridadV748 } from '../js/nomina-integridad-v748.js';

const row = (minutes, code = 'P100', state = 'pendiente') => ({
  cedula: 'TEST', fecha: '2026-10-11', concepto_codigo: code, estado: state,
  horas_calculadas: Math.round(minutes / 60 * 100) / 100,
  grupo_codigo: 'ALIMENTOS_BEBIDAS',
  detalle: { calculo_pendiente: false, tramos_sugeridos: [{ inicio: 1140, fin: 1140 + minutes }] }
});
for (const code of ['P003', 'P004', 'P005', 'P008', 'P009', 'P100']) {
  test(`${code}: 3/4/10/15/25/25:59 hidden; 26/30/60 visible, no subtraction`, () => {
    for (const minutes of [3, 3.75, 4, 10, 15, 25, 25 + 59 / 60]) {
      assert.equal(esMenorUmbral749(row(minutes, code)), true);
      assert.equal(coincideAreaConsulta(row(minutes, code), ''), false);
    }
    for (const minutes of [26, 30, 60, 65]) {
      const input = row(minutes, code), before = JSON.stringify(input);
      assert.equal(esMenorUmbral749(input), false);
      assert.equal(coincideAreaConsulta(input, 'ALIMENTOS_BEBIDAS'), true);
      assert.equal(minutosReferencia749(input), minutes);
      assert.equal(JSON.stringify(input), before);
    }
  });
}
test('sums fragments of one concept without combining different concepts', () => {
  const input = row(0); input.detalle.tramos_sugeridos = [{inicio:100,fin:115}, {inicio:200,fin:215}];
  assert.equal(minutosReferencia749(input), 30);
  assert.equal(visibleEnBandeja749(input), true);
  assert.equal(visibleEnBandeja749(row(15,'P005')), false);
  assert.equal(visibleEnBandeja749(row(15,'P004')), false);
});
test('closed decisions retain buttons/history; approved minutes never filtered', () => {
  for (const state of ['aprobado', 'rechazado']) assert.equal(visibleEnBandeja749(row(3.75,'P100',state)), true);
});
test('Sunday/holiday base, attendance and unknown references stay visible', () => {
  for (const code of ['P006', 'P007']) assert.equal(visibleEnBandeja749(row(0,code)), true);
  assert.equal(visibleEnBandeja749({cedula:'TEST', fecha:'2026-10-11', total_marcaciones:4}), true);
  const unknown = row(0); unknown.detalle.calculo_pendiente = true;
  assert.equal(minutosReferencia749(unknown), null); assert.equal(visibleEnBandeja749(unknown), true);
});
test('audit opt-in preserves access to small entries without rewriting them', () => {
  const input = row(3.75), original = JSON.stringify(input);
  assert.equal(visibleEnBandeja749(input), false);
  assert.equal(visibleEnBandeja749(input,{incluirMenores:true}), true);
  assert.equal(JSON.stringify(input), original);
});
test('net reference wins and legacy precision never fabricates an exact boundary', () => {
  const input = row(60); input.detalle.ajuste_almuerzo_742 = { referencia_extra_minutos: 15 };
  assert.equal(esMenorUmbral749(input), true);
  assert.equal(minutosReferencia749({horas_calculadas:0.43}), null);
  assert.equal(minutosReferencia749(row(25.8)), 25.799999999999955);
  assert.equal(esMenorUmbral749(row(25.8)), true);
});
test('only real UUIDs pass persisted-record preflight', () => {
  assert.equal(esRevisionPersistida749('11111111-1111-4111-8111-111111111111'), true);
  for (const id of ['', null, 's721|TEST|2026-10-11|P100', 's719|TEST|2026-10-11|P100']) assert.equal(esRevisionPersistida749(id), false);
});
test('temporary rejection reaches normal handler, no bad UUID read or full reload', async () => {
  for (const id of ['s721|TEST|2026-10-11|P100', 's719|TEST|2026-10-11|P100']) {
    delete globalThis.__nominaIntegridadV748;
    let capture, reads=0, stops=0, reloads=0;
    const doc = {addEventListener:(_,fn)=>{capture=fn;},getElementById:()=>null};
    const client = {from:()=>{reads++;throw new Error('Unexpected UUID read');}};
    instalarNominaIntegridadV748(client,doc);
    const button={dataset:{action:'rechazar',id},disabled:false};
    await capture({target:{closest:()=>button},preventDefault:()=>{stops++;},stopImmediatePropagation:()=>{stops++;}});
    assert.equal(reads,0);assert.equal(stops,0);assert.equal(button.disabled,false);assert.equal(reloads,0);
  }
  delete globalThis.__nominaIntegridadV748;
});
test('both dialog save callbacks render after releasing shared busy state', async () => {
  for (const path of ['nomina-revision-sugerida.js','nomina-correcciones.js']) {
    const source=await readFile(new URL('../js/'+path,import.meta.url),'utf8');
    assert.match(source,/onBusy\(false\);\s*await onSaved\(/);
  }
});
test('page import map pins every changed module in payroll scope only', async () => {
  const html=await readFile(new URL('../pages/horas-extras.html',import.meta.url),'utf8');
  const map=JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]);
  assert.equal(Object.keys(map.imports).length,5);
  for (const value of Object.values(map.imports)) assert.ok(value.endsWith('?v=749'));
  assert.ok(html.indexOf('type="importmap"')<html.indexOf('type="module"'));
});

function fakeDocument() {
  const nodes = [];
  const node = () => ({disabled:false,value:'',textContent:'',focus(){},replaceChildren(){},addEventListener(){}});
  const make = () => {
    const close = node(), turn = node(), comment = node(), alert = node(), form = node();
    const title=node();
    const body={innerHTML:'',replaceChildren(){},querySelector(selector){
      if(selector==='form')return form;
      if(selector==='[role="alert"]')return alert;
      if(selector==='#ns719Turno')return turn;
      if(selector==='#ns719Comentario'||selector==='#nc722Comentario')return comment;
      if(selector==='[data-cancel]')return close;
      return null;
    }};
    const dlg={...node(),open:false,innerHTML:'',body,form,closeButton:close,setAttribute(){},showModal(){this.open=true;},close(){this.open=false;},
      querySelector(selector){return selector==='[data-close]'?close:selector==='h2'?title:body;},querySelectorAll(){return [close,turn,comment];}};
    nodes.push(dlg);return dlg;
  };
  return {nodes,activeElement:node(),createElement:make,body:{appendChild(){}}};
}

test('executed A&B suggestion rejection releases busy, renders and closes without reloading', async () => {
  const {crearRevisionSugerida719}=await import('../js/nomina-revision-sugerida.js');
  globalThis.document=fakeDocument();
  const current={...row(3.75),revision_id:'s721|TEST|2026-10-11|P100'};
  const revision={...current,id:'11111111-1111-4111-8111-111111111111',estado:'rechazado'};
  let busy=false,saved=0,writes=0;
  try {
    const visor=crearRevisionSugerida719({canWrite:()=>!busy,onBusy:v=>{busy=v;},onError:e=>{throw e;},
      onSaved:async(f)=>{assert.equal(busy,false);assert.equal(f.estado,'rechazado');saved++;},
      rpc:async(name)=>{
        if(name==='previsualizar_ayb_nomina_v721')return {data:{version:'721',horario:{key:'T7'},huella:'test',evidencia:{opciones:[],recorrido:[]},conceptos:[],existentes:[]}};
        assert.equal(name,'resolver_ayb_nomina_v721');writes++;return {data:{revision}};
      }});
    await visor.mostrar(current,'rechazar');const dlg=document.nodes[0];
    assert.equal(dlg.open,true);await dlg.form.onsubmit({preventDefault(){}});
    assert.equal(busy,false);assert.equal(saved,1);assert.equal(writes,1);assert.equal(dlg.open,false);assert.equal(dlg.closeButton.disabled,false);
  } finally {delete globalThis.document;}
});

test('executed correction rejection releases busy before rebuilding remaining actions', async () => {
  const {crearCorreccionesNomina722}=await import('../js/nomina-correcciones.js');
  globalThis.document=fakeDocument();let busy=false,saved=0,writes=0;
  const current={...row(30),id:'11111111-1111-4111-8111-111111111111',revision_id:'11111111-1111-4111-8111-111111111111'};
  try {
    const visor=crearCorreccionesNomina722({canWrite:()=>!busy,onBusy:v=>{busy=v;},onError:e=>{throw e;},
      onSaved:async(f)=>{assert.equal(busy,false);assert.equal(f.estado,'rechazado');saved++;},
      rpc:async(name)=>{
        if(name==='previsualizar_correccion_nomina_v722')return {data:{version:'722',revision:current,huella:'test',historial:[],otros:[],opciones:[],jornada_cerrada:true}};
        assert.equal(name,'corregir_concepto_nomina_v722');writes++;return {data:{revision:{...current,estado:'rechazado'},historial_id:'audit-test'}};
      }});
    await visor.mostrar(current,'rechazar');const dlg=document.nodes[0];await dlg.form.onsubmit({preventDefault(){}});
    assert.equal(busy,false);assert.equal(saved,1);assert.equal(writes,1);assert.equal(dlg.open,false);assert.equal(dlg.closeButton.disabled,false);
  } finally {delete globalThis.document;}
});
