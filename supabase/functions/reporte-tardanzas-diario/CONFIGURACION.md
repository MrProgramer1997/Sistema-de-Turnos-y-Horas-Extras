# Informe de tardanzas AYB / Chef — Microsoft 365

## Estado y parámetros aprobados

- **Remitente oficial:** `reportes@campestrepereira.com`
- **Hora:** 8:00 a. m. Colombia (13:00 UTC), todos los días
- **Período:** el día calendario inmediatamente anterior en `America/Bogota`
- **Prueba:** solamente `analistainnovacion@campestrepereira.com`
- **Producción:** cinco destinatarios institucionales ya definidos en `destinatarios.js`
- **Cron:** `cc_reporte_tardanzas_ayb_chef`, **inactivo hasta autorizar el envío**.
- **Correo:** Microsoft Graph / Exchange Online; **no utiliza Resend**.
- La función usa el mismo cálculo del Centro de Control: primera marcación
  válida en el punto de trabajo; excluye Portería y las novedades justificadas.

## 1. Verificar que el usuario realmente tenga un buzón

En **Centro de administración de Exchange** > Destinatarios > Buzones,
confirmar que aparece `reportes@campestrepereira.com`.
Crear el usuario en Microsoft 365 **no demuestra por sí solo** que Exchange haya
aprovisionado el buzón: debe tener una licencia Exchange Online compatible
(o configurar un buzón compartido conforme a las políticas de la organización).

Verificar:
- Dirección SMTP principal `reportes@campestrepereira.com`
- Estado de buzón y licencia
- Que el remitente tenga permiso de enviar desde su propio buzón.

No compartir contraseñas en tickets, chats ni GitHub.

## 2. Registrar aplicación en Microsoft Entra

Abrir https://entra.microsoft.com -> **Entra ID** -> **Registros de aplicaciones**
-> **Nuevo registro**:

- Nombre: `CCCP - Reportes de puntualidad`
- Tipos de cuenta: **Solo este directorio organizativo** (single tenant).
- URI de redireccionamiento: **vacía** (no se necesita login interactivo).

Guardar los identificadores públicos de la pantalla de información general:

1. **Id. de directorio (inquilino)** → `MS365_TENANT_ID`
2. **Id. de aplicación (cliente)** → `MS365_CLIENT_ID`

La integración usa el flujo OAuth2 `client_credentials`, no la contraseña del
usuario. Conservar el acceso condicionado a la aplicación y al buzón remitente.

## 3. Limitar la aplicación a UN SOLO buzón antes de enviar

**Muy importante:** otorgar `Mail.Send` **de aplicación** con consentimiento
global en Microsoft Entra permite enviar como **cualquier** buzón del tenant.
La configuración preferente es **Exchange Online RBAC for Applications**, que
otorga únicamente `Application Mail.Send` para un alcance restringido.

No otorgar adicionalmente un `Mail.Send` sin alcance en Entra: los permisos
Entra y Exchange RBAC son acumulativos y se perdería la restricción.

Un administrador de Exchange autorizado debe:

1. Localizar el **Object ID del Service Principal** en
   **Entra > Aplicaciones empresariales > CCCP - Reportes de puntualidad**.
   NO confundirlo con el Object ID de `Registros de aplicaciones`.
2. Conectarse a Exchange Online PowerShell.
3. Crear el Service Principal de Exchange para el App ID y el Object ID.
4. Crear un `Management Scope` que contenga **únicamente el buzón reportes**;
   comprobar que ese filtro devuelve una sola identidad.
5. Asignar `Application Mail.Send` para ese scope.
6. Ejecutar `Test-ServicePrincipalAuthorization` contra `reportes@` y contra
   otro buzón: el primero debe estar dentro y el otro fuera.

Ejemplo **orientativo**, para ejecutar **solo después de confirmar los IDs y
el alias real del buzón**:

```powershell
Connect-ExchangeOnline
Get-Mailbox "reportes@campestrepereira.com" |
  Format-List PrimarySmtpAddress,Alias,RecipientTypeDetails

# Usar los valores reales obtenidos en Entra:
New-ServicePrincipal -AppId "<APPLICATION_CLIENT_ID>" `
  -ObjectId "<ENTERPRISE_APP_SERVICE_PRINCIPAL_OBJECT_ID>" `
  -DisplayName "CCCP-Reportes-Puntualidad"

# Reemplazar <ALIAS_VERIFICADO> por el alias comprobado del buzón:
New-ManagementScope -Name "CCCP-Solo-Reportes-Campestre" `
  -RecipientRestrictionFilter "Alias -eq '<ALIAS_VERIFICADO>'"

# COMPROBAR que el scope solo incluye reportes antes de asignar permisos:
Get-Recipient -RecipientPreviewFilter (Get-ManagementScope
  "CCCP-Solo-Reportes-Campestre").RecipientFilter

New-ManagementRoleAssignment -App "<APPLICATION_CLIENT_ID>" `
  -Role "Application Mail.Send" `
  -CustomResourceScope "CCCP-Solo-Reportes-Campestre"

Test-ServicePrincipalAuthorization -Identity "<APPLICATION_CLIENT_ID>" `
  -Resource "reportes@campestrepereira.com"
```

Revisar con el administrador la identidad y los permisos antes de la asignación.
Referencia: https://learn.microsoft.com/en-us/exchange/permissions-exo/application-rbac

## 4. Credencial de la aplicación

La versión preparada de la Edge Function admite **un secreto de cliente** para
la prueba controlada. Microsoft recomienda **certificado** para entornos de
producción; planificar el cambio a certificado y su rotación según política TI.

En Entra > Registros de aplicaciones > la aplicación >
**Certificados y secretos** > **Nuevo secreto de cliente**. Guardar el
**Valor** del secreto (no su ID) exclusivamente en
**Supabase > Edge Functions > Secrets** con el nombre `MS365_CLIENT_SECRET`.
No compartir ni publicar el valor.

Variables requeridas en Supabase:

| Nombre | Uso |
| --- | --- |
| `MS365_TENANT_ID` | GUID del inquilino Microsoft |
| `MS365_CLIENT_ID` | GUID de la aplicación |
| `MS365_CLIENT_SECRET` | Valor secreto de la aplicación; protegido |
| `REPORT_CRON_TOKEN` | Token privado (32+ caracteres) de invocación |
| `REPORT_TEST_ENABLED` | `true` únicamente durante prueba |
| `REPORT_ENABLED` | Mantener `false` hasta pasar prueba y autorizar |
 
El mismo `REPORT_CRON_TOKEN` debe guardarse en **Supabase Vault** bajo el
nombre `tardanzas_cron_token` para que Cron pueda invocar la función.

## 5. Prueba controlada a un solo destinatario

1. Verificar remitente y restricciones RBAC de Exchange.
2. Comprobar que la aplicación puede autenticarse en Graph.
3. Mantener el **Cron inactivo** y `REPORT_ENABLED=false`.
4. Cambiar temporalmente `REPORT_TEST_ENABLED=true`.
5. Ejecutar desde **Edge Functions > reporte-tardanzas-diario > Test**
   usando método POST:
   - Header: `X-Report-Token: <valor privado>`
   - Body: `{"mode":"test","date":"2026-11-22"}`
6. El único destinatario debe ser `analistainnovacion@campestrepereira.com`.
7. Graph devuelve **202 Accepted**, que significa aceptación, **no entrega
   confirmada**. Comprobar la bandeja de entrada y las trazas de Exchange.
8. Volver a `REPORT_TEST_ENABLED=false`.

## 6. Activación diaria

Solo tras prueba satisfactoria, verificar 5 destinatarios y autorizar operación:

1. Establecer `REPORT_ENABLED=true` en Supabase.
2. Activar Cron existente (horario ya registrado 13:00 UTC):

```sql
DO $$
BEGIN
  PERFORM cron.alter_job(
    job_id := (SELECT jobid FROM cron.job
               WHERE jobname='cc_reporte_tardanzas_ayb_chef'),
    active := true
  );
END $$;
```

Verificar:

```sql
SELECT jobid,jobname,schedule,active
FROM cron.job WHERE jobname='cc_reporte_tardanzas_ayb_chef';
```

Ante cualquier incidencia, invertir `active := false`. No ejecutar envíos
manuales de producción repetidos, porque Microsoft Graph **no ofrece la misma
garantía de idempotencia** que el proveedor anterior. Implementar un registro
de envíos duradero antes de habilitar reintentos o correos manuales.

## Referencias

- https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app
- https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-client-creds-grant-flow
- https://learn.microsoft.com/en-us/graph/api/user-sendmail?view=graph-rest-1.0
- https://learn.microsoft.com/en-us/exchange/permissions-exo/application-rbac
