import { textoHoras728, textoMinutos728, leerMinutos728, horasDesdeTexto728, horasTextoONaN728, enlazarTiempo728 } from './tiempo-aprobacion.js?v=728';
import { usaOficios726 } from './nomina-oficios.js?v=727';
import {usaRevisionAyB721} from './nomina-ayb-candidatos.js?v=721';
import {NOMBRES719} from './nomina-candidatos.js?v=727';
const text=v=>String(v??'').trim();
const esc=v=>text(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const time=v=>v?text(v).slice(0,19).replace('T',' '):'Sin extremo confirmado';
/** On-demand, authenticated preview. No client-supplied calculated amounts
 * are trusted by the save RPC; it reads current marks/templates itself. */
export function crearRevisionSugerida719({rpc,canWrite,onBusy,onSaved,onError,canManual=()=>false,onManual=()=>{}}){
 let dlg=null,version=0,busy=false,context=null,current=null,action='aprobar',focus=null,ayb=false;
 const close=()=>{if(busy)return;version++;context=null;dlg?.close();dlg?.querySelector('[data-content]')?.replaceChildren();focus?.focus?.();};
 async function call(name,args,read){const r=await rpc(name,args,{read});if(r?.error)throw r.error;return r?.data??r;}
 function ensure(){
  if(dlg)return;
  dlg=document.createElement('dialog');dlg.className='nd-dialog';dlg.setAttribute('aria-labelledby','ns719Titulo');
  dlg.innerHTML='<header><h2 id="ns719Titulo">Revisar concepto</h2><button type="button" class="btn btn-outline-secondary btn-sm" data-close>Cerrar</button></header><div class="nd-dialog-body" data-content></div>';
  dlg.querySelector('[data-close]').onclick=close;dlg.addEventListener('cancel',e=>{e.preventDefault();close();});document.body.appendChild(dlg);
 }
 async function load(option=null,preferir=true){
  const v=++version;context=null;
  const body=dlg.querySelector('[data-content]');body.innerHTML='<p role="status">Verificando turno sugerido y marcaciones...</p>';
  try{
   const r=await call(ayb?'previsualizar_ayb_nomina_v721':'previsualizar_sugerencia_nomina_v719',{p_cedula:current.cedula,p_fecha:current.fecha.slice(0,10),p_opcion:option},true);
   if(v!==version||!dlg.open)return;
   if(r?.version!==(ayb?'721':'719')||!Array.isArray(r.evidencia?.opciones)||!Array.isArray(r.conceptos)||!Array.isArray(r.evidencia?.recorrido)||!Array.isArray(r.existentes))throw new Error('No se recibio una revision completa. Actualiza el corte.');
   if(!option&&preferir&&!r.horario){
    const prefer=r.evidencia.opciones.find(o=>o.codigo===(current.jornada_actual?.turno||current.turno))||
      (r.evidencia.opciones.length===1?r.evidencia.opciones[0]:null);
    if(prefer)return load(prefer.key,false);
   }
   context=r;paint();
  }catch(e){if(v!==version)return;body.innerHTML='<p role="alert" class="nd-error">'+esc(e.message||e)+'</p>';}
 }
 function paint(){
  const r=context,x=current,c=r.conceptos.find(z=>z.codigo===x.concepto_codigo),options=r.evidencia.opciones;
  const closed=r.existentes.some(z=>z.codigo===x.concepto_codigo&&['aprobado','rechazado'].includes(z.estado));
  const canApprove=Boolean(c&&Number.isFinite(c.horas_maximas)&&c.horas_maximas>0&&r.jornada_cerrada&&r.horario&&!r.evidencia.novedad&&!closed);
  if(!canApprove && action==='aprobar' && !closed && canManual()){close();void onManual(x);return;}
  const label=action==='aprobar'?'Aprobar este concepto':action==='rechazar'?'Rechazar este concepto':'Guardar comentario';
  const body=dlg.querySelector('[data-content]');
  body.innerHTML=`<form novalidate><h3>${esc(x.empleado||r.evidencia.empleado)}</h3>
   <p>${esc(x.fecha)} &middot; <strong>${esc(x.concepto_codigo)} ${esc(NOMBRES719[x.concepto_codigo])}</strong></p>
   <label for="ns719Turno">Turno para esta revision</label><select id="ns719Turno" class="form-select"><option value="">Selecciona el turno a validar</option>${options.map(o=>`<option value="${esc(o.key)}" ${r.horario?.key===o.key?'selected':''}>${esc(o.nombre||o.codigo)} &middot; ${esc(o.inicio)} a ${esc(o.fin)} &middot; descanso ${esc(o.pausa)} min</option>`).join('')}</select>
   
   <p><strong>Ingreso:</strong> ${esc(time(r.evidencia.entrada))}<br><strong>Salida:</strong> ${esc(time(r.evidencia.salida))}</p>
   ${action==='aprobar'?`<label for="ns719Horas">Tiempo NETO de este concepto (referencia: ${esc(textoHoras728(c?.horas_maximas))})</label><input class="form-control" type="text" inputmode="text" maxlength="30" placeholder="1 h 26 min" id="ns719Horas" value="${esc(c?.horas_maximas == null ? '' : textoHoras728(c.horas_maximas))}" ${canApprove?'':'disabled'}>`:''}
   ${!canApprove&&action==='aprobar'?'<p class="nd-error">Falta seleccionar un turno con un tramo verificable, o la jornada sigue abierta. El caso permanece visible para revisar.</p>':''}
   <label for="ns719Comentario">Comentario ${action==='comentar'?'':'(opcional)'}</label><textarea class="form-control" id="ns719Comentario" maxlength="2000" rows="2"></textarea>
   <details class="nd-evidencia"><summary>Ver marcaciones y otros conceptos</summary><p>${esc(r.criterio)}</p>${c?.descanso_aplicado_723 ? `<p>Tramo: ${esc(c.minutos_brutos)} min. Almuerzo descontado: ${esc(c.descanso_descontado_minutos)} min. Neto: ${esc(c.minutos)} min.</p>` : ''}<p>${(r.evidencia.avisos||[]).map(esc).join(" ")}</p><p>${r.conceptos.map(z=>`${esc(z.codigo)} ${esc(z.nombre)}: ${esc(textoHoras728(z.horas_maximas))} de referencia`).join('<br>')||'Sin intervalo calculable con el turno seleccionado.'}</p>
   <table class="table table-sm"><thead><tr><th>Fecha y hora original</th><th>Punto</th><th>Huellero</th></tr></thead><tbody>${r.evidencia.recorrido.map(m=>`<tr><td>${esc(time(m.hora))}</td><td>${esc(m.punto)}</td><td>${esc(m.terminal)}</td></tr>`).join('')}</tbody></table></details>
   <p class="nd-error" role="alert"></p><footer><button class="btn ${action==='rechazar'?'btn-outline-danger':'btn-success'}" type="submit" ${closed||(action==='aprobar'&&!canApprove)?'disabled':''}>${label}</button></footer></form>`;
  body.querySelector('#ns719Turno').onchange=e=>load(e.target.value||null,false);
  body.querySelector('form').onsubmit=save;
 }
 async function save(ev){
  ev.preventDefault();if(busy||!context||!canWrite())return;
  const body=dlg.querySelector('[data-content]'),error=body.querySelector('[role="alert"]');
  const comment=body.querySelector('#ns719Comentario').value.trim();
  // The explicit submit click is the authorization; no second checkbox.
  const confirmed=action==='aprobar';
  let hours=null;try{if(action==='aprobar')hours=horasDesdeTexto728(body.querySelector('#ns719Horas').value);}catch(e){error.textContent=e.message;return;}
  const c=context.conceptos.find(z=>z.codigo===current.concepto_codigo);
  if(action==='aprobar'&&(!Number.isFinite(hours)||hours<=0||!c||!Number.isFinite(c.horas_maximas)||hours>c.horas_maximas||!context.jornada_cerrada)){error.textContent='Indica horas validas para este concepto.';return;}
  if(action==='comentar'&&!comment){error.textContent='Escribe el comentario que deseas guardar.';return;}
  const ticket=version;busy=true;onBusy(true);dlg.querySelectorAll('button,input,select,textarea').forEach(x=>x.disabled=true);
  try{
   const args={p_cedula:current.cedula,p_fecha:current.fecha.slice(0,10),p_opcion:context.horario?.key||null,p_concepto:current.concepto_codigo,p_accion:action,p_horas:hours,p_comentario:comment||null,p_huella:context.huella};
   if(!ayb&&!usaOficios726(current))args.p_confirmado=confirmed;
   const result=await call(ayb?'resolver_ayb_nomina_v721':usaOficios726(current)?'resolver_oficios_nomina_v726':'resolver_sugerencia_nomina_v719',args,false);
   if(ticket!==version)return;
   const expected=action==='aprobar'?'aprobado':action==='rechazar'?'rechazado':(context.existentes.find(z=>z.codigo===current.concepto_codigo)?.estado||'pendiente');
   if(!result.revision?.id||result.revision.estado!==expected||result.revision.concepto_codigo!==current.concepto_codigo||result.revision.cedula!==current.cedula||result.revision.fecha!==current.fecha.slice(0,10))throw new Error('El servidor no confirmo la decision esperada. Actualiza antes de reintentar.');
   await onSaved(result.revision,current,action);busy=false;close();
  }catch(e){if(ticket===version){error.textContent='No se confirmo la operacion. No se repetira automaticamente. '+(e.message||e);context=null;onError(e);}}
  finally{busy=false;onBusy(false);dlg.querySelector('[data-close]').disabled=false;}
 }
 return {cerrar:()=>{busy=false;close();},async mostrar(x,accion='aprobar'){
  if(busy||!canWrite())return;ensure();focus=document.activeElement;current=x;ayb=usaRevisionAyB721(x);action=accion==='ajustar'?'aprobar':accion;
  if(!dlg.open)dlg.showModal();await load();
 }};
}
