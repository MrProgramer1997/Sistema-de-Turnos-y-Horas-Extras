import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const supabaseUrl = "https://kzxveqrgvuchcgwrjwjb.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXAiLCJyZWYiOiJrenh2ZXFyZ3Z1Y2hjZ3dyandqYiIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzczNDM2MzI1LCJleHAiOjIwODkwMTIzMjV9.DhYtYlQdUN_r7AD-glgUIG7y-_wrGWqYqyA3MZBzPuw";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

if (/\/horas-extras\.html$/i.test(window.location.pathname)) {
  try {
    const [{ instalarNominaIntegridadV748 }] = await Promise.all([
      import("../js/nomina-integridad-v748.js?v=748"),
      // Fuerza la version que instala el selector de areas principales.
      import("../js/nomina-control-pendientes.js?v=748")
    ]);
    instalarNominaIntegridadV748(supabase);
  } catch (error) {
    console.error("No se pudo cargar la proteccion de Nomina v7.48:", error);
  }
}

if (/\/programacion-ayb\.html$/i.test(window.location.pathname)) {
  import("../js/programacion-ayb-jornada-42h.js?v=20261010-1")
    .catch((error) => console.error("No se pudo cargar la protección de jornada A&B:", error));
}
