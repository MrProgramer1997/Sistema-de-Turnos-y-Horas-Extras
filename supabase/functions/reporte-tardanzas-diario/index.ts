import {addDays,bogotaNow} from './centro-control-metricas.js';
import {informeDelDia,correoHTML} from './resumen.js';

/* Edge Function independiente. No modifica turnos ni marcaciones.
 * Auth: REPORT_CRON_TOKEN (>=32 caracteres) en X-Report-Token.
 * Por seguridad el envío está deshabilitado hasta REPORT_ENABLED=true.
 * El proveedor Resend y los destinatarios se configuran en Secrets de Supabase.
 */
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{
 status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}
});
const allowedDate=(v:string)=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&
  !Number.isNaN(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
type Filter=[string,string,string];
const env=(key:string)=>Deno.env.get(key)?.trim()||'';
const todayBogota=()=>bogotaNow().slice(0,10);

async function listRows(table:string,select:string,filters:Filter[]=[],max=12000){
 const url=env('SUPABASE_URL'),key=env('SUPABASE_SERVICE_ROLE_KEY');
 if(!url||!key)throw new Error('La conexión interna de Supabase no está disponible');
 const rows:Record<string,unknown>[]=[];
 const page=750;
 for(let offset=0;offset<max;offset+=page){
   const qp=new URLSearchParams({select});
   for(const [name,op,value] of filters)qp.set(name,op?op+'.'+value:value);
   const response=await fetch(url+'/rest/v1/'+table+'?'+qp.toString(),{
      headers:{apikey:key,Authorization:'Bearer '+key,Range:`${offset}-${offset+page-1}`,Accept:'application/json'}
   });
   if(!response.ok)throw new Error('No fue posible leer '+table+' (HTTP '+response.status+')');
   const batch=await response.json();
   if(!Array.isArray(batch))throw new Error('Respuesta no esperada en '+table);
   rows.push(...batch);
   if(batch.length<page)return rows;
 }
 throw new Error('Demasiados registros al consultar '+table+'; no enviar parcial');
}

async function readDay(fecha:string){
 const prev=addDays(fecha,-1),next2=addDays(fecha,2);
 const [legacy,chef,chefPeople,chefCodes,employees,terminals,requests,notices,appliedNotices,marks]=await Promise.all([
   listRows('programacion_turnos','id,cedula,nombre,fecha,area,subarea,subarea_2,cargo,turno,turno_2,hora_inicio,hora_fin,hora_inicio_2,hora_fin_2,tipo_registro,novedad_codigo,novedad_descripcion',[['fecha','eq',fecha]],3000),
   listRows('cocina_programacion_turnos','id,cronograma_personal_id,fecha,area_cocina,area_cocina_2,codigo_turno,codigo_turno_2,estado,origen_programacion,horario_asignado',[['fecha','eq',fecha]],2000),
   listRows('cocina_cronograma_personal','id,empleado_id,externo_id,documento,nombre_visible,tipo_personal,activo',[],5000),
   listRows('cocina_codigos_turno','id,codigo,descripcion,hora_inicio,hora_fin',[],2000),
   listRows('empleados','id,cedula,codigo,nombres,apellidos,cargo,area,centro_costos,estado,fecha_ingreso',[],5000),
   listRows('biotime_terminales','id,sn,alias,area_name,is_attendance',[],200),
   listRows('solicitudes_empleado','id,empleado_id,cedula,fecha_inicio,fecha_fin,tipo_solicitud,codigo_tipo,estado',[['fecha_inicio','lte',fecha],['or','',`(fecha_fin.is.null,fecha_fin.gte.${fecha})`]],10000),
   listRows('novedades_personal','id,empleado_id,cedula,fecha_inicio,fecha_fin,codigo,descripcion,estado',[['fecha_inicio','lte',fecha],['or','',`(fecha_fin.is.null,fecha_fin.gte.${fecha})`]],10000),
   listRows('novedades_programacion','id,empleado_id,cedula,fecha_inicio,fecha_fin,tipo_novedad,estado',[['fecha_inicio','lte',fecha],['or','',`(fecha_fin.is.null,fecha_fin.gte.${fecha})`]],10000),
   listRows('biotime_marcaciones','biotime_id,emp_code,punch_time,terminal_sn,terminal_alias,area_alias,is_attendance',[
     ['punch_time','gte',prev+'T00:00:00'],['punch_time','lt',next2+'T00:00:00'],['is_attendance','eq','true']
   ],30000)
 ]);
 // Las marcas de Portería se conservan como trazabilidad; el motor sólo
 // usa terminales del punto de trabajo para calcular minutos de tardanza.
 return {ctx:{legacy,chef,chefPeople,chefCodes,employees,terminals,requests,notices,appliedNotices,
   general:[],links:[],processes:[],externals:[],extraQueue:[]},marks};
}

Deno.serve(async (req:Request)=>{
 if(req.method!=='POST')return json({error:'Método no permitido'},405);
 const secret=env('REPORT_CRON_TOKEN');
 if(secret.length<32)return json({error:'REPORT_CRON_TOKEN no configurado'},503);
 const provided=req.headers.get('X-Report-Token')||'';
 if(provided!==secret)return json({error:'No autorizado'},401);
 let input:{mode?:string,date?:string}={};
 try{input=await req.json()}catch{return json({error:'Cuerpo JSON inválido'},400)}
 const preview=input.mode==='preview';
 if(input.mode!=='send'&&!preview)return json({error:'Modo no permitido'},400);
 const ayer=addDays(todayBogota(),-1);
 const fecha=preview&&input.date?input.date:ayer;
 if(!allowedDate(fecha)||fecha<'2026-08-23'||fecha>ayer)return json({error:'Fecha inválida'},400);
 try{
   const {ctx,marks}=await readDay(fecha);
   const info=informeDelDia(ctx,marks,fecha,bogotaNow());
   if(info.turnos===0){
     console.warn('tardanzas_diario: NO_PROGRAMACION, fecha',fecha);
     return json({status:'sin_programacion',fecha,message:'No se encontraron turnos AYB/Chef. No se envía un resultado engañoso.'},409);
   }
   if(preview)return json({status:'vista_previa',...info,html:correoHTML(info)});
   if(env('REPORT_ENABLED')!=='true')return json({status:'desactivado',fecha,message:'Falta autorizar REPORT_ENABLED=true'},503);
   const key=env('RESEND_API_KEY'),from=env('REPORT_FROM_EMAIL');
   const to=env('REPORT_TO_EMAILS').split(',').map(x=>x.trim()).filter(Boolean);
   if(!key||!from||to.length!==5||to.some(x=>!/^\S+@\S+\.\S+$/.test(x)))
     return json({status:'sin_proveedor',fecha,message:'Configurar Resend, remitente verificado y cinco destinatarios'},503);
   const dateDisplay=fecha.split('-').reverse().join('/');
   const resp=await fetch('https://api.resend.com/emails',{
     method:'POST',
     headers:{'Content-Type':'application/json',Authorization:'Bearer '+key,
       'Idempotency-Key':'ccp-tardanzas-ayer-'+fecha},
     body:JSON.stringify({
       from,to,subject:`Puntualidad AYB/Chef | ${dateDisplay} | ${info.tardanzas} tardanzas verificadas`,
       html:correoHTML(info)
     })
   });
   if(!resp.ok){console.error('tardanzas_diario: Resend fallo HTTP',resp.status);
     return json({status:'error_envio',fecha,proveedor_http:resp.status},502);}
   const data=await resp.json();
   console.log('tardanzas_diario: registrado para',fecha,'tardes',info.tardanzas,'comparables',info.comparables);
   return json({status:'enviado',fecha,tardanzas:info.tardanzas,comparables:info.comparables,
     proveedor_id:String(data.id||'')});
 }catch(error){
   console.error('tardanzas_diario: problema de generación',error instanceof Error?error.message:'Error desconocido');
   return json({status:'error_lectura',message:'No se envió; revisar registros internos'},500);
 }
});
