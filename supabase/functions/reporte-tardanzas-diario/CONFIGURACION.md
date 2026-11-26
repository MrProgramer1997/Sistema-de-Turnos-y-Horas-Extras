# Reporte diario de tardanzas AYB y Chef

Estado inicial: **Edge Function desplegada con envío deshabilitado** y trabajo
Supabase Cron **creado, pero inactivo**. No se envían correos hasta completar
las comprobaciones siguientes.

## Diseño

- Fecha: día anterior en `America/Bogota`.
- Hora programada: **8:00 a. m. Colombia (13:00 UTC)**, todos los días.
- Fuentes: programación AYB, programación Chef (fija), novedades y marcas BioTime.
- Cálculo: se reutiliza `buildModel/punctuality` del Centro de Control.
- Marcación válida: solo ingreso al punto de trabajo, nunca Portería.
- No se cuentan como tardanza: descansos, incapacidades, conflictos, días sin
  programación, falta de marcas y puntos biométricos aún no validados.
- Si no hay programación ese día, no se envía un falso reporte de cero tardanzas.
- No modifica tablas operativas, horarios ni marcaciones.
- No se registran diagnósticos médicos en los correos.

## 1. Proveedor de email

Supabase no entrega una dirección de correo transaccional para enviar estos
informes. Se utilizará Resend como proveedor saliente y se deberá **verificar
el dominio del remitente** mediante sus registros DNS. Por ejemplo, se puede
verificar un subdominio de envíos independiente del dominio corporativo,
sin interferir con Microsoft 365.
No modificar los MX ni sobrescribir el SPF principal sin revisión de Sistemas.

En **Supabase > Edge Functions > Secrets** configurar los siguientes nombres
con valores privados. Nunca copiarlos al repositorio:

| Variable | Valor |
|---|---|
| `RESEND_API_KEY` | API Key de Resend con permiso de envío |
| `REPORT_FROM_EMAIL` | Remitente del dominio verificado |
| `REPORT_TEST_ENABLED` | `false` por defecto. Permitir `true` solo mientras se realice la prueba privada |
| `REPORT_CRON_TOKEN` | Token aleatorio y exclusivo de mínimo 32 caracteres |
| `REPORT_ENABLED` | `false` hasta validar las pruebas |

Los **únicos destinatarios permitidos para la operación normal** ya están
definidos en `destinatarios.js`:

- analistainnovacion@campestrepereira.com
- sistemas@campestrepereira.com
- directorayb@campestrepereira.com
- maitre@campestrepereira.com
- dirbienestar@campestrepereira.com

En modo `test` el **único destinatario** es
`analistainnovacion@campestrepereira.com`. Los otros cuatro no reciben pruebas.

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

## 4. Prueba real de envío aislado

Tras instalar `RESEND_API_KEY`, verificar `REPORT_FROM_EMAIL` y guardar
`REPORT_CRON_TOKEN` (el mismo en Secrets y Vault):

1. Mantener **`REPORT_ENABLED=false`**, Cron inactivo.
2. Cambiar temporalmente **`REPORT_TEST_ENABLED=true`**.
3. En Edge Functions > `reporte-tardanzas-diario` > Test:
   - Método POST.
   - Cabecera privada `X-Report-Token` con el token.
   - JSON: `{"mode":"test","date":"2026-11-22"}`.
4. Confirmar **un solo destinatario** y la recepción efectiva en
   `analistainnovacion@campestrepereira.com`.
5. Volver a establecer **`REPORT_TEST_ENABLED=false`**.

La prueba utiliza una fecha que tiene turnos programados, porque el 25/11
carece de programación nueva en AYB/Chef. El asunto se marca con
`[PRUEBA]`. No activa los envíos automáticos ni envía a los otros cuatro.

## 5. Activación controlada

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

El Cron invoca a las **13:00 UTC** (8:00 a. m. Colombia) la función con `{"mode":"send"}`.
No acepta fechas arbitrarias para enviar: solo genera **ayer** según Colombia.
La petición a Resend incluye `Idempotency-Key` para impedir duplicados en los
reintentos durante la ventana de 24 horas del proveedor.

## 6. Verificación y reversión

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
