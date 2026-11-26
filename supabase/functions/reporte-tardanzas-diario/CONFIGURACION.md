# Reporte diario de tardanzas AYB y Chef

Estado inicial: **Edge Function desplegada con envío deshabilitado** y trabajo
Supabase Cron **creado, pero inactivo**. No se envían correos hasta completar
las comprobaciones siguientes.

## Diseño

- Fecha: día anterior en `America/Bogota`.
- Hora sugerida: 7:00 a. m. Colombia (12:00 UTC).
- Fuentes: programación AYB, programación Chef (fija), novedades y marcas BioTime.
- Cálculo: se reutiliza `buildModel/punctuality` del Centro de Control.
- Marcación válida: solo ingreso al punto de trabajo, nunca Portería.
- No se cuentan como tardanza: descansos, incapacidades, conflictos, días sin
  programación, falta de marcas y puntos biométricos aún no validados.
- Si no hay programación ese día, no se envía un falso reporte de cero tardanzas.
- No modifica tablas operativas, horarios ni marcaciones.
- No se registran diagnósticos médicos en los correos.

## 1. Proveedor de email

Crear cuenta en Resend (o emplear un proveedor corporativo aprobado) y **verificar
el dominio remitente** mediante sus registros DNS, sin afectar Microsoft 365.
No modificar los MX ni sobrescribir el SPF principal sin revisión de Sistemas.

En **Supabase > Edge Functions > Secrets** configurar los siguientes nombres
con valores privados. Nunca copiarlos al repositorio:

| Variable | Valor |
|---|---|
| `RESEND_API_KEY` | API Key de Resend con permiso de envío |
| `REPORT_FROM_EMAIL` | Remitente del dominio verificado |
| `REPORT_TO_EMAILS` | Exactamente cinco destinatarios internos, separados por comas |
| `REPORT_CRON_TOKEN` | Token aleatorio y exclusivo de mínimo 32 caracteres |
| `REPORT_ENABLED` | `false` hasta validar las pruebas |

`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` son variables internas del
entorno Supabase Edge Functions; no copiarlas al navegador ni a GitHub.

## 2. Registrar el mismo token en Vault

Solo un administrador autorizado debe ejecutar en SQL Editor:

```sql
select vault.create_secret(
  'PEGAR_AQUI_MISMO_TOKEN_ALEATORIO_QUE_REPORT_CRON_TOKEN',
  'tardanzas_cron_token',
  'Autenticacion del cron de tardanzas AYB/Chef'
);
```

La función usa `X-Report-Token` como autenticación exclusiva. `verify_jwt=false`
está justificado porque el endpoint implementa su propio secreto obligatorio y,
sin la variable `REPORT_ENABLED=true`, ninguna petición puede enviar email.

## 3. Vista previa sin enviar

En Edge Functions > `reporte-tardanzas-diario` > Test enviar:

- Método `POST`
- Cabecera `X-Report-Token: <TOKEN_PRIVADO>`
- JSON `{"mode":"preview","date":"2026-11-22"}` (día con programación)

Validar que `turnos` sea mayor que 0 y contrastar tres casos en el Centro de
Control. Los días sin programación devolverán `sin_programacion` y HTTP 409.
La vista previa **nunca** envía correos.

## 4. Activación controlada

Solo tras verificar dominio, la vista previa, remitente y destinatarios:

1. Cambiar `REPORT_ENABLED` a `true` en Secrets.
2. Activar el Cron que ya fue registrado y está inactivo:

```sql
DO $$
BEGIN
  PERFORM cron.alter_job(
    job_id := (
      select jobid from cron.job
      where jobname='cc_reporte_tardanzas_ayb_chef'
    ),
    active := true
  );
END $$;
```

El Cron invoca a las 12:00 UTC la función con `{"mode":"send"}`.
No acepta fechas arbitrarias para enviar: solo genera **ayer** según Colombia.
La petición a Resend incluye `Idempotency-Key` para impedir duplicados en los
reintentos durante la ventana de 24 horas del proveedor.

## 5. Verificación y reversión

```sql
select jobid,jobname,schedule,active
from cron.job
where jobname='cc_reporte_tardanzas_ayb_chef';
```

Revisar `cron.job_run_details` y los logs de la Edge Function. Si hay una
incidencia, desactivar inmediatamente:

```sql
DO $$
BEGIN
  PERFORM cron.alter_job(
    job_id := (
      select jobid from cron.job
      where jobname='cc_reporte_tardanzas_ayb_chef'
    ),
    active := false
  );
END $$;
```

Este procedimiento no modifica datos históricos, permisos RLS de las tablas
operativas ni la lógica de horas extras.
