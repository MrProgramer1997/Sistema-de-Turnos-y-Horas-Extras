-- Las comprobaciones se revierten dentro de una subtransacción.
-- No dejan pruebas en cola, recibos artificiales ni cambios de lectura.
DO $validation$
DECLARE s portal_push_v748.suscripciones%rowtype; ev uuid; leido uuid; viejo uuid; ajeno uuid;
 other_employee uuid; n integer; accepted portal_push_v748.envios%rowtype; r jsonb; first_receipt timestamptz;
BEGIN
 BEGIN
  SELECT * INTO s FROM portal_push_v748.suscripciones
   WHERE activa AND portal_push_v748.identidad(usuario_id)=empleado_id
   ORDER BY visto_at DESC LIMIT 1;
  IF s.id IS NULL THEN RAISE EXCEPTION 'No hay dispositivo válido para comprobar la recuperación'; END IF;
  INSERT INTO portal_push_v748.eventos(clave,empleado_id,clase,fecha)
   VALUES('validacion-v754:'||gen_random_uuid(),s.empleado_id,'horario',(now() AT TIME ZONE 'America/Bogota')::date)
   RETURNING id INTO ev;
  n:=portal_push_v748.recuperar_pendientes(s.id);
  IF n<1 OR NOT EXISTS(SELECT 1 FROM portal_push_v748.envios WHERE evento_id=ev AND suscripcion_id=s.id AND revision=s.revision AND estado='pendiente')
   THEN RAISE EXCEPTION 'No recuperó un aviso pendiente del mismo empleado'; END IF;
  IF portal_push_v748.recuperar_pendientes(s.id)<>0
   THEN RAISE EXCEPTION 'Duplicó los avisos al repetir la recuperación'; END IF;
  INSERT INTO portal_push_v748.eventos(clave,empleado_id,clase,fecha)
   VALUES('validacion-leido-v754:'||gen_random_uuid(),s.empleado_id,'horario',(now() AT TIME ZONE 'America/Bogota')::date)
   RETURNING id INTO leido;
  INSERT INTO portal_push_v748.lecturas(evento_id,usuario_id) VALUES(leido,s.usuario_id);
  INSERT INTO portal_push_v748.eventos(clave,empleado_id,clase,fecha,creado_at)
   VALUES('validacion-viejo-v754:'||gen_random_uuid(),s.empleado_id,'horario',(now() AT TIME ZONE 'America/Bogota')::date,now()-interval '2 days')
   RETURNING id INTO viejo;
  SELECT id INTO other_employee FROM public.empleados WHERE id<>s.empleado_id AND estado LIMIT 1;
  INSERT INTO portal_push_v748.eventos(clave,empleado_id,clase,fecha)
   VALUES('validacion-ajeno-v754:'||gen_random_uuid(),other_employee,'horario',(now() AT TIME ZONE 'America/Bogota')::date)
   RETURNING id INTO ajeno;
  PERFORM portal_push_v748.recuperar_pendientes(s.id);
  IF EXISTS(SELECT 1 FROM portal_push_v748.envios WHERE suscripcion_id=s.id AND evento_id IN(leido,viejo,ajeno))
   THEN RAISE EXCEPTION 'Recuperó un aviso leído, vencido o de otra persona'; END IF;
  UPDATE portal_push_v748.suscripciones SET activa=false WHERE id=s.id;
  IF portal_push_v748.recuperar_pendientes(s.id)<>0
   THEN RAISE EXCEPTION 'Recuperó avisos para un dispositivo desactivado'; END IF;
  SELECT * INTO accepted FROM portal_push_v748.envios WHERE estado='aceptado' AND intentos>0 ORDER BY aceptado_at DESC LIMIT 1;
  IF accepted.id IS NULL THEN RAISE EXCEPTION 'No hay envío aceptado para comprobar el recibo'; END IF;
  r:=public.portal_push_recibo_v754(accepted.id,gen_random_uuid());
  IF (r->>'ok')::boolean OR (SELECT mostrado_at FROM portal_push_v748.envios WHERE id=accepted.id) IS DISTINCT FROM accepted.mostrado_at
   THEN RAISE EXCEPTION 'Aceptó un comprobante que no corresponde al envío'; END IF;
  r:=public.portal_push_recibo_v754(accepted.id,accepted.recibo);
  SELECT mostrado_at INTO first_receipt FROM portal_push_v748.envios WHERE id=accepted.id;
  IF NOT (r->>'ok')::boolean OR first_receipt IS NULL THEN RAISE EXCEPTION 'No aceptó el comprobante correcto'; END IF;
  PERFORM public.portal_push_recibo_v754(accepted.id,accepted.recibo);
  IF (SELECT mostrado_at FROM portal_push_v748.envios WHERE id=accepted.id) IS DISTINCT FROM first_receipt
   THEN RAISE EXCEPTION 'Cambió el primer recibo al repetirlo'; END IF;
  IF has_function_privilege('anon','public.portal_push_recibo_v754(uuid,uuid)','EXECUTE')
   OR has_function_privilege('authenticated','public.portal_push_recibo_v754(uuid,uuid)','EXECUTE')
   OR NOT has_function_privilege('service_role','public.portal_push_recibo_v754(uuid,uuid)','EXECUTE')
   OR has_function_privilege('anon','portal_push_v748.recuperar_pendientes(uuid)','EXECUTE')
   OR has_function_privilege('authenticated','portal_push_v748.recuperar_pendientes(uuid)','EXECUTE')
   THEN RAISE EXCEPTION 'Permisos inesperados en las funciones de recuperación o recibo'; END IF;
  RAISE EXCEPTION 'validacion completada; revertir solamente sus datos' USING ERRCODE='PT754';
 EXCEPTION WHEN SQLSTATE 'PT754' THEN NULL;
 END;
END;
$validation$;

