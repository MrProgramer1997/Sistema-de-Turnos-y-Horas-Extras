/* Capa aditiva para los radicados del portal. No reemplaza gestion ni calculos. */
window.BienestarPortal = (()=>{
 let client,callbacks,timer,active=false,busy=false,box;
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 async function notices(){
  if(!active||busy||document.hidden)return;busy=true;
  try{
   const {data,error}=await client.rpc('portal_avisos_bienestar_v1',{p_leer:null});
   if(error){box.hidden=true;return;}
   box.hidden=!data?.length;
   box.innerHTML=`<strong>Avisos del portal de empleados (${data.length})</strong><p class="mb-2 small">Solicitudes recibidas o documentos nuevos. No significa que est\u00e9n aprobados.</p><details><summary class="mb-2">Ver avisos pendientes</summary>${data.map(n=>`<div class="d-flex gap-2 align-items-center flex-wrap py-2 border-top"><span class="flex-grow-1">${esc(n.titulo)}</span><button type="button" class="btn btn-sm btn-outline-primary" data-portal-review="${esc(n.referencia_id)}">Ver solicitud</button><button type="button" class="btn btn-sm btn-outline-secondary" data-portal-read="${esc(n.id)}">Marcar visto</button></div>`).join('')}</details><p class="small mb-0" id="portalStaffStatus" role="status"></p>`;
  }catch{if(box)box.hidden=true;}finally{busy=false;}
 }
 async function privateFile(path){
  const popup=window.open('about:blank','_blank');if(popup)popup.opener=null;
  try{
   if(!popup)throw new Error('Permite abrir una ventana para consultar el soporte.');
   const {data,error}=await client.storage.from('mis-turnos-soportes').createSignedUrl(path,60);
   if(error)throw new Error('No tienes acceso a este soporte o tu sesi\u00f3n termin\u00f3.');
   popup.location.replace(data.signedUrl);
  }catch(e){popup?.close();alert(e.message||'No se pudo abrir el soporte privado.');}
 }
 async function init(sb,api){
  if(client)return;client=sb;callbacks=api;
  document.addEventListener('click',async e=>{
   const doc=e.target.closest('[data-portal-file]');if(doc){privateFile(doc.dataset.portalFile);return;}
   const r=e.target.closest('[data-portal-read]'),open=e.target.closest('[data-portal-review]');
   if(!r&&!open)return;const btn=r||open;btn.disabled=true;
   try{
    if(r){const {error}=await client.rpc('portal_avisos_bienestar_v1',{p_leer:r.dataset.portalRead});if(error)throw error;await notices();}
    else{await callbacks.refresh();callbacks.open(open.dataset.portalReview);}
   }catch(e){const status=document.getElementById('portalStaffStatus');if(status)status.textContent='No se pudo completar la consulta. Actualiza la bandeja.';}
   finally{btn.disabled=false;}
  });
  let data;try{({data}=await client.auth.getUser());}catch{return;}if(!data?.user)return;
  box=document.createElement('section');box.className='alert alert-info my-3';box.hidden=true;box.setAttribute('aria-label','Avisos del portal');
  const main=document.querySelector('main')||document.body;main.prepend(box);active=true;
  await notices();timer=setInterval(notices,60000);
  client.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'){active=false;box.hidden=true;clearInterval(timer);}});
  window.addEventListener('pagehide',()=>clearInterval(timer));
 }
 return {init};
})();
