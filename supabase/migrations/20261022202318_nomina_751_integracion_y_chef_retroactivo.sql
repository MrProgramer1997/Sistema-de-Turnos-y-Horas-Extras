-- Scoped replacements with original-definition leases and private rollback copies.
do $migration$
declare s text; old text; replacement text; f record; multi jsonb;
begin
 for f in select * from (values
  ('chef_planificacion.guardar(uuid,jsonb,text)','246a05bc38d74d7bb99ad88af0362d97'),
  ('nomina_revision_v77.seleccionar_punto_v713(jsonb)','f30da8a087a7639f6a273c704c475943'),
  ('public.previsualizar_ayb_nomina_v721(text,date,text)','884cae6af8271a3825f69a9f55c3c904'),
  ('public.previsualizar_sugerencia_nomina_v719(text,date,text)','65e5ec1d0dd464041406a4738165ca1f')
 ) v(firma,huella) loop
  s:=pg_get_functiondef(f.firma::regprocedure);
  if md5(s)<>f.huella then raise exception 'La funcion % cambio; abortar y revisar',f.firma;end if;
  insert into nomina_integridad_v751.respaldo_funciones(firma,definicion,huella) values(f.firma,s,f.huella) on conflict(firma) do nothing;
 end loop;
 s:=pg_get_functiondef('nomina_revision_v77.seleccionar_punto_v713(jsonb)'::regprocedure);
 s:=replace(s,'coincide boolean;','coincide boolean; multi jsonb;');
 s:=replace(s,E'BEGIN\n esperado:=',E'BEGIN\n multi:=nomina_revision_v77.seleccionar_multipunto_v751(j);\n IF multi IS NOT NULL THEN RETURN multi||jsonb_build_object(\'version\',\'punto_v713\',\'algoritmo\',\'multipunto_v751\');END IF;\n esperado:=');
 if position('multi:=nomina_revision_v77.seleccionar_multipunto_v751(j)' in s)=0 then raise exception 'No se aplico selector';end if;
 execute s;

 s:=pg_get_functiondef('public.previsualizar_ayb_nomina_v721(text,date,text)'::regprocedure);
 old:=$find$bloques:=jsonb_build_array(jsonb_build_object('inicio',pa,'fin',pb,'subarea',h->>'subarea','ultimo',false,'hasta',pa2),jsonb_build_object('inicio',pa2,'fin',pb2,'subarea',h->>'subarea_2','ultimo',true,'desde',pb));$find$;
 replacement:=$new$IF pa2=pb THEN
      bloques:=jsonb_build_array(jsonb_build_object('inicio',pa,'fin',pb2,'subarea',h->>'subarea','ultimo',true));
     ELSE
      bloques:=jsonb_build_array(jsonb_build_object('inicio',pa,'fin',pb,'subarea',h->>'subarea','ultimo',false,'hasta',pa2),jsonb_build_object('inicio',pa2,'fin',pb2,'subarea',h->>'subarea_2','ultimo',true,'desde',pb));
     END IF;$new$;
 if position(old in s)=0 then raise exception 'No se encontro definicion de bloques';end if;s:=replace(s,old,replacement);
 old:=$find$subctx:=jsonb_build_object('recorrido',ev,'total_marcaciones',jsonb_array_length(ev),'horario',jsonb_build_object('subarea',bloque.v->>'subarea'));$find$;
 replacement:=$new$subctx:=jsonb_build_object('fecha',p_fecha,'recorrido',ev,'total_marcaciones',jsonb_array_length(ev),'horario',jsonb_build_object('subarea',bloque.v->>'subarea','inicio_referencia',bloque.v->>'inicio','fin_referencia',bloque.v->>'fin'));$new$;
 if position(old in s)=0 then raise exception 'No se encontro subcontexto';end if;s:=replace(s,old,replacement);
 old:=$find$sel:=nomina_revision_v77.seleccionar_punto_v713(subctx);a:=$find$;
 replacement:=$new$sel:=nomina_revision_v77.seleccionar_punto_v713(subctx);
   IF sel->>'fuente'='multipunto_horario' THEN avisos:=avisos||jsonb_build_array('Comparacion multipunto: '||(sel->>'punto')||'. '||(sel->>'nota'));END IF;
   a:=$new$;
 if position(old in s)=0 then raise exception 'No se encontro seleccion';end if;s:=replace(s,old,replacement);
 s:=replace(s,'Hay un bloque sin extremos suficientes. No se mezclan puntos distintos.','Hay un bloque sin extremos congruentes. Revisar horario y todas las marcaciones.');
 execute s;

 s:=pg_get_functiondef('public.previsualizar_sugerencia_nomina_v719(text,date,text)'::regprocedure);
 s:=replace(s,'DECLARE ctx jsonb;','DECLARE sel751 jsonb; ctx jsonb;');
 old:=$find$a:=(ctx->>'entrada')::timestamp;b:=(ctx->>'salida')::timestamp;$find$;
 replacement:=$new$a:=(ctx->>'entrada')::timestamp;b:=(ctx->>'salida')::timestamp;
 IF h IS NOT NULL THEN
  sel751:=nomina_revision_v77.seleccionar_multipunto_v751(jsonb_build_object('fecha',p_fecha,'recorrido',ctx->'recorrido','total_marcaciones',jsonb_array_length(ctx->'recorrido'),'horario',jsonb_build_object('hora_inicio',h->>'inicio','hora_fin',h->>'fin')));
  IF sel751 IS NOT NULL THEN
   a:=(sel751->>'entrada')::timestamp;b:=(sel751->>'salida')::timestamp;
   ctx:=ctx||jsonb_build_object('entrada',a,'salida',b,'par_claro',coalesce((sel751->>'par_claro')::boolean,false),'seleccion_multipunto_751',sel751,'avisos',coalesce(ctx->'avisos','[]'::jsonb)||jsonb_build_array(sel751->>'nota'));
  END IF;
 END IF;$new$;
 if position(old in s)=0 then raise exception 'No se encontro entrada sugerida';end if;s:=replace(s,old,replacement);execute s;

 s:=pg_get_functiondef('chef_planificacion.guardar(uuid,jsonb,text)'::regprocedure);
 old:=$find$   IF f<reloj::date THEN
     RAISE EXCEPTION 'La fecha % ya transcurrio. No se modifica retroactivamente',f;
   END IF;$find$;
 replacement:=$new$   IF f<greatest(date '2026-08-23',date_trunc('week',reloj)::date-7) THEN
     RAISE EXCEPTION 'Chef permite programar desde el lunes de la semana anterior (%). Para fechas anteriores requiere revision de Nomina',date_trunc('week',reloj)::date-7 USING ERRCODE='22023';
   END IF;
   PERFORM set_config('chef_planificacion.motivo',left(CASE WHEN f<=reloj::date THEN 'Regularizacion de horario ('||f::text||'): ' ELSE '' END||p_motivo,500),true);$new$;
 if position(old in s)=0 then raise exception 'No se encontro limite de fecha Chef';end if;s:=replace(s,old,replacement);
 old:=$find$   IF f=reloj::date AND EXISTS(
     SELECT 1 FROM public.biotime_marcaciones m
     WHERE (m.emp_code=cp.documento OR m.empleado_id=cp.empleado_id)
       AND coalesce(m.is_attendance,true)
       AND m.punch_time>=f::timestamp AND m.punch_time<reloj
   ) THEN
     RAISE EXCEPTION 'Ya hay marcaciones de esta jornada; requiere revision auditada';
   END IF;
$find$;
 if position(old in s)=0 then raise exception 'No se encontro bloqueo por marcaciones';end if;s:=replace(s,old,'');
 old:=$find$   IF oldrow.id IS NOT NULL AND f=reloj::date
      AND f+public.chef_hora_asignada_v1(
        oldrow.horario_asignado,'inicio1',
        (SELECT hora_inicio FROM public.cocina_codigos_turno WHERE codigo=oldrow.codigo_turno)
      )<=reloj THEN
     RAISE EXCEPTION 'La jornada existente ya comenzo; requiere correccion auditada';
   END IF;
$find$;
 if position(old in s)=0 then raise exception 'No se encontro bloqueo jornada existente';end if;s:=replace(s,old,'');
 old:=$find$   IF f=reloj::date AND (h->>'inicio1') IS NOT NULL AND f+(h->>'inicio1')::time<=reloj THEN
     RAISE EXCEPTION 'El horario ya comenzo; no se cambia para absorber horas trabajadas';
   END IF;
$find$;
 if position(old in s)=0 then raise exception 'No se encontro bloqueo inicio horario';end if;s:=replace(s,old,'');
 if position('chef_planificacion.autorizado()' in s)=0 or position('Existen decisiones de Nomina cerradas' in s)=0 or position('La jornada esta cerrada' in s)=0 then raise exception 'Falta proteccion de permisos o cierres';end if;
 execute s;
end;
$migration$;
