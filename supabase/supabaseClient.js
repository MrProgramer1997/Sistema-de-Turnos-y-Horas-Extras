import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const supabaseUrl = "https://kzxveqrgvuchcgwrjwjb.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt6eHZlcXJndnVjaGNnd3Jqd2piIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MzYzMjUsImV4cCI6MjA4OTAxMjMyNX0.DhYtYlQdUN_r7AD-glgUIG7y-_wrGWqYqyA3MZBzPuw";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

if (/\/programacion-ayb\.html$/i.test(window.location.pathname)) {
  import("../js/programacion-ayb-jornada-42h.js?v=20261010-1")
    .catch((error) => console.error("No se pudo cargar la protección de jornada A&B:", error));
}
