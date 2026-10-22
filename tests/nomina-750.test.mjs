import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { crearAutorizacionManual728 } from '../js/nomina-autorizacion-manual.js';

const CODES=['P003','P004','P005','P006','P007','P008','P009','P100'];
const origin=()=>({cedula:'TEST-750',fecha:'2026-09-17',concepto_codigo:'P005',revision_id:'s721|TEST-750|2026-09-17|P005',estado:'pendiente',empleado:'Test User'});
const row=(code,state='pendiente')=>({id:`test-${code}`,cedula:'TEST-750',fecha:'2026-09-17',concepto_codigo:code,estado:state,horas_aprobadas:state==='aprobado'?1:null});
function preview(code,existing=[]){return {version:'729',cedula:'TEST-750',fecha:'2026-09-17',concepto_codigo:code,concepto_origen:code,concepto_nombre:code,empleado:'Test User',huella:`hash-${code}`,puede_aprobar_manual:true,marcaciones:[],revision:existing.find(r=>r.concepto_codigo===code)||null,otros:existing.map(r=>({codigo:r.concepto_codigo,estado:r.estado})),conceptos_disponibles:CODES.map(codigo=>({codigo,nombre:codigo}))};}
function saved(args){
 const revision={...row(args.p_concepto_destino,'aprobado'),horas_aprobadas:args.p_minutos/60,detalle:{aprobacion_manual_728:{minutos_netos_autorizados:args.p_minutos}}};
 const changing=args.p_concepto_origen!==args.p_concepto_destino;
 return {version:'729',revision,reclasificado:changing,historial_id:'audit',reclasificacion_id:changing?'change-audit':null,revisiones_afectadas:changing?[{...row(args.p_concepto_origen,'rechazado'),horas_aprobadas:0},revision]:[revision]};
}
function fakeDocument(){
 const doc={dialogs:[],activeElement:{focus(){}},body:{appendChild(){}},createElement(){
  const el=()=>({value:'',textContent:'',disabled:false,listeners:{},addEventListener(name,fn){this.listeners[name]=fn;},async fire(name){return this.listeners[name]?.({target:this,preventDefault(){}});},focus(){}});
  const close=el(),title=el();
  const body={nodes:{},html:'',set innerHTML(html){
   this.html=html;this.nodes={};
   if(!html.includes('<form'))return;
   for(const id of ['nm728Horas','nm728Tiempo','nm728Comentario','nm729Concepto','nm729Cambio'])this.nodes['#'+id]=el();
   const hours=html.match(/id="nm728Horas"[^>]*value="([^"]*)"/);this.nodes['#nm728Horas'].value=hours?.[1]||'';
   const comment=html.match(/<textarea[^>]*id="nm728Comentario"[^>]*>([\s\S]*?)<\/textarea>/);this.nodes['#nm728Comentario'].value=comment?.[1]||'';
   const select=this.nodes['#nm729Concepto'];
   select.options=[...html.matchAll(/<option value="([^"]*)"([^>]*)>([\s\S]*?)<\/option>/g)].map(m=>({value:m[1],disabled:m[2].includes('disabled'),selected:m[2].includes('selected'),textContent:m[3]}));
   select.value=select.options.find(o=>o.selected)?.value??select.options[0]?.value??'';
   this.nodes['form']=el();this.nodes['[role="alert"]']=el();
   const submit=html.match(/<button class="btn btn-success" type="submit"([^>]*)>([^<]*)<\/button>/);
   this.nodes['[type="submit"]']={...el(),disabled:submit?.[1].includes('disabled')||false,textContent:submit?.[2]||''};
   for(const name of ['data-add-concept','data-back-concept'])if(html.includes(name))this.nodes['['+name+']']=el();
  },get innerHTML(){return this.html;},querySelector(s){return this.nodes[s]||null;},replaceChildren(){this.nodes={};this.html='';}};
  const dlg={open:false,innerHTML:'',body,setAttribute(){},addEventListener(){},showModal(){this.open=true;},close(){this.open=false;},querySelector(s){return s==='[data-close]'?close:s==='#nm728Titulo'?title:body;},querySelectorAll(){return [close,...Object.values(body.nodes)];}};
  doc.dialogs.push(dlg);return dlg;
 }};
 return doc;
}
function harness(t,{existing=[],handler=null}={}){
 const previous=globalThis.document;globalThis.document=fakeDocument();t.after(()=>{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;});
 const state={busy:false,allowed:true,reads:[],writes:[],saved:[],errors:[],handler};
 const visor=crearAutorizacionManual728({canWrite:()=>!state.busy,canManual:()=>state.allowed,onBusy:v=>{state.busy=v;},onSaved:(...args)=>{assert.equal(state.busy,false,'render callback must run after unlock');state.saved.push(args);},onError:e=>state.errors.push(e),rpc:async(name,args,opts)=>{
  (opts.read?state.reads:state.writes).push({name,args,opts});
  if(state.handler){const override=await state.handler(name,args,opts);if(override!==undefined)return override;}
  return {data:opts.read?preview(args.p_concepto_origen,existing):saved(args)};
 }});
 const dlg=()=>globalThis.document.dialogs[0],body=()=>dlg().body;
 return {state,visor,dlg,body,node:s=>body().querySelector(s),async add(){await body().querySelector('[data-add-concept]').fire('click');},async choose(code){const el=body().querySelector('#nm729Concepto');el.value=code;await el.fire('change');},async submit(){return body().querySelector('form').onsubmit({preventDefault(){}});}};
}

test('new button leaves original approval intact and opening addition makes no writes',async t=>{
 const h=harness(t);const x=Object.freeze(origin());await h.visor.mostrar(x);
 assert.equal(h.node('[type="submit"]').textContent,'Aprobar este concepto');assert.ok(h.node('[data-add-concept]'));
 h.node('#nm728Horas').value='1 h 26 min';h.node('#nm728Comentario').value='Original draft';
 await h.add();assert.equal(h.node('#nm729Concepto').value,'');assert.equal(h.node('#nm728Horas').value,'');assert.equal(h.node('#nm728Comentario').value,'');
 assert.equal(h.node('[type="submit"]').disabled,true);assert.ok(h.node('[data-back-concept]'));assert.equal(h.state.writes.length,0);assert.equal(x._nuevoConcepto743,undefined);
});
test('return restores time, comment and selected concept without approving either',async t=>{
 const h=harness(t);await h.visor.mostrar(origin());await h.choose('P004');h.node('#nm728Horas').value='1 h 26 min';h.node('#nm728Comentario').value='Draft';
 await h.add();await h.choose('P003');h.node('#nm728Horas').value='0 h 40 min';await h.node('[data-back-concept]').fire('click');
 assert.equal(h.node('#nm729Concepto').value,'P004');assert.equal(h.node('#nm728Horas').value,'1 h 26 min');assert.equal(h.node('#nm728Comentario').value,'Draft');assert.equal(h.node('[type="submit"]').textContent,'Cambiar concepto y aprobar');assert.equal(h.state.writes.length,0);
});
test('adding calls the existing save with NEW code as both origin and destination',async t=>{
 const h=harness(t,{existing:[row('P005','aprobado')]});await h.visor.mostrar(origin());await h.add();await h.choose('P003');
 h.node('#nm728Horas').value='0 h 40 min';await h.submit();assert.equal(h.state.writes.length,1);
 const {args}=h.state.writes[0];assert.equal(args.p_concepto_origen,'P003');assert.equal(args.p_concepto_destino,'P003');assert.equal(args.p_minutos,40);assert.equal(args.p_huella,'hash-P003');
 assert.equal(h.state.saved[0][1]._nuevoConcepto743,true);assert.equal(h.state.saved[0][3].length,1);assert.equal(h.dlg().open,false);assert.equal(h.state.busy,false);assert.equal(h.state.errors.length,0);
});
test('synthetic original is retained and cannot be selected as another concept',async t=>{
 const h=harness(t);await h.visor.mostrar(origin());await h.add();assert.equal(h.node('#nm729Concepto').options.find(o=>o.value==='P005').disabled,true);
 await h.choose('P005');h.node('#nm728Horas').value='1 h';await h.submit();assert.equal(h.state.writes.length,0);assert.match(h.node('[role="alert"]').textContent,/Selecciona otro/);
});
for(const status of ['pendiente','aprobado','rechazado'])test(`existing ${status} target is disabled and never overwritten`,async t=>{
 const h=harness(t,{existing:[row('P003',status)]});await h.visor.mostrar(origin());await h.add();assert.equal(h.node('#nm729Concepto').options.find(o=>o.value==='P003').disabled,true);
 await h.choose('P003');h.node('#nm728Horas').value='1 h';await h.submit();assert.match(h.node('[role="alert"]').textContent,/ya existe/);assert.equal(h.state.writes.length,0);
});
test('rapid selection discards a late preview and saves only the latest selected code',async t=>{
 let resolve;const h=harness(t);await h.visor.mostrar(origin());await h.add();
 h.state.handler=async(_name,args,opts)=>{if(opts.read&&args.p_concepto_origen==='P003')return new Promise(r=>{resolve=r;});};
 const first=h.choose('P003');await Promise.resolve();await h.choose('P004');resolve({data:preview('P003')});await first;
 h.node('#nm728Horas').value='1 h';await h.submit();assert.equal(h.state.writes[0].args.p_concepto_origen,'P004');assert.equal(h.state.writes.length,1);
});
test('double submit performs one write and cannot approve while selection is pending',async t=>{
 let finishRead,finishWrite;const h=harness(t);await h.visor.mostrar(origin());await h.add();
 h.state.handler=async(_n,args,opts)=>opts.read?new Promise(r=>{finishRead=()=>r({data:preview(args.p_concepto_origen)});}):new Promise(r=>{finishWrite=()=>r({data:saved(args)});});
 const selecting=h.choose('P003');h.node('#nm728Horas').value='1 h';await h.submit();assert.equal(h.state.writes.length,0);
 finishRead();await selecting;const saving=h.submit();await h.submit();assert.equal(h.state.writes.length,1);assert.equal(h.state.busy,true);finishWrite();await saving;assert.equal(h.state.saved.length,1);assert.equal(h.state.busy,false);
});
test('failed write remains unconfirmed, never retries, and allows closing',async t=>{
 const h=harness(t);await h.visor.mostrar(origin());await h.add();await h.choose('P003');h.node('#nm728Horas').value='1 h';
 h.state.handler=async(_n,_a,opts)=>opts.read?undefined:{error:{code:'40001',message:'Los datos cambiaron'}};
 await h.submit();await h.submit();assert.equal(h.state.writes.length,1);assert.equal(h.state.saved.length,0);assert.equal(h.state.errors.length,1);assert.equal(h.state.busy,false);assert.equal(h.dlg().querySelector('[data-close]').disabled,false);
 h.visor.cerrar();assert.equal(h.dlg().open,false);
});
test('closing during pending preview prevents stale approval',async t=>{
 let finish;const h=harness(t);await h.visor.mostrar(origin());await h.add();
 h.state.handler=async(_n,args,opts)=>opts.read?new Promise(r=>{finish=()=>r({data:preview(args.p_concepto_origen)});}):undefined;
 const selecting=h.choose('P003');h.visor.cerrar();finish();await selecting;assert.equal(h.dlg().open,false);assert.equal(h.state.writes.length,0);
 h.state.handler=null;await h.visor.mostrar(origin());assert.ok(h.node('[data-add-concept]'));assert.equal(h.node('[data-back-concept]'),null);
});
test('permission is still required for opening, adding and saving',async t=>{
 const h=harness(t);h.state.allowed=false;await h.visor.mostrar(origin());assert.equal(h.state.reads.length,0);
 h.state.allowed=true;await h.visor.mostrar(origin());h.state.allowed=false;await h.add();assert.equal(h.state.reads.length,1);
 h.state.allowed=true;await h.add();await h.choose('P003');h.node('#nm728Horas').value='1 h';h.state.allowed=false;await h.submit();assert.equal(h.state.writes.length,0);
});
test('invalid time and blank selection cannot create a concept',async t=>{
 const h=harness(t);await h.visor.mostrar(origin());await h.add();await h.submit();assert.equal(h.state.writes.length,0);
 await h.choose('P003');h.node('#nm728Horas').value='invalid';await h.submit();assert.equal(h.state.writes.length,0);assert.match(h.node('[role="alert"]').textContent,/horas y minutos/);
});
for(const destination of ['P005','P004'])test(`existing approval/reclassification flow still works for ${destination}`,async t=>{
 const h=harness(t);await h.visor.mostrar(origin());await h.choose(destination);h.node('#nm728Horas').value='1 h';await h.submit();assert.equal(h.state.errors.length,0);assert.equal(h.state.writes.length,1);
 assert.equal(h.state.writes[0].args.p_concepto_origen,'P005');assert.equal(h.state.saved[0][2],destination==='P005'?'aprobar':'reclasificar');
});
test('actual table callback preserves original row and other concepts on an addition',async()=>{
 const source=await readFile(new URL('../js/horas-extras.js',import.meta.url),'utf8');
 const code=source.match(/onSaved:(\(fila,anterior,accion,afectadas=\[fila\]\)=>\{[\s\S]*?\n \})\n\}\);/)[1];
 const original=origin(),other={...origin(),concepto_codigo:'P100',revision_id:'other'};
 const added={...row('P003','aprobado'),horas_aprobadas:1};
 const context={base:[original,other],fila:added,anterior:{...original,_nuevoConcepto743:true},heEmpleadosDetalle:[],heMarcasFuente:[],jornadas:[],heConceptosElegidos:new Map(),texto:v=>String(v??''),claveDia:r=>`${r.cedula}|${r.fecha}`,concepto:r=>r.concepto_codigo,marcarConceptosOficios726:x=>x,completarBandeja:rs=>rs.map(r=>({...r,revision_id:r.id})),ordenCronologicoRevision:()=>0,render(){},avisoCarga(){},textoHoras728:()=>''};
 vm.runInNewContext(`(${code})(fila,anterior,'aprobar',[fila]);`,context);
 assert.equal(context.base.length,3);assert.ok(context.base.includes(original));assert.ok(context.base.includes(other));assert.equal(original.estado,'pendiente');assert.equal(context.base.find(r=>r.concepto_codigo==='P003').estado,'aprobado');
});
test('page pins the manual module without altering five existing 7.49 mappings',async()=>{
 const html=await readFile(new URL('../pages/horas-extras.html',import.meta.url),'utf8');const map=JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]);
 assert.equal(map.imports['../js/nomina-autorizacion-manual.js?v=746'],'../js/nomina-autorizacion-manual.js?v=750');assert.equal(Object.values(map.imports).filter(v=>v.endsWith('?v=749')).length,5);assert.match(html,/versi.n 7.50/);
});
