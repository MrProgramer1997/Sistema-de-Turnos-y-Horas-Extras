import {TYPES,esc,todayBogota,addDays,dateText,timeText,daysBetween,requiredDocs,validateForm,validateFiles,resolveDay,stateInfo,receipt} from './portal-mis-turnos-core.js?v=chef-7-3';
import {supabase,call,uploadSupports,openSupport} from './portal-mis-turnos-api.js?v=711';
const $=id=>document.getElementById(id);
let user=null,bundle=null,today=todayBogota(),screen='home',step=1,kind='',files=[],requestId=null,uploaded=null,supplement=null,busy=false,uncertain=false,offset=0,inbox=null,inboxBusy=false,weekStart=today,weekMode=false,scheduleToken=0,refreshTimer=null;
function say(s=''){$('live').textContent=s;}
function fail(e){$('error').hidden=false;$('error').textContent=e?.message||String(e);$('error').scrollIntoView({block:'nearest'});}
function clearError(){$('error').hidden=true;$('error').textContent='';}
function focusHeading(){requestAnimationFrame(()=>{const h=$(screen).querySelector('h1');if(h){h.tabIndex=-1;h.focus({preventScroll:true});}window.scrollTo({top:0,behavior:'auto'});});}
function go(target){
 if(busy){say('Espera a que termine el env\u00edo.');return;}clearError();screen=target;
 document.querySelectorAll('[data-screen]').forEach(el=>el.hidden=el.id!==target);
 if(target==='today')renderSchedule(today);
 if(target==='report')setStep(!supplement&&!kind?1:step);
 if(target==='inbox')loadInbox().catch(fail);
 focusHeading();
}
function setStep(n){step=n;$('stepLabel').textContent=supplement?'Agregar documentos a '+receipt(supplement.id):`Paso ${n} de 3`;document.querySelectorAll('[data-step]').forEach(el=>el.hidden=Number(el.dataset.step)!==n);$('reportTitle').textContent=supplement?'Completar documentos':'Reportar a Bienestar';if(n===2)renderFiles();if(n===3)renderReview();}
function formData(){return {tipo:$('requestType').value,subtipo:$('requestType').value==='incapacidad'?$('requestSubtype').value:'',desde:$('startDate').value,hasta:$('endDate').value,nota:$('note').value.trim()};}
function chooseKind(next){
 if(uncertain){fail('Revisa si el env\u00edo anterior ya aparece en Mis solicitudes. No crees otra solicitud.');return;}
 if(next===kind&&!supplement)return;
 if(files.length&&!confirm('Al cambiar el motivo, se limpiar\u00e1 este formulario. \u00bfContinuar?'))return;
 kind=next;supplement=null;uploaded=null;requestId=null;files=[];$('requestForm').reset();
 $('startDate').readOnly=false;$('endDate').readOnly=false;$('note').disabled=false;$('backType').hidden=false;
 document.querySelectorAll('[data-kind]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.kind===kind)));
 $('typeWrap').hidden=kind==='incapacidad';$('subWrap').hidden=kind!=='incapacidad';
 const keys=kind==='incapacidad'?['incapacidad']:kind==='libre'?['dia_familia','cumpleanos','permiso_no_remunerado']:['calamidad','luto','dia_grado','graduacion','matrimonio'];
 $('requestType').innerHTML=(kind==='incapacidad'?'':'<option value="">Selecciona una opci\u00f3n</option>')+keys.map(k=>`<option value="${k}">${esc(TYPES[k])}</option>`).join('');updateKindHelp();
}
function updateKindHelp(){const noPay=$('requestType').value==='permiso_no_remunerado';$('kindHelp').hidden=!noPay;$('kindHelp').textContent='Este permiso es sin pago. Si no es lo que necesitas, elige otra opci\u00f3n o consulta a Bienestar.';uploaded=null;}
function docsNeeded(){const d=formData();return supplement?.documentos_requeridos||requiredDocs(d.tipo,d.subtipo,daysBetween(d.desde,d.hasta));}
function renderFiles(){
 const req=docsNeeded(),n=daysBetween($('startDate').value,$('endDate').value);$('duration').textContent=n>0?`${n} d\u00eda(s), contando el primero y el \u00faltimo.`:'';
 $('requirements').innerHTML=req.map(d=>`<li>${esc(d)}</li>`).join('');$('docHelp').textContent=req.length?'Adjunta estos documentos para que Bienestar pueda revisar tu solicitud:':'No hay documentos obligatorios para este tipo de solicitud. Puedes agregar un soporte.';
 $('selectedFiles').innerHTML=files.map((entry,i)=>{
  if(req.length===1)entry.tipo_documento=req[0];else if(req.length&&!req.includes(entry.tipo_documento))entry.tipo_documento='';
  return `<div class="file-row"><strong>${esc(entry.file.name)}</strong> <span class="subtle">${Math.max(1,Math.round(entry.file.size/1024))} KB</span><button type="button" data-remove="${i}" aria-label="Quitar ${esc(entry.file.name)}">Quitar</button>${req.length>1?`<label for="fileType${i}">Qu\u00e9 documento es esta foto o PDF</label><select id="fileType${i}" data-file-type="${i}"><option value="">Selecciona el documento</option>${req.map(d=>`<option value="${esc(d)}" ${entry.tipo_documento===d?'selected':''}>${esc(d)}</option>`).join('')}</select>`:''}</div>`;
 }).join('');
}
function addFiles(list){if(busy||uncertain)return;const next=[...files,...Array.from(list).map(file=>({file,tipo_documento:''}))];const error=validateFiles(next.map(x=>x.file));if(error){fail(error);return;}files=next;uploaded=null;clearError();renderFiles();}
function renderReview(){const d=formData();$('review').innerHTML=`<h2>${esc(TYPES[d.tipo])}</h2><p><strong>Desde:</strong> ${esc(dateText(d.desde))}<br><strong>Hasta:</strong> ${esc(dateText(d.hasta))}</p><p><strong>Documentos:</strong> ${files.length} archivo(s)</p>${d.nota?`<p>${esc(d.nota)}</p>`:''}<p class="hint">A nombre de ${esc(bundle.empleado.nombres)} ${esc(bundle.empleado.apellidos)}.</p>`;$('send').textContent=supplement?'Enviar documentos':'S\u00ed, enviar a Bienestar';}
function dayHTML(data,day,weekly=false){
 const r=resolveDay(data,day);
 if(r.title==='Hoy descansas'&&day!==today)r.title=day===addDays(today,1)?'Ma\u00f1ana descansas':'D\u00eda de descanso';
 const blocks=bs=>bs.map((b,i)=>`<div class="schedule-times"><div><span>${i?'Segunda entrada':'Entras a las'}</span><strong>${esc(timeText(b.start))}</strong>${b.startDayOffset?'<small>Del d\u00eda siguiente</small>':''}</div><div><span>Sales a las</span><strong>${esc(timeText(b.end))}</strong>${b.overnight?'<small>Del d\u00eda siguiente</small>':''}</div></div><p class="location"><strong>Lugar:</strong> ${esc(b.place)}</p>`).join('');
 return `<article class="shift ${r.status} ${weekly?'weekly':''}"><p class="hint">${esc(dateText(day))}</p>${r.status==='work'?`<h2>Este es tu turno</h2>${blocks(r.blocks)}`:r.status==='conflict'?`<h2>${esc(r.title)}</h2><p>Confirma con tu jefe antes de desplazarte. No elegimos un horario por ti.</p><details><summary>Ver horarios registrados</summary>${r.details.map(d=>`<p>${esc(d.source==='chef'?'Programaci\u00f3n Chef':d.source==='ayb'?'Programaci\u00f3n A&B':'Programaci\u00f3n general')}</p>${d.blocks.length?blocks(d.blocks):`<p>${esc(d.title||'Sin horario')}</p>`}`).join('')}</details>`:`<h2>${esc(r.title||'Tu turno a\u00fan no est\u00e1 publicado')}</h2>${r.until?`<p>Desde el ${esc(dateText(r.from))} hasta el ${esc(dateText(r.until))}.</p>`:''}${r.hasWorkConflict?'<p class="tip">Tambi\u00e9n hay un turno guardado. Pide a tu jefe confirmar la programaci\u00f3n.</p>':''}${r.status==='unknown'?'<p>Esto no significa que tengas el d\u00eda libre. Consulta con tu jefe.</p>':''}`}</article>`;
}
async function renderSchedule(day=today){
 const token=++scheduleToken,weekly=weekMode,start=weekStart;say('Consultando tu horario...');
 try{
  const result=await call('portal_mis_turnos_v1',{p_desde:addDays(weekly?start:day,-1),p_hasta:weekly?addDays(start,6):day});
  if(token!==scheduleToken)return;if(result.user_id!==user?.id)throw new Error('La sesi\u00f3n cambi\u00f3. Vuelve a ingresar.');
  bundle=result;$('schedule').innerHTML=weekly?Array.from({length:7},(_,i)=>dayHTML(result,addDays(start,i),true)).join(''):dayHTML(result,day);
  $('weekNav').hidden=!weekly;$('dayToday').setAttribute('aria-pressed',String(!weekly&&day===today));$('dayTomorrow').setAttribute('aria-pressed',String(!weekly&&day===addDays(today,1)));$('showWeek').setAttribute('aria-pressed',String(weekly));
 }catch(e){if(token===scheduleToken)fail(e);}finally{if(token===scheduleToken)say('');}
}
function renderInbox(){
 if(!inbox)return;const unread=inbox.avisos.filter(n=>!n.estado_lectura);$('badge').hidden=!unread.length;$('badge').textContent=unread.length;
 $('notices').innerHTML=unread.map(n=>`<article class="notice"><strong>${esc(n.titulo)}</strong><p>${esc(n.mensaje)}</p><button data-read="${esc(n.id)}">Entendido</button></article>`).join('');
 $('requests').innerHTML=inbox.solicitudes.length?inbox.solicitudes.map((s,i)=>{
  const [title,hint,color]=stateInfo(s.estado),docs=s.documentos_cargados||[],responses=s.respuestas||[];
  return `<article class="request"><header><span class="subtle">${esc(receipt(s.id))}</span><span class="badge ${color}">${esc(title)}</span></header><h2>${esc(TYPES[s.tipo_solicitud]||s.tipo_solicitud)}</h2><p>${esc(dateText(s.fecha_inicio))}<br>Hasta ${esc(dateText(s.fecha_fin))}</p><p>${esc(hint)}</p>${s.observacion_revision?`<div class="response"><strong>Respuesta de Bienestar</strong><br>${esc(s.observacion_revision)}</div>`:''}${s.del_portal&&['pendiente','pendiente_documentos','fuera_de_tiempo'].includes(s.estado)?`<button class="btn secondary" data-add-docs="${i}">Agregar documentos</button>`:''}<details><summary>Ver detalle de mi solicitud</summary>${s.observacion_empleado?`<p>${esc(s.observacion_empleado)}</p>`:''}<h3>Documentos enviados</h3>${docs.map((d,j)=>`<button class="btn secondary document" data-open-doc="${i}:${j}">${esc(d.name||'Ver soporte')}</button>`).join('')||'<p>No hay archivos adjuntos.</p>'}${s.documentos_requeridos?.length?`<h3>Documentos solicitados</h3><ul>${s.documentos_requeridos.map(d=>`<li>${esc(d)}</li>`).join('')}</ul>`:''}${responses.length?`<h3>Respuestas anteriores</h3>${responses.map(r=>`<p><strong>${esc(stateInfo(r.estado)[0])}</strong> <span class="subtle">${esc(new Date(r.fecha).toLocaleString('es-CO',{timeZone:'America/Bogota'}))}</span><br>${esc(r.respuesta||'Cambio de estado')}</p>`).join('')}`:''}</details></article>`;
 }).join(''):'<div class="card empty"><h2>A\u00fan no tienes solicitudes</h2><p>Cuando env\u00edes una solicitud a Bienestar, aparecer\u00e1 aqu\u00ed.</p></div>';
 $('requestCount').textContent=inbox.total?`${offset+1}-${offset+inbox.solicitudes.length} de ${inbox.total}`:'0 solicitudes';$('prevRequests').disabled=offset===0;$('nextRequests').disabled=offset+inbox.solicitudes.length>=inbox.total;
}
async function loadInbox(quiet=false){
 if(inboxBusy||!user)return;inboxBusy=true;if(!quiet)say('Consultando tus solicitudes...');
 try{inbox=await call('portal_mis_solicitudes_v1',{p_offset:offset,p_limit:20});renderInbox();}
 finally{inboxBusy=false;if(!quiet)say('');}
}
function startSupplement(index){
 const s=inbox.solicitudes[index];if(!s?.del_portal)return;if(uncertain){fail('Primero comprueba tu env\u00edo anterior.');return;}
 if(files.length&&!confirm('Vas a dejar el formulario actual. \u00bfContinuar?'))return;
 supplement=s;requestId=s.id;files=[];uploaded=null;kind=s.tipo_solicitud;
 $('requestType').innerHTML=`<option value="${esc(s.tipo_solicitud)}">${esc(TYPES[s.tipo_solicitud])}</option>`;$('requestSubtype').value=s.subtipo||'';
 $('startDate').value=s.fecha_inicio;$('endDate').value=s.fecha_fin;$('note').value=s.observacion_empleado||'';$('startDate').readOnly=true;$('endDate').readOnly=true;$('note').disabled=true;$('backType').hidden=true;step=2;go('report');
}
function savePending(){try{sessionStorage.setItem('portal-envio-id',JSON.stringify({id:requestId,user:user.id,supplement:!!supplement}));}catch{}}
function clearPending(){try{sessionStorage.removeItem('portal-envio-id');}catch{}}
function complete(data){
 $('successTitle').textContent=supplement?'Recibimos tus documentos':'Recibimos tu solicitud';$('successReceipt').textContent='N\u00famero de recibido: '+receipt(data.id);$('successState').textContent=stateInfo(data.estado)[0]+'. Enviar no equivale a una aprobaci\u00f3n.';
 clearPending();files=[];uploaded=null;requestId=null;supplement=null;kind='';uncertain=false;step=1;$('requestForm').reset();$('startDate').readOnly=false;$('endDate').readOnly=false;$('note').disabled=false;$('backType').hidden=false;
 document.querySelectorAll('[data-kind]').forEach(b=>b.setAttribute('aria-pressed','false'));$('typeWrap').hidden=true;$('subWrap').hidden=true;$('kindHelp').hidden=true;go('success');
}
async function send(event){
 event.preventDefault();if(busy)return;clearError();const data=formData(),invalid=validateForm(data);if(invalid){fail(invalid);return;}if(supplement&&!files.length){fail('Elige una foto o PDF antes de enviar.');return;}
 busy=true;$('send').disabled=true;$('backDates').disabled=true;$('logout').disabled=true;let submitted=false;
 try{
  requestId=requestId||crypto.randomUUID();savePending();
  if(!uploaded)uploaded=await uploadSupports(user.id,requestId,files,(i,total)=>say(`Subiendo archivo ${i} de ${total}...`));
  say('Enviando a Bienestar. No cierres esta p\u00e1gina.');submitted=true;
  const result=supplement?await call('portal_adjuntar_soportes_v1',{p_id:requestId,p_files:uploaded}):await call('portal_radicar_solicitud_v1',{p_id:requestId,p_datos:{...data,documentos:uploaded}});
  busy=false;complete(result);offset=0;loadInbox(true).catch(()=>{});
 }catch(e){
  if(submitted&&['P0001','22007','22008','23514','42501','23505'].includes(e.code)){uncertain=false;clearPending();fail(e.message);}
  else if(submitted){uncertain=true;fail('No pudimos confirmar la respuesta. No crees otra solicitud. Pulsa de nuevo Enviar para comprobar el mismo env\u00edo o revisa Mis solicitudes.');}
  else{clearPending();fail(e);}
 }finally{busy=false;$('send').disabled=false;$('backDates').disabled=uncertain;$('logout').disabled=false;say('');}
}
function lockAccess(title,text){user=null;inbox=null;bundle=null;clearInterval(refreshTimer);$('portal').hidden=true;$('access').hidden=false;$('access').innerHTML=`<h1>${esc(title)}</h1><p>${esc(text)}</p><a class="btn major" href="login.html">Ir al ingreso</a><p class="hint">Si solo ingresabas con tu c\u00e9dula, Sistemas debe habilitar tu acceso personal. No compartas tu contrase\u00f1a.</p>`;say('');}
async function init(){
 try{
  const {data,error}=await supabase.auth.getUser();if(error||!data?.user){lockAccess('Necesitas tu acceso personal','Para proteger tus datos, este espacio requiere una sesi\u00f3n verificada.');return;}
  user=data.user;const result=await call('portal_mis_turnos_v1',{p_desde:addDays(today,-1),p_hasta:addDays(today,13)});bundle=result;today=result.hoy;
  let old=null;try{old=JSON.parse(localStorage.getItem('ccp_sesion')||'null');}catch{}
  if(old?.cedula&&String(old.cedula)!==String(result.empleado.cedula)){lockAccess('La sesi\u00f3n corresponde a otra persona','Pulsa Salir y vuelve a ingresar con tu acceso personal.');return;}
  $('hello').textContent='Hola, '+result.empleado.nombres;$('dateToday').textContent=dateText(today);const r=resolveDay(bundle,today);$('todayHint').textContent=r.status==='work'?`Entras a las ${timeText(r.blocks[0].start)}`:r.title||'Mira tu hora y lugar de trabajo';$('access').hidden=true;$('portal').hidden=false;
  await loadInbox(true).catch(()=>{});
  let pending=null;try{pending=JSON.parse(sessionStorage.getItem('portal-envio-id')||'null');}catch{}
  if(pending?.user===user.id){
   const found=await call('portal_consultar_recibo_v1',{p_id:pending.id});clearPending();
   if(found?.id){go('inbox');say('Tu env\u00edo anterior aparece como '+stateInfo(found.estado)[0]+'. Revisa sus documentos antes de volver a enviar.');}
   else say('El env\u00edo anterior no se registr\u00f3. Puedes diligenciarlo nuevamente.');
  }
  refreshTimer=setInterval(()=>{if(!document.hidden&&!busy)loadInbox(true).catch(()=>{});},60000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!busy)loadInbox(true).catch(()=>{});});
 }catch(e){lockAccess('No pudimos abrir tu espacio',e.message);}
}
$('logout').addEventListener('click',async()=>{if(busy)return;$('portal').hidden=true;try{await supabase.auth.signOut({scope:'local'});}finally{localStorage.removeItem('ccp_sesion');clearPending();location.href='login.html';}});
document.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>go(b.dataset.go)));
document.querySelectorAll('[data-kind]').forEach(b=>b.addEventListener('click',()=>chooseKind(b.dataset.kind)));
$('requestType').addEventListener('change',updateKindHelp);$('requestSubtype').addEventListener('change',()=>uploaded=null);
$('toDates').addEventListener('click',()=>{if(!kind||!$('requestType').value){fail('Elige el motivo de tu solicitud.');return;}if(kind==='incapacidad'&&!$('requestSubtype').value){fail('Selecciona el tipo de incapacidad.');return;}clearError();setStep(2);focusHeading();});
$('backType').addEventListener('click',()=>{if(!uncertain){setStep(1);focusHeading();}});$('backDates').addEventListener('click',()=>{if(!uncertain){setStep(2);focusHeading();}});
$('startDate').addEventListener('change',()=>{if(!$('endDate').value)$('endDate').value=$('startDate').value;uploaded=null;renderFiles();});$('endDate').addEventListener('change',()=>{uploaded=null;renderFiles();});
$('supportFiles').addEventListener('change',e=>{addFiles(e.target.files);e.target.value='';});$('cameraFile').addEventListener('change',e=>{addFiles(e.target.files);e.target.value='';});
$('selectedFiles').addEventListener('click',e=>{const b=e.target.closest('[data-remove]');if(b&&!busy&&!uncertain){files.splice(Number(b.dataset.remove),1);uploaded=null;renderFiles();}});
$('selectedFiles').addEventListener('change',e=>{if(e.target.matches('[data-file-type]')){files[Number(e.target.dataset.fileType)].tipo_documento=e.target.value;uploaded=null;}});
$('toConfirm').addEventListener('click',()=>{const invalid=validateForm(formData());if(invalid){fail(invalid);return;}clearError();setStep(3);focusHeading();});$('requestForm').addEventListener('submit',send);
$('dayToday').addEventListener('click',()=>{weekMode=false;renderSchedule(today);});$('dayTomorrow').addEventListener('click',()=>{weekMode=false;renderSchedule(addDays(today,1));});$('showWeek').addEventListener('click',()=>{weekMode=true;weekStart=today;renderSchedule();});$('prevWeek').addEventListener('click',()=>{weekStart=addDays(weekStart,-7);renderSchedule();});$('nextWeek').addEventListener('click',()=>{weekStart=addDays(weekStart,7);renderSchedule();});
$('refreshInbox').addEventListener('click',()=>loadInbox().catch(fail));$('prevRequests').addEventListener('click',()=>{offset=Math.max(0,offset-20);loadInbox().catch(fail);});$('nextRequests').addEventListener('click',()=>{offset+=20;loadInbox().catch(fail);});
$('requests').addEventListener('click',e=>{const docs=e.target.closest('[data-open-doc]');if(docs){const [i,j]=docs.dataset.openDoc.split(':').map(Number);openSupport(inbox.solicitudes[i].documentos_cargados[j]).catch(fail);}const add=e.target.closest('[data-add-docs]');if(add)startSupplement(Number(add.dataset.addDocs));});
$('notices').addEventListener('click',async e=>{const b=e.target.closest('[data-read]');if(!b)return;b.disabled=true;try{await call('portal_leer_aviso_v1',{p_id:b.dataset.read});await loadInbox(true);}catch(err){b.disabled=false;fail(err);}});
supabase.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_OUT'||(user&&session?.user&&user.id!==session.user.id))queueMicrotask(()=>lockAccess('Tu sesi\u00f3n cambi\u00f3','Vuelve a ingresar para consultar tu informaci\u00f3n.'));});
window.addEventListener('pagehide',()=>clearInterval(refreshTimer));window.addEventListener('beforeunload',e=>{if(busy){e.preventDefault();e.returnValue='';}});
init();
