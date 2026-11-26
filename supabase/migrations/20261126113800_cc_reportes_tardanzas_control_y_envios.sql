-- Configuración y auditoría privadas del envío diario de tardanzas.
-- Tablas en public con RLS habilitado y sin políticas para anon/authenticated;
-- exclusivamente la función con service_role puede consultarlas o modificarlas.
CREATE TABLE IF NOT EXISTS public.cc_reporte_tardanzas_control (
 clave text PRIMARY KEY CHECK (clave = 'principal'),
 envio_habilitado boolean NOT NULL DEFAULT false,
 recuperacion_hasta timestamptz,
 actualizado_en timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cc_reporte_tardanzas_control ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.cc_reporte_tardanzas_control FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.cc_reporte_tardanzas_control TO service_role;
INSERT INTO public.cc_reporte_tardanzas_control(clave, envio_habilitado)
VALUES ('principal',false) ON CONFLICT (clave) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.cc_reporte_tardanzas_envios (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 fecha date NOT NULL,
 audiencia text NOT NULL DEFAULT 'produccion' CHECK (audiencia = 'produccion'),
 tipo text NOT NULL CHECK (tipo IN ('puntualidad','alerta_programacion')),
 estado text NOT NULL DEFAULT 'preparando' CHECK (estado IN ('preparando','aceptado','error')),
 codigo_proveedor integer,
 detalle_error text,
 creado_en timestamptz NOT NULL DEFAULT now(),
 actualizado_en timestamptz NOT NULL DEFAULT now(),
 UNIQUE (fecha,audiencia)
);
ALTER TABLE public.cc_reporte_tardanzas_envios ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.cc_reporte_tardanzas_envios FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.cc_reporte_tardanzas_envios TO service_role;
COMMENT ON TABLE public.cc_reporte_tardanzas_envios IS
 'Auditoría de envíos Microsoft Graph, única por fecha en producción, sin datos personales de empleados ni credenciales';
COMMENT ON TABLE public.cc_reporte_tardanzas_control IS
 'Control privado de activación del reporte diario AYB/Chef mediante Supabase Edge Function';
