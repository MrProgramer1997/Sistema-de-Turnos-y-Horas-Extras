import {addDays,bogotaNow} from './centro-control-metricas.js';
import {informeDelDia,correoHTML} from './resumen.js';
import {destinatariosPara} from './destinatarios.js';
import {enviarCorreoGraph,GraphDeliveryError,GRAPH_SENDER,diagnosticarAutenticacionGraph} from './microsoft-graph-mail.js';
import {consultarPaginado,documentosProgramados} from './consulta-paginada.js';
import {evaluarProgramacion,avisoProgramacionFaltante} from './alerta-programacion.js';
import {consultarControlEnvio,recuperacionPermitida,reservarEnvio,finalizarEnvio} from './control-envios.js';

/* Edge Function independiente. No modifica turnos ni marcaciones.
 * Auth: REPORT_CRON_TOKEN (>=32 caracteres) en X-Report-Token.
 * Activación y duplicados controlados por las tablas RLS privadas de reportes.
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
 const preview=input.mode==='preview',prueba=input.mode==='test',
       diagnose=input.mode==='diagnose',backfill=input.mode==='backfill';
 if(input.mode!=='send'&&!preview&&!prueba&&!diagnose&&!backfill)
   return json({error:'Modo no permitido'},400);
 // Verifica OAuth sin consultar empleados, guardar credenciales ni generar correo.
 if(diagnose){
   if(env('REPORT_TEST_ENABLED')!=='true')return json({status:'diagnostico_desactivado'},503);
   const result=await diagnosticarAutenticacionGraph();
   console.log('tardanzas_diario: diagnostico OAuth',result.status,result.aadsts||'',result.http_status||'');
   return json(result,result.ok?200:502);
 }
 const ayer=addDays(todayBogota(),-1);
 // Operación normal: ayer según Colombia. Backfill restringido al arranque
 // inicial aprobado del 22 al 25/11/2026, con expiración adicional en DB.
 if((input.mode==='send'&&input.date)||(backfill&&!input.date))
   return json({error:'Fecha no permitida para el modo solicitado'},400);
 const fecha=(preview||prueba||backfill)&&input.date?input.date:ayer;
 if(!allowedDate(fecha)||fecha<'2026-08-23'||fecha>ayer)
   return json({error:'Fecha inválida'},400);
 try{
   if(!preview&&!prueba){
     const control=await consultarControlEnvio();
     if(!control.habilitado)return json({status:'desactivado',fecha,message:'Control de envíos desactivado'},503);
     if(backfill&&!recuperacionPermitida(control,fecha))
       return json({status:'recuperacion_no_autorizada',fecha},403);
   }
   const {ctx,marks}=await readDay(fecha);
   const programacion=evaluarProgramacion(ctx,fecha);
   const info=programacion.completa?informeDelDia(ctx,marks,fecha,bogotaNow()):null;
   // Una fecha sin programación en una o ambas áreas produce AVISO operativo,
   // nunca un falso "0 tardanzas". Una lectura DB fallida sigue siendo HTTP 500.
   if(info&&info.turnos===0)
     throw new Error('Programaciones presentes pero no interpretables; se requiere validación');
   const alerta=programacion.completa?null:avisoProgramacionFaltante(programacion,fecha);
   const dateDisplay=fecha.split('-').reverse().join('/');
   const mensajeNormal=info
     ?{subject:`Puntualidad AYB/Chef | ${dateDisplay} | ${info.tardanzas} tardanzas verificadas`,
       html:correoHTML(info)}
     :null;
   const mensaje=alerta||mensajeNormal;
   if(!mensaje)throw new Error('No se pudo construir el informe ni el aviso operativo');
   const {subject,html}=mensaje;
   if(preview)return json(alerta
     ?{status:'vista_previa_alerta',fecha,programacion,asunto:subject,html}
     :{status:'vista_previa',...info,html});
   if(prueba&&env('REPORT_TEST_ENABLED')!=='true')
     return json({status:'prueba_desactivada',fecha,message:'REPORT_TEST_ENABLED debe ser true para ejecutar una prueba de envío'},503);
   const to=destinatariosPara(prueba?'test':'send');
   // Reservar una sola vez por fecha en producción: si ya se aceptó o hay
   // un intento en curso no repetimos el correo sin auditoría manual.
   let envioId:string|null=null;
   if(!prueba){
     const reservado=await reservarEnvio({fecha,tipo:alerta?'alerta_programacion':'puntualidad'});
     if(!reservado.reservado)
       return json({status:'omitido_duplicado',fecha,motivo:'Fecha ya procesada; revisar auditoría de envíos'},200);
     envioId=reservado.id;
   }
   let aceptacion;
   try{
     aceptacion=await enviarCorreoGraph({to,subject:prueba?'[PRUEBA] '+subject:subject,html});
   }catch(error){
     if(envioId){
       try{await finalizarEnvio({id:envioId,aceptado:false,
         httpStatus:error instanceof GraphDeliveryError?error.status:0,
         error:error instanceof GraphDeliveryError?error.stage:'error no clasificado'});}
       catch(ledgerError){console.error('tardanzas_diario: fallo al registrar intento de envío');}
     }
     if(error instanceof GraphDeliveryError){
       console.error('tardanzas_diario: Graph',error.stage,'HTTP',error.status);
       return json({status:'error_envio',fecha,etapa:error.stage,proveedor_http:error.status},502);
     }
     throw error;
   }
   // Microsoft Graph devuelve 202 Accepted: aún no confirma entrega final.
   // Si falla registrar el resultado, la reserva permanece y bloquea reenvíos.
   if(envioId){
     try{await finalizarEnvio({id:envioId,aceptado:true,httpStatus:aceptacion.http_status});}
     catch(_){console.error('tardanzas_diario: Graph aceptó, pero auditoría requiere revisión');
       return json({status:'aceptado_pendiente_auditoria',fecha,destinatarios:to.length,
         proveedor_http:aceptacion.http_status},202);}
   }
   console.log('tardanzas_diario: Graph aceptó',prueba?'PRUEBA':'PRODUCCION',
     'fecha',fecha,'tipo',alerta?'alerta_programacion':'puntualidad',
     'faltan',programacion.faltan.join(',')||'ninguna');
   return json({status:alerta?(prueba?'prueba_alerta_aceptada':'alerta_aceptada'):
                              (prueba?'prueba_aceptada':'envio_aceptado'),
     fecha,
     ...(info?{tardanzas:info.tardanzas,comparables:info.comparables}:
       {tipo:'alerta_programacion',faltan:programacion.faltan,
        empleados_programados:programacion.empleados}),
     destinatarios:to.length,remitente:GRAPH_SENDER,proveedor_http:aceptacion.http_status});
 }catch(error){
   console.error('tardanzas_diario: problema de generación',error instanceof Error?error.message:'Error desconocido');
   return json({status:'error_lectura',message:'No se envió; revisar registros internos'},500);
 }
});
