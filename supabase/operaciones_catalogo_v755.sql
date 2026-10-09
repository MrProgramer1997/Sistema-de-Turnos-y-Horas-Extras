-- Additive template editor. Original payroll catalog and saved schedules are untouched.
create schema if not exists operaciones_catalogo_v755;
revoke all on schema operaciones_catalogo_v755 from public, anon, authenticated;

create table operaciones_catalogo_v755.versiones (
 revision bigint generated always as identity primary key,
 codigo text not null references nomina_oficios_v726.catalogo(codigo),
 desde date not null,
 inicio time not null, fin time not null,
 inicio_especial time, fin_especial time,
 pausa integer not null check (pausa between 0 and 240),
 creado_por uuid not null, creado_at timestamptz not null default now(),
 check (inicio <> fin),
 check ((inicio_especial is null) = (fin_especial is null)),
 check (inicio_especial is null or inicio_especial <> fin_especial)
);
alter table operaciones_catalogo_v755.versiones enable row level security;
create index on operaciones_catalogo_v755.versiones(codigo, desde desc, revision desc);
revoke all on operaciones_catalogo_v755.versiones from public, anon, authenticated;

create or replace function public.consultar_programacion_operaciones_v755(p_desde date,p_hasta date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r jsonb; v jsonb;
begin
 if auth.uid() is null or not operaciones_programacion_v738.autorizado() then
  raise exception 'Sin permiso para Programación Operaciones' using errcode='42501';
 end if;
 r:=public.consultar_programacion_operaciones_v745(p_desde,p_hasta);
 select coalesce(jsonb_agg(to_jsonb(x)-array['creado_por','creado_at'] order by x.desde,x.revision),'[]')
 into v from operaciones_catalogo_v755.versiones x;
 return r||jsonb_build_object('versiones_turnos_base',v,'edicion_turnos_base',true);
end; $$;

create or replace function public.editar_turno_base_operaciones_v755(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare c nomina_oficios_v726.catalogo%rowtype; v operaciones_catalogo_v755.versiones%rowtype;
 cod text; fecha date; ini time; fin time; ie time; fe time; pausa int; actual bigint;
begin
 if auth.uid() is null or not operaciones_programacion_v738.autorizado() then
  raise exception 'Sin permiso para Programación Operaciones' using errcode='42501';
 end if;
 if jsonb_typeof(p_payload) is distinct from 'object' then
  raise exception 'Turno base inválido' using errcode='22023';
 end if;
 cod:=p_payload->>'codigo';
 perform pg_advisory_xact_lock(hashtextextended('ops755:'||coalesce(cod,''),0));
 select * into c from nomina_oficios_v726.catalogo where codigo=cod;
 if not found then raise exception 'Turno base no encontrado' using errcode='22023'; end if;
 select coalesce(max(revision),0) into actual from operaciones_catalogo_v755.versiones where codigo=cod;
 if nullif(p_payload->>'revision','')::bigint is distinct from actual then
  raise exception 'El turno base cambió. Recarga antes de editar.' using errcode='40001';
 end if;
 fecha:=nullif(p_payload->>'desde','')::date;
 ini:=nullif(p_payload->>'inicio','')::time; fin:=nullif(p_payload->>'fin','')::time;
 ie:=nullif(p_payload->>'inicio_especial','')::time; fe:=nullif(p_payload->>'fin_especial','')::time;
 pausa:=nullif(p_payload->>'pausa','')::int;
 if fecha is null or fecha<(now() at time zone 'America/Bogota')::date or fecha<c.desde then
  raise exception 'La fecha de aplicación debe ser hoy o posterior' using errcode='22023';
 end if;
 if ini is null or fin is null or ini=fin or pausa is null or pausa not between 0 and 240
  or (ie is null)<>(fe is null) or (ie is not null and ie=fe)
  or (c.solo_lunes and (ie is not null or fe is not null)) then
  raise exception 'Revisa entrada, salida y alimentación del turno' using errcode='22023';
 end if;
 if (extract(epoch from(fin-ini))/60+(case when fin<ini then 1440 else 0 end))<=pausa
  or (ie is not null and (extract(epoch from(fe-ie))/60+(case when fe<ie then 1440 else 0 end))<=pausa) then
  raise exception 'La alimentación debe ser menor que la duración del turno' using errcode='22023';
 end if;
 insert into operaciones_catalogo_v755.versiones(codigo,desde,inicio,fin,inicio_especial,fin_especial,pausa,creado_por)
 values(cod,fecha,ini,fin,ie,fe,pausa,auth.uid()) returning * into v;
 insert into operaciones_puestos_v739.auditoria(accion,anterior,nuevo,usuario_id)
 values('editar_turno_base_v755',jsonb_build_object('codigo',cod,'revision',actual),to_jsonb(v),auth.uid());
 return jsonb_build_object('ok',true,'version',to_jsonb(v)-array['creado_por','creado_at']);
end; $$;

-- Reuse all existing validation, permissions, employee/external routing, calendar,
-- fixed positions and Monday vestier rules. Patch only explicitly saved rows.
create or replace function public.guardar_programacion_operaciones_v755(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare arr jsonb; x jsonb; r jsonb; y jsonb; anterior jsonb; nuevo jsonb;
 salida jsonb:='[]'; v operaciones_catalogo_v755.versiones%rowtype;
 f date; esp boolean; ext boolean; conservar boolean; ini time; fin time; pausa int; snapshot jsonb; a timestamp; b timestamp;
begin
 if auth.uid() is null or not operaciones_programacion_v738.autorizado() then
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
  f:=nullif(x->>'fecha','')::date; v:=null; snapshot:=null;
  conservar:=coalesce((x->>'conservar_horario')::boolean,false);
  if coalesce(x->>'tipo_registro','turno')='turno'
   and not coalesce((x->>'personalizado')::boolean,false)
   and nullif(x->>'horario_reutilizable_id','') is null then
   if conservar then
    if exists(select 1 from operaciones_externos_v741.personal where externo_id=(x->>'empleado_id')::uuid) then
     select to_jsonb(t) into snapshot from operaciones_externos_v741.programacion t
     where t.externo_id=(x->>'empleado_id')::uuid and t.proceso_id=(x->>'proceso_id')::uuid
      and t.fecha=f and t.estado<>'cancelado' and t.tipo_registro='turno' and t.turno_codigo=x->>'turno_codigo' for update;
    else
     select to_jsonb(t) into snapshot from public.turnos_programacion t
     join public.turnos_horarios_base h on h.id=t.horario_base_id
     where t.empleado_id=(x->>'empleado_id')::uuid and t.proceso_id=(x->>'proceso_id')::uuid
      and t.fecha=f and t.estado<>'cancelado' and t.tipo_registro='turno' and h.codigo=x->>'turno_codigo' for update of t;
    end if;
    if snapshot is null or (snapshot->>'updated_at')::timestamptz is distinct from nullif(x->>'esperado_updated_at','')::timestamptz then
     raise exception 'La jornada cambió. Recarga antes de editar.' using errcode='40001';
    end if;
   else
    select * into v from operaciones_catalogo_v755.versiones
    where codigo=x->>'turno_codigo' and desde<=f order by desde desc,revision desc limit 1;
   end if;
  end if;
  r:=public.guardar_programacion_operaciones_v745(x);
  for y in select value from jsonb_array_elements(r->'guardados') loop
   if y->>'tipo_registro'='turno' and (v.revision is not null or snapshot is not null) then
    esp:=extract(isodow from f)=7 or exists(select 1 from public.festivos where fecha=f and activo);
    ini:=case when snapshot is not null then (snapshot->>'hora_inicio')::time when esp then v.inicio_especial else v.inicio end;
    fin:=case when snapshot is not null then (snapshot->>'hora_fin')::time when esp then v.fin_especial else v.fin end;
    pausa:=case when snapshot is not null then (snapshot->>'minutos_descanso')::int else v.pausa end;
    if ini is null or fin is null then raise exception 'El turno no aplica para esa fecha' using errcode='22023'; end if;
    ext:=coalesce((y->>'es_externo')::boolean,false);
    if ext then
     select to_jsonb(t) into anterior from operaciones_externos_v741.programacion t where id=(y->>'id')::uuid;
     update operaciones_externos_v741.programacion set hora_inicio=ini,hora_fin=fin,minutos_descanso=pausa,
      cruza_medianoche=fin<ini,updated_at=now() where id=(y->>'id')::uuid returning to_jsonb(programacion) into nuevo;
    else
     select to_jsonb(t) into anterior from public.turnos_programacion t where id=(y->>'id')::uuid;
     update public.turnos_programacion set hora_inicio=ini,hora_fin=fin,minutos_descanso=pausa,
      cruza_medianoche=fin<ini,updated_at=now() where id=(y->>'id')::uuid returning to_jsonb(turnos_programacion) into nuevo;
    end if;
    if snapshot is null then nuevo:=operaciones_ajustes_v745.normalizar_pausa((y->>'id')::uuid,ext,'Horario base versionado; regla vestier lunes conservada'); end if;
    a:=f+ini; b:=f+fin+case when fin<ini then interval '1 day' else interval '0' end;
    if ext and exists(select 1 from operaciones_externos_v741.programacion t
     where t.externo_id=(y->>'empleado_id')::uuid and t.id<>(y->>'id')::uuid
      and t.fecha between f-1 and f+1 and t.estado<>'cancelado' and t.tipo_registro='turno'
      and t.fecha+t.hora_inicio<b and t.fecha+t.hora_fin+case when t.cruza_medianoche then interval '1 day' else interval '0' end>a) then
     raise exception 'La jornada se cruza con otra programación del externo' using errcode='22023';
    end if;
    insert into operaciones_puestos_v739.auditoria(accion,anterior,nuevo,usuario_id)
    values('aplicar_turno_base_v755',anterior,jsonb_build_object('programacion',nuevo,'revision',v.revision),auth.uid());
    y:=y||nuevo;
    if ext then y:=y||jsonb_build_object('empleado_id',nuevo->'externo_id','es_externo',true); end if;
   end if;
   salida:=salida||jsonb_build_array(y);
  end loop;
 end loop;
 return jsonb_build_object('ok',true,'guardados',salida,'version','745');
end; $$;

revoke all on function public.consultar_programacion_operaciones_v755(date,date) from public,anon;
revoke all on function public.editar_turno_base_operaciones_v755(jsonb) from public,anon;
revoke all on function public.guardar_programacion_operaciones_v755(jsonb) from public,anon;
grant execute on function public.consultar_programacion_operaciones_v755(date,date) to authenticated;
grant execute on function public.editar_turno_base_operaciones_v755(jsonb) to authenticated;
grant execute on function public.guardar_programacion_operaciones_v755(jsonb) to authenticated;
