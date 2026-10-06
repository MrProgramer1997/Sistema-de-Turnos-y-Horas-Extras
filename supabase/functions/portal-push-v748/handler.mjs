const ALLOWED_ORIGINS = new Set(['https://turnos.campestrepereira.com','http://127.0.0.1:5500','http://localhost:5500']);
const ACTIONS = new Set(['config','guardar','baja','prueba','avisos','leido']);
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
export function validSubscription(s) {
 try {const u=new URL(s?.endpoint);const host=u.hostname;const allowed=['fcm.googleapis.com','updates.push.services.mozilla.com','web.push.apple.com'].includes(host)||/^[a-z0-9-]+\.notify\.windows\.com$/.test(host);const decode=v=>Uint8Array.from(atob(String(v).replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));const key=decode(s?.keys?.p256dh),auth=decode(s?.keys?.auth);return allowed&&u.protocol==='https:'&&(!u.port||u.port==='443')&&!u.username&&!u.password&&!u.hash&&s.endpoint.length<=4096&&key.length===65&&key[0]===4&&auth.length===16;}catch{return false;}
}
export function pushPayload(job) {
 const bodies={horario:'Tu programacion cambio. Abre Mis Turnos para revisar el horario actualizado.',bienestar:'Tienes una novedad de Bienestar. Abre la app para consultar tu solicitud.',bienestar_equipo:'Hay una solicitud o nuevos soportes para revisar en Bienestar.',prueba:'Las notificaciones de Mis Turnos ya pueden llegar a este dispositivo.'};
 return JSON.stringify({version:754,titulo:'Mis Turnos - Club Campestre',mensaje:bodies[job.clase]||bodies.bienestar,clase:job.clase,id:job.evento,fecha:job.fecha||null,envio:job.id,recibo:job.recibo});
}
export function createHandler({admin,userClient,webpush,fetcher=fetch}) {
 let vapidPromise;
 const rpc=async(name,args)=>{const {data,error}=await admin.rpc(name,args);if(error)throw Object.assign(new Error(error.message),{code:error.code});return data;};
 const vapid=()=>vapidPromise||(vapidPromise=(async()=>{const keys=webpush.generateVAPIDKeys();return await rpc('portal_push_vapid_v748',{p_publica:keys.publicKey,p_privada:keys.privateKey});})().catch(e=>{vapidPromise=null;throw e;}));
 async function dispatch(secret) {
  if(!/^[a-f0-9]{64}$/.test(secret))return {status:401,body:{error:'Acceso reservado'}};
  const batch=await rpc('portal_push_despacho_v748',{p_secreto:secret,p_resultados:[],p_limite:20});
  if(!batch.envios.length)return {status:200,body:{ok:true,procesados:0}};
  const keys=await vapid();const results=[];
  for(let i=0;i<batch.envios.length;i+=4){
   const part=await Promise.all(batch.envios.slice(i,i+4).map(async job=>{let status=0;try{
    if(!validSubscription(job.suscripcion))status=410;
    else {const req=webpush.generateRequestDetails(job.suscripcion,pushPayload(job),{vapidDetails:keys,TTL:86400,contentEncoding:'aes128gcm',urgency:'high',topic:job.evento.replace(/-/g,'').slice(0,32)});const res=await fetcher(req.endpoint,{method:'POST',headers:req.headers,body:req.body,redirect:'error',signal:AbortSignal.timeout(7000)});status=res.status;await res.body?.cancel();}
   }catch{status=0;}return {id:job.id,lease:job.lease,status};}));results.push(...part);
  }
  await rpc('portal_push_despacho_v748',{p_secreto:secret,p_resultados:results,p_limite:0});
  return {status:200,body:{ok:true,procesados:results.length,aceptados:results.filter(r=>r.status>=200&&r.status<300).length}};
 }
 return async function handle(req) {
  const origin=req.headers.get('Origin')||'';
  const headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
  if(ALLOWED_ORIGINS.has(origin))headers['Access-Control-Allow-Origin']=origin;
  const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
  if(origin&&!ALLOWED_ORIGINS.has(origin))return reply({error:'Origen no permitido'},403);
  if(req.method==='OPTIONS')return new Response('ok',{headers});
  if(req.method!=='POST')return reply({error:'Metodo no permitido'},405);
  try {
   const worker=req.headers.get('X-Portal-Push-Key');if(worker){const r=await dispatch(worker);return reply(r.body,r.status);}
   const raw=await req.text();if(raw.length>7000)return reply({error:'Envio demasiado grande'},413);
   let body;try{body=JSON.parse(raw);}catch{return reply({error:'Datos invalidos'},400);}
   // El receptor cerrado no usa credenciales de la cuenta. Este comprobante
   // aleatorio solo permite confirmar el envío que lo incluyó cifrado.
   if(body?.accion==='recibido'){
    if(!uuid(body?.datos?.envio)||!uuid(body?.datos?.recibo))return reply({error:'Recibo invalido'},400);
    const result=await rpc('portal_push_recibo_v754',{p_envio:body.datos.envio,p_recibo:body.datos.recibo});
    return reply(result,result.ok?200:404);
   }
   const bearer=req.headers.get('Authorization')||'';if(!/^Bearer\s+\S+$/i.test(bearer))return reply({error:'Inicia sesion para activar las notificaciones'},401);
   const {data:session,error}=await userClient.auth.getUser(bearer.replace(/^Bearer\s+/i,''));
   if(error||!session?.user||session.user.is_anonymous)return reply({error:'La sesion vencio. Ingresa nuevamente'},401);
   const action=body?.accion;if(!ACTIONS.has(action))return reply({error:'Accion no permitida'},400);
   if(action==='guardar'&&!validSubscription(body?.datos))return reply({error:'El navegador no envio una suscripcion compatible'},400);
   const result=await rpc('portal_push_usuario_v748',{p_usuario:session.user.id,p_accion:action,p_datos:body.datos||{}});
   if(action==='config'){const keys=await vapid();return reply({...result,publicKey:keys.publicKey});}return reply(result);
  }catch(e){console.error('portal-push-v748',e?.code||'error');return reply({error:e?.code==='42501'?'Tu acceso no esta habilitado. Ingresa nuevamente.':e?.message||'No se pudo procesar el aviso. Intenta nuevamente.'},e?.code==='42501'?403:400);}
 };
}
