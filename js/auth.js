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

window.loginAdmin = async function () {
  const usuario = document.getElementById("usuario")?.value.trim() || "";
  const password = document.getElementById("password")?.value.trim() || "";
  const rol = document.getElementById("rol")?.value.trim() || "";

  if (!usuario || !password || !rol) {
    if (typeof mostrarMensaje === "function") {
      mostrarMensaje("error", "Complete usuario, contraseña y rol.");
    }
    return false;
  }

  try {
    const { data, error } = await supabase
      .from("empleados")
      .select("*")
      .eq("cedula", usuario)
      .eq("password", password)
      .eq("rol", rol)
      .single();

    if (error || !data) {
      console.error("Error login admin:", error);

      if (typeof mostrarMensaje === "function") {
        mostrarMensaje("error", "Credenciales incorrectas o usuario no autorizado.");
      }

      return false;
    }

    const modulosBase =
      data.modulos_permitidos && data.modulos_permitidos.length
        ? data.modulos_permitidos
        : [
            "dashboard",
            "programacion-ayb",
            "programacion-administrativo",
            "programacion-operaciones",
            "mis-turnos-ayb",
            "mis-turnos-administrativo",
            "mis-turnos-operaciones",
            "usuarios",
            "reportes",
            "configuracion"
          ];

    const sesion = {
      id: data.id || null,
      codigo: data.codigo || "",
      cedula: String(data.cedula || ""),
      nombre_completo: `${data.nombres || ""} ${data.apellidos || ""}`.trim(),
      nombres: data.nombres || "",
      apellidos: data.apellidos || "",
      cargo: data.cargo || "",
      centro_costos: data.centro_costos || "",
      correo: data.correo || "",
      telefono: data.telefono || "",
      rol: data.rol || "",
      puede_ver_todo: data.puede_ver_todo || false,
      areas_permitidas: data.areas_permitidas || [],
      modulos_permitidos: Array.from(
        new Set([
          ...modulosBase,
          "empleados"
        ])
      ),
      tipo_ingreso: "admin"
    };

    localStorage.setItem("ccp_sesion", JSON.stringify(sesion));

    if (typeof mostrarMensaje === "function") {
      mostrarMensaje("success", "Ingreso correcto. Redirigiendo...");
    }

    window.location.href = "dashboard.html";
    return true;
  } catch (err) {
    console.error("Excepción login admin:", err);

    if (typeof mostrarMensaje === "function") {
      mostrarMensaje("error", "Ocurrió un error al iniciar sesión.");
    }

    return false;
  }
};

window.consultarTurnos = async function () {
  const cedula = document.getElementById("cedula")?.value.trim() || "";

  if (!cedula) {
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
      .single();

    if (error || !data) {
      console.error("Error consulta empleado:", error);

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
      correo: data.correo || "",
      telefono: data.telefono || "",
      rol: "empleado",
      puede_ver_todo: false,
      areas_permitidas: [data.centro_costos || ""],
      modulos_permitidos: [],
      tipo_ingreso: "empleado"
    };

    localStorage.setItem("ccp_sesion", JSON.stringify(sesionEmpleado));

    const centroCostos = String(data.centro_costos || "").toUpperCase();
    const cargo = String(data.cargo || "").toUpperCase();

    const esAyb =
      centroCostos.includes("ALIMENTOS") ||
      centroCostos.includes("BEBIDAS") ||
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

    if (typeof mostrarMensaje === "function") {
      mostrarMensaje("error", "Ocurrió un error al consultar la información del empleado.");
    }

    return false;
  }
};