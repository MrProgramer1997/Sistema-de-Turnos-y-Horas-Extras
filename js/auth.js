import { supabase } from "../supabase/supabaseClient.js";

window.mostrarAdmin = function () {
  document.getElementById("adminLogin").style.display = "flex";
  document.getElementById("empleadoLogin").style.display = "none";

  const tabAdmin = document.getElementById("tabAdmin");
  const tabEmpleado = document.getElementById("tabEmpleado");

  if (tabAdmin) tabAdmin.classList.add("active");
  if (tabEmpleado) tabEmpleado.classList.remove("active");

  if (typeof limpiarMensaje === "function") limpiarMensaje();
  if (typeof limpiarErrores === "function") limpiarErrores();
  if (typeof ocultarLoader === "function") ocultarLoader();
};

window.mostrarEmpleado = function () {
  document.getElementById("adminLogin").style.display = "none";
  document.getElementById("empleadoLogin").style.display = "flex";

  const tabAdmin = document.getElementById("tabAdmin");
  const tabEmpleado = document.getElementById("tabEmpleado");

  if (tabEmpleado) tabEmpleado.classList.add("active");
  if (tabAdmin) tabAdmin.classList.remove("active");

  if (typeof limpiarMensaje === "function") limpiarMensaje();
  if (typeof limpiarErrores === "function") limpiarErrores();
  if (typeof ocultarLoader === "function") ocultarLoader();
};

function normalizarTexto(valor) {
  return String(valor || "").trim().toLowerCase();
}

function obtenerPermisosPorRol(rol) {
  const r = normalizarTexto(rol);

  const mapa = {
    admin: {
      puede_ver_todo: true,
      areas_permitidas: ["*"],
      modulos_permitidos: [
        "dashboard",
        "solicitudes-bienestar",
        "programacion-ayb",
        "cocina-chef",
        "programacion-administrativo",
        "programacion-operaciones",
        "mis-turnos-ayb",
        "mis-turnos-administrativo",
        "empleados",
        "usuarios-admin"
      ]
    },

    gerencia: {
      puede_ver_todo: true,
      areas_permitidas: ["*"],
      modulos_permitidos: [
        "dashboard",
        "solicitudes-bienestar",
        "programacion-ayb",
        "cocina-chef",
        "programacion-administrativo",
        "programacion-operaciones",
        "mis-turnos-ayb",
        "mis-turnos-administrativo",
        "empleados",
        "usuarios-admin"
      ]
    },

    bienestar: {
      puede_ver_todo: true,
      areas_permitidas: ["*"],
      modulos_permitidos: [
        "dashboard",
        "solicitudes-bienestar",
        "mis-turnos-administrativo"
      ]
    },

    ayb: {
      puede_ver_todo: false,
      areas_permitidas: [
        "Alimentos y Bebidas"
      ],
      modulos_permitidos: [
        "dashboard",
        "dashboard-ayb",
        "solicitudes-bienestar",
        "programacion-ayb",
        "cocina-chef",
        "mis-turnos-ayb"
      ]
    },

    servicios_generales: {
      puede_ver_todo: false,
      areas_permitidas: [
        "SERVICIOS GENERALES",
        "OPERACIONES"
      ],
      modulos_permitidos: [
        "dashboard",
        "programacion-operaciones",
        "mis-turnos-administrativo"
      ]
    },

    direccion_financiera: {
      puede_ver_todo: false,
      areas_permitidas: [
        "DIRECCION ADMINISTRATIVA",
        "DIRECCIÓN ADMINISTRATIVA",
        "DIRECCION FINANCIERA",
        "DIRECCIÓN FINANCIERA",
        "CONTABILIDAD",
        "CARTERA",
        "COMPRAS",
        "SISTEMAS",
        "AUDITORIA",
        "AUDITORÍA"
      ],
      modulos_permitidos: [
        "dashboard",
        "programacion-administrativo",
        "mis-turnos-administrativo",
        "empleados",
        "usuarios-admin"
      ]
    }
  };

  return mapa[r] || {
    puede_ver_todo: false,
    areas_permitidas: [],
    modulos_permitidos: []
  };
}

window.loginAdmin = async function () {
  const usuario = document.getElementById("usuario")?.value.trim() || "";
  const password = document.getElementById("password")?.value.trim() || "";

  if (!usuario || !password) {
    if (typeof ocultarLoader === "function") ocultarLoader();
    if (typeof mostrarMensaje === "function") {
      mostrarMensaje("error", "Complete usuario y contraseña.");
    }
    return false;
  }

  try {
    const { data: usuarioAdmin, error: errorUsuario } = await supabase
      .from("usuarios_admin")
      .select("*")
      .or(`usuario.eq.${usuario},cedula.eq.${usuario}`)
      .eq("password_hash", password)
      .eq("activo", true)
      .maybeSingle();

    if (errorUsuario) {
      console.error("Error consultando usuarios_admin:", errorUsuario);

      if (typeof ocultarLoader === "function") ocultarLoader();
      if (typeof mostrarMensaje === "function") {
        mostrarMensaje("error", "Error consultando el usuario administrativo.");
      }

      return false;
    }

    if (!usuarioAdmin) {
      if (typeof ocultarLoader === "function") ocultarLoader();
      if (typeof mostrarMensaje === "function") {
        mostrarMensaje("error", "Credenciales incorrectas o usuario no autorizado.");
      }

      return false;
    }

    const { data: empleado, error: errorEmpleado } = await supabase
      .from("empleados")
      .select("*")
      .eq("id", usuarioAdmin.empleado_id)
      .maybeSingle();

    if (errorEmpleado) {
      console.error("Error consultando empleado vinculado:", errorEmpleado);

      if (typeof ocultarLoader === "function") ocultarLoader();
      if (typeof mostrarMensaje === "function") {
        mostrarMensaje("error", "Error consultando el empleado vinculado.");
      }

      return false;
    }

    if (!empleado) {
      if (typeof ocultarLoader === "function") ocultarLoader();
      if (typeof mostrarMensaje === "function") {
        mostrarMensaje("error", "El usuario existe, pero no tiene empleado vinculado.");
      }

      return false;
    }

    const permisos = obtenerPermisosPorRol(usuarioAdmin.rol);

    const sesion = {
      id: usuarioAdmin.id || null,
      usuario_admin_id: usuarioAdmin.id || null,
      empleado_id: empleado.id || null,
      codigo: empleado.codigo || "",
      cedula: String(empleado.cedula || usuarioAdmin.cedula || ""),
      usuario: usuarioAdmin.usuario || "",
      nombre_completo: `${empleado.nombres || ""} ${empleado.apellidos || ""}`.trim(),
      nombres: empleado.nombres || "",
      apellidos: empleado.apellidos || "",
      cargo: empleado.cargo || "",
      centro_costos: empleado.centro_costos || "",
      area: empleado.area || "",
      correo: empleado.correo || "",
      telefono: empleado.telefono || "",
      rol: usuarioAdmin.rol || "",
      puede_ver_todo: permisos.puede_ver_todo,
      areas_permitidas: permisos.areas_permitidas,
      modulos_permitidos: permisos.modulos_permitidos,
      tipo_ingreso: "admin"
    };

    localStorage.setItem("ccp_sesion", JSON.stringify(sesion));

    await supabase
      .from("usuarios_admin")
      .update({
        ultimo_login: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq("id", usuarioAdmin.id);

    if (typeof mostrarMensaje === "function") {
      mostrarMensaje("success", `Ingreso correcto como ${usuarioAdmin.rol}. Redirigiendo...`);
    }

    window.location.href = "dashboard.html";
    return true;
  } catch (err) {
    console.error("Excepción login admin:", err);

    if (typeof ocultarLoader === "function") ocultarLoader();

    if (typeof mostrarMensaje === "function") {
      mostrarMensaje("error", "Ocurrió un error al iniciar sesión.");
    }

    return false;
  }
};

window.consultarTurnos = async function () {
  const cedula = document.getElementById("cedula")?.value.trim() || "";

  if (!cedula) {
    if (typeof ocultarLoader === "function") ocultarLoader();
    if (typeof mostrarMensaje === "function") {
      mostrarMensaje("error", "Ingrese la cédula.");
    }
    return false;
  }

  try {
    const { data, error } = await supabase
      .from("empleados")
      .select("*")
      .eq("cedula", cedula)
      .maybeSingle();

    if (error) {
      console.error("Error consulta empleado:", error);

      if (typeof ocultarLoader === "function") ocultarLoader();
      if (typeof mostrarMensaje === "function") {
        mostrarMensaje("error", "Error consultando el empleado.");
      }

      return false;
    }

    if (!data) {
      if (typeof ocultarLoader === "function") ocultarLoader();
      if (typeof mostrarMensaje === "function") {
        mostrarMensaje("error", "No se encontró un empleado con esa cédula.");
      }

      return false;
    }

    const sesionEmpleado = {
      id: data.id || null,
      codigo: data.codigo || "",
      cedula: String(data.cedula || ""),
      nombre_completo: `${data.nombres || ""} ${data.apellidos || ""}`.trim(),
      nombres: data.nombres || "",
      apellidos: data.apellidos || "",
      cargo: data.cargo || "",
      centro_costos: data.centro_costos || "",
      area: data.area || "",
      correo: data.correo || "",
      telefono: data.telefono || "",
      rol: "empleado",
      puede_ver_todo: false,
      areas_permitidas: [data.centro_costos || data.area || ""],
      modulos_permitidos: [],
      tipo_ingreso: "empleado"
    };

    localStorage.setItem("ccp_sesion", JSON.stringify(sesionEmpleado));

    const centroCostos = String(data.centro_costos || "").toUpperCase();
    const area = String(data.area || "").toUpperCase();
    const cargo = String(data.cargo || "").toUpperCase();

    const esAyb =
      centroCostos.includes("ALIMENTOS") ||
      centroCostos.includes("BEBIDAS") ||
      centroCostos.includes("A&B") ||
      centroCostos.includes("AYB") ||
      area.includes("ALIMENTOS") ||
      area.includes("BEBIDAS") ||
      area.includes("A&B") ||
      area.includes("AYB") ||
      cargo.includes("MESERO") ||
      cargo.includes("MESERA") ||
      cargo.includes("BARISTA") ||
      cargo.includes("BARTENDER") ||
      cargo.includes("PATINADOR") ||
      cargo.includes("PATINADORA") ||
      cargo.includes("AUXILIAR DE PUNTO") ||
      cargo.includes("LIDER DE PUNTO") ||
      cargo.includes("CAPITAN DE MESEROS") ||
      cargo.includes("LIDER DE SERVICIO") ||
      cargo.includes("COCINA") ||
      cargo.includes("SERVICIO");

    const esOperaciones =
      centroCostos.includes("OPERACIONES") ||
      centroCostos.includes("SERVICIOS GENERALES") ||
      area.includes("OPERACIONES") ||
      area.includes("SERVICIOS GENERALES") ||
      cargo.includes("ASEO") ||
      cargo.includes("OPERACIONES") ||
      cargo.includes("SERVICIOS GENERALES");

    if (typeof mostrarMensaje === "function") {
      mostrarMensaje("success", "Empleado encontrado. Redirigiendo...");
    }

    if (esAyb) {
      window.location.href = "mis-turnos-ayb.html";
      return true;
    }

    if (esOperaciones) {
      window.location.href = "mis-turnos-operaciones.html";
      return true;
    }

    window.location.href = "mis-turnos-administrativo.html";
    return true;
  } catch (err) {
    console.error("Excepción consulta empleado:", err);

    if (typeof ocultarLoader === "function") ocultarLoader();

    if (typeof mostrarMensaje === "function") {
      mostrarMensaje("error", "Ocurrió un error al consultar la información del empleado.");
    }

    return false;
  }
};
