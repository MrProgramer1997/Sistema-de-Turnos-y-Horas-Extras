-- Migracion ya aplicada en proyecto Supabase Sistema de Turnos y Horas Extras.
-- Solo lecturas de Centro de Control; no modifica registros.
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
        AND cc_analytics.scope_matches(e.area,e.centro_costos,s)
    UNION
    SELECT cp.documento AS codigo
      FROM public.cocina_programacion_turnos r
      JOIN public.cocina_cronograma_personal cp ON cp.id=r.cronograma_personal_id
      WHERE r.fecha BETWEEN p_desde AND p_hasta
        AND coalesce(r.estado,'') !~* 'cancel|rechaz|borrador'
        AND (cp.externo_id IS NOT NULL OR coalesce(cp.tipo_personal,'') ~* 'extern|extra|eventual')
        AND '*'=ANY(s)
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

REVOKE ALL ON FUNCTION cc_analytics.marcaciones_ayb_chef_v1(date,date,bigint,bigint,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION cc_analytics.marcaciones_ayb_chef_v1(date,date,bigint,bigint,integer) TO authenticated;
CREATE OR REPLACE FUNCTION public.consultar_centro_control_marcaciones_ayb_chef_v1(p_desde date, p_hasta date, p_despues bigint DEFAULT 0, p_hasta_id bigint DEFAULT NULL::bigint, p_limite integer DEFAULT 1500)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  SELECT cc_analytics.marcaciones_ayb_chef_v1(
    p_desde,p_hasta,p_despues,p_hasta_id,p_limite
  );
$function$

REVOKE ALL ON FUNCTION public.consultar_centro_control_marcaciones_ayb_chef_v1(date,date,bigint,bigint,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consultar_centro_control_marcaciones_ayb_chef_v1(date,date,bigint,bigint,integer) TO authenticated;
