document.addEventListener("DOMContentLoaded", () => {
  const sesion = JSON.parse(localStorage.getItem("ccp_sesion") || "null");

  if (!sesion) {
    window.location.href = "login.html";
    return;
  }

  protegerModulo(sesion);
  aplicarPermisosNavegacion(sesion);
  configurarCerrarSesion();
  cargarEncabezadoUsuario(sesion);
  configurarBotones();
  cargarIndicadoresBase(sesion);
});

function protegerModulo(sesion) {
  const moduloActual = "programacion-administrativo";

  if (sesion.puede_ver_todo === true) {
    return;
  }

  if (!Array.isArray(sesion.modulos_permitidos) || !sesion.modulos_permitidos.includes(moduloActual)) {
    alert("No tienes permisos para acceder a Programación Administrativo.");
    window.location.href = "dashboard.html";
  }
}

function aplicarPermisosNavegacion(sesion) {
  const links = document.querySelectorAll(".nav-link");

  links.forEach((link) => {
    const href = link.getAttribute("href") || "";

    if (href.includes("login.html")) {
      return;
    }

    if (sesion.puede_ver_todo === true) {
      return;
    }

    const modulo = obtenerClaveModulo(href);

    if (!tieneAccesoModulo(sesion, modulo)) {
      link.style.display = "none";
    }
  });
}

function tieneAccesoModulo(sesion, modulo) {
  if (sesion.puede_ver_todo === true) {
    return true;
  }

  if (!Array.isArray(sesion.modulos_permitidos)) {
    return false;
  }

  return sesion.modulos_permitidos.includes(modulo);
}

function obtenerClaveModulo(href) {
  if (href.includes("dashboard")) return "dashboard";
  if (href.includes("empleados")) return "empleados";
  if (href.includes("programacion-ayb")) return "programacion-ayb";
  if (href.includes("programacion-administrativo")) return "programacion-administrativo";
  if (href.includes("programacion-operaciones")) return "programacion-operaciones";
  if (href.includes("mis-turnos-ayb")) return "mis-turnos-ayb";
  if (href.includes("mis-turnos-administrativo")) return "mis-turnos-administrativo";
  if (href.includes("mis-turnos-operaciones")) return "mis-turnos-operaciones";
  if (href.includes("usuarios")) return "usuarios";
  if (href.includes("reportes")) return "reportes";
  if (href.includes("configuracion")) return "configuracion";
  return href;
}

function configurarCerrarSesion() {
  const linksCerrar = document.querySelectorAll('.nav-link[href="login.html"]');

  linksCerrar.forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      localStorage.removeItem("ccp_sesion");
      window.location.href = "login.html";
    });
  });
}

function cargarEncabezadoUsuario(sesion) {
  const subtitulo = document.getElementById("subtituloProgramacionAdmin");

  if (!subtitulo) {
    return;
  }

  const nombre = sesion.nombre_completo || "Usuario";
  const cargo = sesion.cargo || "Sin cargo";
  const rol = traducirRol(sesion.rol);

  subtitulo.textContent = `Módulo base para horarios fijos, rotativos y vista calendario | Usuario: ${nombre} | Cargo: ${cargo} | Rol: ${rol}`;
}

function traducirRol(rol) {
  const mapa = {
    admin: "Administrador",
    gerencia: "Gerencia",
    bienestar: "Bienestar Institucional",
    direccion_financiera: "Dirección Administrativa y Financiera",
    ayb: "Alimentos y Bebidas",
    servicios_generales: "Servicios Generales",
    empleado: "Empleado"
  };

  return mapa[String(rol || "").trim().toLowerCase()] || rol || "Sin rol";
}

function configurarBotones() {
  const btnSemanaAnterior = document.getElementById("btnSemanaAnteriorAdmin");
  const btnSemanaSiguiente = document.getElementById("btnSemanaSiguienteAdmin");
  const btnNuevaAsignacion = document.getElementById("btnNuevaAsignacionAdmin");
  const btnGuardar = document.getElementById("btnGuardarProgramacionAdmin");

  if (btnSemanaAnterior) {
    btnSemanaAnterior.addEventListener("click", () => {
      alert("Siguiente paso: cargar semana anterior de programación administrativa.");
    });
  }

  if (btnSemanaSiguiente) {
    btnSemanaSiguiente.addEventListener("click", () => {
      alert("Siguiente paso: cargar semana siguiente de programación administrativa.");
    });
  }

  if (btnNuevaAsignacion) {
    btnNuevaAsignacion.addEventListener("click", () => {
      alert("Siguiente paso: abrir formulario real para nueva asignación administrativa.");
    });
  }

  if (btnGuardar) {
    btnGuardar.addEventListener("click", () => {
      alert("Siguiente paso: guardar programación administrativa en Supabase.");
    });
  }
}

function cargarIndicadoresBase(sesion) {
  const kpiEmpleados = document.getElementById("kpiAdminEmpleados");
  const kpiAreas = document.getElementById("kpiAdminAreas");
  const kpiNovedades = document.getElementById("kpiAdminNovedades");
  const kpiValidaciones = document.getElementById("kpiAdminValidaciones");

  if (kpiEmpleados) kpiEmpleados.textContent = "--";
  if (kpiAreas) kpiAreas.textContent = Array.isArray(sesion.areas_permitidas) ? sesion.areas_permitidas.length : 0;
  if (kpiNovedades) kpiNovedades.textContent = "--";
  if (kpiValidaciones) kpiValidaciones.textContent = "--";
}