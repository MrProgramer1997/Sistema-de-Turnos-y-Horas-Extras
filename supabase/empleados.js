import { supabase } from "./supabaseClient.js";

export async function obtenerEmpleados({ area = "" } = {}) {
  let query = supabase
    .from("empleados")
    .select("*")
    .order("created_at", { ascending: false });

  if (area) {
    query = query.eq("area", area);
  }

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
  const { data, error } = await supabase
    .from("empleados")
    .insert([payload])
    .select();

  if (error) {
    throw error;
  }

  return data;
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
