-- 7.52: read the same Chef schedule in programming, payroll and evidence.
-- This pure resolver reads no tables and grants no access to employee data.
CREATE OR REPLACE FUNCTION public.chef_hora_programada_v752(
 h jsonb, campo text, codigo text, fecha date, festivo boolean,
 inicio time without time zone, fin time without time zone, activo boolean
) RETURNS time without time zone
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path = ''
AS $fn$
DECLARE primera time; larga boolean;
BEGIN
 IF campo NOT IN ('inicio1','fin1','inicio2','fin2') OR campo IS NULL THEN
  RAISE EXCEPTION 'Campo de horario Chef no valido' USING ERRCODE='22023';
 END IF;
 -- An individual assignment is authoritative, including explicit nulls.
 -- Never replace an unknown snapshot version with a catalog guess.
 IF h IS NOT NULL AND h <> 'null'::jsonb THEN
  IF h->>'version' IS DISTINCT FROM '1' THEN RETURN NULL; END IF;
  RETURN nullif(h->>campo,'')::time;
 END IF;
 IF activo IS FALSE OR inicio IS NULL OR fin IS NULL THEN RETURN NULL; END IF;
 -- Mirror resolverHorarioCodigo: custom and overnight codes retain their times.
 IF fin < inicio OR btrim(coalesce(codigo,'')) NOT IN ('1','2','3','4','5','6','7','8','9','10','11') THEN
  RETURN CASE WHEN campo LIKE 'inicio%' THEN inicio ELSE fin END;
 END IF;
 primera := (ARRAY[time '05:30',time '06:00',time '07:00',time '08:00',time '09:00',
  time '10:00',time '11:00',time '12:00',time '13:00',time '14:00',time '15:00'])[btrim(codigo)::int];
 larga := coalesce(festivo,false) OR coalesce(extract(isodow FROM fecha) IN (6,7),false);
 RETURN CASE WHEN campo LIKE 'inicio%' THEN primera
  ELSE primera + CASE WHEN larga THEN interval '8 hours 30 minutes' ELSE interval '7 hours' END END;
END;
$fn$;
REVOKE ALL ON FUNCTION public.chef_hora_programada_v752(jsonb,text,text,date,boolean,time,time,boolean) FROM PUBLIC;
-- Existing views are also used by legacy read-only screens. The utility is pure.
GRANT EXECUTE ON FUNCTION public.chef_hora_programada_v752(jsonb,text,text,date,boolean,time,time,boolean) TO anon, authenticated, service_role;

CREATE SCHEMA IF NOT EXISTS chef_nomina_v752;
REVOKE ALL ON SCHEMA chef_nomina_v752 FROM PUBLIC, anon, authenticated;
CREATE TABLE chef_nomina_v752.respaldo_vistas (
 nombre text PRIMARY KEY, definicion text NOT NULL, huella text NOT NULL,
 creado_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE chef_nomina_v752.respaldo_vistas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON chef_nomina_v752.respaldo_vistas FROM PUBLIC, anon, authenticated;

DO $checks$
DECLARE c record; actual time; h jsonb := '{"version":1,"inicio1":"09:15","fin1":"17:45","inicio2":null,"fin2":null}';
BEGIN
 FOR c IN SELECT * FROM (VALUES
  ('weekday entry',NULL::jsonb,'inicio1','3',date '2026-09-18',false,time '08:00',time '16:00',true,time '07:00'),
  ('weekday exit',NULL,'fin1','3',date '2026-09-18',false,time '08:00',time '16:00',true,time '14:00'),
  ('Saturday exit',NULL,'fin1','3',date '2026-09-19',false,time '08:00',time '16:00',true,time '15:30'),
  ('Sunday exit',NULL,'fin1','3',date '2026-09-20',false,time '08:00',time '16:00',true,time '15:30'),
  ('holiday exit',NULL,'fin1','3',date '2026-10-12',true,time '08:00',time '16:00',true,time '15:30'),
  ('saved entry',h,'inicio1','3',date '2026-09-18',false,time '08:00',time '16:00',true,time '09:15'),
  ('saved weekend',h,'fin1','3',date '2026-09-19',false,time '08:00',time '16:00',true,time '17:45'),
  ('saved inactive catalog',h,'inicio1','3',date '2026-09-18',false,time '08:00',time '16:00',false,time '09:15'),
  ('explicit null',h,'inicio2','7',date '2026-09-18',false,time '11:00',time '19:00',true,NULL::time),
  ('night entry',NULL,'inicio1','10',date '2026-09-18',false,time '18:00',time '02:00',true,time '18:00'),
  ('night exit',NULL,'fin1','10',date '2026-09-19',false,time '18:00',time '02:00',true,time '02:00'),
  ('custom exit',NULL,'fin1','TE',date '2026-09-18',false,time '16:00',time '18:00',true,time '18:00'),
  ('rest day',NULL,'inicio1','D',date '2026-09-18',false,NULL::time,NULL::time,true,NULL::time),
  ('inactive legacy',NULL,'fin1','3',date '2026-09-18',false,time '08:00',time '16:00',false,NULL::time),
  ('unknown snapshot','{"version":2}'::jsonb,'fin1','3',date '2026-09-18',false,time '08:00',time '16:00',true,NULL::time),
  ('second block weekday',NULL,'fin2','7',date '2026-09-18',false,time '12:00',time '20:00',true,time '18:00'),
  ('second block holiday',NULL,'fin2','7',date '2026-10-12',true,time '12:00',time '20:00',true,time '19:30')
 ) x(label,snapshot,field,code,day,holiday,start_time,end_time,active,expected)
 LOOP
  actual:=public.chef_hora_programada_v752(c.snapshot,c.field,c.code,c.day,c.holiday,c.start_time,c.end_time,c.active);
  IF actual IS DISTINCT FROM c.expected THEN RAISE EXCEPTION '752 test failed: %',c.label; END IF;
 END LOOP;
END;
$checks$;

DO $views$
DECLARE v record; s text; m text[]; old text; replacement text; found int;
 decisions_before text; schedules_before text;
BEGIN
 -- Do not touch stored decisions, schedules, grants, view columns or A&B rules.
 SELECT md5(string_agg(to_jsonb(r)::text,'|' ORDER BY id)) INTO decisions_before
 FROM public.turnos_conceptos_revision r;
 SELECT md5(string_agg(to_jsonb(r)::text,'|' ORDER BY id)) INTO schedules_before
 FROM public.cocina_programacion_turnos r;
 FOR v IN SELECT * FROM (VALUES
  ('vw_ayb_horas_programadas_diarias','79d5c995341e59dcd3ea71416a47f092',4),
  ('vw_cocina_chef_dashboard','d13e78b4a36473ca3d9ecc2600f2fd6f',2),
  ('vw_programaciones_resueltas','4811b0698c9c34c817e010ef9770a088',4),
  ('vw_programaciones_resueltas_v2','ad9d0794cfa562a2df2dbd784db54628',4)
 ) x(nombre,huella,esperados)
 LOOP
  s:=pg_get_viewdef(('public.'||v.nombre)::regclass,true);
  IF md5(s)<>v.huella THEN RAISE EXCEPTION 'La vista % cambio: revisar antes de aplicar',v.nombre;END IF;
  INSERT INTO chef_nomina_v752.respaldo_vistas(nombre,definicion,huella) VALUES(v.nombre,s,v.huella);
  found:=0;
  FOR m IN SELECT DISTINCT captures FROM regexp_matches(s,
    $rx$chef_hora_asignada_v1\(([a-z0-9_]+)\.horario_asignado, '(inicio[12]|fin[12])'::text, ([a-z0-9_]+)\.hora_(inicio|fin)\)$rx$,'g') AS t(captures)
  LOOP
   old:=format('chef_hora_asignada_v1(%s.horario_asignado, %L::text, %s.hora_%s)',m[1],m[2],m[3],m[4]);
   replacement:=format('public.chef_hora_programada_v752(%s.horario_asignado, %L::text, %s.codigo_turno%s, %s.fecha, EXISTS (SELECT 1 FROM public.festivos f752 WHERE f752.fecha=%s.fecha AND f752.activo), %s.hora_inicio, %s.hora_fin, %s.activo)',
      m[1],m[2],m[1],CASE WHEN right(m[2],1)='2' THEN '_2' ELSE '' END,m[1],m[1],m[3],m[3],m[3]);
   IF position(old IN s)=0 THEN RAISE EXCEPTION 'No se encontro expresion esperada';END IF;
   s:=replace(s,old,replacement);found:=found+1;
  END LOOP;
  IF found<>v.esperados OR position('chef_hora_asignada_v1(' IN s)>0 THEN
   RAISE EXCEPTION 'Reemplazo incompleto de %: %',v.nombre,found;
  END IF;
  EXECUTE format('CREATE OR REPLACE VIEW public.%I AS %s',v.nombre,s);
 END LOOP;
 IF decisions_before IS DISTINCT FROM (SELECT md5(string_agg(to_jsonb(r)::text,'|' ORDER BY id)) FROM public.turnos_conceptos_revision r)
  OR schedules_before IS DISTINCT FROM (SELECT md5(string_agg(to_jsonb(r)::text,'|' ORDER BY id)) FROM public.cocina_programacion_turnos r) THEN
  RAISE EXCEPTION 'Los registros cambiaron durante la verificacion; no publicar parcialmente';
 END IF;
END;
$views$;
