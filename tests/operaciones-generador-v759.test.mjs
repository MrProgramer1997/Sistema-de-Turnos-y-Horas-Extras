import assert from 'node:assert/strict';
import fs from 'node:fs';
const {generarSemanaOps,minutosAutoOps,fechasAutoOps}=await import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync(new URL('../js/operaciones-generador.js',import.meta.url))).toString('base64'));
const clone=x=>JSON.parse(JSON.stringify(x));
function contexto({festivo=false,apoyos=false}={}){
 const semana='2026-10-19',fechas=fechasAutoOps(semana),h=Array.from({length:9},(_,i)=>`h${i}`),m=Array.from({length:9},(_,i)=>`m${i}`);
 const especiales=[['cesar','normal','M'],['vh1','vestier_h_am','M'],['vh2','vestier_h_pm','M'],['vh3','vestier_h_pm','M'],['vd1','damas_am','F'],['vd2','damas_pm','F'],['ten1','tenis_am','F'],['ten2','tenis_pm','F'],['porta1','porteria',''],['porta2','porteria',''],['park','parqueadero',''],['zona','normal',''],['flexextra','flexible','M']];
 const puestos=h.map((id,i)=>({id,tipo:i>=6?'flexible':'normal',sexo:'M',obligatorio:i<6})).concat(m.map((id,i)=>({id,tipo:i>=6?'flexible':'normal',sexo:'F',obligatorio:i<6})),especiales.map(([id,tipo,sexo])=>({id,tipo,sexo,obligatorio:tipo!=='flexible'})));
 const ubicaciones=puestos.map(p=>({empleado_id:`e_${p.id}`,puesto_id:p.id,sexo:p.sexo,rol:h.includes(p.id)?'rotar_h':m.includes(p.id)?'rotar_m':p.tipo==='flexible'?'flexible':'fijo',proceso_id:'operaciones',semana_fuente:'2026-10-12'}));
 ubicaciones.push({empleado_id:'coord',puesto_id:null,rol:'coordinador',sexo:'',proceso_id:'coordinador'});
 if(apoyos)ubicaciones.push({empleado_id:'apoyo_h',puesto_id:null,rol:'apoyo_am',sexo:'M',proceso_id:'operaciones'},{empleado_id:'apoyo_m',puesto_id:null,rol:'apoyo_pm',sexo:'F',proceso_id:'operaciones'});
 const personal=ubicaciones.map(u=>({empleado_id:u.empleado_id,nombres:u.empleado_id,apellidos:'Prueba',proceso_id:u.proceso_id}));
 const jornadas=puestos.flatMap(p=>fechas.map((fecha,i)=>({puesto_id:p.id,fecha,hora_inicio:p.tipo.endsWith('_pm')?'13:00':i===6?'07:00':'06:00',hora_fin:p.tipo.endsWith('_pm')?(i===6?'19:00':'21:00'):i===6?'13:00':'14:00',minutos_descanso:30,origen:'Prueba'})));
 for(const u of ubicaciones.filter(u=>!u.puesto_id))for(const [i,fecha]of fechas.entries())jornadas.push({empleado_id:u.empleado_id,fecha,hora_inicio:u.rol==='apoyo_pm'?'13:00':'06:00',hora_fin:u.rol==='apoyo_pm'?'21:00':'14:00',minutos_descanso:30});
 return {semana,huella:'prueba',ocupada:false,lunes_festivo:festivo,configuracion:{confirmada:true,personas:ubicaciones,puestos,ciclos:{hombres:h,mujeres:m},aseo_festivo:'mantener',reconocidos:{F:420,CUMPLE:420,VOT:420,DP:420,DF:420}},organizacion:{puestos:puestos.map((p,i)=>({...p,orden:i+1,nombre:p.id})),asignaciones:[]},programacion:{personal,programacion:[],festivos:festivo?[{fecha:semana,nombre:'Festivo de prueba'}]:[]},ubicaciones,jornadas,pendientes:[]};
}
const base=contexto();const p=generarSemanaOps(base);
assert.deepEqual(p.errores,[]);assert.equal(p.registros.length,base.ubicaciones.length*7);
for(const id of ['e_porta1','e_porta2','e_park']){assert.equal(p.registros.find(r=>r.empleado_id===id&&r.fecha===base.semana).tipo_registro,'descanso');assert(!p.relevos.some(r=>r.puesto_id===id.slice(2)&&r.fecha===base.semana));}
assert.equal(new Set(p.relevos.map(r=>`${r.empleado_id}|${r.fecha}`)).size,p.relevos.length);
for(const r of p.relevos){const regla=base.configuracion.puestos.find(x=>x.id===r.puesto_id),u=base.ubicaciones.find(x=>x.empleado_id===r.empleado_id);assert(!regla.sexo||regla.sexo===u.sexo);assert.notEqual(u.rol,'coordinador');}
const fest=contexto({festivo:true});const pf=generarSemanaOps(fest);assert.deepEqual(pf.errores,[]);
for(const id of ['e_porta1','e_porta2','e_park']){assert.equal(pf.registros.find(r=>r.empleado_id===id&&r.fecha==='2026-10-19').tipo_registro,'turno');assert.equal(pf.registros.find(r=>r.empleado_id===id&&r.fecha==='2026-10-20').tipo_registro,'descanso');assert(!pf.relevos.some(r=>r.puesto_id===id.slice(2)&&r.fecha==='2026-10-20'));}
const cn=[{empleado_id:'e_h0',tipo:'novedad',codigo:'INC',desde:'2026-10-19',hasta:'2026-10-25'},{empleado_id:'e_m0',tipo:'novedad',codigo:'VAC',desde:'2026-10-19',hasta:'2026-10-25'},{empleado_id:'e_h1',tipo:'descanso',desde:'2026-10-25',hasta:'2026-10-25'},{empleado_id:'e_m1',tipo:'descanso',desde:'2026-10-21',hasta:'2026-10-21'}];
const pn=generarSemanaOps(contexto({apoyos:true}),cn);assert.deepEqual(pn.errores,[]);
for(const id of ['e_h0','e_m0']){assert.equal(pn.registros.filter(r=>r.empleado_id===id&&r.tipo_registro==='novedad').length,7);assert.equal(pn.resumen.find(r=>r.empleado_id===id).trabajados,0);assert.equal(pn.relevos.filter(r=>r.puesto_id===id.slice(2)).length,7);assert.equal(pn.asignaciones.find(a=>a.empleado_id===id).puesto_id,id.slice(2));}
for(const id of ['apoyo_h','apoyo_m']){assert.equal(pn.registros.find(r=>r.empleado_id===id&&r.fecha==='2026-10-25').tipo_registro,'descanso');for(const r of pn.registros.filter(r=>r.empleado_id===id&&r.tipo_registro==='turno'))assert(id==='apoyo_h'?r.hora_inicio<'12:00':r.hora_inicio>='12:00');}
const pr=generarSemanaOps(base,[{empleado_id:'e_h0',tipo:'novedad',codigo:'F',desde:'2026-10-22',hasta:'2026-10-22'}]);const res=pr.resumen.find(r=>r.empleado_id==='e_h0');assert.equal(res.reconocidos,420);assert.equal(res.adicionales,Math.max(0,res.trabajados+420-2520));assert.equal(minutosAutoOps(pr.registros.find(r=>r.empleado_id==='e_h0'&&r.fecha==='2026-10-22')),0);
assert.equal(minutosAutoOps({tipo_registro:'turno',hora_inicio:'17:00',hora_fin:'03:00',minutos_descanso:60}),540);
assert.equal(minutosAutoOps({tipo_registro:'turno',hora_inicio:'06:00',hora_fin:'14:00',minutos_descanso:90}),390);
const sinDomingo=clone(base);sinDomingo.jornadas=sinDomingo.jornadas.filter(j=>!(j.puesto_id==='m4'&&j.fecha==='2026-10-25'));assert(generarSemanaOps(sinDomingo).errores.some(e=>e.mensaje.includes('domingo')&&e.puesto_id==='m4'));
const ocupado=clone(base);ocupado.ocupada=true;assert(generarSemanaOps(ocupado).errores.some(e=>e.mensaje.includes('ya tiene programación')));
const sinCobertura=clone(base);sinCobertura.ubicaciones=sinCobertura.ubicaciones.filter(u=>!['h6','h7','h8','flexextra'].includes(u.puesto_id));assert(generarSemanaOps(sinCobertura).errores.some(e=>e.mensaje.includes('Sin relevo masculino')));
const solicitud=generarSemanaOps(base,[{empleado_id:'e_ten1',tipo:'descanso',desde:'2026-10-22',hasta:'2026-10-22'}]);assert.equal(solicitud.registros.find(r=>r.empleado_id==='e_ten1'&&r.fecha==='2026-10-22').tipo_registro,'descanso');
const vecino=clone(base);vecino.bloqueos=[{empleado_id:'e_cesar',fecha:'2026-10-18',hora_inicio:'23:00',hora_fin:'08:00'}];assert(generarSemanaOps(vecino).errores.some(e=>e.mensaje.includes('Otra jornada')&&e.fecha==='2026-10-19'));
console.log('OK: semana normal y festiva, rotaciones conservadas, descansos, VAC/INC, cobertura por sexo, apoyos, novedades reconocidas, pausas, medianoche, domingo y semana protegida.');
