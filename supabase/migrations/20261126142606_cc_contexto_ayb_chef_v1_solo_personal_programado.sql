-- Migración de lectura ya aplicada en Supabase; definiciones consolidadas (sin tocar marcaciones, horarios o aprobaciones).
CREATE OR REPLACE FUNCTION cc_analytics.contexto_ayb_chef_v1(p_desde date, p_hasta date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s text[]; ids uuid[]; codes text[]; result jsonb;
begin
 s:=cc_analytics.read_scope();
 if p_desde is null or p_hasta is null or p_hasta<p_desde or p_hasta-p_desde>96 then raise exception 'Rango de fechas invalido (maximo 97 dias)'; end if;
 select coalesce(array_agg(per.id),'{}'::uuid[]),coalesce(array_agg(per.cedula),'{}'::text[]) into ids,codes from (
 select distinct e.id,e.cedula from public.programacion_turnos p join public.empleados e on e.cedula=p.cedula
 where p.fecha between p_desde and p_hasta
 and (upper(btrim(p.area)) like 'ALIMENTOS Y BEBIDAS%' or upper(btrim(p.area)) in ('AYB','A&B'))
 and cc_analytics.scope_matches(e.area,e.centro_costos,s)
 union
 select distinct e.id,e.cedula from public.cocina_programacion_turnos r
 join public.cocina_cronograma_personal cp on cp.id=r.cronograma_personal_id
 join public.empleados e on e.id=cp.empleado_id or e.cedula=cp.documento
 where r.fecha between p_desde and p_hasta
 and coalesce(r.estado,'') !~* 'cancel|rechaz|borrador'
 and cp.externo_id is null and coalesce(cp.tipo_personal,'') !~* 'extern|extra|eventual'
 and cc_analytics.scope_matches(e.area,e.centro_costos,s)
 ) per;
 result:=jsonb_build_object('scope',to_jsonb(s), 'server_time',now(),
 'employees',(select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) from (select id,cedula,codigo,nombres,apellidos,cargo,area,centro_costos,estado,fecha_ingreso from public.empleados where id=any(ids) order by id) q),
 'terminals',(select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) from (select id,sn,alias,area_name,is_attendance,last_activity,synced_at from public.biotime_terminales order by id) q),
 'externals','[]'::jsonb,
 'extraQueue','[]'::jsonb,
 'links',(select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) from (select id,empleado_id,proceso_id,activo,fecha_inicio,fecha_fin from public.turnos_empleados_proceso where empleado_id=any(ids) order by id) q),
 'processes',(select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) from (select id,codigo,nombre,activo from public.turnos_procesos order by id) q),
 'chefPeople',(select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) from (select id,empleado_id,externo_id,documento,nombre_visible,tipo_personal,activo from public.cocina_cronograma_personal where (empleado_id=any(ids) or documento=any(codes)) and externo_id is null and coalesce(tipo_personal,'') !~* 'extern|extra|eventual' order by id) q),
 'chefCodes',(select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) from (select id,codigo,descripcion,hora_inicio,hora_fin from public.cocina_codigos_turno order by id) q),
 'legacy',(select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) from (select id,cedula,nombre,fecha,area,subarea,subarea_2,cargo,turno,turno_2,hora_inicio,hora_fin,hora_inicio_2,hora_fin_2,tipo_registro,novedad_codigo,novedad_descripcion from public.programacion_turnos where fecha between p_desde and p_hasta and cedula=any(codes) and (upper(btrim(area)) like 'ALIMENTOS Y BEBIDAS%' or upper(btrim(area)) in ('AYB','A&B')) order by id) q),
 'general','[]'::jsonb,
 'chef',(select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) from (select id,cronograma_personal_id,fecha,area_cocina,area_cocina_2,codigo_turno,codigo_turno_2,estado,origen_programacion,horario_asignado from public.cocina_programacion_turnos where fecha between p_desde and p_hasta and coalesce(estado,'') !~* 'cancel|rechaz|borrador' and exists(select 1 from public.cocina_cronograma_personal cp where cp.id=cronograma_personal_id and (cp.empleado_id=any(ids) or cp.documento=any(codes)) and cp.externo_id is null and coalesce(cp.tipo_personal,'') !~* 'extern|extra|eventual') order by id) q),
 'requests',(select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) from (select id,empleado_id,cedula,fecha_inicio,fecha_fin,tipo_solicitud,codigo_tipo,estado from public.solicitudes_empleado where fecha_inicio<=p_hasta and coalesce(fecha_fin,fecha_inicio)>=p_desde and (empleado_id=any(ids) or cedula=any(codes)) order by id) q),
 'notices',(select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) from (select id,empleado_id,cedula,fecha_inicio,fecha_fin,codigo,descripcion,estado from public.novedades_personal where fecha_inicio<=p_hasta and coalesce(fecha_fin,fecha_inicio)>=p_desde and (empleado_id=any(ids) or cedula=any(codes)) order by id) q),
 'appliedNotices',(select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) from (select id,empleado_id,cedula,fecha_inicio,fecha_fin,tipo_novedad,estado from public.novedades_programacion where fecha_inicio<=p_hasta and coalesce(fecha_fin,fecha_inicio)>=p_desde and (empleado_id=any(ids) or cedula=any(codes)) order by id) q));
 return result;
end; $function$
;
REVOKE ALL ON FUNCTION cc_analytics.contexto_ayb_chef_v1(date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION cc_analytics.contexto_ayb_chef_v1(date,date) TO authenticated;
CREATE OR REPLACE FUNCTION public.consultar_centro_control_contexto_ayb_chef_v1(p_desde date, p_hasta date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$ SELECT cc_analytics.contexto_ayb_chef_v1(p_desde,p_hasta); $function$
;
REVOKE ALL ON FUNCTION public.consultar_centro_control_contexto_ayb_chef_v1(date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.consultar_centro_control_contexto_ayb_chef_v1(date,date) TO authenticated;
