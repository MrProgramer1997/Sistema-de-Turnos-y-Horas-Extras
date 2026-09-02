const SUPABASE_URL = "https://kzxveqrgvuchcgwrjwjb.supabase.co";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY) {
  console.error("Falta SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const chef = {
  nombre: "MARIA ANGELICA ESCOBAR RODRIGUEZ",
  email: "mescobar@turnos.club",
  password: "Me8#C4fL7q",
  rol: "aprobador",
  areas: ["ALIMENTOS Y BEBIDAS", "CHEF"],
  empleadoId: "75e07608-0b94-49a1-a8df-140dfc8d448b"
};

const headers = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  "Content-Type": "application/json"
};

async function request(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers || {}) }
  });
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!response.ok) throw new Error(`${response.status}: ${body?.message || body?.msg || text}`);
  return body;
}

async function main() {
  const listado = await request("/auth/v1/admin/users?page=1&per_page=1000");
  const existente = (listado.users || []).find(
    (usuario) => String(usuario.email || "").toLowerCase() === chef.email
  );
  const payload = {
    email: chef.email,
    password: chef.password,
    email_confirm: true,
    app_metadata: {
      rol: chef.rol,
      empleado_id: chef.empleadoId,
      areas_permitidas: chef.areas
    },
    user_metadata: { nombre_completo: chef.nombre }
  };
  const respuesta = existente
    ? await request(`/auth/v1/admin/users/${existente.id}`, { method: "PUT", body: JSON.stringify(payload) })
    : await request("/auth/v1/admin/users", { method: "POST", body: JSON.stringify(payload) });
  const usuario = respuesta.user || respuesta;
  await request("/rest/v1/nomina_perfiles?on_conflict=user_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      user_id: usuario.id,
      empleado_id: chef.empleadoId,
      correo: chef.email,
      rol: chef.rol,
      activo: true,
      updated_at: new Date().toISOString()
    })
  });
  console.log(`✓ ${chef.nombre}: ${existente ? "actualizada" : "creada"}`);
  console.log("No se modificaron las contraseñas de los otros usuarios.");
}

main().catch((error) => {
  console.error("No se completó:", error.message);
  process.exitCode = 1;
});
