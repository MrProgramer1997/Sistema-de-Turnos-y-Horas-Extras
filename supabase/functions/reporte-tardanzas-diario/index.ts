import {addDays,bogotaNow} from './centro-control-metricas.js';
import {informeDelDia,correoHTML} from './resumen.js';
import {destinatariosPara} from './destinatarios.js';
import {enviarCorreoGraph,GraphDeliveryError,GRAPH_SENDER,diagnosticarAutenticacionGraph} from './microsoft-graph-mail.js';
import {consultarPaginado,documentosProgramados} from './consulta-paginada.js';

/* Edge Function independiente. No modifica turnos ni marcaciones.
 * Auth: REPORT_CRON_TOKEN (>=32 caracteres) en X-Report-Token.
 * Por seguridad el envío está deshabilitado hasta REPORT_ENABLED=true.
 * Microsoft Graph envía desde reportes@campestrepereira.com.
 * Entra: limitar el acceso a ese buzón con Exchange Application RBAC.
 * Los destinatarios están definidos en la lista institucional cerrada.
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
 return consultarPaginado({baseUrl:env('SUPABASE_URL'),serviceKey:env('SUPABASE_SERVICE_ROLE_KEY'),
   table,select,filters,max,pageSize:500});
}

async function readDay(fecha:string){
 const prev=addDays(fecha,-1),next2=addDays(fecha,2);
 const [legacy,chef,chefPeople,chefCodes,employees,terminals,requests,notices,appliedNotices]=await Promise.all([
   listRows('programacion_turnos','id,cedula,nombre,fecha,area,subarea,subarea_2,cargo,turno,turno_2,hora_inicio,hora_fin,hora_inicio_2,hora_fin_2,tipo_registro,novedad_codigo,novedad_descripcion',[['fecha','eq',fecha]],3000),
   listRows('cocina_programacion_turnos','id,cronograma_personal_id,fecha,area_cocina,area_cocina_2,codigo_turno,codigo_turno_2,estado,origen_programacion,horario_asignado',[['fecha','eq',fecha]],2000),
   listRows('cocina_cronograma_personal','id,empleado_id,externo_id,documento,nombre_visible,tipo_personal,activo',[],5000),
   listRows('cocina_codigos_turno','id,codigo,descripcion,hora_inicio,hora_fin',[],2000),
   listRows('empleados','id,cedula,codigo,nombres,apellidos,cargo,area,centro_costos,estado,fecha_ingreso',[],5000),
   listRows('biotime_terminales','id,sn,alias,area_name,is_attendance',[],200),
   listRows('solicitudes_empleado','id,empleado_id,cedula,fecha_inicio,fecha_fin,tipo_solicitud,codigo_tipo,estado',[['fecha_inicio','lte',fecha],['or','',`(fecha_fin.is.null,fecha_fin.gte.${fecha})`]],10000),
   listRows('novedades_personal','id,empleado_id,cedula,fecha_inicio,fecha_fin,codigo,descripcion,estado',[['fecha_inicio','lte',fecha],['or','',`(fecha_fin.is.null,fecha_fin.gte.${fecha})`]],10000),
   listRows('novedades_programacion','id,empleado_id,cedula,fecha_inicio,fecha_fin,tipo_novedad,estado',[['fecha_inicio','lte',fecha],['or','',`(fecha_fin.is.null,fecha_fin.gte.${fecha})`]],10000)
 ]);
 const codes=documentosProgramados(legacy,chef,chefPeople,employees);
 if(codes.some(x=>!/^[A-Za-z0-9_-]+$/.test(x)))throw new Error('Código de empleado inválido en programación');
 // Solo marcas de personas programadas AYB y Chef fijo. No se alteran marcas ni filtros por terminal.
 const marks=codes.length?await listRows('biotime_marcaciones',
   'biotime_id,emp_code,punch_time,terminal_sn,terminal_alias,area_alias,is_attendance',[
    ['punch_time','gte',prev+'T00:00:00'],['punch_time','lt',next2+'T00:00:00'],
    ['is_attendance','eq','true'],['emp_code','in',`(${codes.join(',')})`]
   ],12000):[];
 console.log('tardanzas_diario: lectura correcta',fecha,'programaciones',legacy.length+chef.length,
   'personas_programadas',codes.length,'marcas_aplicables',marks.length);
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
 const preview=input.mode==='preview',prueba=input.mode==='test',diagnose=input.mode==='diagnose';
 if(input.mode!=='send'&&!preview&&!prueba&&!diagnose)return json({error:'Modo no permitido'},400);
 // Verifica OAuth sin consultar empleados, guardar credenciales ni generar correo.
 if(diagnose){
   if(env('REPORT_TEST_ENABLED')!=='true')return json({status:'diagnostico_desactivado'},503);
   const result=await diagnosticarAutenticacionGraph();
   console.log('tardanzas_diario: diagnostico OAuth',result.status,result.aadsts||'',result.http_status||'');
   return json(result,result.ok?200:502);
 }
 const ayer=addDays(todayBogota(),-1);
 // La prueba permite verificar un día histórico con programación real;
 // producción SIEMPRE calcula ayer y jamás permite elegir otra fecha.
 const fecha=(preview||prueba)&&input.date?input.date:ayer;
 if(!allowedDate(fecha)||fecha<'2026-08-23'||fecha>ayer)return json({error:'Fecha inválida'},400);
 try{
   const {ctx,marks}=await readDay(fecha);
   const info=informeDelDia(ctx,marks,fecha,bogotaNow());
   if(info.turnos===0){
     console.warn('tardanzas_diario: NO_PROGRAMACION, fecha',fecha);
     return json({status:'sin_programacion',fecha,message:'No se encontraron turnos AYB/Chef. No se envía un resultado engañoso.'},409);
   }
   if(preview)return json({status:'vista_previa',...info,html:correoHTML(info)});
   if(prueba&&env('REPORT_TEST_ENABLED')!=='true')
     return json({status:'prueba_desactivada',fecha,message:'REPORT_TEST_ENABLED debe ser true para ejecutar una prueba de envío'},503);
   if(!prueba&&env('REPORT_ENABLED')!=='true')
     return json({status:'desactivado',fecha,message:'Falta autorizar REPORT_ENABLED=true'},503);
   const to=destinatariosPara(prueba?'test':'send');
   const dateDisplay=fecha.split('-').reverse().join('/');
   const subject=`${prueba?'[PRUEBA] ':''}Puntualidad AYB/Chef | ${dateDisplay} | ${info.tardanzas} tardanzas verificadas`;
   let aceptacion;
   try{
     aceptacion=await enviarCorreoGraph({to,subject,html:correoHTML(info)});
   }catch(error){
     if(error instanceof GraphDeliveryError){
       console.error('tardanzas_diario: Graph',error.stage,'HTTP',error.status);
       return json({status:'error_envio',fecha,etapa:error.stage,proveedor_http:error.status},502);
     }
     throw error;
   }
   // Microsoft Graph devuelve 202 Accepted: aún no confirma entrega final.
   console.log('tardanzas_diario: Graph aceptó',prueba?'PRUEBA':'PRODUCCION',
     'fecha',fecha,'tardes',info.tardanzas,'comparables',info.comparables);
   return json({status:prueba?'prueba_aceptada':'envio_aceptado',
     fecha,tardanzas:info.tardanzas,comparables:info.comparables,
     destinatarios:to.length,remitente:GRAPH_SENDER,proveedor_http:aceptacion.http_status});
 }catch(error){
   console.error('tardanzas_diario: problema de generación',error instanceof Error?error.message:'Error desconocido');
   return json({status:'error_lectura',message:'No se envió; revisar registros internos'},500);
 }
});
