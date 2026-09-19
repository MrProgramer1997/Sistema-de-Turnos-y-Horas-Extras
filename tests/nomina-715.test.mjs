import test from 'node:test';
import assert from 'node:assert/strict';
import {modeloNomina, completarDescansosNomina, esAyBChefNomina, horasMinutosNomina, alertaAlmuerzoConcepto} from '../js/nomina-neto.js';
import {modeloRevision} from '../js/revision-evidencia.js';
import {agruparAprobacionDiaria, minutosDecisionNomina, validarDecisionNomina} from '../js/nomina-aprobacion-diaria.js';
import {columnasIntervalo, hojaIntervalos} from '../js/nomina-marcaciones.js';
const fecha='2026-09-16';
function row(patch={}) {
  const r={cedula:'DEMO-1',codigo_erp:'00107',empleado:'Persona de prueba',fecha,
    grupo_codigo:'ADMINISTRACION',proceso_nombre:'Sistemas',programacion_tipo:'confirmada',
    hora_inicio:'08:00',hora_fin:'17:00',minutos_descanso:60,total_marcaciones:2,
    recorrido:[{hora:fecha+'T08:00:00',punto:'Administracion'},{hora:fecha+'T17:20:00',punto:'Administracion'}],...patch};
  return r;
}
const concept=patch=>({...row(),id:'r1',revision_id:'r1',concepto_codigo:'P003',horas_calculadas:0.5,estado:'pendiente',...patch});
const decide=patch=>validarDecisionNomina({x:concept(),m:modeloNomina(row()),accion:'aprobar',horas:'00:30',motivo:'',confirmado:true,hoy:'2026-09-18',...patch});
function pkg(pause=60) {
 return {personas:[{cedula:'DEMO-1',plantillas:['T1','T2'],vigente_desde:'2026-08-23'}],
 plantillas:['T1','T2'].map(c=>({codigo:c,dias:[{dia:3,tipo:'laboral',descanso_descontable_minutos:pause}]})),festivos:[],protegidas:[]};
}

test('9:20 menos 1:00 produce exactamente 8:20; codigo mantiene ceros',()=>{const r=row(),m=modeloNomina(r);assert.equal(m.brutos,560);assert.equal(m.neto,500);assert.equal(horasMinutosNomina(m.neto),'08:20');assert.equal(r.codigo_erp,'00107');});
for (const area of ['Infraestructura','Sistemas','Cartera','Contabilidad']) test('Descanso configurado: '+area,()=>{assert.equal(modeloNomina(row({proceso_nombre:area})).neto,500);});
test('30 minutos configurados, no una hora fija',()=>assert.equal(modeloNomina(row({minutos_descanso:30})).neto,530));
test('Cero explicito no activa un descuento por defecto',()=>assert.equal(modeloNomina(row({minutos_descanso:0})).neto,560));
test('Sin configuracion no inventa 30 o 60 minutos',()=>{const m=modeloNomina(row({minutos_descanso:null}));assert.equal(m.pausa,null);assert.equal(m.neto,null);});
test('Campo alternativo en horas se convierte a minutos',()=>assert.equal(modeloNomina(row({minutos_descanso:null,descuento_almuerzo:1})).neto,500));
test('No vuelve a restar almuerzo al neto previo',()=>assert.equal(modeloNomina(row({horas_reales:500/60,horas_reales_pareadas:500/60})).neto,500));
test('Prioriza el punto interno sobre Porteria',()=>{const r=row({total_marcaciones:4,recorrido:[{hora:fecha+'T07:40',punto:'Porteria'},...row().recorrido,{hora:fecha+'T18:00',punto:'Porteria'}]});const m=modeloNomina(r);assert.equal(m.brutos,560);assert.equal(m.neto,500);assert.equal(m.punto,'Administracion');});
test('No completa par interno con la salida de Porteria',()=>{const r=row({total_marcaciones:3,recorrido:[{hora:fecha+'T07:40',punto:'Porteria'},row().recorrido[0],{hora:fecha+'T18:00',punto:'Porteria'}]});const m=modeloNomina(r);assert.notEqual(m.entrada,null);assert.equal(m.salida,null);assert.equal(m.neto,null);});
test('Porteria unica permite referencia con mas de dos marcas',()=>{const m=modeloNomina(row({total_marcaciones:3,recorrido:['08:00','12:00','17:20'].map(h=>({hora:fecha+'T'+h,punto:'Porteria'}))}));assert.equal(m.neto,500);assert.equal(m.seleccion.fuente,'porteria_unica');});
test('Una sola marca no inventa salida ni neto',()=>{const m=modeloNomina(row({total_marcaciones:1,recorrido:[row().recorrido[0]]}));assert.notEqual(m.entrada,null);assert.equal(m.salida,null);assert.equal(m.neto,null);});
test('Recorrido parcial bloquea el calculo',()=>assert.equal(modeloNomina(row({total_marcaciones:3})).neto,null));
test('Varios puntos no mezcla extremos de areas distintas',()=>assert.equal(modeloNomina(row({recorrido:[{hora:fecha+'T08:00',punto:'Tenis'},{hora:fecha+'T17:20',punto:'Golf'}]})).neto,null));
test('Turno partido no suma pausa entre bloques como trabajo',()=>assert.equal(modeloNomina(row({hora_inicio_2:'18:00',hora_fin_2:'20:00'})).neto,null));
test('Pausa mayor al intervalo queda por revisar',()=>assert.equal(modeloNomina(row({minutos_descanso:600})).neto,null));
test('Intervalo igual a pausa da cero, no negativo',()=>assert.equal(modeloNomina(row({minutos_descanso:560})).neto,0));
test('Novedad evita calcular neto de turno ordinario',()=>assert.equal(modeloNomina(row({novedad_codigo:'INC'})).neto,null));
test('Conflicto de horarios evita neto',()=>assert.equal(modeloNomina(row({conflicto_programacion:true})).neto,null));
test('Cruce de medianoche descuenta una sola pausa',()=>{const m=modeloNomina(row({hora_inicio:'20:00',hora_fin:'05:20',recorrido:[{hora:fecha+'T20:00',punto:'Sistemas'},{hora:'2026-09-17T05:20',punto:'Sistemas'}]}));assert.equal(m.neto,500);});
test('Instantes UTC se muestran en hora Colombia',()=>{const m=modeloNomina(row({recorrido:[{hora:fecha+'T13:00:00Z',punto:'Sistemas'},{hora:fecha+'T22:20:00Z',punto:'Sistemas'}]}));assert.equal(m.neto,500);assert.equal(m.deltaEntrada,0);});
for(const patch of [{grupo_codigo:'ALIMENTOS_BEBIDAS'},{origen:'ayb'},{area_cocina:'Cocina fria'},{es_externo_chef:true}])test('A&B/Chef conserva resultados originales '+JSON.stringify(patch),()=>{const r=row({...patch,minutos_descanso:30}),m=modeloNomina(r),old=modeloRevision(r);assert.ok(esAyBChefNomina(r));for(const k of ['neto','pausa','brutos','entrada','salida','comparable','criterio'])assert.deepEqual(m[k],old[k]);});
test('Consenso de almuerzo no confirma ni asigna un turno',()=>{const r=row({minutos_descanso:null,programacion_tipo:'inferida_ambigua',hora_inicio:'',hora_fin:''}),out=completarDescansosNomina([r],pkg())[0];assert.equal(out.almuerzo_documental_nomina.minutos,60);assert.equal(out.programacion_tipo,'inferida_ambigua');assert.equal(out.hora_inicio,'');assert.equal(modeloNomina(out).neto,500);assert.equal(r.almuerzo_documental_nomina,undefined);});
test('Alternativas con pausas distintas no suponen una',()=>{const p=pkg();p.plantillas[1].dias[0].descanso_descontable_minutos=30;assert.equal(completarDescansosNomina([row({minutos_descanso:null})],p)[0].almuerzo_documental_nomina,undefined);});
test('Break remunerado documental queda en cero',()=>{const r=completarDescansosNomina([row({minutos_descanso:null})],pkg(0))[0];assert.equal(modeloNomina(r).neto,560);});
test('Festivo no hereda la plantilla ordinaria',()=>{const p=pkg();p.festivos=[{fecha}];assert.equal(completarDescansosNomina([row({minutos_descanso:null})],p)[0].almuerzo_documental_nomina,undefined);});
test('Vinculo fuera de vigencia no da descuento',()=>{const p=pkg();p.personas[0].vigente_hasta='2026-09-01';assert.equal(completarDescansosNomina([row({minutos_descanso:null})],p)[0].almuerzo_documental_nomina,undefined);});
test('A&B no recibe nuevas reglas documentales',()=>{const r=row({minutos_descanso:null,grupo_codigo:'ALIMENTOS_BEBIDAS'});assert.deepEqual(completarDescansosNomina([r],pkg())[0],r);});
test('Todos los dias, incluidos sin marcas o sin conceptos',()=>{const days=Array.from({length:28},(_,i)=>row({fecha:new Date(Date.UTC(2026,7,23+i)).toISOString().slice(0,10),total_marcaciones:0}));const rows=agruparAprobacionDiaria(days,[],{hoy:'2026-09-18'});assert.equal(rows.length,28);assert.equal(rows[0].jornada.fecha,'2026-08-23');assert.ok(rows.at(-1).abierta);});
test('Varios conceptos se agrupan sin multiplicar la jornada',()=>{const c=concept(),c2=concept({id:'r2',revision_id:'r2',concepto_codigo:'P005'});const r=agruparAprobacionDiaria([row()],[c,c2,c]);assert.equal(r.length,1);assert.equal(r[0].conceptos.length,2);});
test('Domingo con marcas sin concepto sigue pendiente y visible',()=>{const r=agruparAprobacionDiaria([row({fecha:'2026-09-13'})],[],{estado:'pendiente',hoy:'2026-09-18'});assert.equal(r.length,1);assert.ok(r[0].sinConceptoEspecial);});
test('Festivo sin concepto usa calendario configurado',()=>{const r=agruparAprobacionDiaria([row()],[],{calendario:{festivos:new Map([[fecha,{}]])}});assert.ok(r[0].sinConceptoEspecial);});
test('Filtro estado no confunde aprobado con pendiente',()=>{assert.equal(agruparAprobacionDiaria([row()],[concept({estado:'aprobado'})],{estado:'pendiente'}).length,0);});
test('Horas y minutos validos se convierten, no base100',()=>{assert.equal(minutosDecisionNomina('08:20'),500);for(const h of ['1.5','01:60','-01:30','25:00','00:00','texto'])assert.throws(()=>minutosDecisionNomina(h));});
test('Aprobar candidato intacto mantiene accion aprobar',()=>assert.equal(decide().accion,'aprobar'));
test('Ajustar cantidad permite comentario vacio y conserva accion ajustar',()=>{assert.equal(decide({horas:'00:20'}).accion,'ajustar');assert.equal(decide({horas:'00:20',motivo:'Tiempo efectivo verificado'}).accion,'ajustar');});
test('No permite aprobar mas que el total neto',()=>assert.throws(()=>decide({horas:'09:20',motivo:'Tiempo verificado en la jornada'}),/neto/));
test('Jornada actual y futura no se aprueba',()=>assert.throws(()=>decide({x:concept({fecha:'2026-09-18'})}),/abierta/));
test('Confirmacion obligatoria',()=>assert.throws(()=>decide({confirmado:false}),/Confirma/));
test('Rechazo permite comentario vacio sin inventar horas',()=>{assert.deepEqual(decide({accion:'rechazar',motivo:''}),{accion:'rechazar',horas:null,motivo:''});assert.deepEqual(decide({accion:'rechazar',motivo:'No autorizado'}),{accion:'rechazar',horas:null,motivo:'No autorizado'});});
test('Domingo mantiene horas manuales y confirmacion, comentario opcional',()=>{assert.throws(()=>decide({accion:'validarDomingo',horas:''}));assert.equal(decide({accion:'validarDomingo',horas:'08:20',motivo:''}).horas,8.33);});
test('Candidato con bruto previo genera advertencia, no autoajuste',()=>{const c=concept({detalle:{horas_reales:560/60}});assert.match(alertaAlmuerzoConcepto(c),/bruto/);assert.equal(c.horas_calculadas,0.5);});
test('No altera decisiones cerradas aunque cambie el neto mostrado',()=>assert.equal(alertaAlmuerzoConcepto(concept({estado:'aprobado',horas_calculadas:99})),null));
test('XLSX mantiene bruto y agrega neto como numeros',()=>{const cols=columnasIntervalo(row());assert.equal(cols['Total neto (h)'],500/60);assert.equal(cols['Almuerzo descontado (min)'],60);assert.equal(cols['Total neto (h:mm:ss)'],500/1440);});

import {accionesConceptoDiario} from '../js/nomina-aprobacion-diaria.js';
import {validarComentarioNomina} from '../js/nomina-comentarios.js';
for (const accion of ['aprobar','rechazar','ajustar','validarDomingo']) {
 test(accion+' admite comentario vacio',()=>assert.equal(decide({accion,motivo:''}).motivo,''));
 test(accion+' admite comentario breve',()=>assert.equal(decide({accion,motivo:'OK'}).motivo,'OK'));
}
test('Pendiente ofrece aprobar rechazar comentar',()=>{const a=accionesConceptoDiario(concept());assert.ok(a.aprobar&&a.rechazar&&a.comentar&&a.mostrarDecision);});
for(const estado of ['aprobado','rechazado']) {
 test(estado+' permite comentar pero no reabrir decision',()=>{const a=accionesConceptoDiario(concept({estado,permite_revision:false}));assert.ok(a.comentar&&a.cerrado);assert.equal(a.aprobar,false);assert.equal(a.rechazar,false);assert.equal(a.mostrarDecision,false);assert.match(a.motivo,/cerrada/);});
 test(estado+' no puede entrar por validacion alternativa',()=>assert.throws(()=>decide({x:concept({estado})}),/cerrada/));
}
test('Sin concepto no ofrece decisiones o comentarios de concepto',()=>{const a=accionesConceptoDiario(null);assert.equal(a.comentar,false);assert.equal(a.aprobar,false);});
test('Jornada abierta bloquea decisiones pero permite notas',()=>{const a=accionesConceptoDiario(concept(),{abierta:true});assert.ok(a.comentar);assert.equal(a.aprobar,false);assert.equal(a.rechazar,false);});
test('Lectura incompleta no permite ninguna escritura',()=>{const a=accionesConceptoDiario(concept(),{disponible:false});assert.equal(a.comentar,false);assert.equal(a.aprobar,false);assert.equal(a.rechazar,false);});
test('No cambia datos al calcular opciones de botones',()=>{const c=concept();const before=structuredClone(c);accionesConceptoDiario(c);assert.deepEqual(c,before);});
test('Rechazo con marca incompleta permitido sin comentario',()=>assert.equal(decide({accion:'rechazar',m:modeloNomina(row({total_marcaciones:1,recorrido:[row().recorrido[0]]}))}).accion,'rechazar'));
test('Aprobacion con marca incompleta sigue bloqueada',()=>assert.throws(()=>decide({m:modeloNomina(row({total_marcaciones:1,recorrido:[row().recorrido[0]]}))}),/intervalo/));
test('Accion desconocida nunca se convierte en aprobacion',()=>assert.throws(()=>decide({accion:'inventada'}),/valida/));
test('Comentario demasiado largo no se envia',()=>assert.throws(()=>decide({motivo:'x'.repeat(2001)}),/2000/));
test('Nueva nota requiere texto solo al solicitar guardarla',()=>{assert.throws(()=>validarComentarioNomina('  '));assert.equal(validarComentarioNomina(' OK '),'OK');assert.throws(()=>validarComentarioNomina('x'.repeat(2001)));});
