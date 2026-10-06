-- Mis Turnos 7.54: conserva suscripciones y recupera avisos recientes sin envío.
-- No cambia permisos de notificaciones, claves VAPID, datos de nómina ni sesiones.

ALTER TABLE portal_push_v748.envios
 ADD COLUMN IF NOT EXISTS recibo uuid NOT NULL DEFAULT gen_random_uuid(),
 ADD COLUMN IF NOT EXISTS mostrado_at timestamptz;

CREATE OR REPLACE FUNCTION public.portal_push_recibo_v754(p_envio uuid,p_recibo uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE n integer;
BEGIN
 UPDATE portal_push_v748.envios
 SET mostrado_at=coalesce(mostrado_at,now())
 WHERE id=p_envio AND recibo=p_recibo AND intentos>0;
 GET DIAGNOSTICS n=ROW_COUNT;
 RETURN jsonb_build_object('ok',n=1);
END;
$function$;
REVOKE ALL ON FUNCTION public.portal_push_recibo_v754(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.portal_push_recibo_v754(uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION portal_push_v748.recuperar_pendientes(p_suscripcion uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE s portal_push_v748.suscripciones%rowtype; n integer;
BEGIN
 SELECT * INTO s FROM portal_push_v748.suscripciones
 WHERE id=p_suscripcion AND activa
   AND portal_push_v748.identidad(usuario_id)=empleado_id
 FOR UPDATE;
 IF s.id IS NULL OR NOT EXISTS(SELECT 1 FROM portal_push_v748.configuracion WHERE id AND activo) THEN RETURN 0; END IF;
 INSERT INTO portal_push_v748.envios(evento_id,suscripcion_id,revision,proximo)
 SELECT e.id,s.id,s.revision,now()
 FROM portal_push_v748.eventos e
 WHERE e.creado_at>now()-interval '1 day'
   AND NOT EXISTS(SELECT 1 FROM portal_push_v748.envios d WHERE d.evento_id=e.id AND d.suscripcion_id=s.id)
   AND (
    (e.clase='horario' AND e.empleado_id=s.empleado_id
     AND e.fecha>=(now() AT TIME ZONE 'America/Bogota')::date
     AND NOT EXISTS(SELECT 1 FROM portal_push_v748.lecturas l WHERE l.evento_id=e.id AND l.usuario_id=s.usuario_id))
    OR
    (e.clase='bienestar' AND e.empleado_id=s.empleado_id AND EXISTS(
     SELECT 1 FROM public.notificaciones_sistema n JOIN public.empleados p ON p.id=s.empleado_id
     WHERE n.referencia_id=e.referencia_id AND n.cedula_destino=p.cedula
      AND n.rol_destino='empleado' AND n.canal='interno' AND n.modulo='mis-turnos'
      AND n.created_at=e.creado_at AND NOT n.estado_lectura))
    OR
    (e.clase='bienestar_equipo' AND portal_push_v748.es_bienestar(s.usuario_id) AND EXISTS(
     SELECT 1 FROM public.notificaciones_sistema n
     WHERE n.referencia_id=e.referencia_id AND n.rol_destino='bienestar'
      AND n.canal='interno' AND n.modulo='solicitudes-bienestar'
      AND n.created_at=e.creado_at AND NOT n.estado_lectura))
   )
 ORDER BY e.creado_at DESC,e.id
 LIMIT 30
 ON CONFLICT(evento_id,suscripcion_id) DO NOTHING;
 GET DIAGNOSTICS n=ROW_COUNT;
 RETURN n;
END;
$function$;
REVOKE ALL ON FUNCTION portal_push_v748.recuperar_pendientes(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.portal_push_usuario_v748(p_usuario uuid, p_accion text, p_datos jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 eid uuid;
 s portal_push_v748.suscripciones%rowtype;
 v_endpoint text;
 v_p256dh text;
 v_auth text;
 v_usuario_anterior uuid;
 ev uuid;
 lista jsonb;
 n bigint;
 recuperados integer;
BEGIN
 eid:=portal_push_v748.identidad(p_usuario);
 IF eid IS NULL THEN
  RAISE EXCEPTION 'Activa tu cuenta personal e ingresa nuevamente' USING ERRCODE='42501';
 END IF;

 IF p_accion='config' THEN
  RETURN jsonb_build_object(
   'ok',true,
   'usuario',p_usuario,
   'bienestar',portal_push_v748.es_bienestar(p_usuario),
   'activo',(SELECT activo FROM portal_push_v748.configuracion WHERE id),
   'envio_automatico',(SELECT envio_automatico FROM portal_push_v748.configuracion WHERE id)
  );

 ELSIF p_accion='guardar' THEN
  v_endpoint:=p_datos->>'endpoint';
  v_p256dh:=p_datos->'keys'->>'p256dh';
  v_auth:=p_datos->'keys'->>'auth';

  IF v_endpoint IS NULL
     OR length(v_endpoint)>4096
     OR v_endpoint !~ '^https://(fcm[.]googleapis[.]com|updates[.]push[.]services[.]mozilla[.]com|web[.]push[.]apple[.]com|[a-zA-Z0-9-]+[.]notify[.]windows[.]com)/'
     OR coalesce(v_p256dh,'')!~'^[A-Za-z0-9_-]{87}=?$'
     OR coalesce(v_auth,'')!~'^[A-Za-z0-9_-]{22}(==)?$'
  THEN
   RAISE EXCEPTION 'Suscripcion push invalida' USING ERRCODE='22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('push748:endpoint:'||v_endpoint,0));
  PERFORM pg_advisory_xact_lock(hashtextextended('push748:user:'||p_usuario,0));

  SELECT * INTO s
  FROM portal_push_v748.suscripciones
  WHERE suscripciones.endpoint=v_endpoint
  FOR UPDATE;

  v_usuario_anterior:=s.usuario_id;

  IF s.id IS NOT NULL AND s.usuario_id<>p_usuario
     AND (s.p256dh IS DISTINCT FROM v_p256dh OR s.auth_key IS DISTINCT FROM v_auth)
  THEN
   RAISE EXCEPTION 'No se pudo verificar que este dispositivo sea el mismo. Desactiva y vuelve a activar los avisos.'
   USING ERRCODE='23505';
  END IF;

  IF (s.id IS NULL OR s.usuario_id<>p_usuario OR NOT s.activa)
     AND (SELECT count(*) FROM portal_push_v748.suscripciones WHERE usuario_id=p_usuario AND activa)>=5
  THEN
   RAISE EXCEPTION 'Maximo cinco dispositivos activos. Contacta a Sistemas.';
  END IF;

  INSERT INTO portal_push_v748.suscripciones(
   usuario_id,empleado_id,endpoint,p256dh,auth_key
  )
  VALUES(
   p_usuario,eid,v_endpoint,v_p256dh,v_auth
  )
  ON CONFLICT(endpoint) DO UPDATE SET
   usuario_id=excluded.usuario_id,
   empleado_id=excluded.empleado_id,
   activa=true,
   visto_at=now(),
   p256dh=excluded.p256dh,
   auth_key=excluded.auth_key,
   revision=CASE
    WHEN portal_push_v748.suscripciones.usuario_id=excluded.usuario_id
      AND portal_push_v748.suscripciones.empleado_id=excluded.empleado_id
      AND portal_push_v748.suscripciones.activa
      AND portal_push_v748.suscripciones.p256dh=excluded.p256dh
      AND portal_push_v748.suscripciones.auth_key=excluded.auth_key
    THEN portal_push_v748.suscripciones.revision
    ELSE gen_random_uuid()
   END,
   ultima_prueba=CASE
    WHEN portal_push_v748.suscripciones.usuario_id=excluded.usuario_id
    THEN portal_push_v748.suscripciones.ultima_prueba
    ELSE NULL
   END
  RETURNING * INTO s;

  UPDATE portal_push_v748.envios
  SET estado='cancelado',lease=NULL,vence_lease=NULL
  WHERE suscripcion_id=s.id
    AND revision<>s.revision
    AND estado IN('pendiente','enviando');

  recuperados:=portal_push_v748.recuperar_pendientes(s.id);

  RETURN jsonb_build_object(
   'ok',true,
   'id',s.id,
   'recuperados',recuperados,
   'reasignada',v_usuario_anterior IS NOT NULL AND v_usuario_anterior<>p_usuario
  );

 ELSIF p_accion='baja' THEN
  UPDATE portal_push_v748.suscripciones
  SET activa=false,revision=gen_random_uuid()
  WHERE usuario_id=p_usuario AND suscripciones.endpoint=p_datos->>'endpoint';
  RETURN jsonb_build_object('ok',true);

 ELSIF p_accion='prueba' THEN
  SELECT * INTO s
  FROM portal_push_v748.suscripciones
  WHERE usuario_id=p_usuario AND activa AND suscripciones.endpoint=p_datos->>'endpoint'
  FOR UPDATE;
  IF s.id IS NULL THEN RAISE EXCEPTION 'Activa primero las notificaciones';END IF;
  IF s.ultima_prueba>now()-interval '1 minute' THEN RAISE EXCEPTION 'Espera un minuto antes de otra prueba';END IF;
  UPDATE portal_push_v748.suscripciones SET ultima_prueba=now() WHERE id=s.id;
  INSERT INTO portal_push_v748.eventos(clave,empleado_id,usuario_id,clase)
  VALUES('prueba:'||gen_random_uuid(),eid,p_usuario,'prueba')
  RETURNING id INTO ev;
  INSERT INTO portal_push_v748.envios(evento_id,suscripcion_id,revision,proximo)
  VALUES(ev,s.id,s.revision,now());
  RETURN jsonb_build_object('ok',true,'en_cola',true);

 ELSIF p_accion IN('avisos','leido') THEN
  IF p_accion='leido' THEN
   INSERT INTO portal_push_v748.lecturas(evento_id,usuario_id)
   SELECT e.id,p_usuario
   FROM portal_push_v748.eventos e
   WHERE e.id=(p_datos->>'id')::uuid AND e.empleado_id=eid AND e.clase='horario'
   ON CONFLICT DO NOTHING;
  END IF;

  SELECT count(*) INTO n
  FROM portal_push_v748.eventos e
  WHERE e.empleado_id=eid
    AND e.clase='horario'
    AND NOT EXISTS(
     SELECT 1 FROM portal_push_v748.lecturas l
     WHERE l.evento_id=e.id AND l.usuario_id=p_usuario
    );

  SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') INTO lista
  FROM (
   SELECT e.id,e.fecha,e.hasta,e.creado_at,
          'Cambio en tu programacion'::text titulo,
          NOT EXISTS(
           SELECT 1 FROM portal_push_v748.lecturas l
           WHERE l.evento_id=e.id AND l.usuario_id=p_usuario
          ) pendiente
   FROM portal_push_v748.eventos e
   WHERE e.empleado_id=eid AND e.clase='horario'
   ORDER BY e.creado_at DESC,e.id DESC
   LIMIT 30
  ) t;

  RETURN jsonb_build_object('ok',true,'avisos',lista,'pendientes',n);

 ELSE
  RAISE EXCEPTION 'Accion no permitida' USING ERRCODE='22023';
 END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.portal_push_despacho_v748(p_secreto text, p_resultados jsonb DEFAULT '[]'::jsonb, p_limite integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE esperado text;v jsonb;x jsonb;s portal_push_v748.envios%rowtype;salida jsonb;
BEGIN
 SELECT d.decrypted_secret INTO esperado FROM portal_push_v748.configuracion c JOIN vault.decrypted_secrets d ON d.id=c.trabajador_vault WHERE c.id;
 IF p_secreto IS NULL OR p_secreto IS DISTINCT FROM esperado THEN RAISE EXCEPTION 'Acceso reservado' USING ERRCODE='42501';END IF;
 IF jsonb_typeof(p_resultados)<>'array' OR jsonb_array_length(p_resultados)>30 OR p_limite NOT BETWEEN 0 AND 30 THEN RAISE EXCEPTION 'Lote invalido';END IF;
 FOR x IN SELECT value FROM jsonb_array_elements(p_resultados) LOOP
  SELECT * INTO s FROM portal_push_v748.envios WHERE id=(x->>'id')::uuid AND lease=(x->>'lease')::uuid AND estado='enviando' FOR UPDATE;IF s.id IS NULL THEN CONTINUE;END IF;
  IF (x->>'status')::int BETWEEN 200 AND 299 THEN UPDATE portal_push_v748.envios SET estado='aceptado',codigo_http=(x->>'status')::int,aceptado_at=now(),lease=NULL,vence_lease=NULL WHERE id=s.id;
  ELSIF (x->>'status')::int IN(404,410) THEN UPDATE portal_push_v748.envios SET estado='cancelado',codigo_http=(x->>'status')::int,lease=NULL,vence_lease=NULL WHERE id=s.id;UPDATE portal_push_v748.suscripciones SET activa=false WHERE id=s.suscripcion_id AND revision=s.revision;
  ELSE UPDATE portal_push_v748.envios SET estado=CASE WHEN intentos>=6 THEN 'agotado' ELSE 'pendiente' END,codigo_http=(x->>'status')::int,proximo=now()+make_interval(secs=>least(1800,60*(2^intentos)::int)),lease=NULL,vence_lease=NULL WHERE id=s.id;END IF;
 END LOOP;
 UPDATE portal_push_v748.envios d SET estado='cancelado',lease=NULL,vence_lease=NULL WHERE d.estado IN('pendiente','enviando') AND EXISTS(SELECT 1 FROM portal_push_v748.suscripciones b JOIN portal_push_v748.eventos e ON e.id=d.evento_id WHERE b.id=d.suscripcion_id AND (NOT b.activa OR b.revision<>d.revision OR portal_push_v748.identidad(b.usuario_id) IS DISTINCT FROM b.empleado_id OR e.creado_at<now()-interval '1 day' OR (e.clase='bienestar_equipo' AND NOT portal_push_v748.es_bienestar(b.usuario_id))));
 UPDATE portal_push_v748.envios SET estado='agotado',lease=NULL,vence_lease=NULL WHERE estado='enviando' AND vence_lease<now() AND intentos>=6;
 WITH eligibles AS(SELECT d.id FROM portal_push_v748.envios d WHERE (SELECT activo FROM portal_push_v748.configuracion WHERE id) AND ((d.estado='pendiente' AND d.proximo<=now()) OR (d.estado='enviando' AND d.vence_lease<now())) AND d.intentos<6 ORDER BY d.proximo LIMIT p_limite FOR UPDATE SKIP LOCKED),locked AS(UPDATE portal_push_v748.envios d SET estado='enviando',intentos=intentos+1,lease=gen_random_uuid(),vence_lease=now()+interval '3 minutes' FROM eligibles q WHERE q.id=d.id RETURNING d.*)
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',d.id,'lease',d.lease,'recibo',d.recibo,'evento',e.id,'clase',e.clase,'fecha',e.fecha,'hasta',e.hasta,'suscripcion',jsonb_build_object('endpoint',b.endpoint,'keys',jsonb_build_object('p256dh',b.p256dh,'auth',b.auth_key)))),'[]') INTO salida FROM locked d JOIN portal_push_v748.suscripciones b ON b.id=d.suscripcion_id JOIN portal_push_v748.eventos e ON e.id=d.evento_id;
 RETURN jsonb_build_object('ok',true,'envios',salida);
END;$function$
;
