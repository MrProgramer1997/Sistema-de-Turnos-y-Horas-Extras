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
CREATE OR REPLACE FUNCTION cc_analytics.marcaciones_ayb_chef_v1(p_desde date, p_hasta date, p_despues bigint DEFAULT 0, p_hasta_id bigint DEFAULT NULL::bigint, p_limite integer DEFAULT 1500)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  s text[];
  codes text[];
  ceiling bigint;
  total bigint;
  rows_json jsonb;
  cursor_id bigint;
BEGIN
  s:=cc_analytics.read_scope(); -- exige JWT, rol y permiso dashboard.
  IF p_desde IS NULL OR p_hasta IS NULL OR p_hasta<p_desde OR p_hasta-p_desde>96
    THEN RAISE EXCEPTION 'Rango de fechas invalido';
  END IF;
  IF p_limite IS NULL OR p_limite<1 OR p_limite>5000 OR p_despues IS NULL OR p_despues<0
    THEN RAISE EXCEPTION 'Paginacion invalida';
  END IF;
  -- Solo documentos de personas autorizadas y programadas en AYB o Chef.
  SELECT COALESCE(array_agg(DISTINCT codigo),'{}'::text[]) INTO codes
  FROM (
    SELECT e.cedula AS codigo
      FROM public.programacion_turnos p
      JOIN public.empleados e ON e.cedula=p.cedula
      WHERE p.fecha BETWEEN p_desde AND p_hasta
        AND (upper(btrim(p.area)) LIKE 'ALIMENTOS Y BEBIDAS%' OR upper(btrim(p.area)) IN ('AYB','A&B'))
        AND cc_analytics.scope_matches(e.area,e.centro_costos,s)
    UNION
    SELECT e.cedula AS codigo
      FROM public.cocina_programacion_turnos r
      JOIN public.cocina_cronograma_personal cp ON cp.id=r.cronograma_personal_id
      JOIN public.empleados e ON e.id=cp.empleado_id OR e.cedula=cp.documento
      WHERE r.fecha BETWEEN p_desde AND p_hasta
        AND coalesce(r.estado,'') !~* 'cancel|rechaz|borrador'
        AND cp.externo_id IS NULL AND coalesce(cp.tipo_personal,'') !~* 'extern|extra|eventual'
        AND cc_analytics.scope_matches(e.area,e.centro_costos,s)

  ) elegibles
  WHERE nullif(btrim(codigo),'') IS NOT NULL;
  SELECT coalesce(p_hasta_id,max(m.biotime_id),0) INTO ceiling
    FROM public.biotime_marcaciones m
    WHERE m.punch_time>=p_desde::timestamp
      AND m.punch_time<(p_hasta+1)::timestamp
      AND coalesce(m.is_attendance,true)
      AND m.emp_code::text=ANY(codes);
  IF p_despues=0 THEN
    SELECT count(*) INTO total
      FROM public.biotime_marcaciones m
      WHERE m.punch_time>=p_desde::timestamp
        AND m.punch_time<(p_hasta+1)::timestamp
        AND coalesce(m.is_attendance,true)
        AND m.biotime_id<=ceiling
        AND m.emp_code::text=ANY(codes);
  END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.biotime_id),'[]'::jsonb),
         coalesce(max(q.biotime_id),p_despues)
    INTO rows_json,cursor_id
    FROM (
      SELECT m.biotime_id,m.emp_code,m.punch_time,m.terminal_sn,
             m.terminal_alias,m.area_alias,m.is_attendance
        FROM public.biotime_marcaciones m
        WHERE m.punch_time>=p_desde::timestamp
          AND m.punch_time<(p_hasta+1)::timestamp
          AND coalesce(m.is_attendance,true)
          AND m.biotime_id>p_despues
          AND m.biotime_id<=ceiling
          AND m.emp_code::text=ANY(codes)
        ORDER BY m.biotime_id LIMIT p_limite
    ) q;
  RETURN jsonb_build_object('registros',rows_json,'total',total,
      'hasta_id',ceiling,'cursor',cursor_id);
END; $function$
;
