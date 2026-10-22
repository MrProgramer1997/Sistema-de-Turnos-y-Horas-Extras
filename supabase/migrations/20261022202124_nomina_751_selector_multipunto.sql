-- Additive, private pure selector. No payroll or biometric rows are changed.
create schema if not exists nomina_integridad_v751;
revoke all on schema nomina_integridad_v751 from public, anon, authenticated;
create table if not exists nomina_integridad_v751.respaldo_funciones (
 firma text primary key, definicion text not null, huella text not null,
 creado_at timestamptz not null default now()
);
alter table nomina_integridad_v751.respaldo_funciones enable row level security;
revoke all on nomina_integridad_v751.respaldo_funciones from public, anon, authenticated;

create or replace function nomina_revision_v77.seleccionar_multipunto_v751(j jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $function$
declare
 ev jsonb; internos jsonb; h jsonb:=coalesce(j->'horario','{}'::jsonb);
 primero jsonb; ultimo jsonb; respuesta jsonb; total int; grupos int; fecha date;
 a timestamp; b timestamp; pa timestamp; pb timestamp; pa2 timestamp; pb2 timestamp;
begin
 with raw as (
  select v,coalesce(nullif(v->>'punto',''),nullif(v->>'area_alias',''),nullif(v->>'area_biometrico',''),nullif(v->>'terminal_alias',''),nullif(v->>'terminal',''),v->>'serial','') etiqueta,
   position('PORTER' in nomina_revision_v77.normalizar(concat_ws(' ',v->>'punto',v->>'area_alias',v->>'area_biometrico',v->>'terminal_alias',v->>'terminal')))>0 puerta
  from jsonb_array_elements(coalesce(j->'recorrido','[]'::jsonb)) v
 ), clas as (
  select v||jsonb_build_object('_punto',etiqueta,'_key',nomina_revision_v77.normalizar(etiqueta),'_puerta',puerta) v from raw
 ) select coalesce(jsonb_agg(v order by (v->>'hora')::timestamp,v->>'id'),'[]'::jsonb) into ev from clas;
 total:=jsonb_array_length(ev);
 select coalesce(jsonb_agg(v order by (v->>'hora')::timestamp,v->>'id'),'[]'::jsonb),count(distinct v->>'_key')
 into internos,grupos from jsonb_array_elements(ev) v
 where not (v->>'_puerta')::boolean and coalesce((v->>'is_attendance')::boolean,true)
 and coalesce(v->>'_key','')<>'' and (v->>'_key')!~'^[A-Z]{2,}[0-9]{6,}$';
 if grupos<2 then return null; end if;
 fecha:=coalesce(nullif(j->>'fecha',''),nullif(h->>'fecha',''))::date;
 if nullif(h->>'inicio_referencia','') is not null and nullif(h->>'fin_referencia','') is not null then
  pa:=(h->>'inicio_referencia')::timestamp;pb:=(h->>'fin_referencia')::timestamp;
 elsif fecha is not null and coalesce(h->>'hora_inicio','')~'^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$'
 and coalesce(h->>'hora_fin','')~'^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$' then
  pa:=fecha+(h->>'hora_inicio')::time;pb:=fecha+(h->>'hora_fin')::time;
 else return null;end if;
 if pb<pa then pb:=pb+interval '1 day';end if;
 respuesta:=jsonb_build_object('version','multipunto_v751','fuente','incompleta','punto',null,'punto_programado',h->>'subarea','coincide',null,'entrada',null,'salida',null,'cantidad',0,'total',total,'grupos',grupos,'par_claro',false,'usadas','[]'::jsonb,'completa',total=coalesce((j->>'total_marcaciones')::int,total));
 if total<>coalesce((j->>'total_marcaciones')::int,total) then
  return respuesta||jsonb_build_object('nota','Recorrido incompleto: actualizar antes de comparar puntos distintos.');end if;
 if coalesce((h->>'conflicto_programacion')::boolean,false) or coalesce((j->>'conflicto_horario')::boolean,false) or nullif(h->>'novedad_codigo','') is not null or h->>'tipo_registro'='novedad' then
  return respuesta||jsonb_build_object('nota','Horario en conflicto o con novedad. Confirmar antes de combinar puntos.');end if;
 if nullif(h->>'hora_inicio_2','') is not null or nullif(h->>'turno_2','') is not null then
  if fecha is null or nullif(h->>'hora_inicio_2','') is null or nullif(h->>'hora_fin_2','') is null then
   return respuesta||jsonb_build_object('nota','Turno partido: confirmar cada bloque.');end if;
  pa2:=fecha+(h->>'hora_inicio_2')::time;if pa2<pa then pa2:=pa2+interval '1 day';end if;
  pb2:=pa2::date+(h->>'hora_fin_2')::time;if pb2<pa2 then pb2:=pb2+interval '1 day';end if;
  if pa2<>pb then return respuesta||jsonb_build_object('nota','Turno partido con separacion: confirmar cada bloque.');end if;
  pb:=pb2;
 end if;
 primero:=internos->0;ultimo:=internos->(jsonb_array_length(internos)-1);
 a:=(primero->>'hora')::timestamp;b:=(ultimo->>'hora')::timestamp;
 -- Congruence windows, not a wage tolerance: +/-120 entry, +/-240 exit.
 if pb<=pa or pb-pa>interval '16 hours' or b<=a or b-a>interval '16 hours' or abs(extract(epoch from a-pa))>7200 or abs(extract(epoch from b-pb))>14400 or a>=pb or b<=pa then
  return respuesta||jsonb_build_object('nota','Los extremos de distintos puntos no son congruentes con el horario. Revisar todas las marcas; no se recortan ni se inventan horas.');end if;
 if exists(select 1 from jsonb_array_elements(internos) v where
  ((v->>'hora')::timestamp-a<=interval '2 minutes' and v->>'_key'<>primero->>'_key') or
  (b-(v->>'hora')::timestamp<=interval '2 minutes' and v->>'_key'<>ultimo->>'_key')) then
  return respuesta||jsonb_build_object('nota','Hay lecturas de distintos puntos muy proximas a un extremo. Confirmar entrada o salida; no asumir captura accidental.');end if;
 if exists(select 1 from jsonb_array_elements(ev) v,jsonb_array_elements(ev) w
  where (v->>'_puerta')::boolean and (w->>'_puerta')::boolean
  and nomina_revision_v77.normalizar(coalesce(v->>'terminal_alias',v->>'terminal')) like '%SALIDA%'
  and nomina_revision_v77.normalizar(coalesce(w->>'terminal_alias',w->>'terminal'))~'(INGRESO|ENTRADA)'
  and (v->>'hora')::timestamp>a and (v->>'hora')::timestamp<b
  and (w->>'hora')::timestamp>(v->>'hora')::timestamp and (w->>'hora')::timestamp<b) then
  return respuesta||jsonb_build_object('nota','Hay salida y reingreso intermedios de Porteria. Revisar intervalos antes de sumar la jornada.');end if;
 return respuesta||jsonb_build_object('fuente','multipunto_horario','entrada',a,'salida',b,'cantidad',2,'par_claro',true,
  'punto',case when primero->>'_punto'=ultimo->>'_punto' then primero->>'_punto' else (primero->>'_punto')||' -> '||(ultimo->>'_punto') end,
  'punto_entrada',primero->>'_punto','punto_salida',ultimo->>'_punto','usadas',jsonb_build_array(primero,ultimo),
  'nota','Extremos internos contrastados con el horario; marcas intermedias conservadas como movimientos. Referencia para revisar, no pago aprobado.');
end;
$function$;
revoke execute on function nomina_revision_v77.seleccionar_multipunto_v751(jsonb) from public, anon, authenticated;
