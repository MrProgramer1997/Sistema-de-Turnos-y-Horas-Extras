/* Avisos internos. No solicita permisos push ni modifica la gestion de solicitudes. */
window.BienestarPortal = (()=>{
 let client,callbacks,timer,active=false,busy=false,box,capability=null;
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 async function respuestaEnServidor(){
  if(!client)return false;
  if(!capability)capability=client.rpc('portal_estado_notificaciones_v747').then(({data,error})=>{
   if(error){capability=null;return false;}return data?.respuestas_en_servidor===true;
  }).catch(()=>{capability=null;return false;});
  return capability;
 }
 async function fetchNotices(id=null){
  let {data,error}=await client.rpc('portal_avisos_bienestar_v747',{p_leer:id});
  if(error?.code==='PGRST202'){
   ({data,error}=await client.rpc('portal_avisos_bienestar_v1',{p_leer:id}));
   if(!error)data={avisos:data||[],pendientes:(data||[]).length};
  }
  if(error)throw error;return data;
 }
 async function notices(){
  if(!active||busy||document.hidden)return;busy=true;
  try{
   const data=await fetchNotices(),items=data?.avisos||[],count=data?.pendientes??items.length;
   box.hidden=!count;
   box.innerHTML=`<strong>Avisos de Bienestar (${count})</strong><p class="mb-2 small">Solicitudes recibidas o documentos nuevos. No significa que estén aprobados.</p><details><summary class="mb-2">Ver avisos pendientes</summary>${items.map(n=>`<div class="d-flex gap-2 align-items-center flex-wrap py-2 border-top"><span class="flex-grow-1">${esc(n.titulo)}</span><button type="button" class="btn btn-sm btn-outline-primary" data-portal-review="${esc(n.referencia_id)}">Ver solicitud</button><button type="button" class="btn btn-sm btn-outline-secondary" data-portal-read="${esc(n.id)}">Marcar visto</button></div>`).join('')}</details><p class="small mb-0" id="portalStaffStatus" role="status"></p>`;
  }catch(e){
   if(e?.code==='42501'){box.hidden=true;return;}
   box.hidden=false;
   let status=box.querySelector('#portalStaffStatus');
   if(!status){box.innerHTML='<p id="portalStaffStatus" class="small mb-0" role="status"></p>';status=box.querySelector('#portalStaffStatus');}
   status.textContent='No se pudieron actualizar los avisos. Se reintentará al volver a la página.';
  }finally{busy=false;}
 }
 async function privateFile(path){
  const popup=window.open('about:blank','_blank');if(popup)popup.opener=null;
  try{
   if(!popup)throw new Error('Permite abrir una ventana para consultar el soporte.');
   const {data,error}=await client.storage.from('mis-turnos-soportes').createSignedUrl(path,60);
   if(error)throw new Error('No tienes acceso a este soporte o tu sesión terminó.');
   const url=new URL(data.signedUrl);
   if(url.protocol!=='https:'||url.hostname!=='kzxveqrgvuchcgwrjwjb.supabase.co'||!url.pathname.startsWith('/storage/'))throw new Error('Enlace de soporte no válido.');
   popup.location.replace(url.href);
  }catch(e){popup?.close();alert(e.message||'No se pudo abrir el soporte privado.');}
 }
 function restart(){clearInterval(timer);if(active)timer=setInterval(notices,60000);}
 async function init(sb,api){
  if(client)return;client=sb;callbacks=api;
  document.addEventListener('click',async event=>{
   const doc=event.target.closest('[data-portal-file]');if(doc){privateFile(doc.dataset.portalFile);return;}
   const read=event.target.closest('[data-portal-read]'),open=event.target.closest('[data-portal-review]');
   if(!read&&!open)return;const button=read||open;button.disabled=true;
   try{if(read){await fetchNotices(read.dataset.portalRead);await notices();}else{await callbacks.refresh();callbacks.open(open.dataset.portalReview);}}
   catch{const status=document.getElementById('portalStaffStatus');if(status)status.textContent='No se pudo completar la consulta. Actualiza la bandeja.';}
   finally{button.disabled=false;}
  });
  let data;try{({data}=await client.auth.getUser());}catch{return;}if(!data?.user)return;
  box=document.createElement('section');box.className='alert alert-info my-3';box.hidden=true;box.setAttribute('aria-label','Avisos de Bienestar');
  (document.querySelector('main')||document.body).prepend(box);active=true;
  await respuestaEnServidor();await notices();restart();
  client.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'){active=false;box.hidden=true;clearInterval(timer);}});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)notices();});
  window.addEventListener('pageshow',event=>{if(event.persisted){restart();notices();}});
  window.addEventListener('pagehide',()=>clearInterval(timer));
 }
 return {init,respuestaEnServidor};
})();
