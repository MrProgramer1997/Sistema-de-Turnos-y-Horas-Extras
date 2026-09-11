import { supabase } from "./supabaseClient.js";

export async function obtenerEmpleados() {
  const query = supabase
    .from("empleados")
    .select("*")
    .order("created_at", { ascending: false });

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return Array.isArray(data) ? data : [];
}

export async function obtenerEmpleadoPorCedula(cedula) {
  const cedulaLimpia = (cedula || "").toString().trim();

  if (!cedulaLimpia) {
    return null;
  }

  const { data, error } = await supabase
    .from("empleados")
    .select("*")
    .eq("cedula", cedulaLimpia)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}

export async function existeEmpleadoPorCedula(cedula) {
  const empleado = await obtenerEmpleadoPorCedula(cedula);
  return Boolean(empleado);
}

export async function crearEmpleado(payload) {
  // El alta oficial de Nómina debe ser atómica: empleado + solicitud ZKTeco.
  // La RPC valida la sesión Auth y evita dejar un empleado creado a medias.
  const { data, error } = await supabase.rpc("crear_empleado_nomina_con_biotime_v1", {
    p_payload: payload
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function obtenerEstadosBiotimeEmpleados() {
  const { data, error } = await supabase.rpc("consultar_estado_biotime_empleados_v1");

  if (error) {
    // El listado de empleados no debe dejar de funcionar si el estado ZKTeco
    // no está disponible temporalmente.
    console.warn("No fue posible consultar estados ZKTeco:", error.message);
    return [];
  }

  return Array.isArray(data) ? data : [];
}

export async function actualizarEmpleado(id, payload) {
  const { data, error } = await supabase
    .from("empleados")
    .update(payload)
    .eq("id", id)
    .select();

  if (error) {
    throw error;
  }

  return data;
}
