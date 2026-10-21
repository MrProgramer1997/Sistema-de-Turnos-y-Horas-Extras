-- Fase 7.48: garantiza que todo domingo/festivo con marcaciones tenga
-- un concepto base P006/P007 pendiente de revision. No calcula ni aprueba pagos.
create schema if not exists nomina_domingos_v748;
revoke all on schema nomina_domingos_v748 from public;

create or replace function nomina_domingos_v748.reconciliar_faltantes(
  p_desde date,
  p_hasta date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set jit = 'off'
as $$
declare
  v_insertados integer := 0;
  v_cobertura jsonb := '[]'::jsonb;
begin
  if p_desde is null
     or p_hasta is null
     or p_hasta < p_desde
     or p_hasta - p_desde > 365 then
    raise exception 'Rango invalido: maximo 366 dias' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(748, 6);

  with marcas as (
    select
      m.emp_code::text as cedula,
      m.punch_time::date as fecha,
      count(*)::integer as cantidad,
      min(m.punch_time) as primera,
      max(m.punch_time) as ultima,
      md5(
        jsonb_agg(
          jsonb_build_array(
            m.biotime_id,
            m.emp_code,
            m.punch_time,
            m.terminal_sn,
            coalesce(m.is_attendance, true)
          )
          order by m.punch_time, m.biotime_id
        )::text
      ) as huella
    from public.biotime_marcaciones m
    where m.punch_time >= greatest(p_desde, date '2026-08-23')::timestamp
      and m.punch_time < (p_hasta + 1)::timestamp
      and m.punch_time::date <= (now() at time zone 'America/Bogota')::date
      and coalesce(m.is_attendance, true)
      and (
        extract(isodow from m.punch_time) = 7
        or exists (
          select 1
          from public.festivos fest
          where fest.fecha = m.punch_time::date
            and fest.activo
        )
      )
    group by m.emp_code::text, m.punch_time::date
  ), fuente as (
    select
      m.*,
      e.codigo,
      e.centro_costos,
      trim(concat_ws(' ', e.nombres, e.apellidos)) as empleado,
      e.cargo,
      p.id as proceso_id,
      p.codigo as proceso_codigo,
      p.nombre as proceso_nombre,
      g.codigo as grupo_codigo,
      case
        when exists (
          select 1
          from public.festivos fest
          where fest.fecha = m.fecha
            and fest.activo
        ) then 'P007'
        else 'P006'
      end as concepto,
      jsonb_build_object(
        'calculo_pendiente', true,
        'requiere_validacion_dominical_v712', true,
        'conciliacion_automatica_v748', true,
        'tipo_candidato', 'dia_especial_con_registro_sin_liquidar',
        'criterio', 'Pendiente visible por marcaciones del domingo o festivo, incluso sin programacion. Las horas a pagar y las pausas deben validarse; no se aplica descuento automatico.',
        'total_marcaciones', m.cantidad,
        'primera_marcacion', m.primera,
        'ultima_marcacion', case when m.cantidad > 1 then m.ultima else null end,
        'intervalo_segundos', case when m.cantidad > 1 then extract(epoch from m.ultima - m.primera) else null end,
        'huella_marcaciones', m.huella,
        'empleado', trim(concat_ws(' ', e.nombres, e.apellidos)),
        'cargo', e.cargo,
        'centro_costos', e.centro_costos,
        'fecha_en_curso', m.fecha = (now() at time zone 'America/Bogota')::date,
        'es_festivo', exists (
          select 1
          from public.festivos fest
          where fest.fecha = m.fecha
            and fest.activo
        ),
        'evidencia_incompleta', m.cantidad < 2
          or m.ultima - m.primera < interval '1 hour'
          or m.ultima - m.primera > interval '16 hours',
        'advertencia', 'Verificar entrada, salida, pausas, cruces de medianoche y modalidad del concepto. Presencia no equivale a horas aprobadas.'
      ) as detalle
    from marcas m
    join public.empleados e
      on e.cedula = m.cedula
    left join lateral (
      select ep.proceso_id
      from public.turnos_empleados_proceso ep
      where ep.empleado_id = e.id
        and ep.activo
        and (ep.fecha_inicio is null or ep.fecha_inicio <= m.fecha)
        and (ep.fecha_fin is null or ep.fecha_fin >= m.fecha)
      order by
        case when ep.tipo_vinculo = 'principal' then 0 else 1 end,
        ep.fecha_inicio desc nulls last,
        ep.id
      limit 1
    ) ep on true
    left join public.turnos_procesos p
      on p.id = ep.proceso_id
    left join public.turnos_grupos g
      on g.id = p.grupo_id
    where not exists (
      select 1
      from public.cocina_cronograma_personal cp
      where cp.documento = e.cedula
        and (
          cp.externo_id is not null
          or lower(coalesce(cp.tipo_personal, '')) in ('externo', 'extra', 'eventual')
        )
    )
  ), insertados as (
    insert into public.turnos_conceptos_revision (
      cedula,
      fecha,
      concepto_codigo,
      concepto_nombre,
      horas_calculadas,
      origen_calculo,
      estado,
      elegible_erp,
      codigo_erp,
      detalle,
      grupo_codigo,
      proceso_id,
      proceso_codigo,
      proceso_nombre
    )
    select
      f.cedula,
      f.fecha,
      f.concepto,
      case when f.concepto = 'P007' then 'FESTIVO' else 'DOMINICAL COMPENSADO' end,
      0,
      'domingo_pendiente_revision_v712',
      'pendiente',
      nullif(trim(f.codigo), '') is not null,
      f.codigo,
      f.detalle,
      f.grupo_codigo,
      f.proceso_id,
      f.proceso_codigo,
      f.proceso_nombre
    from fuente f
    where not exists (
      select 1
      from public.turnos_conceptos_revision r
      where r.cedula = f.cedula
        and r.fecha = f.fecha
        and r.concepto_codigo in ('P006', 'P007')
    )
    on conflict (cedula, fecha, concepto_codigo) do nothing
    returning 1
  )
  select count(*) into v_insertados from insertados;

  with dias as (
    select distinct
      m.emp_code::text as cedula,
      m.punch_time::date as fecha
    from public.biotime_marcaciones m
    join public.empleados e
      on e.cedula = m.emp_code::text
    where m.punch_time >= greatest(p_desde, date '2026-08-23')::timestamp
      and m.punch_time < (p_hasta + 1)::timestamp
      and m.punch_time::date <= (now() at time zone 'America/Bogota')::date
      and coalesce(m.is_attendance, true)
      and (
        extract(isodow from m.punch_time) = 7
        or exists (
          select 1
          from public.festivos fest
          where fest.fecha = m.punch_time::date
            and fest.activo
        )
      )
      and not exists (
        select 1
        from public.cocina_cronograma_personal cp
        where cp.documento = e.cedula
          and (
            cp.externo_id is not null
            or lower(coalesce(cp.tipo_personal, '')) in ('externo', 'extra', 'eventual')
          )
      )
  ), agrupado as (
    select
      d.fecha,
      count(*) as personas,
      count(*) filter (
        where not exists (
          select 1
          from public.turnos_conceptos_revision r
          where r.cedula = d.cedula
            and r.fecha = d.fecha
            and r.concepto_codigo in ('P006', 'P007')
        )
      ) as faltantes
    from dias d
    group by d.fecha
  )
  select coalesce(jsonb_agg(to_jsonb(a) order by a.fecha), '[]'::jsonb)
  into v_cobertura
  from agrupado a;

  return jsonb_build_object(
    'desde', p_desde,
    'hasta', p_hasta,
    'insertados', v_insertados,
    'cobertura', v_cobertura,
    'faltantes', coalesce((
      select sum((item ->> 'faltantes')::integer)
      from jsonb_array_elements(v_cobertura) item
    ), 0),
    'sin_aprobar', true
  );
end;
$$;

revoke execute on function nomina_domingos_v748.reconciliar_faltantes(date, date) from public;
revoke execute on function nomina_domingos_v748.reconciliar_faltantes(date, date) from anon;
revoke execute on function nomina_domingos_v748.reconciliar_faltantes(date, date) from authenticated;

comment on function nomina_domingos_v748.reconciliar_faltantes(date, date) is
'Inserta P006/P007 pendientes cuando existen marcaciones de domingo/festivo sin concepto base. No calcula horas aprobadas ni modifica decisiones cerradas.';

select cron.schedule(
  'nomina-dominicales-v748',
  '15 * * * *',
  $cron$
    select nomina_domingos_v748.reconciliar_faltantes(
      greatest(
        date '2026-08-23',
        (now() at time zone 'America/Bogota')::date - 120
      ),
      (now() at time zone 'America/Bogota')::date
    );
  $cron$
);
