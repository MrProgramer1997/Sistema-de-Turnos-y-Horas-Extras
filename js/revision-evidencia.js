import { seleccionarPuntoRevision, diaSemanaRevision, fechaDiaRevision, recorridoRevisionHtml } from './revision-punto.js?v=713';
/* Shared presentation of schedule, raw evidence and night-review warnings.
 * No first/last interval is certified as continuously worked time.
 * A stored concept amount is never used as a daily worked-hours total.
 */
const str=v=>String(v??'').trim();
const finite=v=>v===null||v===undefined||v===''||!Number.isFinite(Number(v))?null:Number(v);
const norm=s=>str(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
export const escaparRevision=v=>str(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function minutoCivil(v,fecha=''){
 let s=str(v).replace(' ','T');if(/^\d{2}:\d{2}(:\d{2})?$/.test(s))s=fecha+'T'+s;
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s))return null;
 const zoned=/(Z|[+-]\d{2}:?\d{2})$/i.test(s),t=Date.parse(s+(zoned?'':'Z'));
 return Number.isFinite(t)?t/60000-(zoned?300:0):null;
}
export function duracionRevision(min,segundos=false){
 if(min===null||!Number.isFinite(min)||min<0)return 'No calculable';
 const s=Math.round(min*60),h=Math.floor(s/3600),m=Math.floor(s%3600/60);
 return `${h} h ${String(m).padStart(2,'0')} min`+(segundos?` ${String(s%60).padStart(2,'0')} s`:'');
}
function reloj(min,fecha='',segundos=false){if(min===null||!Number.isFinite(min))return '\u2014';const d=new Date(Math.round(min*60000));return d.toISOString().slice(11,segundos?19:16)+(fecha&&d.toISOString().slice(0,10)!==fecha?' (d\u00eda siguiente)':'');}
function bloque(fecha,a,b,offset=0){if(!/^\d{2}:\d{2}(:\d{2})?$/.test(str(a))||!/^\d{2}:\d{2}(:\d{2})?$/.test(str(b)))return null;let start=minutoCivil(a,fecha),end=minutoCivil(b,fecha);if(start===null||end===null||start===end)return null;start+=offset*1440;end+=offset*1440;if(end<start)end+=1440;return {start,end};}
export function requiereRevisionNocturna(x){return ['P005','P100','P004','P009'].includes(x.concepto_codigo)&&!['aprobado','rechazado'].includes(x.estado_revision||x.estado);}
export function modeloRevision(x={}){
 const ev=x.evidencia_revision||null,fecha=str(x.fecha).slice(0,10),doc=x.jornada_actual?.documental_711?x.jornada_actual:ev?.horario_documental||(x.documental_711?x:null),p=doc||ev?.horario||x.jornada_actual||x;
 const confirmado=doc?doc.programacion_tipo==='confirmada':Boolean(ev?.horario)||p.programacion_tipo==='confirmada'||x.programacion_tipo==='confirmada';
 const sugerido=/inferida_(alta|media)/.test(p.programacion_tipo||'');
 const b1=bloque(fecha,p.hora_inicio,p.hora_fin),b2=bloque(fecha,p.hora_inicio_2,p.hora_fin_2,b1&&minutoCivil(p.hora_inicio_2,fecha)<b1.start?1:0);
 const hayNovedad=p.tipo_registro==='novedad'||Boolean(p.novedad_codigo);
 const horarioComparable=Boolean(b1&&!(doc?doc.conflicto_programacion:ev?.conflicto_horario)&&!hayNovedad&&(confirmado||sugerido));
 const lista=Array.isArray(ev?.recorrido)?ev.recorrido:Array.isArray(x.recorrido)?x.recorrido:[];
 const eventos=lista.map(v=>({...v,t:minutoCivil(v.hora||v.punch_time,fecha)})).filter(v=>v.t!==null).sort((a,b)=>a.t-b.t);
 const cantidad=finite(ev?.total_marcaciones??x.total_marcaciones)??eventos.length;
 const seleccion=seleccionarPuntoRevision(eventos,cantidad,p);
 const {entrada,salida,usadas,parClaro,punto}=seleccion;
 const base=seleccion.fuente==='punto'?'Punto: '+punto:seleccion.fuente==='porteria_dos'?'Portería: solo dos marcas':seleccion.fuente==='dos_sin_punto'?'Dos marcas: punto sin identificar':'Punto incompleto; sin par de comparación';
 const brutos=entrada!==null&&salida!==null&&salida>entrada&&salida-entrada<=1440?salida-entrada:null;
 const pausa=finite(p.minutos_descanso)??(finite(p.descuento_almuerzo)!==null?Number(p.descuento_almuerzo)*60:confirmado?30:null);
 let neto=null,criterio='No hay un par de marcas suficiente para calcular horas.';
 if(brutos!==null){
   criterio='Intervalo entre marcas; no acredita trabajo continuo.';
   // Split shifts and multiple point movements need an actual pairing rule, not min/max minus lunch.
   if(!b2&&pausa!==null&&pausa>=0&&pausa<brutos&&(parClaro||eventos.length===2)&&!(punto&&base==='Primera y \u00faltima marca')){neto=brutos-pausa;criterio='Estimado: intervalo seleccionado menos '+pausa+' min. Confirmar pausas y salidas; no son horas aprobadas.';}
   else if(b2)criterio='Turno partido: revisar cada bloque; no se suma la pausa entre bloques como trabajo.';
   else if(punto&&base==='Primera y \u00faltima marca')criterio='No se identificaron entrada y salida en el punto programado. Porter\u00eda solo acredita presencia.';
   else criterio='Hay movimientos o descanso sin verificar. Se muestra el intervalo, no un total neto confirmado.';
 }
 const comparable=seleccion.fuente!=='dos_sin_punto'&&horarioComparable&&entrada!==null&&salida!==null&&!b2;
 const deltaEntrada=comparable&&entrada!==null?entrada-b1.start:null,deltaSalida=comparable&&salida!==null?salida-(b2||b1).end:null;
 const nets=!b1||hayNovedad?null:finite(p.horas_programadas_netas)??(b1?Math.max(0,b1.end-b1.start+(b2?b2.end-b2.start:0)-(pausa??30))/60:null);
 return {seleccion,fecha,p,ev,eventos,usadas,cantidad,entrada,salida,base,punto,brutos,neto,pausa,criterio,comparable,sugerido,b1,b2,netoProgramado:nets===null?null:nets*60,deltaEntrada,deltaSalida,fuente:doc?(doc.documental_711.tipo==='documental_fija'?'Plantilla estipulada por Bienestar':doc.documental_711.tipo==='confirmacion_usuario'?'Horario confirmado por el responsable; lectura documental':doc.documental_711.tipo==='guardada'?'Asignacion guardada':'Deteccion semanal; no asignacion confirmada'):ev?.horario?'Programaci\u00f3n actual':confirmado?'Programaci\u00f3n guardada':sugerido?'Horario sugerido':'Horario sin confirmar',requiereNocturno:requiereRevisionNocturna(x)};
}
export function comparacionCelda(m,lado){
 const ini=lado==='entrada',prog=ini?m.b1?.start:(m.b2||m.b1)?.end,real=ini?m.entrada:m.salida,delta=ini?m.deltaEntrada:m.deltaSalida;
 let clase='neutro',mensaje=real===null?(ini?'Sin entrada':'Sin salida verificable'):'Sin comparaci\u00f3n confirmada';
 if(delta!==null){const minutos=Math.floor(Math.abs(delta)+1e-7);clase=minutos===0?'ok':delta>0?'alerta':ini?'info':'temprano';mensaje=minutos===0?'En el minuto previsto':`${ini?'Lleg\u00f3':'Sali\u00f3'} ${minutos} min ${delta>0?(ini?'tarde':'despu\u00e9s'):'antes'}`;}
 return `<div class="rev-compara"><div><b>Prog.</b> ${escaparRevision(reloj(prog??null,m.fecha))}</div><div><b>Real</b> ${escaparRevision(reloj(real,m.fecha))}</div><span class="rev-diferencia ${clase}">${escaparRevision(mensaje)}</span>${m.sugerido?'<small>Referencia inferida, no confirmada</small>':''}</div>`;
}
export function programacionCelda(m){return `<strong>${m.netoProgramado===null?'Sin confirmar':duracionRevision(m.netoProgramado)}</strong><div class="rev-small">${escaparRevision(m.p.turno||'Sin turno')} \u00b7 ${escaparRevision(m.p.hora_inicio||'\u2014')}\u2013${escaparRevision(m.p.hora_fin||'\u2014')}${m.b1&&m.b1.end>=minutoCivil('00:00',m.fecha)+1440?' (d\u00eda siguiente)':''}</div>${m.b2?`<div class="rev-small">Bloque 2: ${escaparRevision(m.p.hora_inicio_2)}\u2013${escaparRevision(m.p.hora_fin_2)}</div>`:''}<small>${escaparRevision(m.fuente)}</small>`;}
export function marcadoCelda(m){return `<strong>${m.brutos===null?'Sin intervalo completo':duracionRevision(m.brutos)}</strong><div class="rev-small">${m.cantidad} marcaci\u00f3n(es)</div><small>${escaparRevision(m.base)}</small>`;}
export function totalCelda(m){return `<strong>${duracionRevision(m.neto)}</strong><small class="rev-small">${m.neto===null?'Neto por verificar':'Estimado; validar pausas'}</small>`;}
export function advertenciaNocturna(x){
 if(!requiereRevisionNocturna(x))return '';
 if(x.origen_calculo==='motor_central_nocturno_19_00')return '<div class="rev-aviso">Valor anterior basado en el horario. El botón contrasta las marcas del punto antes de aprobar.</div>';
 if(x.origen_calculo==='nocturno_pendiente_revision_v713')return '<div class="rev-aviso">Marca nocturna recibida. Falta validar el intervalo y clasificar recargo o extra; no significa cero trabajado.</div>';
 return '<div class="rev-small">Revisar evidencia del punto, horario, pausas y concepto antes de aprobar.</div>';
}
export function calculadasCeldaRevision(x,m=modeloRevision(x)){
 if(x.origen_calculo==='domingo_pendiente_revision_v712')return '<strong>Por validar</strong><small class="rev-small">Domingo o festivo con marcas, con o sin programación.</small>';
 if(requiereRevisionNocturna(x)){
  const bruto=m.brutos;
  return `<strong>${x.detalle?.calculo_pendiente?'Por verificar':Number(x.horas_calculadas||0).toFixed(2)+' h guardadas'}</strong><small class="rev-small">${bruto===null?'Falta un par válido del punto.':'El importe se verifica con las marcas del punto al abrir la revisión.'}</small>`;
 }
 return `<strong>${Number(x.horas_calculadas||0).toFixed(2)} h</strong><small class="rev-small">${duracionRevision(Number(x.horas_calculadas||0)*60)}</small>`;
}

export function contextoComoJornada(e){return {...e.horario,cedula:e.cedula,fecha:e.fecha,evidencia_revision:e,recorrido:e.recorrido,total_marcaciones:e.total_marcaciones,primera_marcacion:e.primera_marcacion,ultima_marcacion:e.ultima_marcacion,horas_reales_pareadas:null,programacion_tipo:e.horario?'confirmada':'Sin programaci\u00f3n',estado_comparacion:e.conflicto_horario?'programacion_a_revisar':e.total_marcaciones===1?'marcaciones_incompletas':!e.total_marcaciones?'programado_sin_marcaciones':e.horario?'comparable':'marcado_sin_programacion'};}
export function columnasRevisionExcel(x){const m=modeloRevision(x);return {'Día':diaSemanaRevision(m.fecha),'Punto comparado':m.punto,'Aclaración del punto':m.seleccion.nota,'Inicio programado':m.p.hora_inicio||'','Salida programada':m.p.hora_fin||'','Entrada comparada':reloj(m.entrada,m.fecha,true),'Salida comparada':reloj(m.salida,m.fecha,true),'Criterio de comparacion':m.base,'Diferencia entrada (min)':m.deltaEntrada===null?null:Math.round(m.deltaEntrada*100)/100,'Diferencia salida (min)':m.deltaSalida===null?null:Math.round(m.deltaSalida*100)/100,'Intervalo observado (h)':m.brutos===null?null:Math.round(m.brutos/60*100)/100,'Total jornada estimado (h)':m.neto===null?null:Math.round(m.neto/60*100)/100,'Criterio del total':m.criterio,'Recargo solo programado':m.requiereNocturno?'SI - REVISAR':'NO'};}
export function crearVisorRevision({rpc,onChanged=()=>{},onError=()=>{},onBusy=()=>{},totalEntreMarcas=false,canWrite=()=>true,confirmacionExplicita=true}){
 let dlg=null,version=0,ocupado=false;
 async function llamada(nombre,args){const r=await rpc(nombre,args);if(r?.error)throw r.error;return r?.data??r;}
 function construir(){if(dlg)return;dlg=document.createElement('dialog');dlg.className='rev-dialog';dlg.innerHTML='<div class="rev-dialog-header"><h2>Turno y marcaciones</h2><button type="button" class="btn btn-outline-secondary btn-sm" data-close>Cerrar</button></div><div class="rev-dialog-body" data-body></div>';document.body.appendChild(dlg);dlg.querySelector('[data-close]').onclick=()=>{if(!ocupado){version++;dlg.close();}};dlg.addEventListener('cancel',e=>{if(ocupado)e.preventDefault();else version++;});dlg.addEventListener('close',()=>{if(!dlg.open){version++;if(ocupado){ocupado=false;onBusy(false);}dlg.querySelector('[data-close]').disabled=false;dlg.querySelector('[data-body]')?.replaceChildren();}});}
 return async function mostrar(x,{nocturno=false}={}){
  if(ocupado)return;
  construir();const actual=++version;ocupado=false;if(!dlg.open)dlg.showModal();dlg.scrollTop=0;const body=dlg.querySelector('[data-body]');body.innerHTML='<p role="status">Consultando evidencia guardada...</p>';
  try{
   const c=await llamada('consultar_evidencia_nomina_v77',{p_items:[{cedula:x.cedula,fecha:str(x.fecha).slice(0,10)}]});if(actual!==version)return;
   const e=c.jornadas?.[0];if(!e)throw new Error('No se obtuvo evidencia para esta persona y fecha.');const fila={...x,evidencia_revision:e},m=modeloRevision(fila);
   const ev=recorridoRevisionHtml(m);
   body.innerHTML=`<h3>${escaparRevision(x.empleado||x.cedula)}</h3><p>${fechaDiaRevision(m.fecha)} \u00b7 ${escaparRevision(m.base)}</p><div class="rev-dialog-grid"><section><h4>Entrada</h4>${comparacionCelda(m,'entrada')}</section><section><h4>Salida</h4>${comparacionCelda(m,'salida')}</section></div><div class="table-responsive"><table class="table table-sm"><thead><tr><th>Fecha y hora</th><th>Punto</th><th>Huellero</th><th>Lectura del recorrido</th></tr></thead><tbody>${ev||'<tr><td colspan="4">No hay marcaciones recibidas.</td></tr>'}</tbody></table></div><p class="rev-aviso">${escaparRevision(m.seleccion.nota||"Comparación con el biométrico del área. Se conservan todas las marcas.")}</p><div class="rev-totales"><p><b>Intervalo observado:</b> ${duracionRevision(m.brutos,true)}</p><p><b>${totalEntreMarcas?"Total entre ingreso y salida (sin descuentos)":"Total neto estimado"}:</b> ${duracionRevision(totalEntreMarcas?m.brutos:m.neto,true)}</p><p>${escaparRevision(totalEntreMarcas?"Salida menos ingreso. Sin descuento autom\u00e1tico de descanso. El intervalo no acredita trabajo continuo ni horas aprobadas.":m.criterio)}</p><p class="rev-small">Se conservan todas las marcas. El nombre del huellero no demuestra por s\u00ed solo el sentido entrada/salida. El total de la jornada no debe sumarse varias veces por tener varios conceptos.</p></div><section id="revisionNocturnaPanel"></section>`;
   if(nocturno||requiereRevisionNocturna(x)){
    const panel=body.querySelector('#revisionNocturnaPanel');panel.innerHTML='<p role="status">Contrastando el recargo con las marcaciones...</p>';
    const p=await llamada('previsualizar_recargo_nocturno_v77',{p_revision_id:x.revision_id||x.id});if(actual!==version)return;
    if(!p.calculable){panel.innerHTML=`<div class="rev-aviso">${escaparRevision(p.motivo)}. No se ha modificado ni aprobado el concepto.</div>`;return;}
    panel.innerHTML=`<h3>Revisar y aprobar tiempo nocturno</h3><p><b>Guardado:</b> ${escaparRevision(p.concepto_anterior)} · ${Number(p.horas_anteriores).toFixed(2)} h.</p><p><b>Tramo observado:</b> ${duracionRevision(p.minutos_observados,true)} · ${escaparRevision(p.punto)}.</p><p><b>Concepto propuesto:</b> ${escaparRevision(p.concepto_codigo)} · ${Number(p.horas_candidatas).toFixed(2)} h.</p><div class="rev-aviso">${escaparRevision(p.criterio)} ${p.extra_nocturna_adicional_segundos>0?'También hay exceso nocturno: revisar el concepto separado para no duplicar tiempo.':''}</div><label for="revHoras">Horas que validas (decimal; máximo ${Number(p.horas_candidatas).toFixed(2)})</label><input id="revHoras" class="form-control" type="number" step="0.01" min="0.01" max="${Number(p.horas_candidatas)}" value="${Number(p.horas_candidatas).toFixed(2)}"><label for="revMotivo">Comentario (opcional)</label><textarea id="revMotivo" maxlength="2000" rows="3" class="form-control" placeholder="Puedes dejarlo en blanco"></textarea>${confirmacionExplicita?'<label class="rev-check"><input type="checkbox" id="revConfirmar"> Revisé las marcas, el punto y las pausas; confirmo las horas y el concepto que voy a guardar.</label>':''}<div class="rev-footer-actions"><button type="button" id="revActualizar" class="btn btn-outline-primary" disabled>Actualizar candidato, sin aprobar</button><button type="button" id="revAprobar" class="btn btn-success" disabled>Aprobar horas verificadas</button></div><p id="revResultado" role="status"></p>`;
    const btn=panel.querySelector('#revActualizar'),aprobar=panel.querySelector('#revAprobar'),mot=panel.querySelector('#revMotivo'),check=panel.querySelector('#revConfirmar'),horas=panel.querySelector('#revHoras'),status=panel.querySelector('#revResultado');
    function habilitar(){const h=Number(horas.value);btn.disabled=ocupado||!canWrite()||(confirmacionExplicita&&!check?.checked);aprobar.disabled=btn.disabled||!horas.value||!Number.isFinite(h)||h<=0||h>Number(p.horas_candidatas);}
    mot.oninput=habilitar;if(check)check.onchange=habilitar;horas.oninput=habilitar;
    async function guardar(decidir){
     if(actual!==version||!dlg.open||ocupado||!canWrite()||(decidir?aprobar:btn).disabled)return;
     ocupado=true;onBusy(true);habilitar();dlg.querySelector('[data-close]').disabled=true;status.textContent=decidir?'Registrando aprobación y auditoría...':'Actualizando candidato, sin aprobar...';
     try{
      const args={p_revision_id:p.revision_id,p_version:p.updated_at,p_huella:p.huella,p_motivo:mot.value.trim()};if(decidir)args.p_horas=Number(horas.value);
      const response=await llamada(decidir?'aprobar_recargo_nocturno_v713':'actualizar_recargo_nocturno_v77',args),saved=Array.isArray(response)?response[0]:response;
      if(actual!==version||!dlg.open)return;
      if(saved?.id!==p.revision_id||(decidir&&saved.estado!=='aprobado'))throw new Error('No se confirmó el estado guardado');
      await onChanged(saved,e);status.textContent=decidir?'Aprobacion confirmada y registrada en auditoria.':'Candidato actualizado; no se aprobó ningún pago.';btn.hidden=aprobar.hidden=true;mot.disabled=horas.disabled=true;if(check)check.disabled=true;
     }catch(err){if(actual===version&&dlg.open){status.textContent='No se confirmo la operacion: '+(err.message||err)+'. Cierra y actualiza antes de reintentar. No se repite automaticamente.';btn.hidden=aprobar.hidden=true;onError(err);}}
     finally{if(actual===version){ocupado=false;onBusy(false);dlg.querySelector('[data-close]').disabled=false;}}
    }
    btn.onclick=()=>guardar(false);aprobar.onclick=()=>guardar(true);habilitar();

   }
  }catch(err){if(actual===version)body.innerHTML=`<div class="rev-aviso">No se pudo consultar la evidencia: ${escaparRevision(err.message||err)}. No se cambiaron registros.</div>`;}
 };
}

export function nocturnoPosteriorRevision(m){
 if(!m.comparable||m.salida===null||!m.b1)return null;
 const a=Math.max(m.entrada,(m.b2||m.b1).end),b=m.salida;if(b<=a)return 0;
 let minutos=0;for(let d=Math.floor(a/1440)*1440;d<=b;d+=1440){minutos+=Math.max(0,Math.min(b,d+360)-Math.max(a,d));minutos+=Math.max(0,Math.min(b,d+1440)-Math.max(a,d+1140));}return minutos;
}
