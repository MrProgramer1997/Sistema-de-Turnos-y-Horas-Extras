import { textoHoras728, textoMinutos728, leerMinutos728, horasDesdeTexto728, horasTextoONaN728, enlazarTiempo728 } from './tiempo-aprobacion.js?v=728';
import { fechaDiaRevision, recorridoRevisionHtml } from './revision-punto.js?v=713';
// Sunday evidence creates a review obligation, never an automatic payment.
const text=v=>String(v??'').trim();
const esc=v=>text(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const esDomingoRevision=r=>r?.origen_calculo==='domingo_pendiente_revision_v712';
export function textoCalculoDomingo(r){return ['aprobado','rechazado'].includes(text(r?.estado_revision||r?.estado))?'Sin calculo automatico':'Por validar';}
export function horasDomingo(valor){return horasDesdeTexto728(valor);}
export function duracionDomingo(valor){
 if(valor===null||valor===undefined||valor===''||!Number.isFinite(Number(valor))||Number(valor)<0)return 'No calculable';
 const s=Math.floor(Number(valor));return `${Math.floor(s/3600)} h ${String(Math.floor(s%3600/60)).padStart(2,'0')} min ${String(s%60).padStart(2,'0')} s`;
}
export async function incorporarDomingos(request,desde,hasta,{signal}={}){
 if(signal?.aborted)throw new DOMException('Consulta cancelada','AbortError');
 // A single authorized, idempotent write. Never retry an ambiguous acknowledgement.
 const r=await request('preparar_revision_general_v713',{p_desde:desde,p_hasta:hasta},{read:false,signal});
 if(r?.error)throw r.error;
 const d=r?.data;
 if(!d||d.desde!==desde||d.hasta!==hasta||d.sin_aprobar!==true||!Array.isArray(d.cobertura)||!Number.isSafeInteger(d.insertados)||d.insertados<0||!Number.isSafeInteger(d.actualizados)||d.actualizados<0||d.cobertura.some(x=>!Number.isSafeInteger(x.faltantes)||x.faltantes!==0))throw new Error('No se confirmo la cobertura de domingos y festivos. Actualiza antes de decidir; no se repite automaticamente.');
 return d;
}
let dialog=null,resolver=null,returnFocus=null;
export function cerrarDomingoRevision(){if(!resolver)return;const done=resolver;resolver=null;dialog?.close();done(null);returnFocus?.focus?.();}
export function pedirValidacionDomingo(r,m){
 if(resolver)return Promise.resolve(null);
 if(!dialog){dialog=document.createElement('dialog');dialog.className='dom712-dialog';dialog.setAttribute('aria-labelledby','dom712Titulo');document.body.appendChild(dialog);}
 const d=r.detalle||{},marcas=m.eventos||[];returnFocus=document.activeElement;
 dialog.innerHTML=`<form novalidate class="dom712-form"><header><h2 id="dom712Titulo">Revisar domingo o festivo</h2><button type="button" data-cancel aria-label="Cerrar revision">Cerrar</button></header><div class="dom712-body"><h3>${esc(r.empleado||r.cedula)}</h3><p>${fechaDiaRevision(r.fecha)} &middot; ${esc(r.concepto_codigo)}</p><div class="dom712-intervalo"><strong>Intervalo principal en el punto</strong><span>${esc(duracionDomingo(m.brutos===null?null:m.brutos*60))}</span><small>${esc(m.base||"Punto por verificar")}. Sin descuentos. No son horas pagables confirmadas. La madrugada puede pertenecer a una jornada que comenzo el sabado.</small></div><p>Horario de referencia: <b>${esc(m.p?.hora_inicio||'Sin confirmar')} - ${esc(m.p?.hora_fin||'Sin confirmar')}</b>. ${esc(m.fuente||'')}</p><div class="dom712-tabla"><table><thead><tr><th>Fecha y hora</th><th>Punto</th><th>Huellero</th><th>Lectura</th></tr></thead><tbody>${recorridoRevisionHtml(m)||'<tr><td colspan="4">Falta el recorrido. Actualiza antes de decidir.</td></tr>'}</tbody></table></div><p class="dom712-aviso">Valida trabajo, pausas, horas ya reconocidas en otra jornada y modalidad del concepto. La marca no asigna un compensatorio ni aprueba un pago.</p><label for="dom712Horas">Tiempo que validas para aprobar (horas y minutos)</label><input id="dom712Horas" name="horas" type="text" inputmode="text" placeholder="1 h 26 min" maxlength="30" autocomplete="off" required><label for="dom712Motivo">Explica el tiempo y las pausas validados</label><textarea id="dom712Motivo" name="motivo" rows="3" maxlength="2000" required></textarea><label class="dom712-check"><input name="confirmado" type="checkbox"> Revise las marcaciones y los soportes necesarios. Confirmo estas horas para aprobacion.</label><p role="alert" class="dom712-error"></p></div><footer><button type="button" data-cancel>Cancelar</button><button type="submit" class="dom712-aprobar">Aprobar horas verificadas</button></footer></form>`;
 return new Promise(resolve=>{
  resolver=resolve;
  const terminar=value=>{const done=resolver;resolver=null;dialog.close();done?.(value);returnFocus?.focus?.();};
  dialog.querySelectorAll('[data-cancel]').forEach(b=>b.onclick=()=>terminar(null));
  dialog.oncancel=e=>{e.preventDefault();terminar(null);};
  const form=dialog.querySelector('form');
  form.onsubmit=e=>{e.preventDefault();try{
   const horas=horasDomingo(form.elements.horas.value),motivo=text(form.elements.motivo.value);
   if(motivo.length<10)throw new Error('Explica el tiempo validado y las pausas (minimo 10 caracteres).');
   if(!form.elements.confirmado.checked)throw new Error('Confirma la revision de la evidencia antes de aprobar.');
   const hoy=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());if(text(r.fecha).slice(0,10)>=hoy)throw new Error('La jornada actual permanece visible; se cierra para pago después de terminar el día.');
   if(!marcas.length)throw new Error('Falta el recorrido. Cierra y actualiza la consulta antes de aprobar.');
   terminar({horas,motivo});
  }catch(err){dialog.querySelector('[role=alert]').textContent=err.message;}};
  dialog.showModal();dialog.querySelector('[data-cancel]').focus();
 });
}
