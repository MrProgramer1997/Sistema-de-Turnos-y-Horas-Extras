require("dotenv").config();

const { createClient } = require("@supabase/supabase-js");

const BIOTIME_URL = process.env.BIOTIME_URL;
const BIOTIME_USERNAME = process.env.BIOTIME_USERNAME;
const BIOTIME_PASSWORD = process.env.BIOTIME_PASSWORD;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function text(v) { return String(v ?? "").trim(); }

function splitName(fullName) {
  const parts = text(fullName).split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first_name: "EMPLEADO", last_name: "" };
  if (parts.length === 1) return { first_name: parts[0], last_name: "" };
  const middle = Math.ceil(parts.length / 2);
  return {
    first_name: parts.slice(0, middle).join(" "),
    last_name: parts.slice(middle).join(" "),
  };
}

async function getToken() {
  const response = await fetch(`${BIOTIME_URL}/jwt-api-token-auth/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: BIOTIME_USERNAME, password: BIOTIME_PASSWORD }),
  });
  if (!response.ok) throw new Error(`Error autenticando BioTime: HTTP ${response.status}`);
  const data = await response.json();
  if (!data.token) throw new Error("BioTime no devolvio token JWT.");
  return data.token;
}

async function getPendingQueue() {
  const { data, error } = await supabase
    .from("biotime_personas_sync_queue")
    .select("id,origen,origen_id,operacion,emp_code,nombre,telefono,departamento,cargo,activo,payload,estado,intentos")
    .in("origen", ["cocina_externo", "empleado_nomina"])
    .eq("estado", "pendiente")
    .order("solicitado_at", { ascending: true })
    .limit(100);
  if (error) throw error;
  return data || [];
}

async function findBioEmployee(token, empCode) {
  const url = `${BIOTIME_URL}/personnel/api/employees/?emp_code=${encodeURIComponent(empCode)}&page=1&page_size=20`;
  const response = await fetch(url, { headers: { Authorization: `JWT ${token}` } });
  if (!response.ok) throw new Error(`Error consultando BioTime ${empCode}: HTTP ${response.status}`);
  const result = await response.json();
  return (result.data || []).find((e) => text(e.emp_code) === text(empCode)) || null;
}

async function getDepartment(token, deptCode) {
  const response = await fetch(`${BIOTIME_URL}/personnel/api/departments/?page=1&page_size=100`, {
    headers: { Authorization: `JWT ${token}` },
  });
  if (!response.ok) throw new Error(`Error consultando departamentos: HTTP ${response.status}`);
  const result = await response.json();
  const department = (result.data || []).find((d) => text(d.dept_code) === text(deptCode));
  if (!department) throw new Error(`No se encontro departamento BioTime con codigo ${deptCode}.`);
  return department;
}

async function getActiveAreaIds() {
  const { data, error } = await supabase
    .from("biotime_terminales")
    .select("area_biotime_id,area_code,area_name,estado")
    .eq("estado", 1);
  if (error) throw error;
  const ids = [...new Set((data || []).map((r) => Number(r.area_biotime_id)).filter(Number.isFinite))];
  if (!ids.length) throw new Error("No se encontraron areas activas de BioTime en biotime_terminales.");
  return ids;
}

function buildEmployeePayload(item, department, areaIds) {
  const p = item.payload || {};
  const names = splitName(item.nombre);
  return {
    emp_code: text(item.emp_code),
    first_name: text(p.nombres) || names.first_name,
    last_name: text(p.apellidos) || names.last_name,
    department: department.id,
    company: Number(p.codigo_empresa || 1),
    area: areaIds,
    hire_date: text(p.fecha_contratacion) || new Date().toISOString().slice(0, 10),
    emp_status: item.activo === false ? 2 : 1,
    mobile: text(p.celular || item.telefono) || null,
    email: text(p.correo_electronico) || null,
    payroll_code: text(p.codigo_nomina) || null,
    enable_att: true,
    enable_overtime: false,
    enable_holiday: true,
  };
}

async function createBioEmployee(token, payload) {
  const response = await fetch(`${BIOTIME_URL}/personnel/api/employees/`, {
    method: "POST",
    headers: { Authorization: `JWT ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Error creando ${payload.emp_code}: HTTP ${response.status} - ${body}`);
}

async function updateBioEmployee(token, existing, payload) {
  const response = await fetch(`${BIOTIME_URL}/personnel/api/employees/${existing.id}/`, {
    method: "PATCH",
    headers: { Authorization: `JWT ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Error actualizando ${payload.emp_code}: HTTP ${response.status} - ${body}`);
}

async function markProcessing(item) {
  const { error } = await supabase
    .from("biotime_personas_sync_queue")
    .update({ estado: "procesando", intentos: Number(item.intentos || 0) + 1, updated_at: new Date().toISOString() })
    .eq("id", item.id);
  if (error) throw error;
}

async function markSuccess(item, bioEmployee) {
  if (!bioEmployee?.id) throw new Error("BioTime no devolvio un biotime_person_id valido.");
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("biotime_personas_sync_queue")
    .update({ estado: "procesado", biotime_person_id: bioEmployee.id, ultimo_error: null, procesado_at: now, updated_at: now })
    .eq("id", item.id);
  if (error) throw error;

  if (item.origen === "cocina_externo") {
    const { error: extError } = await supabase
      .from("cocina_personal_externo")
      .update({ biotime_emp_code: item.emp_code, biotime_person_id: bioEmployee.id, biotime_sync_estado: "sincronizado", biotime_sync_at: now, biotime_sync_error: null })
      .eq("id", item.origen_id);
    if (extError) throw extError;
  }
}

async function markError(item, message) {
  const now = new Date().toISOString();
  await supabase.from("biotime_personas_sync_queue").update({
    estado: "error", ultimo_error: message, procesado_at: now, updated_at: now,
  }).eq("id", item.id);
  if (item.origen === "cocina_externo") {
    await supabase.from("cocina_personal_externo").update({ biotime_sync_estado: "error", biotime_sync_error: message }).eq("id", item.origen_id);
  }
}

async function main() {
  console.log("SINCRONIZACION PERSONAS PENDIENTES -> BIOTIME");
  const token = await getToken();
  const queue = await getPendingQueue();
  console.log(`Pendientes: ${queue.length}`);
  if (!queue.length) return;

  const areaIds = await getActiveAreaIds();
  console.log(`Areas BioTime activas: ${areaIds.join(", ")}`);

  let errors = 0;
  for (const item of queue) {
    try {
      await markProcessing(item);
      const p = item.payload || {};
      const deptCode = text(p.codigo_departamento) || (item.origen === "cocina_externo" ? "05" : "");
      if (!deptCode) throw new Error("La solicitud no contiene codigo_departamento.");
      const department = await getDepartment(token, deptCode);
      const payload = buildEmployeePayload(item, department, areaIds);
      const existing = await findBioEmployee(token, item.emp_code);
      if (existing) {
        await updateBioEmployee(token, existing, payload);
      } else {
        await createBioEmployee(token, payload);
      }
      const verified = await findBioEmployee(token, item.emp_code);
      if (!verified) throw new Error("BioTime no permite consultar el empleado despues del alta/actualizacion.");
      const assigned = (verified.area || []).map((a) => Number(a.id)).filter(Number.isFinite);
      const missing = areaIds.filter((id) => !assigned.includes(id));
      if (missing.length) throw new Error(`Empleado creado en BioTime pero faltan areas: ${missing.join(",")}`);
      await markSuccess(item, verified);
      console.log(`OK ${item.origen} ${item.emp_code} -> BioTime ${verified.id}`);
    } catch (error) {
      errors++;
      console.error(`ERROR ${item.emp_code}: ${error.message}`);
      await markError(item, error.message);
    }
  }
  if (errors) throw new Error(`Finalizo con ${errors} solicitud(es) en error.`);
}

main().catch((error) => {
  console.error("ERROR GENERAL:", error.message);
  process.exitCode = 1;
});
