-- Retire Operations base templates without deleting the shared payroll catalog.
create schema operaciones_turnos_v758;
revoke all on schema operaciones_turnos_v758 from public,anon,authenticated;
grant usage on schema operaciones_turnos_v758 to authenticated;
create table operaciones_turnos_v758.eliminados (
 codigo text primary key references nomina_oficios_v726.catalogo(codigo),
 revision_turno bigint not null,
 eliminado_at timestamptz not null default now(),
 eliminado_por uuid not null
);
alter table operaciones_turnos_v758.eliminados enable row level security;
revoke all on operaciones_turnos_v758.eliminados from public,anon,authenticated;

create function operaciones_turnos_v758.consultar(p_desde date,p_hasta date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r jsonb; activos jsonb; eliminados jsonb;
begin
 if auth.uid() is null or not coalesce(operaciones_programacion_v738.autorizado(),false) then
  raise exception 'Sin permiso para Programación Operaciones' using errcode='42501';end if;
 r:=public.consultar_programacion_operaciones_v755(p_desde,p_hasta);
 select coalesce(jsonb_agg(x.value order by x.orden),'[]') into activos
 from jsonb_array_elements(r->'turnos_oficios') with ordinality x(value,orden)
 where not exists(select 1 from operaciones_turnos_v758.eliminados e where e.codigo=x.value->>'codigo');
 select coalesce(jsonb_agg(codigo order by codigo),'[]') into eliminados from operaciones_turnos_v758.eliminados;
 return r||jsonb_build_object('turnos_oficios',activos,'gestion_turnos_base',true,'turnos_base_eliminados',eliminados);
end; $$;

create function operaciones_turnos_v758.eliminar(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare c nomina_oficios_v726.catalogo%rowtype; e operaciones_turnos_v758.eliminados%rowtype; actual bigint; cod text;
begin
 if auth.uid() is null or not coalesce(operaciones_programacion_v738.autorizado(),false) then
  raise exception 'Sin permiso para Programación Operaciones' using errcode='42501';end if;
 if jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'Turno inválido' using errcode='22023';end if;
 cod:=p_payload->>'codigo';
 perform pg_advisory_xact_lock(hashtextextended('ops755:'||coalesce(cod,''),0));
 select * into c from nomina_oficios_v726.catalogo where codigo=cod;
 if not found then raise exception 'Turno base no encontrado' using errcode='22023';end if;
 if exists(select 1 from operaciones_turnos_v758.eliminados where codigo=cod) then
  raise exception 'Este turno ya fue eliminado. Recarga la lista.' using errcode='22023';end if;
 select coalesce(max(revision),0) into actual from operaciones_catalogo_v755.versiones where codigo=cod;
 if nullif(p_payload->>'revision','')::bigint is distinct from actual then
  raise exception 'El turno cambió. Recarga antes de eliminarlo.' using errcode='40001';end if;
 insert into operaciones_turnos_v758.eliminados(codigo,revision_turno,eliminado_por)
 values(cod,actual,auth.uid()) returning * into e;
 insert into operaciones_puestos_v739.auditoria(accion,anterior,nuevo,usuario_id)
 values('eliminar_turno_base_v758',to_jsonb(c),to_jsonb(e),auth.uid());
 return jsonb_build_object('ok',true,'codigo',cod,'eliminado_at',e.eliminado_at);
end; $$;

create function operaciones_turnos_v758.editar(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare cod text;
begin
 if auth.uid() is null or not coalesce(operaciones_programacion_v738.autorizado(),false) then
  raise exception 'Sin permiso para Programación Operaciones' using errcode='42501';end if;
 cod:=p_payload->>'codigo';
 perform pg_advisory_xact_lock(hashtextextended('ops755:'||coalesce(cod,''),0));
 if exists(select 1 from operaciones_turnos_v758.eliminados where codigo=cod) then
  raise exception 'Este turno fue eliminado. Recarga la lista.' using errcode='22023';end if;
 return public.editar_turno_base_operaciones_v755(p_payload);
end; $$;

create function operaciones_turnos_v758.guardar(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare arr jsonb; x jsonb; cod text;
begin
 if auth.uid() is null or not coalesce(operaciones_programacion_v738.autorizado(),false) then
  raise exception 'Sin permiso para Programación Operaciones' using errcode='42501';end if;
 if p_payload is null or jsonb_typeof(p_payload) not in ('object','array') then
  raise exception 'Programación inválida' using errcode='22023';end if;
 arr:=case when jsonb_typeof(p_payload)='array' then p_payload else jsonb_build_array(p_payload) end;
 if jsonb_array_length(arr) not between 1 and 250 then raise exception 'Máximo 250 cambios por guardado' using errcode='22023';end if;
 -- Acquire locks in a consistent order for multi-day copies.
 for cod in select distinct value->>'turno_codigo' from jsonb_array_elements(arr)
  where nullif(value->>'turno_codigo','') is not null order by 1 loop
  perform pg_advisory_xact_lock(hashtextextended('ops755:'||cod,0));
 end loop;
 for x in select value from jsonb_array_elements(arr) loop
  if coalesce(x->>'tipo_registro','turno')='turno' and not coalesce((x->>'personalizado')::boolean,false)
   and not coalesce((x->>'conservar_horario')::boolean,false)
   and exists(select 1 from operaciones_turnos_v758.eliminados e where e.codigo=x->>'turno_codigo') then
   raise exception 'Este turno fue eliminado. Selecciona otro turno disponible.' using errcode='22023';end if;
 end loop;
 -- The existing saver verifies the original shift and timestamp before preserving it.
 return public.guardar_programacion_operaciones_v757(p_payload);
end; $$;

create function public.consultar_programacion_operaciones_v758(p_desde date,p_hasta date)
returns jsonb language sql stable security invoker set search_path='' as $$select operaciones_turnos_v758.consultar(p_desde,p_hasta);$$;
create function public.eliminar_turno_base_operaciones_v758(p_payload jsonb)
returns jsonb language sql security invoker set search_path='' as $$select operaciones_turnos_v758.eliminar(p_payload);$$;
create function public.editar_turno_base_operaciones_v758(p_payload jsonb)
returns jsonb language sql security invoker set search_path='' as $$select operaciones_turnos_v758.editar(p_payload);$$;
create function public.guardar_programacion_operaciones_v758(p_payload jsonb)
returns jsonb language sql security invoker set search_path='' as $$select operaciones_turnos_v758.guardar(p_payload);$$;
revoke all on all functions in schema operaciones_turnos_v758 from public,anon,authenticated;
grant execute on all functions in schema operaciones_turnos_v758 to authenticated;
revoke all on function public.consultar_programacion_operaciones_v758(date,date) from public,anon,authenticated;
revoke all on function public.eliminar_turno_base_operaciones_v758(jsonb) from public,anon,authenticated;
revoke all on function public.editar_turno_base_operaciones_v758(jsonb) from public,anon,authenticated;
revoke all on function public.guardar_programacion_operaciones_v758(jsonb) from public,anon,authenticated;
grant execute on function public.consultar_programacion_operaciones_v758(date,date) to authenticated;
grant execute on function public.eliminar_turno_base_operaciones_v758(jsonb) to authenticated;
grant execute on function public.editar_turno_base_operaciones_v758(jsonb) to authenticated;
grant execute on function public.guardar_programacion_operaciones_v758(jsonb) to authenticated;
