-- Weekly proposals are reviewed in the UI; application is atomic and only to empty weeks.
create schema operaciones_auto_v759;
revoke all on schema operaciones_auto_v759 from public,anon,authenticated;
grant usage on schema operaciones_auto_v759 to authenticated;
create table operaciones_auto_v759.configuracion(id boolean primary key default true check(id),revision bigint not null default 0,dato jsonb not null default '{}',updated_at timestamptz not null default now(),actualizado_por uuid);
insert into operaciones_auto_v759.configuracion(id) values(true);
create table operaciones_auto_v759.semanas(semana date primary key references operaciones_puestos_v739.semanas(semana),configuracion jsonb not null,condiciones jsonb not null,creado_por uuid not null,created_at timestamptz not null default now());
create table operaciones_auto_v759.relevos(semana date not null references operaciones_auto_v759.semanas(semana),puesto_id uuid not null references operaciones_puestos_v739.puestos(id),fecha date not null,empleado_id uuid not null,programacion_id uuid not null,es_externo boolean not null,programacion_updated_at timestamptz not null,hora_inicio time not null,hora_fin time not null,minutos_descanso integer not null,primary key(puesto_id,fecha),unique(empleado_id,fecha),check(fecha between semana and semana+6));
create table operaciones_auto_v759.reconocimientos(semana date not null references operaciones_auto_v759.semanas(semana),empleado_id uuid not null,fecha date not null,programacion_id uuid not null,es_externo boolean not null,programacion_updated_at timestamptz not null,minutos integer not null check(minutos between 0 and 1440),primary key(empleado_id,fecha));
alter table operaciones_auto_v759.configuracion enable row level security;
alter table operaciones_auto_v759.semanas enable row level security;
alter table operaciones_auto_v759.relevos enable row level security;
alter table operaciones_auto_v759.reconocimientos enable row level security;
create policy acceso_directo_denegado on operaciones_auto_v759.configuracion for all to authenticated using(false) with check(false);
create policy acceso_directo_denegado on operaciones_auto_v759.semanas for all to authenticated using(false) with check(false);
create policy acceso_directo_denegado on operaciones_auto_v759.relevos for all to authenticated using(false) with check(false);
create policy acceso_directo_denegado on operaciones_auto_v759.reconocimientos for all to authenticated using(false) with check(false);
create index relevos_semana_fecha_idx on operaciones_auto_v759.relevos(semana,fecha);
create index reconocimientos_semana_fecha_idx on operaciones_auto_v759.reconocimientos(semana,fecha);
revoke all on all tables in schema operaciones_auto_v759 from public,anon,authenticated;
-- Keep every saved assignment and daily record; split the combined slot for future cycles.
do $$ declare p operaciones_puestos_v739.puestos%rowtype; begin
 select * into p from operaciones_puestos_v739.puestos where clave='PLANTILLA_FILA_21';
 if p.id is not null and not exists(select 1 from operaciones_puestos_v739.puestos where clave='OPS_AUTO_HOYO19') then
  update operaciones_puestos_v739.puestos set orden=orden+1 where orden>p.orden;
  insert into operaciones_puestos_v739.puestos(clave,nombre,orden,fuente) values('OPS_AUTO_HOYO19','HOYO 19',p.orden+1,'Rotación femenina de nueve posiciones, reglas de Operaciones 7.59');
  update operaciones_puestos_v739.puestos set nombre='BAÑOS',revision=revision+1,updated_at=now() where id=p.id;
  insert into operaciones_puestos_v739.auditoria(accion,anterior,nuevo,usuario_id) values('separar_banos_hoyo19_v759',to_jsonb(p),jsonb_build_object('clave_nueva','OPS_AUTO_HOYO19','nombre','BAÑOS'),null);
 end if;
end $$;

create function operaciones_auto_v759.exigir() returns void language plpgsql stable security definer set search_path='' as $$
#variable_conflict use_column
begin
 if auth.uid() is null or not coalesce(operaciones_programacion_v738.autorizado(),false) then raise exception 'Sin permiso para Programación Operaciones' using errcode='42501';end if;
end $$;

create function operaciones_auto_v759.guardar_config(p_dato jsonb,p_revision bigint) returns jsonb language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
#variable_conflict use_column
declare r bigint;x jsonb;ciclo jsonb;ids uuid[];
begin
 perform operaciones_auto_v759.exigir();
 if jsonb_typeof(p_dato) is distinct from 'object' or coalesce((p_dato->>'confirmada')::boolean,false) is not true or length(p_dato::text)>150000 then raise exception 'Confirma los grupos, el sexo de cobertura y los horarios' using errcode='22023';end if;
 if jsonb_typeof(p_dato->'personas') is distinct from 'array' or jsonb_typeof(p_dato->'puestos') is distinct from 'array' or jsonb_array_length(p_dato->'personas')>250 or (select count(*) from jsonb_array_elements(p_dato->'personas')person where person.value->>'rol'<>'excluir')>35 then raise exception 'Configuración de personal inválida (máximo 35 personas)' using errcode='22023';end if;
 for ciclo in select value from jsonb_each(p_dato->'ciclos') loop
  if jsonb_typeof(ciclo) is distinct from 'array' or jsonb_array_length(ciclo)<>9 or (select count(distinct value) from jsonb_array_elements(ciclo))<>9 then raise exception 'Cada rotación debe tener nueve puestos diferentes' using errcode='22023';end if;
 end loop;
 if jsonb_typeof(p_dato->'ciclos'->'hombres') is distinct from 'array' or jsonb_typeof(p_dato->'ciclos'->'mujeres') is distinct from 'array' or (select count(*) from jsonb_object_keys(p_dato->'ciclos'))<>2 then raise exception 'Completa las dos rotaciones' using errcode='22023';end if;
 select array_agg(value::uuid) into ids from jsonb_array_elements_text((p_dato->'ciclos'->'hombres')||(p_dato->'ciclos'->'mujeres'));
 if (select count(distinct x) from unnest(ids)x)<>18 or (select count(*) from operaciones_puestos_v739.puestos where id=any(ids))<>18 then raise exception 'Los puestos de las dos rotaciones deben ser distintos y existentes' using errcode='22023';end if;
 if p_dato->>'aseo_festivo' not in ('revisar','mantener','martes') then raise exception 'Revisa la regla del aseo del lunes festivo' using errcode='22023';end if;
 if (select count(distinct value->>'id') from jsonb_array_elements(p_dato->'puestos'))<>jsonb_array_length(p_dato->'puestos') then raise exception 'Puestos repetidos' using errcode='22023';end if;
 for x in select value from jsonb_array_elements(p_dato->'puestos') loop
  if not exists(select 1 from operaciones_puestos_v739.puestos where id=(x->>'id')::uuid) or x->>'tipo' not in ('normal','flexible','vestier_h_am','vestier_h_pm','damas_am','damas_pm','tenis_am','tenis_pm','porteria','parqueadero') or coalesce(x->>'sexo','') not in ('','M','F') then raise exception 'Regla de puesto inválida' using errcode='22023';end if;
  if (x->>'tipo' like 'vestier_h_%' and x->>'sexo'<>'M') or (x->>'tipo' like 'damas_%' or x->>'tipo' like 'tenis_%') and x->>'sexo'<>'F' then raise exception 'Confirma el sexo requerido para vestieres y Tenis' using errcode='22023';end if;
  if not exists(select 1 from operaciones_puestos_v739.puestos where id=(x->>'referencia_id')::uuid) then raise exception 'Puesto de referencia no encontrado' using errcode='22023';end if;
  for ciclo in select to_jsonb(value) from unnest(array[x->>'normal',x->>'aseo',x->>'especial'])value loop
   if ciclo #>> '{}' is distinct from 'historial' and not exists(select 1 from operaciones_puestos_v739.horarios where id=nullif(replace(ciclo #>> '{}','reutilizable:',''),'')::uuid and eliminado_at is null) then raise exception 'Selecciona un horario vigente o la referencia histórica' using errcode='22023';end if;
  end loop;
 end loop;
 for ciclo in select value from jsonb_array_elements(p_dato->'ciclos'->'hombres') loop
  if not exists(select 1 from jsonb_array_elements(p_dato->'puestos')slot where slot.value->>'id'=ciclo #>> '{}' and slot.value->>'sexo'='M') then raise exception 'Confirma los puestos de la rotación masculina' using errcode='22023';end if;
 end loop;
 for ciclo in select value from jsonb_array_elements(p_dato->'ciclos'->'mujeres') loop
  if not exists(select 1 from jsonb_array_elements(p_dato->'puestos')slot where slot.value->>'id'=ciclo #>> '{}' and slot.value->>'sexo'='F') then raise exception 'Confirma los puestos de la rotación femenina, incluidos Baños y Hoyo 19' using errcode='22023';end if;
 end loop;
 if (select count(*) from jsonb_array_elements(p_dato->'puestos')x where x->>'tipo'='vestier_h_am' and (x->>'obligatorio')::boolean)<>1 or (select count(*) from jsonb_array_elements(p_dato->'puestos')x where x->>'tipo'='vestier_h_pm' and (x->>'obligatorio')::boolean)<>2 then raise exception 'Vestier Hombres requiere un puesto AM y dos PM' using errcode='22023';end if;
 if (select count(*) from jsonb_array_elements(p_dato->'puestos')x where x->>'tipo' in ('damas_am','damas_pm','tenis_am','tenis_pm') and (x->>'obligatorio')::boolean)<>4 then raise exception 'Vestier Damas y Tenis requieren sus puestos AM y PM' using errcode='22023';end if;
 if (select count(distinct value->>'empleado_id') from jsonb_array_elements(p_dato->'personas'))<>jsonb_array_length(p_dato->'personas') then raise exception 'Personal repetido' using errcode='22023';end if;
 for x in select value from jsonb_array_elements(p_dato->'personas') loop
  if x->>'rol' not in ('rotar_h','rotar_m','fijo','flexible','apoyo_am','apoyo_pm','coordinador','excluir') or coalesce(x->>'sexo','') not in ('','M','F') then raise exception 'Revisa el grupo y sexo de cobertura' using errcode='22023';end if;
  if x->>'rol' in ('rotar_h','apoyo_am') and x->>'sexo'<>'M' or x->>'rol' in ('rotar_m','apoyo_pm') and x->>'sexo'<>'F' then raise exception 'Confirma el sexo de los grupos de rotación y apoyo' using errcode='22023';end if;
  if x->>'rol' in ('apoyo_am','apoyo_pm') and x->>'turno_apoyo'<>'historial' and not exists(select 1 from operaciones_puestos_v739.horarios where id=replace(x->>'turno_apoyo','reutilizable:','')::uuid and eliminado_at is null) then raise exception 'Selecciona el horario vigente del apoyo' using errcode='22023';end if;
  if not exists(select 1 from public.empleados where id=(x->>'empleado_id')::uuid) and not exists(select 1 from operaciones_externos_v741.personal where externo_id=(x->>'empleado_id')::uuid) then raise exception 'Colaborador no encontrado' using errcode='22023';end if;
 end loop;
 for x in select to_jsonb(t) from jsonb_each(p_dato->'reconocidos')t loop
  if x->>'key' not in ('F','CUMPLE','VOT','DP','DF') or (x->>'value')::integer not between 0 and 1440 then raise exception 'Revisa las horas reconocidas' using errcode='22023';end if;
 end loop;
 select revision into r from operaciones_auto_v759.configuracion where id for update;
 if r is distinct from p_revision then raise exception 'Las reglas cambiaron. Recarga antes de guardar.' using errcode='40001';end if;
 update operaciones_auto_v759.configuracion set dato=p_dato,revision=revision+1,updated_at=now(),actualizado_por=auth.uid() where id returning revision into r;
 insert into operaciones_puestos_v739.auditoria(accion,nuevo,usuario_id) values('configuracion_automatizacion_v759',jsonb_build_object('revision',r,'dato',p_dato),auth.uid());
 return jsonb_build_object('ok',true,'revision',r);
end $$;

-- Resolve a slot/day against the explicit current template or an actual historical day.
create function operaciones_auto_v759.jornada(p_regla jsonb,p_fecha date,p_semana date,p_aseo text,p_persona uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
#variable_conflict use_column
declare ref text;esp boolean;aseo boolean;h operaciones_puestos_v739.horarios%rowtype;r jsonb;f date;minutos integer;tipo text;
begin
 esp:=extract(isodow from p_fecha)=7 or exists(select 1 from public.festivos where fecha=p_fecha and activo);
 aseo:=not esp and (extract(isodow from p_fecha)=1 or p_aseo='martes' and p_fecha=p_semana+1 and exists(select 1 from public.festivos where fecha=p_semana and activo));
 ref:=case when esp then p_regla->>'especial' when aseo then p_regla->>'aseo' else p_regla->>'normal' end;
 if ref is not null and ref<>'historial' then
  select * into h from operaciones_puestos_v739.horarios where id=replace(ref,'reutilizable:','')::uuid and eliminado_at is null;
  if not found then return null;end if;
  r:=jsonb_build_object('hora_inicio',to_char(case when esp then h.inicio_especial else h.inicio end,'HH24:MI'),'hora_fin',to_char(case when esp then h.fin_especial else h.fin end,'HH24:MI'),'minutos_descanso',case when esp then h.pausa_especial else h.pausa end,'origen',h.codigo||' · '||h.nombre);
 else
  select to_jsonb(t),t.fecha into r,f from (
   select p.fecha,p.hora_inicio,p.hora_fin,p.minutos_descanso,p.empleado_id from public.turnos_programacion p join public.turnos_procesos pr on pr.id=p.proceso_id and pr.codigo in ('OPS_COORDINADOR','OPS_SERVICIOS_GENERALES','OPS_AUX_VESTIER') where p.estado<>'cancelado' and p.tipo_registro='turno'
   union all select p.fecha,p.hora_inicio,p.hora_fin,p.minutos_descanso,p.externo_id from operaciones_externos_v741.programacion p where p.estado<>'cancelado' and p.tipo_registro='turno'
  )t where t.fecha between p_semana-28 and p_semana-1
   and (p_persona is not null and t.empleado_id=p_persona or p_persona is null and exists(select 1 from (select a.semana,a.puesto_id,a.empleado_id from operaciones_puestos_v739.asignaciones a union all select a.semana,a.puesto_id,a.externo_id from operaciones_externos_v741.asignaciones a)a where a.empleado_id=t.empleado_id and a.puesto_id=(p_regla->>'referencia_id')::uuid and t.fecha between a.semana and a.semana+6))
   and (case when p_persona is not null then extract(isodow from t.fecha)=extract(isodow from p_fecha)
    when esp then extract(isodow from t.fecha)=7 or exists(select 1 from public.festivos where fecha=t.fecha and activo)
    when aseo then extract(isodow from t.fecha)=1 and not exists(select 1 from public.festivos where fecha=t.fecha and activo)
    else extract(isodow from t.fecha) between 2 and 6 and not exists(select 1 from public.festivos where fecha=t.fecha and activo) end)
   order by t.fecha desc limit 1;
  if r is null then return null;end if;
  r:=jsonb_build_object('hora_inicio',left(r->>'hora_inicio',5),'hora_fin',left(r->>'hora_fin',5),'minutos_descanso',(r->>'minutos_descanso')::integer,'origen','Historial '||f::text);
 end if;
 tipo:=p_regla->>'tipo';minutos:=coalesce((r->>'minutos_descanso')::integer,0);
 if extract(isodow from p_fecha)=1 and (tipo like 'vestier_h_%' or tipo like 'damas_%') and p_fecha>=(select desde from operaciones_ajustes_v745.configuracion) then minutos:=0;end if;
 return r||jsonb_build_object('fecha',p_fecha,'puesto_id',nullif(p_regla->>'id','')::uuid,'empleado_id',p_persona,'minutos_descanso',minutos);
end $$;

create function operaciones_auto_v759.contexto(p_semana date) returns jsonb language plpgsql stable security definer set search_path='' as $$
#variable_conflict use_column
declare cfg jsonb;rev bigint;pr jsonb;org jsonb;u jsonb;persona jsonb;a jsonb;regla jsonb;dest uuid;ciclo jsonb;idx int;pasos int;src date;other jsonb;ubic jsonb:='[]';jornadas jsonb:='[]';pend jsonb:='[]';j jsonb;d date;huella text;ocupada boolean;refid uuid;bloqueos jsonb;
begin
 perform operaciones_auto_v759.exigir();
 if p_semana is null or extract(isodow from p_semana)<>1 or p_semana<date '2026-08-24' then raise exception 'Elige un lunes' using errcode='22023';end if;
 select dato,revision into cfg,rev from operaciones_auto_v759.configuracion where id;
 pr:=public.consultar_programacion_operaciones_v758(p_semana-21,p_semana+6);
 org:=public.consultar_organizacion_operaciones_v757(p_semana-21,p_semana+6);
 -- A long absence or an ungenerated week must not erase a person's last position.
 org:=jsonb_set(org,'{asignaciones}',(with antiguas as (
  select distinct on (a.empleado_id) to_jsonb(a) dato from (
   select semana,puesto_id,empleado_id,false es_externo,updated_at from operaciones_puestos_v739.asignaciones where semana<p_semana
   union all select semana,puesto_id,externo_id,true,updated_at from operaciones_externos_v741.asignaciones where semana<p_semana
  )a order by a.empleado_id,a.semana desc
 ), todas as (
  select value dato from jsonb_array_elements(org->'asignaciones')
  union all select dato from antiguas where (dato->>'semana')::date<p_semana-21
 ) select coalesce(jsonb_agg(dato order by dato->>'semana',dato->>'puesto_id',dato->>'empleado_id'),'[]') from todas));
 -- Hash the full authoritative data before removing visual identifiers.
 -- RPC aggregates may return the same rows in a different order as plans change.
 huella:=md5(jsonb_build_object('programacion',
  (select jsonb_object_agg(k.key,case when jsonb_typeof(k.value)='array' then (select coalesce(jsonb_agg(e.value order by e.value::text),'[]') from jsonb_array_elements(k.value)e) else k.value end) from jsonb_each(pr-'consultado')k),
  'organizacion',(select jsonb_object_agg(k.key,case when jsonb_typeof(k.value)='array' then (select coalesce(jsonb_agg(e.value order by e.value::text),'[]') from jsonb_array_elements(k.value)e) else k.value end) from jsonb_each(org)k),
  'revision',rev,'configuracion',cfg)::text);
 ocupada:=exists(select 1 from jsonb_array_elements(pr->'programacion')x where (x->>'fecha')::date>=p_semana) or exists(select 1 from jsonb_array_elements(org->'asignaciones')x where (x->>'semana')::date=p_semana);
 for u in select value from jsonb_array_elements(coalesce(cfg->'personas','[]')) where value->>'rol'<>'excluir' loop
  select value into persona from jsonb_array_elements(pr->'personal') where value->>'empleado_id'=u->>'empleado_id' and coalesce((value->>'disponible')::boolean,true) and (nullif(value->>'fecha_inicio','')::date is null or (value->>'fecha_inicio')::date<=p_semana) and (nullif(value->>'fecha_fin','')::date is null or (value->>'fecha_fin')::date>=p_semana+6);
  if persona is null then continue;end if;
  select value into a from jsonb_array_elements(org->'asignaciones') where value->>'empleado_id'=u->>'empleado_id' and (value->>'semana')::date<p_semana order by value->>'semana' desc limit 1;
  dest:=coalesce(nullif(a->>'puesto_id','')::uuid,nullif(u->>'puesto_id','')::uuid);src:=nullif(a->>'semana','')::date;
  if u->>'rol' in ('rotar_h','rotar_m') then
   ciclo:=cfg->'ciclos'->case when u->>'rol'='rotar_h' then 'hombres' else 'mujeres' end;
   select ordinality::int-1 into idx from jsonb_array_elements_text(ciclo) with ordinality where value=dest::text;
   if idx is null or src is null then pend:=pend||jsonb_build_array(jsonb_build_object('mensaje','Falta la posición anterior de '||concat_ws(' ',persona->>'nombres',persona->>'apellidos')));continue;end if;
   pasos:=(p_semana-src)/7;dest:=(ciclo->>mod(idx+pasos,9))::uuid;
  elsif coalesce((u->>'alternar')::boolean,false) and src is not null and mod((p_semana-src)/7,2)=1 then
   select value into regla from jsonb_array_elements(cfg->'puestos') where value->>'id'=dest::text;
   select slot.value into other from jsonb_array_elements(cfg->'puestos')slot where slot.value->>'tipo'=case regla->>'tipo' when 'damas_am' then 'damas_pm' when 'damas_pm' then 'damas_am' when 'tenis_am' then 'tenis_pm' when 'tenis_pm' then 'tenis_am' when 'vestier_h_am' then 'vestier_h_pm' when 'vestier_h_pm' then 'vestier_h_am' else '' end and (regla->>'tipo' not like 'vestier_h_%' or exists(select 1 from jsonb_array_elements(cfg->'personas')person where coalesce((person.value->>'alternar')::boolean,false) and person.value->>'puesto_id'=slot.value->>'id')) limit 1;
   if other is not null then dest:=(other->>'id')::uuid;end if;
  end if;
  if u->>'rol' in ('coordinador','apoyo_am','apoyo_pm') then dest:=null;end if;
  if dest is not null and exists(select 1 from jsonb_array_elements(ubic)x where x->>'puesto_id'=dest::text) then pend:=pend||jsonb_build_array(jsonb_build_object('mensaje','Dos personas resultan en el mismo puesto. Revisa los grupos y la alternancia.'));continue;end if;
  ubic:=ubic||jsonb_build_array(jsonb_build_object('empleado_id',persona->>'empleado_id','proceso_id',persona->>'proceso_id','es_externo',coalesce((persona->>'es_externo')::boolean,false),'puesto_id',dest,'origen_id',a->>'puesto_id','semana_fuente',src,'rol',u->>'rol','sexo',u->>'sexo'));
 end loop;
 for regla in select value from jsonb_array_elements(coalesce(cfg->'puestos','[]')) loop
  for d in select generate_series(p_semana,p_semana+6,interval '1 day')::date loop j:=operaciones_auto_v759.jornada(regla,d,p_semana,cfg->>'aseo_festivo');if j is not null then jornadas:=jornadas||jsonb_build_array(j);end if;end loop;
 end loop;
 for u in select value from jsonb_array_elements(ubic) where value->>'puesto_id' is null loop
  if u->>'rol'='coordinador' then
   for d in select generate_series(p_semana,p_semana+6,interval '1 day')::date loop
    select t into j from jsonb_array_elements(pr->'turnos_coordinador')b cross join lateral jsonb_array_elements(b->'dias')t where (t->>'dia')::integer=extract(isodow from d) and t->>'tipo'='laboral' limit 1;
    if j is not null then jornadas:=jornadas||jsonb_build_array(jsonb_build_object('empleado_id',u->>'empleado_id','puesto_id',null,'fecha',d,'hora_inicio',j->>'inicio','hora_fin',j->>'fin','minutos_descanso',(j->>'descanso')::integer,'origen','Horario base de Coordinación'));end if;
   end loop;
  else
   select value into persona from jsonb_array_elements(cfg->'personas') where value->>'empleado_id'=u->>'empleado_id';
   refid:=(cfg->'ciclos'->case when u->>'rol'='apoyo_am' then 'hombres' else 'mujeres' end->>case when u->>'rol'='apoyo_am' then 2 else 1 end)::uuid;
   regla:=jsonb_build_object('referencia_id',refid,'normal',coalesce(persona->>'turno_apoyo','historial'),'aseo',coalesce(persona->>'turno_apoyo','historial'),'especial',coalesce(persona->>'turno_apoyo','historial'));
   for d in select generate_series(p_semana,p_semana+6,interval '1 day')::date loop j:=operaciones_auto_v759.jornada(regla,d,p_semana,cfg->>'aseo_festivo');if j is not null then jornadas:=jornadas||jsonb_build_array(j||jsonb_build_object('empleado_id',u->>'empleado_id','puesto_id',null));end if;end loop;
  end if;
 end loop;
 select coalesce(jsonb_agg(jsonb_build_object('empleado_id',t.empleado_id,'fecha',t.fecha,'hora_inicio',to_char(t.hora_inicio,'HH24:MI'),'hora_fin',to_char(t.hora_fin,'HH24:MI')) order by t.empleado_id,t.fecha,t.hora_inicio,t.hora_fin),'[]') into bloqueos from (
  select empleado_id,fecha,hora_inicio,hora_fin from public.turnos_programacion where estado<>'cancelado' and tipo_registro='turno' and fecha between p_semana-1 and p_semana+7
  union all select externo_id,fecha,hora_inicio,hora_fin from operaciones_externos_v741.programacion where estado<>'cancelado' and tipo_registro='turno' and fecha between p_semana-1 and p_semana+7
 )t where exists(select 1 from jsonb_array_elements(ubic)person where person.value->>'empleado_id'=t.empleado_id::text);
 huella:=md5(huella||bloqueos::text);
 -- Do not expose document numbers or payroll IDs in the generator.
 pr:=jsonb_set(pr,'{personal}',(select coalesce(jsonb_agg(value-array['cedula','codigo','documento','codigo_nomina','telefono','correo','email','biotime_person_id']),'[]') from jsonb_array_elements(pr->'personal')));
 pr:=jsonb_set(pr,'{programacion}',(select coalesce(jsonb_agg(value-array['cedula','codigo','documento','codigo_nomina','telefono','correo','email','biotime_person_id']),'[]') from jsonb_array_elements(pr->'programacion')));
 pr:=pr-'candidatos';
 return jsonb_build_object('semana',p_semana,'configuracion',cfg,'revision',rev,'programacion',pr,'organizacion',org,'ubicaciones',ubic,'jornadas',jornadas,'pendientes',pend,'bloqueos',bloqueos,'huella',huella,'ocupada',ocupada,'lunes_festivo',exists(select 1 from public.festivos where fecha=p_semana and activo));
end $$;

create function operaciones_auto_v759.aplicar(p_propuesta jsonb) returns jsonb language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
#variable_conflict use_column
declare ctx jsonb;cfg jsonb;sem date;arr jsonb;x jsonb;u jsonb;p jsonb;j jsonb;c jsonb;r jsonb;y jsonb;puesto uuid;f date;rev bigint;recon int;cnt int;faltante boolean;libre date;cond jsonb;dayrest date;sexo text;ini time;fin time;
begin
 perform operaciones_auto_v759.exigir();sem:=nullif(p_propuesta->>'semana','')::date;
 if sem is null or sem<=(now() at time zone 'America/Bogota')::date then raise exception 'La generación se aplica a una semana futura' using errcode='22023';end if;
 if jsonb_typeof(p_propuesta->'registros') is distinct from 'array' or jsonb_typeof(p_propuesta->'asignaciones') is distinct from 'array' or jsonb_typeof(p_propuesta->'relevos') is distinct from 'array' or jsonb_typeof(p_propuesta->'condiciones') is distinct from 'array' then raise exception 'Propuesta incompleta' using errcode='22023';end if;
 -- Existing editors do not share a new advisory lock. Table locks close the
 -- compare/apply race, including outside module edits, for this brief transaction.
 lock table operaciones_auto_v759.configuracion,operaciones_puestos_v739.horarios,operaciones_catalogo_v755.versiones,operaciones_turnos_v758.eliminados,operaciones_puestos_v739.puestos,operaciones_puestos_v739.semanas,operaciones_puestos_v739.asignaciones,operaciones_externos_v741.asignaciones,public.turnos_programacion,operaciones_externos_v741.programacion in share row exclusive mode;
 ctx:=operaciones_auto_v759.contexto(sem);cfg:=ctx->'configuracion';arr:=p_propuesta->'registros';cond:=p_propuesta->'condiciones';
 if ctx->>'huella' is distinct from p_propuesta->>'huella' then raise exception 'La programación, el personal o las reglas cambiaron. Genera de nuevo antes de aplicar.' using errcode='40001';end if;
 if coalesce((ctx->>'ocupada')::boolean,true) then raise exception 'Esta semana ya contiene cambios. No se sobrescribe la programación existente.' using errcode='40001';end if;
 if coalesce((cfg->>'confirmada')::boolean,false) is not true or jsonb_array_length(ctx->'pendientes')>0 or (ctx->>'lunes_festivo')::boolean and cfg->>'aseo_festivo'='revisar' then raise exception 'Resuelve los pendientes de la propuesta' using errcode='22023';end if;
 cnt:=jsonb_array_length(ctx->'ubicaciones');if cnt=0 or jsonb_array_length(arr)<>cnt*7 or jsonb_array_length(arr)>250 then raise exception 'La propuesta debe contener siete días por colaborador, máximo 250 registros' using errcode='22023';end if;
 if exists(select 1 from jsonb_array_elements(arr)x group by x->>'empleado_id',x->>'fecha' having count(*)>1) or exists(select 1 from jsonb_array_elements(p_propuesta->'relevos')x group by x->>'empleado_id',x->>'fecha' having count(*)>1) or exists(select 1 from jsonb_array_elements(p_propuesta->'relevos')x group by x->>'puesto_id',x->>'fecha' having count(*)>1) then raise exception 'Una persona no puede cubrir dos puestos al mismo tiempo' using errcode='22023';end if;
 if (select coalesce(jsonb_agg(jsonb_build_object('puesto_id',value->>'puesto_id','empleado_id',value->>'empleado_id') order by value->>'puesto_id'),'[]') from jsonb_array_elements(ctx->'ubicaciones') where value->>'puesto_id' is not null) is distinct from (select coalesce(jsonb_agg(value order by value->>'puesto_id'),'[]') from jsonb_array_elements(p_propuesta->'asignaciones')) then raise exception 'La rotación debe continuar desde la última semana' using errcode='22023';end if;
 for c in select value from jsonb_array_elements(cond) loop
  if not exists(select 1 from jsonb_array_elements(ctx->'ubicaciones')u where u->>'empleado_id'=c->>'empleado_id') or nullif(c->>'desde','')::date not between sem and sem+6 or c->>'tipo' not in ('descanso','novedad') then raise exception 'Condición semanal inválida' using errcode='22023';end if;
  if c->>'tipo'='novedad' and (nullif(c->>'hasta','')::date not between (c->>'desde')::date and sem+6 or c->>'codigo' not in ('VAC','INC','F','CUMPLE','VOT','DP','DF','LR','CITA','SP','NNJ')) then raise exception 'Novedad inválida' using errcode='22023';end if;
 end loop;
 dayrest:=sem+case when (ctx->>'lunes_festivo')::boolean then 1 else 0 end;
 for x in select value from jsonb_array_elements(arr) loop
  f:=nullif(x->>'fecha','')::date;select value into u from jsonb_array_elements(ctx->'ubicaciones') where value->>'empleado_id'=x->>'empleado_id';
  if u is null or f is null or f not between sem and sem+6 or x->>'proceso_id' is distinct from u->>'proceso_id' or x->>'tipo_registro' not in ('turno','descanso','novedad') then raise exception 'Registro ajeno a la propuesta' using errcode='22023';end if;
  puesto:=nullif(u->>'puesto_id','')::uuid;select value into p from jsonb_array_elements(cfg->'puestos') where value->>'id'=puesto::text;
  select value into c from jsonb_array_elements(cond) where value->>'empleado_id'=x->>'empleado_id' and value->>'tipo'='novedad' and f between (value->>'desde')::date and (value->>'hasta')::date limit 1;
  if c is not null and (x->>'tipo_registro'<>'novedad' or x->>'novedad_codigo' is distinct from c->>'codigo') then raise exception 'La novedad solicitada debe conservarse' using errcode='22023';end if;
  if c is null and x->>'tipo_registro'='novedad' then raise exception 'Novedad sin condición semanal' using errcode='22023';end if;
  if c is null and p->>'tipo' in ('porteria','parqueadero') and ((f=dayrest and x->>'tipo_registro'<>'descanso') or (f<>dayrest and x->>'tipo_registro'<>'turno')) then raise exception 'Portería y Parqueadero descansan el lunes o el martes después del festivo' using errcode='22023';end if;
  if u->>'rol' in ('apoyo_am','apoyo_pm') and f=sem+6 and c is null and x->>'tipo_registro'<>'descanso' then raise exception 'Los apoyos descansan el domingo' using errcode='22023';end if;
  if exists(select 1 from jsonb_array_elements(cond)c where c->>'tipo'='descanso' and c->>'empleado_id'=x->>'empleado_id' and (c->>'desde')::date=f) and x->>'tipo_registro'<>'descanso' then raise exception 'Respeta el descanso solicitado' using errcode='22023';end if;
  select value into y from jsonb_array_elements(p_propuesta->'relevos') where value->>'empleado_id'=x->>'empleado_id' and value->>'fecha'=x->>'fecha';
  if y is not null then
   if x->>'tipo_registro'<>'turno' or u->>'rol'='coordinador' or coalesce((p->>'obligatorio')::boolean,false) and p->>'tipo'<>'flexible' then raise exception 'El relevo debe ser un colaborador disponible sin descubrir su puesto' using errcode='22023';end if;
   puesto:=(y->>'puesto_id')::uuid;select value into p from jsonb_array_elements(cfg->'puestos') where value->>'id'=puesto::text;
   if p is null or p->>'tipo'='flexible' or not (p->>'obligatorio')::boolean or p->>'tipo' in ('porteria','parqueadero') and f=dayrest then raise exception 'Este puesto no necesita relevo' using errcode='22023';end if;
   if coalesce(p->>'sexo','')<>'' and p->>'sexo' is distinct from u->>'sexo' then raise exception 'El sexo del relevo no cumple el requerido por el puesto' using errcode='22023';end if;
   if exists(select 1 from jsonb_array_elements(ctx->'ubicaciones')v join jsonb_array_elements(arr)s on s->>'empleado_id'=v->>'empleado_id' and s->>'fecha'=x->>'fecha' where v->>'puesto_id'=puesto::text and s->>'tipo_registro'='turno') then raise exception 'El puesto ya está atendido por su titular' using errcode='22023';end if;
  end if;
  if x->>'tipo_registro'='turno' then
   select value into j from jsonb_array_elements(ctx->'jornadas') where value->>'fecha'=x->>'fecha' and (puesto is not null and value->>'puesto_id'=puesto::text or puesto is null and value->>'empleado_id'=x->>'empleado_id');
   if j is null or x->>'hora_inicio' is distinct from j->>'hora_inicio' or x->>'hora_fin' is distinct from j->>'hora_fin' or coalesce((x->>'minutos_descanso')::integer,-1)<>(j->>'minutos_descanso')::integer then raise exception 'El horario cambió o no coincide con la regla revisada' using errcode='22023';end if;
   if u->>'rol'='apoyo_am' and (x->>'hora_inicio')::time>=time '12:00' or u->>'rol'='apoyo_pm' and (x->>'hora_inicio')::time<time '12:00' then raise exception 'Respeta la jornada de mañana o tarde del apoyo' using errcode='22023';end if;
   if p->>'tipo' like '%_am' and (x->>'hora_inicio')::time>=time '12:00' or p->>'tipo' like '%_pm' and (x->>'hora_inicio')::time<time '12:00' then raise exception 'Revisa los horarios AM/PM de los puestos críticos' using errcode='22023';end if;
   if y is null and p is not null and coalesce(p->>'sexo','')<>'' and p->>'sexo' is distinct from u->>'sexo' then raise exception 'Confirma el sexo de cobertura del titular' using errcode='22023';end if;
  end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(arr)first_day join jsonb_array_elements(arr)next_day on first_day.value->>'empleado_id'=next_day.value->>'empleado_id' and first_day.value->>'fecha'<next_day.value->>'fecha' where first_day.value->>'tipo_registro'='turno' and next_day.value->>'tipo_registro'='turno' and (first_day.value->>'fecha')::date+(first_day.value->>'hora_inicio')::time<(next_day.value->>'fecha')::date+(next_day.value->>'hora_fin')::time+case when (next_day.value->>'hora_fin')::time<(next_day.value->>'hora_inicio')::time then interval '1 day' else interval '0' end and (next_day.value->>'fecha')::date+(next_day.value->>'hora_inicio')::time<(first_day.value->>'fecha')::date+(first_day.value->>'hora_fin')::time+case when (first_day.value->>'hora_fin')::time<(first_day.value->>'hora_inicio')::time then interval '1 day' else interval '0' end)
  or exists(select 1 from jsonb_array_elements(arr)proposed join jsonb_array_elements(ctx->'bloqueos')saved on proposed.value->>'empleado_id'=saved.value->>'empleado_id' where proposed.value->>'tipo_registro'='turno' and (proposed.value->>'fecha')::date+(proposed.value->>'hora_inicio')::time<(saved.value->>'fecha')::date+(saved.value->>'hora_fin')::time+case when (saved.value->>'hora_fin')::time<(saved.value->>'hora_inicio')::time then interval '1 day' else interval '0' end and (saved.value->>'fecha')::date+(saved.value->>'hora_inicio')::time<(proposed.value->>'fecha')::date+(proposed.value->>'hora_fin')::time+case when (proposed.value->>'hora_fin')::time<(proposed.value->>'hora_inicio')::time then interval '1 day' else interval '0' end) then raise exception 'Hay jornadas que se cruzan, incluso al pasar medianoche. Revisa los horarios.' using errcode='22023';end if;
 for u in select value from jsonb_array_elements(ctx->'ubicaciones') loop
  if not exists(select 1 from jsonb_array_elements(arr)x where x->>'empleado_id'=u->>'empleado_id' and x->>'tipo_registro'='descanso') and (select count(*) from jsonb_array_elements(arr)x where x->>'empleado_id'=u->>'empleado_id' and x->>'tipo_registro'='novedad')<7 then raise exception 'Falta el descanso semanal de un colaborador' using errcode='22023';end if;
 end loop;
 for sexo in select unnest(array['damas_','tenis_']) loop
  if ((select count(*) from jsonb_array_elements(ctx->'ubicaciones')u join jsonb_array_elements(cfg->'puestos')p on p->>'id'=u->>'puesto_id' join jsonb_array_elements(arr)x on x->>'empleado_id'=u->>'empleado_id' where p->>'tipo' like sexo||'%' and x->>'tipo_registro'='descanso' and (x->>'fecha')::date=sem)<>1 or (select count(*) from jsonb_array_elements(ctx->'ubicaciones')u join jsonb_array_elements(cfg->'puestos')p on p->>'id'=u->>'puesto_id' join jsonb_array_elements(arr)x on x->>'empleado_id'=u->>'empleado_id' where p->>'tipo' like sexo||'%' and x->>'tipo_registro'='descanso' and (x->>'fecha')::date=sem+1)<>1) and exists(select 1 from jsonb_array_elements(ctx->'ubicaciones')u join jsonb_array_elements(cfg->'puestos')p on p->>'id'=u->>'puesto_id' join jsonb_array_elements(arr)x on x->>'empleado_id'=u->>'empleado_id' where p->>'tipo' like sexo||'%' and x->>'tipo_registro'='descanso' and (x->>'fecha')::date=sem) then
   -- Full-week novelties legitimately replace the nominal rest; still require cover.
   if not exists(select 1 from jsonb_array_elements(ctx->'ubicaciones')u join jsonb_array_elements(cfg->'puestos')p on p->>'id'=u->>'puesto_id' join jsonb_array_elements(arr)x on x->>'empleado_id'=u->>'empleado_id' where p->>'tipo' like sexo||'%' and x->>'tipo_registro'='novedad' and (x->>'fecha')::date in (sem,sem+1)) then raise exception 'Revisa el cruce lunes/martes de Vestier Damas y Tenis' using errcode='22023';end if;
  end if;
 end loop;
 for p in select value from jsonb_array_elements(cfg->'puestos') where (value->>'obligatorio')::boolean and value->>'tipo'<>'flexible' loop
  for f in select generate_series(sem,sem+6,interval '1 day')::date loop
   if p->>'tipo' in ('porteria','parqueadero') and f=dayrest then continue;end if;
   if not exists(select 1 from jsonb_array_elements(ctx->'ubicaciones')u join jsonb_array_elements(arr)x on x->>'empleado_id'=u->>'empleado_id' where u->>'puesto_id'=p->>'id' and (x->>'fecha')::date=f and x->>'tipo_registro'='turno') and not exists(select 1 from jsonb_array_elements(p_propuesta->'relevos')x where x->>'puesto_id'=p->>'id' and (x->>'fecha')::date=f) then raise exception 'Hay un puesto obligatorio sin cobertura. Revisa los relevos.' using errcode='22023';end if;
  end loop;
 end loop;
 insert into operaciones_puestos_v739.semanas(semana) values(sem) on conflict do nothing;
 select revision into rev from operaciones_puestos_v739.semanas where semana=sem for update;
 for x in select value from jsonb_array_elements(p_propuesta->'asignaciones') loop
  r:=public.asignar_puesto_operaciones_v741(sem,(x->>'puesto_id')::uuid,(x->>'empleado_id')::uuid,rev);rev:=(r->>'revision')::bigint;
 end loop;
 -- Construct the saver payload ourselves; client flags cannot bypass template or conflict checks.
 select jsonb_agg((value-array['conservar_horario','solo_vacias','esperado_updated_at','turno_codigo','horario_reutilizable_id'])||jsonb_build_object('personalizado',true,'esperado_updated_at',null) order by value->>'empleado_id',value->>'fecha') into arr from jsonb_array_elements(arr);
 r:=public.guardar_programacion_operaciones_v758(arr);
 if r->>'ok'<>'true' or jsonb_array_length(r->'guardados')<>cnt*7 then raise exception 'No se pudo verificar el guardado completo';end if;
 insert into operaciones_auto_v759.semanas(semana,configuracion,condiciones,creado_por) values(sem,cfg,cond,auth.uid());
 for y in select value from jsonb_array_elements(r->'guardados') loop
  select value into x from jsonb_array_elements(p_propuesta->'relevos') where value->>'empleado_id'=coalesce(y->>'empleado_id',y->>'externo_id') and value->>'fecha'=y->>'fecha';
  if x is not null then insert into operaciones_auto_v759.relevos values(sem,(x->>'puesto_id')::uuid,(x->>'fecha')::date,(x->>'empleado_id')::uuid,(y->>'id')::uuid,coalesce((y->>'es_externo')::boolean,false),(y->>'updated_at')::timestamptz,(y->>'hora_inicio')::time,(y->>'hora_fin')::time,(y->>'minutos_descanso')::integer);end if;
  recon:=case when y->>'tipo_registro'='novedad' then coalesce((cfg->'reconocidos'->>(y->>'novedad_codigo'))::integer,0) else 0 end;
  if recon>0 then insert into operaciones_auto_v759.reconocimientos values(sem,coalesce(y->>'empleado_id',y->>'externo_id')::uuid,(y->>'fecha')::date,(y->>'id')::uuid,coalesce((y->>'es_externo')::boolean,false),(y->>'updated_at')::timestamptz,recon);end if;
 end loop;
 insert into operaciones_puestos_v739.auditoria(accion,nuevo,usuario_id) values('aplicar_semana_automatica_v759',jsonb_build_object('semana',sem,'registros',cnt*7,'relevos',jsonb_array_length(p_propuesta->'relevos')),auth.uid());
 return jsonb_build_object('ok',true,'semana',sem,'registros',cnt*7,'relevos',jsonb_array_length(p_propuesta->'relevos'));
end $$;

create function operaciones_auto_v759.organizacion(p_desde date,p_hasta date) returns jsonb language plpgsql stable security definer set search_path='' as $$
#variable_conflict use_column
declare r jsonb;rel jsonb;rec jsonb;reg jsonb;
begin
 perform operaciones_auto_v759.exigir();r:=public.consultar_organizacion_operaciones_v757(p_desde,p_hasta);
 select coalesce(jsonb_agg(to_jsonb(a)-'programacion_updated_at' order by a.fecha,a.puesto_id),'[]') into rel from operaciones_auto_v759.relevos a where a.fecha between p_desde and p_hasta and not exists(select 1 from jsonb_array_elements(r->'asignaciones')assigned join operaciones_auto_v759.semanas plan on plan.semana=a.semana cross join lateral jsonb_array_elements(plan.configuracion->'puestos')slot where assigned.value->>'empleado_id'=a.empleado_id::text and assigned.value->>'semana'=a.semana::text and slot.value->>'id'=assigned.value->>'puesto_id' and coalesce((slot.value->>'obligatorio')::boolean,false) and slot.value->>'tipo'<>'flexible') and not exists(select 1 from jsonb_array_elements(r->'asignaciones')assigned where assigned.value->>'puesto_id'=a.puesto_id::text and assigned.value->>'semana'=a.semana::text and (exists(select 1 from public.turnos_programacion t where t.empleado_id=(assigned.value->>'empleado_id')::uuid and t.fecha=a.fecha and t.estado<>'cancelado' and t.tipo_registro='turno') or exists(select 1 from operaciones_externos_v741.programacion t where t.externo_id=(assigned.value->>'empleado_id')::uuid and t.fecha=a.fecha and t.estado<>'cancelado' and t.tipo_registro='turno'))) and (not a.es_externo and exists(select 1 from public.turnos_programacion p where p.id=a.programacion_id and p.estado<>'cancelado' and p.tipo_registro='turno' and p.hora_inicio=a.hora_inicio and p.hora_fin=a.hora_fin and p.minutos_descanso=a.minutos_descanso) or a.es_externo and exists(select 1 from operaciones_externos_v741.programacion p where p.id=a.programacion_id and p.estado<>'cancelado' and p.tipo_registro='turno' and p.hora_inicio=a.hora_inicio and p.hora_fin=a.hora_fin and p.minutos_descanso=a.minutos_descanso));
 select coalesce(jsonb_agg(jsonb_build_object('empleado_id',t.empleado_id,'fecha',t.fecha,'minutos',(s.configuracion->'reconocidos'->>t.novedad_codigo)::integer) order by t.fecha,t.empleado_id),'[]') into rec from (select empleado_id,fecha,novedad_codigo from public.turnos_programacion where estado<>'cancelado' and tipo_registro='novedad' and proceso_id in (select id from public.turnos_procesos where codigo in ('OPS_COORDINADOR','OPS_SERVICIOS_GENERALES','OPS_AUX_VESTIER')) union all select externo_id,fecha,novedad_codigo from operaciones_externos_v741.programacion where estado<>'cancelado' and tipo_registro='novedad')t join operaciones_auto_v759.semanas s on t.fecha between s.semana and s.semana+6 where t.fecha between p_desde and p_hasta and coalesce((s.configuracion->'reconocidos'->>t.novedad_codigo)::integer,0)>0;
 select coalesce(jsonb_agg(jsonb_build_object('semana',s.semana,'puestos',s.configuracion->'puestos','descanso_porteria',s.semana+case when exists(select 1 from public.festivos where fecha=s.semana and activo) then 1 else 0 end) order by s.semana),'[]') into reg from operaciones_auto_v759.semanas s where s.semana<=p_hasta and s.semana+6>=p_desde;
 return r||jsonb_build_object('automatizacion',true,'relevos',rel,'reconocimientos',rec,'reglas_semanas',reg);
end $$;

create function public.consultar_automatizacion_operaciones_v759(p_semana date) returns jsonb language sql stable security invoker set search_path='' as $$select operaciones_auto_v759.contexto(p_semana);$$;
create function public.guardar_reglas_operaciones_v759(p_dato jsonb,p_revision bigint) returns jsonb language sql security invoker set search_path='' as $$select operaciones_auto_v759.guardar_config(p_dato,p_revision);$$;
create function public.aplicar_semana_operaciones_v759(p_propuesta jsonb) returns jsonb language sql security invoker set search_path='' as $$select operaciones_auto_v759.aplicar(p_propuesta);$$;
create function public.consultar_organizacion_operaciones_v759(p_desde date,p_hasta date) returns jsonb language sql stable security invoker set search_path='' as $$select operaciones_auto_v759.organizacion(p_desde,p_hasta);$$;
revoke all on all functions in schema operaciones_auto_v759 from public,anon,authenticated;
grant execute on function operaciones_auto_v759.contexto(date),operaciones_auto_v759.guardar_config(jsonb,bigint),operaciones_auto_v759.aplicar(jsonb),operaciones_auto_v759.organizacion(date,date) to authenticated;
revoke all on function public.consultar_automatizacion_operaciones_v759(date),public.guardar_reglas_operaciones_v759(jsonb,bigint),public.aplicar_semana_operaciones_v759(jsonb),public.consultar_organizacion_operaciones_v759(date,date) from public,anon,authenticated;
grant execute on function public.consultar_automatizacion_operaciones_v759(date),public.guardar_reglas_operaciones_v759(jsonb,bigint),public.aplicar_semana_operaciones_v759(jsonb),public.consultar_organizacion_operaciones_v759(date,date) to authenticated;
