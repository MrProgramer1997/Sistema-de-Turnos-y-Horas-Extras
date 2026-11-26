
/* Control privado de reportes y registro de envío para evitar duplicados.
 * Tablas públicas con RLS activado, sin políticas para anon/authenticated.
 * Solo service_role (dentro de Edge Functions) puede administrarlas.
 * Si Graph acepta un correo, no se permite reenviar esa fecha automáticamente.
 */
function internal(options={}){
 const env=options.env||((key)=>Deno.env.get(key)?.trim()||'');
 const fetchFn=options.fetch||fetch;
 const url=env('SUPABASE_URL'),key=env('SUPABASE_SERVICE_ROLE_KEY');
 if(!url||!key)throw new Error('No existe conexión interna a Supabase');
 return {url:url.replace(/\/$/,''),key,fetchFn};
}
async function queryRest(path,init,options={}){
 const {url,key,fetchFn}=internal(options);
 const res=await fetchFn(url+'/rest/v1/'+path,{
   ...init,
   headers:{
     apikey:key,Authorization:'Bearer '+key,
     'Content-Type':'application/json',
     Accept:'application/json',
     ...(init.headers||{})
   }
 });
 return res;
}

export async function consultarControlEnvio(options={}){
 const r=await queryRest('cc_reporte_tardanzas_control?select=envio_habilitado,recuperacion_hasta&clave=eq.principal',
   {method:'GET'},options);
 if(!r.ok)throw new Error('No fue posible leer el control de envío (HTTP '+r.status+')');
 const rows=await r.json();
 if(!Array.isArray(rows)||rows.length!==1||typeof rows[0].envio_habilitado!=='boolean')
   throw new Error('Control de envío ausente o inválido');
 return {habilitado:rows[0].envio_habilitado,recuperacion_hasta:rows[0].recuperacion_hasta||null};
}
export function recuperacionPermitida(control,fecha,ahora=new Date()){
 const dates=['2026-11-22','2026-11-23','2026-11-24','2026-11-25'];
 return control.habilitado===true&&dates.includes(fecha)&&
   typeof control.recuperacion_hasta==='string'&&
   Number.isFinite(Date.parse(control.recuperacion_hasta))&&
   ahora.getTime()<Date.parse(control.recuperacion_hasta);
}
export async function reservarEnvio({fecha,tipo},options={}){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(fecha)||
   !['puntualidad','alerta_programacion'].includes(tipo))
   throw new Error('Intento de reserva de envío inválido');
 const r=await queryRest('cc_reporte_tardanzas_envios?select=id,fecha,estado',
   {method:'POST',headers:{Prefer:'return=representation'},
    body:JSON.stringify({fecha,tipo,audiencia:'produccion',estado:'preparando'})},options);
 if(r.status===409)return {reservado:false,motivo:'ya_registrado'};
 if(!r.ok)throw new Error('No fue posible reservar el envío (HTTP '+r.status+')');
 const rows=await r.json();
 if(!Array.isArray(rows)||rows.length!==1||typeof rows[0].id!=='string')
   throw new Error('Reserva de envío sin confirmación');
 return {reservado:true,id:rows[0].id};
}
export async function finalizarEnvio({id,aceptado,httpStatus=0,error=null},options={}){
 if(!/^[0-9a-f-]{36}$/i.test(id))throw new Error('ID de envío inválido');
 const r=await queryRest('cc_reporte_tardanzas_envios?id=eq.'+id+'&select=id,estado',
   {method:'PATCH',headers:{Prefer:'return=representation'},
    body:JSON.stringify({
      estado:aceptado?'aceptado':'error',
      codigo_proveedor:httpStatus||null,
      detalle_error:error||null,
      actualizado_en:new Date().toISOString()
    })},options);
 if(!r.ok)throw new Error('No fue posible guardar estado del envío (HTTP '+r.status+')');
 const rows=await r.json();
 if(!Array.isArray(rows)||rows.length!==1)throw new Error('No se confirmó el estado final del envío');
 return {estado:rows[0].estado};
}
