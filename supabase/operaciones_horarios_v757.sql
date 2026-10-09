-- Manage reusable Operations templates without deleting saved shifts or references.
alter table operaciones_puestos_v739.horarios
 add column revision bigint not null default 1 check (revision > 0),
 add column eliminado_at timestamptz;

create schema operaciones_horarios_v757;
revoke all on schema operaciones_horarios_v757 from public, anon, authenticated;
grant usage on schema operaciones_horarios_v757 to authenticated;

create function operaciones_horarios_v757.consultar(p_desde date,p_hasta date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r jsonb; disponibles jsonb;
begin
 if auth.uid() is null or not coalesce(operaciones_programacion_v738.autorizado(),false) then
  raise exception 'Sin permiso para Programación Operaciones' using errcode='42501';
 end if;
 r:=public.consultar_organizacion_operaciones_v745(p_desde,p_hasta);
 select coalesce(jsonb_agg(x order by x->>'nombre',x->>'codigo'),'[]') into disponibles
 from jsonb_array_elements(r->'horarios') x where x->>'eliminado_at' is null;
 -- Keep horarios_aplicados, including references to retired templates.
 return r||jsonb_build_object('horarios',disponibles,'gestion_horarios',true);
end; $$;

create function operaciones_horarios_v757.gestionar(p_payload jsonb,p_eliminar boolean)
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare anterior operaciones_puestos_v739.horarios%rowtype;
 nuevo operaciones_puestos_v739.horarios%rowtype; neto numeric; especial numeric;
begin
 if auth.uid() is null or not coalesce(operaciones_programacion_v738.autorizado(),false) then
  raise exception 'Sin permiso para Programación Operaciones' using errcode='42501';
 end if;
 if jsonb_typeof(p_payload) is distinct from 'object' or p_eliminar is null then
  raise exception 'Horario inválido' using errcode='22023';
 end if;
 select * into anterior from operaciones_puestos_v739.horarios
 where id=nullif(p_payload->>'id','')::uuid for update;
 if not found or anterior.eliminado_at is not null then
  raise exception 'El horario ya no está disponible. Recarga la lista.' using errcode='22023';
 end if;
 if nullif(p_payload->>'revision','')::bigint is distinct from anterior.revision then
  raise exception 'El horario cambió. Recarga antes de modificarlo o eliminarlo.' using errcode='40001';
 end if;
 if p_eliminar then
  update operaciones_puestos_v739.horarios set eliminado_at=now(),revision=revision+1
  where id=anterior.id returning * into nuevo;
 else
  nuevo.codigo:=upper(btrim(p_payload->>'codigo'));nuevo.nombre:=btrim(p_payload->>'nombre');
  nuevo.inicio:=nullif(p_payload->>'inicio','')::time;nuevo.fin:=nullif(p_payload->>'fin','')::time;
  nuevo.pausa:=nullif(p_payload->>'pausa','')::integer;
  nuevo.inicio_especial:=coalesce(nullif(p_payload->>'inicio_especial','')::time,nuevo.inicio);
  nuevo.fin_especial:=coalesce(nullif(p_payload->>'fin_especial','')::time,nuevo.fin);
  nuevo.pausa_especial:=coalesce(nullif(p_payload->>'pausa_especial','')::integer,nuevo.pausa);
  if nuevo.codigo is null or nuevo.codigo !~ '^[A-Z0-9_-]{1,40}$'
   or coalesce(length(nuevo.nombre),0) not between 1 and 120 then
   raise exception 'Revisa el código y nombre del horario' using errcode='22023';
  end if;
  if nuevo.inicio is null or nuevo.fin is null or nuevo.inicio=nuevo.fin
   or nuevo.inicio_especial=nuevo.fin_especial or nuevo.pausa is null
   or nuevo.pausa not between 0 and 240 or nuevo.pausa_especial not between 0 and 240 then
   raise exception 'Entrada, salida y descanso no válidos' using errcode='22023';
  end if;
  neto:=extract(epoch from(nuevo.fin-nuevo.inicio))/60+case when nuevo.fin<nuevo.inicio then 1440 else 0 end-nuevo.pausa;
  especial:=extract(epoch from(nuevo.fin_especial-nuevo.inicio_especial))/60+case when nuevo.fin_especial<nuevo.inicio_especial then 1440 else 0 end-nuevo.pausa_especial;
  if neto<=0 or especial<=0 then
   raise exception 'El descanso debe ser menor que la duración del horario' using errcode='22023';
  end if;
  if exists(select 1 from operaciones_puestos_v739.horarios h where h.codigo=nuevo.codigo and h.id<>anterior.id)
   or exists(select 1 from nomina_oficios_v726.catalogo c where c.codigo=nuevo.codigo)
   or exists(select 1 from public.turnos_horarios_base h where h.codigo=nuevo.codigo) then
   raise exception 'Ese código ya existe; utiliza otro código' using errcode='23505';
  end if;
  update operaciones_puestos_v739.horarios set codigo=nuevo.codigo,nombre=nuevo.nombre,
   inicio=nuevo.inicio,fin=nuevo.fin,pausa=nuevo.pausa,
   inicio_especial=nuevo.inicio_especial,fin_especial=nuevo.fin_especial,pausa_especial=nuevo.pausa_especial,
   revision=revision+1 where id=anterior.id returning * into nuevo;
 end if;
 insert into operaciones_puestos_v739.auditoria(accion,anterior,nuevo,usuario_id)
 values(case when p_eliminar then 'eliminar_horario_v757' else 'editar_horario_v757' end,to_jsonb(anterior),to_jsonb(nuevo),auth.uid());
 return jsonb_build_object('ok',true,'horario',to_jsonb(nuevo)-'creado_por');
end; $$;

-- Preserve a saved reusable shift when editing its notes after changing/deleting
-- the template. New assignments still use current active template hours.
create function operaciones_horarios_v757.guardar(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare arr jsonb; x jsonb; payload jsonb; h operaciones_puestos_v739.horarios%rowtype;
 snapshot jsonb; nuevo jsonb; r jsonb; y jsonb; salida jsonb:='[]';
 conservar boolean; externo boolean; f date; persona uuid; proceso uuid;
begin
 if auth.uid() is null or not coalesce(operaciones_programacion_v738.autorizado(),false) then
  raise exception 'Sin permiso para Programación Operaciones' using errcode='42501';
 end if;
 if p_payload is null or jsonb_typeof(p_payload) not in ('object','array') then
  raise exception 'Programación inválida' using errcode='22023';
 end if;
 arr:=case when jsonb_typeof(p_payload)='array' then p_payload else jsonb_build_array(p_payload) end;
 if jsonb_array_length(arr) not between 1 and 250 then
  raise exception 'Máximo 250 cambios por guardado' using errcode='22023';
 end if;
 for x in select value from jsonb_array_elements(arr) loop
  payload:=x;snapshot:=null;conservar:=false;h:=null;
  if nullif(x->>'horario_reutilizable_id','') is not null and coalesce(x->>'tipo_registro','turno')='turno' then
   select * into h from operaciones_puestos_v739.horarios
    where id=(x->>'horario_reutilizable_id')::uuid for share;
   if not found then raise exception 'Horario reutilizable no encontrado' using errcode='22023';end if;
   conservar:=coalesce((x->>'conservar_horario')::boolean,false) and not coalesce((x->>'personalizado')::boolean,false);
   if conservar then
    persona:=(x->>'empleado_id')::uuid;proceso:=(x->>'proceso_id')::uuid;f:=(x->>'fecha')::date;
    externo:=exists(select 1 from operaciones_externos_v741.personal where externo_id=persona);
    if externo then
     select to_jsonb(t) into snapshot from operaciones_externos_v741.programacion t
     where t.externo_id=persona and t.proceso_id=proceso and t.fecha=f and t.estado<>'cancelado'
      and t.tipo_registro='turno' and t.horario_reutilizable_id=h.id for update;
    else
     select to_jsonb(t) into snapshot from public.turnos_programacion t
     join operaciones_puestos_v739.horario_aplicado m on m.programacion_id=t.id and m.horario_id=h.id
     where t.empleado_id=persona and t.proceso_id=proceso and t.fecha=f and t.estado<>'cancelado'
      and t.tipo_registro='turno' and t.horario_base_id is null for update of t;
    end if;
    if snapshot is null or (snapshot->>'updated_at')::timestamptz is distinct from nullif(x->>'esperado_updated_at','')::timestamptz then
     raise exception 'La jornada cambió. Recarga antes de editar.' using errcode='40001';
    end if;
    payload:=(x-array['horario_reutilizable_id','conservar_horario'])||jsonb_build_object('personalizado',true,'turno_codigo',null,
     'hora_inicio',snapshot->'hora_inicio','hora_fin',snapshot->'hora_fin','minutos_descanso',snapshot->'minutos_descanso');
   elsif h.eliminado_at is not null then
    raise exception 'Este horario fue eliminado. Selecciona otro horario disponible.' using errcode='22023';
   end if;
  end if;
  r:=public.guardar_programacion_operaciones_v755(payload);
  for y in select value from jsonb_array_elements(r->'guardados') loop
   if conservar then
    if y->>'id' is distinct from snapshot->>'id' then raise exception 'No se pudo verificar la jornada guardada';end if;
    if externo then
     update operaciones_externos_v741.programacion set horario_reutilizable_id=h.id,turno_nombre=snapshot->>'turno_nombre',
      hora_inicio=(snapshot->>'hora_inicio')::time,hora_fin=(snapshot->>'hora_fin')::time,
      minutos_descanso=(snapshot->>'minutos_descanso')::int,cruza_medianoche=(snapshot->>'cruza_medianoche')::boolean
     where id=(y->>'id')::uuid returning to_jsonb(programacion) into nuevo;
     y:=y||nuevo||jsonb_build_object('empleado_id',nuevo->'externo_id','es_externo',true);
    else
     update public.turnos_programacion set hora_inicio=(snapshot->>'hora_inicio')::time,hora_fin=(snapshot->>'hora_fin')::time,
      minutos_descanso=(snapshot->>'minutos_descanso')::int,cruza_medianoche=(snapshot->>'cruza_medianoche')::boolean
     where id=(y->>'id')::uuid returning to_jsonb(turnos_programacion) into nuevo;
     insert into operaciones_puestos_v739.horario_aplicado(programacion_id,horario_id,inicio,fin,pausa)
     values((y->>'id')::uuid,h.id,(snapshot->>'hora_inicio')::time,(snapshot->>'hora_fin')::time,(snapshot->>'minutos_descanso')::int)
     on conflict(programacion_id) do update set horario_id=excluded.horario_id,inicio=excluded.inicio,fin=excluded.fin,pausa=excluded.pausa,updated_at=now();
     y:=y||nuevo;
    end if;
    insert into operaciones_puestos_v739.auditoria(accion,anterior,nuevo,usuario_id)
    values('conservar_horario_v757',snapshot,nuevo,auth.uid());
   end if;
   salida:=salida||jsonb_build_array(y);
  end loop;
 end loop;
 return jsonb_build_object('ok',true,'guardados',salida,'version','745');
end; $$;

-- Only permission-checked implementations in the private schema run as definer.
create function public.consultar_organizacion_operaciones_v757(p_desde date,p_hasta date)
returns jsonb language sql stable security invoker set search_path='' as $$select operaciones_horarios_v757.consultar(p_desde,p_hasta);$$;
create function public.editar_horario_operaciones_v757(p_payload jsonb)
returns jsonb language sql security invoker set search_path='' as $$select operaciones_horarios_v757.gestionar(p_payload,false);$$;
create function public.eliminar_horario_operaciones_v757(p_payload jsonb)
returns jsonb language sql security invoker set search_path='' as $$select operaciones_horarios_v757.gestionar(p_payload,true);$$;
create function public.guardar_programacion_operaciones_v757(p_payload jsonb)
returns jsonb language sql security invoker set search_path='' as $$select operaciones_horarios_v757.guardar(p_payload);$$;

revoke all on all functions in schema operaciones_horarios_v757 from public,anon,authenticated;
grant execute on all functions in schema operaciones_horarios_v757 to authenticated;
revoke all on function public.consultar_organizacion_operaciones_v757(date,date) from public,anon,authenticated;
revoke all on function public.editar_horario_operaciones_v757(jsonb) from public,anon,authenticated;
revoke all on function public.eliminar_horario_operaciones_v757(jsonb) from public,anon,authenticated;
revoke all on function public.guardar_programacion_operaciones_v757(jsonb) from public,anon,authenticated;
grant execute on function public.consultar_organizacion_operaciones_v757(date,date) to authenticated;
grant execute on function public.editar_horario_operaciones_v757(jsonb) to authenticated;
grant execute on function public.eliminar_horario_operaciones_v757(jsonb) to authenticated;
grant execute on function public.guardar_programacion_operaciones_v757(jsonb) to authenticated;
